#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, lstat, mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { open as openZip, type Entry, type ZipFile } from 'yauzl'
import { resolveRuntime, runtimeDirectory } from './runtime.js'
import {
  DEFAULT_RUNTIME_VERSION,
  RUNTIME_RECORD,
  RUNTIME_REGISTRY_COMMIT,
  runtimeAsset,
  type RuntimeAsset,
  type RuntimeFileRecord,
  type RuntimeInstallRecord,
} from './runtime-manifest.js'

const MAX_ARCHIVE_BYTES = 1024 ** 3
const MAX_FILE_BYTES = 2 * 1024 ** 3
const MAX_EXTRACTED_BYTES = 3 * 1024 ** 3
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000
const LOCK_TIMEOUT_MS = 15 * 60_000

interface Options {
  runtimeDir?: string
  archive?: string
}

function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) {
    if (errorCode(error) === 'ENOENT') return false
    throw error
  }
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (error) {
    return errorCode(error) !== 'ESRCH'
  }
}

/** Only this process removes its lock. An abandoned lock is never stolen. */
async function installationLock(directory: string): Promise<() => Promise<void>> {
  const path = `${directory}.install.lock`
  const token = randomUUID()
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    let handle
    try {
      handle = await open(path, 'wx', 0o600)
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error
      let owner: { pid?: unknown; createdAt?: unknown } | undefined
      try { owner = JSON.parse(await readFile(path, 'utf8')) as typeof owner } catch { /* A new owner may still be writing. */ }
      if (typeof owner?.pid === 'number' && Number.isSafeInteger(owner.pid) && owner.pid > 0 && !processAlive(owner.pid)) {
        throw new Error(`A previous installer left an inactive lock: ${path}. Remove that lock file before retrying.`)
      }
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for the Antigravity installation lock: ${path}`)
      await delay(200 + Math.floor(Math.random() * 100))
      continue
    }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }))
      await handle.sync()
    } catch (error) {
      await handle.close()
      await rm(path, { force: true })
      throw error
    }
    return async () => {
      await handle.close()
      // Do not unlink a lock replaced externally while installation was running.
      try {
        const owner = JSON.parse(await readFile(path, 'utf8')) as { token?: unknown }
        if (owner.token === token) await rm(path, { force: true })
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error
      }
    }
  }
}

async function verifiedArchive(asset: RuntimeAsset, destination: string, localArchive?: string): Promise<void> {
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  let source: Readable
  if (localArchive !== undefined) {
    const path = resolve(localArchive)
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ARCHIVE_BYTES) {
      throw new Error('The supplied archive must be a regular file no larger than 1 GiB')
    }
    source = createReadStream(path)
  } else {
    process.stderr.write(`Downloading official Antigravity ACP ${DEFAULT_RUNTIME_VERSION} (${asset.platform})...\n`)
    const response = await fetch(asset.archive, { signal, redirect: 'error' })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error(`Official Antigravity download failed (HTTP ${response.status})`)
    }
    const declaredSize = Number(response.headers.get('content-length'))
    if (declaredSize > MAX_ARCHIVE_BYTES) {
      await response.body.cancel()
      throw new Error('Official Antigravity archive exceeds the 1 GiB download limit')
    }
    source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
  }
  const hash = createHash('sha256')
  let bytes = 0
  const verify = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      if (bytes > MAX_ARCHIVE_BYTES) {
        callback(new Error('Antigravity archive exceeds the 1 GiB download limit'))
        return
      }
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(source, verify, createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal })
  if (hash.digest('hex') !== asset.sha256) {
    throw new Error('Antigravity archive SHA-256 does not match the pinned official ACP registry; nothing was installed')
  }
}

function zipArchive(path: string): Promise<ZipFile> {
  return new Promise((resolveArchive, reject) => {
    openZip(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (error, archive) => {
      if (error) reject(error)
      else if (archive) resolveArchive(archive)
      else reject(new Error('Could not open the verified Antigravity archive'))
    })
  })
}

function entryStream(archive: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolveStream, reject) => {
    archive.openReadStream(entry, (error, stream) => {
      if (error) reject(error)
      else if (stream) resolveStream(stream)
      else reject(new Error('Could not read an Antigravity archive member'))
    })
  })
}

async function extractPair(path: string, destination: string, asset: RuntimeAsset): Promise<RuntimeFileRecord[]> {
  const archive = await zipArchive(path)
  const files: RuntimeFileRecord[] = []
  let active: Readable | undefined
  let entryTask: Promise<void> | undefined
  try {
    if (archive.entryCount !== 2) throw new Error('Antigravity archive must contain exactly the executable and matching harness')
    await new Promise<void>((resolveExtraction, reject) => {
      let settled = false
      let declaredTotal = 0
      const seen = new Set<string>()
      const fail = (error: unknown): void => {
        if (settled) return
        settled = true
        active?.destroy()
        reject(error)
      }
      archive.on('error', fail)
      archive.on('end', () => {
        if (settled) return
        settled = true
        if (!seen.has(asset.executable) || !seen.has(asset.harness)) {
          reject(new Error('Antigravity archive is missing the executable or matching harness'))
        } else resolveExtraction()
      })
      archive.on('entry', (entry: Entry) => {
        if (settled) return
        entryTask = (async () => {
          const unixType = (entry.externalFileAttributes >>> 16) & 0o170000
          declaredTotal += entry.uncompressedSize
          if (![asset.executable, asset.harness].includes(entry.fileName)
            || seen.has(entry.fileName) || /[\\/]/.test(entry.fileName)
            || (unixType !== 0 && unixType !== 0o100000)
            || (entry.externalFileAttributes & 0x10) !== 0
            || (entry.generalPurposeBitFlag & 1) !== 0
            || ![0, 8].includes(entry.compressionMethod)
            || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize <= 0
            || entry.uncompressedSize > MAX_FILE_BYTES || declaredTotal > MAX_EXTRACTED_BYTES) {
            throw new Error('Antigravity archive contains an unexpected or unsafe member')
          }
          seen.add(entry.fileName)
          const hash = createHash('sha256')
          let size = 0
          const verify = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              size += chunk.length
              if (size > entry.uncompressedSize) {
                callback(new Error('Antigravity archive member exceeded its declared size'))
                return
              }
              hash.update(chunk)
              callback(null, chunk)
            },
          })
          active = await entryStream(archive, entry)
          if (settled) { active.destroy(); return }
          const filePath = join(destination, entry.fileName)
          await pipeline(active, verify, createWriteStream(filePath, { flags: 'wx', mode: 0o700 }))
          active = undefined
          if (size !== entry.uncompressedSize) throw new Error('Antigravity archive member was truncated')
          if (process.platform !== 'win32') await chmod(filePath, 0o755)
          files.push({ name: entry.fileName, size, sha256: hash.digest('hex') })
          if (!settled) archive.readEntry()
        })()
        void entryTask.catch(fail)
      })
      archive.readEntry()
    })
    return files
  } finally {
    active?.destroy()
    archive.close()
    // Do not race recursive staging cleanup against a still-open output file.
    await entryTask?.catch(() => {})
  }
}

async function install(options: Options): Promise<string> {
  const asset = runtimeAsset()
  const directory = runtimeDirectory(options.runtimeDir)
  const parent = dirname(directory)
  await mkdir(parent, { recursive: true })
  const unlock = await installationLock(directory)
  let staging: string | undefined
  const prefix = `.${basename(directory)}-install-`
  try {
    if (await exists(directory)) {
      // Idempotent installs do not download again or replace an incomplete/unrelated directory.
      await resolveRuntime(directory)
      return directory
    }
    staging = await mkdtemp(join(parent, prefix))
    const archivePath = join(staging, 'download.zip')
    const payloadPath = join(staging, 'payload')
    await mkdir(payloadPath, { mode: 0o755 })
    await verifiedArchive(asset, archivePath, options.archive)
    process.stderr.write('Extracting the verified ACP executable and harness...\n')
    const files = await extractPair(archivePath, payloadPath, asset)
    const record: RuntimeInstallRecord = {
      schema: 1,
      version: DEFAULT_RUNTIME_VERSION,
      platform: asset.platform,
      archiveSha256: asset.sha256,
      registryCommit: RUNTIME_REGISTRY_COMMIT,
      files,
    }
    await writeFile(join(payloadPath, RUNTIME_RECORD), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await resolveRuntime(payloadPath)
    await rename(payloadPath, directory)
    return directory
  } finally {
    try {
      if (staging !== undefined) {
        // The only recursive deletion is this installer-created sibling staging directory.
        const absolute = resolve(staging)
        if (dirname(absolute) !== parent || !basename(absolute).startsWith(prefix)) {
          throw new Error('Refusing to clean an installation staging path outside its parent')
        }
        await rm(absolute, { recursive: true, force: true })
      }
    } finally {
      await unlock()
    }
  }
}

function parseOptions(args: readonly string[]): Options | undefined {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    process.stdout.write(`Install the pinned official Antigravity ACP ${DEFAULT_RUNTIME_VERSION} runtime.\n\nUsage: dsh-antigravity-install [--runtime-dir ABSOLUTE_DIRECTORY] [--archive ZIP_FILE]\n\nDownloads only from the pinned Google URL and verifies the official registry SHA-256.\n--archive installs an already downloaded ZIP with the same strict digest check.\nThe default directory is package-local native/${DEFAULT_RUNTIME_VERSION}/<platform>-<arch>.\n`)
    return undefined
  }
  const options: Options = {}
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i]
    const value = args[++i]
    if ((option !== '--runtime-dir' && option !== '--archive') || !value || value.startsWith('--')) {
      throw new Error('Usage: dsh-antigravity-install [--runtime-dir ABSOLUTE_DIRECTORY] [--archive ZIP_FILE]')
    }
    const key = option === '--runtime-dir' ? 'runtimeDir' : 'archive'
    if (options[key] !== undefined) throw new Error(`Duplicate option: ${option}`)
    options[key] = value
  }
  return options
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))
  if (options === undefined) return
  const directory = await install(options)
  process.stdout.write(`Antigravity ACP ${DEFAULT_RUNTIME_VERSION} is installed at ${directory}\n`)
}

void main().catch((error: unknown) => {
  process.stderr.write(`Antigravity installation failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
