#!/usr/bin/env node
/** Install one verified official agy CLI binary, without running login or setup. */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { resolveRuntime, runtimeDirectory } from './runtime.js'
import { DEFAULT_RUNTIME_VERSION, RUNTIME_RECORD, runtimeAsset, type RuntimeInstallRecord } from './runtime-manifest.js'

interface Options { runtimeDir?: string; binary?: string }

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function install(options: Options): Promise<string> {
  const asset = runtimeAsset()
  const directory = runtimeDirectory(options.runtimeDir)
  const parent = dirname(directory)
  await mkdir(parent, { recursive: true })
  // Exclusive ownership; an existing or abandoned lock is never stolen.
  const lockPath = directory + '.install.lock'
  const lock = await open(lockPath, 'wx', 0o600)
  let stage: string | undefined
  const prefix = '.' + basename(directory) + '-install-'
  try {
    if (await exists(directory)) { await resolveRuntime(directory); return directory }
    stage = await mkdtemp(join(parent, prefix))
    let source: Readable
    const signal = AbortSignal.timeout(10 * 60_000)
    if (options.binary) {
      const stat = await lstat(options.binary)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== asset.size) throw new Error('Official agy binary has an unexpected size or type')
      source = createReadStream(options.binary)
    } else {
      const response = await fetch(asset.url, { signal, redirect: 'error' })
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Official agy download failed') }
      source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
    }
    const hash = createHash('sha512')
    let size = 0
    const verify = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        if (size > asset.size) { callback(new Error('Official agy binary exceeded its pinned size')); return }
        hash.update(chunk)
        callback(null, chunk)
      },
    })
    await pipeline(source, verify, createWriteStream(join(stage, asset.executable), {flags:'wx',mode:0o700}), {signal})
    if (size !== asset.size || hash.digest('hex') !== asset.sha512) throw new Error('Official agy SHA-512 mismatch; nothing was installed')
    const record: RuntimeInstallRecord = {
      schema: 2, kind: 'agy-cli', version: DEFAULT_RUNTIME_VERSION, platform: asset.platform,
      url: asset.url, sha512: asset.sha512, size,
    }
    await writeFile(join(stage, RUNTIME_RECORD), JSON.stringify(record, null, 2) + '\n', {flag:'wx',mode:0o600})
    await resolveRuntime(stage)
    await rename(stage, directory)
    stage = undefined
    return directory
  } finally {
    try {
      if (stage !== undefined) {
        const absolute = resolve(stage)
        if (dirname(absolute) !== parent || !basename(absolute).startsWith(prefix)) throw new Error('Unsafe installer cleanup path')
        await rm(absolute, {recursive:true,force:true})
      }
    } finally { await lock.close(); await rm(lockPath, {force:true}) }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 1 && ['--help','-h'].includes(args[0]!)) {
    process.stdout.write('Install the pinned official agy CLI ' + DEFAULT_RUNTIME_VERSION + '.\nUsage: dsh-antigravity-install [--runtime-dir ABSOLUTE_DIRECTORY] [--binary OFFICIAL_EXE]\nThe complete release TGZ already contains this binary. No login or setup is run.\n')
    return
  }
  const options: Options = {}
  for (let i=0; i<args.length; i+=2) {
    const flag=args[i], value=args[i+1]
    if (!value || value.startsWith('--') || (flag!=='--runtime-dir' && flag!=='--binary')) throw new Error('Expected --runtime-dir or --binary followed by a path')
    const key=flag==='--runtime-dir'?'runtimeDir':'binary'
    if (options[key] !== undefined) throw new Error('Duplicate installation option')
    options[key]=resolve(value)
  }
  process.stdout.write('Antigravity CLI installed at ' + await install(options) + '\n')
}
void main().catch((error:unknown) => {
  process.stderr.write('Antigravity installation failed: ' + (error instanceof Error ? error.message : 'unknown error') + '\n')
  process.exitCode=1
})