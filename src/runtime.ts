import { constants, createReadStream, type Stats } from 'node:fs'
import { createHash } from 'node:crypto'
import { access, lstat, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_RUNTIME_VERSION,
  RUNTIME_RECORD,
  RUNTIME_REGISTRY_COMMIT,
  runtimeAsset,
  type RuntimeFileRecord,
} from './runtime-manifest.js'

export { DEFAULT_RUNTIME_VERSION } from './runtime-manifest.js'

export interface ResolvedRuntime {
  readonly argv: string[]
  readonly env: Record<string, string>
  readonly directory: string
}

interface CachedRuntime {
  readonly fingerprint: string
  readonly runtime: ResolvedRuntime
}

const cache = new Map<string, CachedRuntime>()
const pending = new Map<string, Promise<ResolvedRuntime>>()

/** A custom directory names the installed pair itself, not a search root. */
export function runtimeDirectory(runtimeDir?: string): string {
  if (runtimeDir !== undefined) {
    if (!isAbsolute(runtimeDir)) throw new Error('Antigravity runtimeDir must be an absolute directory path')
    return resolve(runtimeDir)
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'native', DEFAULT_RUNTIME_VERSION, runtimeAsset().platform)
}

function fingerprint(stat: Stats): string {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')
}

function recordObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Antigravity runtime installation record is invalid')
  }
  return value as Record<string, unknown>
}

async function fileDigest(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

function validateFileRecord(value: unknown, name: string, size: number): RuntimeFileRecord {
  const record = recordObject(value)
  if (record.name !== name || record.size !== size || !Number.isSafeInteger(record.size)
    || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    throw new Error(`Antigravity runtime file does not match its installation record: ${name}`)
  }
  return record as unknown as RuntimeFileRecord
}

async function resolveInstalledRuntime(directory: string): Promise<ResolvedRuntime> {
  const asset = runtimeAsset()
  const executable = join(directory, asset.executable)
  const harness = join(directory, asset.harness)
  const recordPath = join(directory, RUNTIME_RECORD)
  let stats: [Stats, Stats, Stats, Stats]
  try {
    stats = await Promise.all([lstat(directory), lstat(recordPath), lstat(executable), lstat(harness)])
  } catch (cause) {
    throw new Error(`Antigravity ACP ${DEFAULT_RUNTIME_VERSION} is not installed in ${directory}; run dsh-antigravity-install with the matching --runtime-dir`, { cause })
  }
  const [directoryStat, recordStat, executableStat, harnessStat] = stats
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()
    || [recordStat, executableStat, harnessStat].some(stat => !stat.isFile() || stat.isSymbolicLink())
    || recordStat.size > 16_384 || executableStat.size === 0 || harnessStat.size === 0) {
    throw new Error('Antigravity runtime directory must contain its regular installation record and executable pair')
  }
  const stamp = stats.map(fingerprint).join('|')
  const cached = cache.get(directory)
  if (cached?.fingerprint === stamp) return cached.runtime

  const record = recordObject(JSON.parse(await readFile(recordPath, 'utf8')) as unknown)
  if (record.schema !== 1 || record.version !== DEFAULT_RUNTIME_VERSION
    || record.platform !== asset.platform || record.archiveSha256 !== asset.sha256
    || record.registryCommit !== RUNTIME_REGISTRY_COMMIT
    || !Array.isArray(record.files) || record.files.length !== 2) {
    throw new Error('Antigravity runtime installation does not match the pinned official release')
  }
  for (const [name, stat] of [[asset.executable, executableStat], [asset.harness, harnessStat]] as const) {
    const matching = record.files.filter(file => recordObject(file).name === name)
    if (matching.length !== 1) throw new Error('Antigravity runtime installation has a missing or duplicate file record')
    const file = validateFileRecord(matching[0], name, stat.size)
    if (await fileDigest(join(directory, name)) !== file.sha256) {
      throw new Error('Antigravity runtime file integrity check failed; reinstall the pinned runtime')
    }
  }
  if (process.platform !== 'win32') {
    await Promise.all([access(executable, constants.X_OK), access(harness, constants.X_OK)])
  }
  // Verify installed bytes once per Host and again after any stat change.
  // Stat-based invalidation avoids re-reading hundreds of MB per task.
  const runtime = {
    argv: [executable, ...asset.args],
    env: { ANTIGRAVITY_HARNESS_PATH: harness },
    directory,
  }
  cache.set(directory, { fingerprint: stamp, runtime })
  return runtime
}

/** Resolve only the pinned installed payload; never download or consult PATH. */
export async function resolveRuntime(runtimeDir?: string): Promise<ResolvedRuntime> {
  const directory = runtimeDirectory(runtimeDir)
  let resolving = pending.get(directory)
  if (!resolving) {
    resolving = resolveInstalledRuntime(directory)
    pending.set(directory, resolving)
  }
  try {
    const runtime = await resolving
    // Callers may merge their own environment without mutating the cached launch.
    return { argv: [...runtime.argv], env: { ...runtime.env }, directory: runtime.directory }
  } finally {
    if (pending.get(directory) === resolving) pending.delete(directory)
  }
}
