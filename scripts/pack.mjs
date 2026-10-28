#!/usr/bin/env node
/** Build the Windows x64 bundle from a verified official archive, never a user's login home. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function options(args) {
  const result = { outputDir: root }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--archive' || arg === '--output-dir') {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
      result[arg === '--archive' ? 'archive' : 'outputDir'] = resolve(value)
    } else throw new Error(`Unknown packaging option: ${arg}`)
  }
  return result
}

function run(argv, cwd, capture = false) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, argv, {
      cwd, windowsHide: true, stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    })
    const chunks = []
    child.stdout?.on('data', chunk => chunks.push(chunk))
    child.once('error', reject)
    child.once('close', code => {
      if (code === 0) resolveRun(Buffer.concat(chunks).toString('utf8'))
      else reject(new Error(`Packaging command failed (${code}): ${argv[0]}`))
    })
  })
}

async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function main() {
  const opts = options(process.argv.slice(2))
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Build this Windows x64 release on Windows x64')
  }
  const npmCli = process.env.npm_execpath
  if (!npmCli || !isAbsolute(npmCli) || !/npm-cli\.(?:c?js)$/.test(npmCli)) {
    throw new Error('Run this command through npm run pack:bundle')
  }
  await run([join(root, 'node_modules/typescript/bin/tsc')], root)
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const { DEFAULT_RUNTIME_VERSION, RUNTIME_RECORD, runtimeAsset } = await import(pathToFileURL(join(root, 'lib/runtime-manifest.js')).href)
  const asset = runtimeAsset()
  await mkdir(opts.outputDir, { recursive: true })
  const stage = await mkdtemp(join(root, '.pack-'))
  try {
    // Only the explicit public file list is copied. No node_modules, login homes or existing native state.
    for (const entry of manifest.files) {
      const source = resolve(root, entry)
      const local = relative(root, source)
      if (isAbsolute(local) || local === '..' || local.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
        throw new Error(`Package file is outside the project: ${entry}`)
      }
      await cp(source, join(stage, local), { recursive: true, errorOnExist: true, force: false })
    }
    manifest.files = [...manifest.files]
    const nativeRelative = `native/${DEFAULT_RUNTIME_VERSION}/${asset.platform}`
    const nativeDirectory = join(stage, nativeRelative)
    const installArgs = [join(root, 'lib/install.js'), '--runtime-dir', nativeDirectory]
    if (opts.archive) installArgs.push('--archive', opts.archive)
    // Installer verifies the official ZIP digest and records the exact extracted pair.
    await run(installArgs, root)
    manifest.files.push(...[asset.executable, asset.harness, RUNTIME_RECORD].map(file => `${nativeRelative}/${file}`))
    manifest.os = [process.platform]
    manifest.cpu = [process.arch]
    manifest.license = 'SEE LICENSE IN NOTICE'
    manifest.antigravityRuntime = { version: DEFAULT_RUNTIME_VERSION, platform: asset.platform, archiveSha256: asset.sha256 }
    await writeFile(join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    // Do not run package lifecycle hooks in the clean staging directory.
    const [packed] = JSON.parse(await run([npmCli, 'pack', '--ignore-scripts', '--json'], stage, true))
    if (!packed?.filename || basename(packed.filename) !== packed.filename) throw new Error('npm returned an invalid archive name')
    const contents = new Set(packed.files.map(file => file.path))
    for (const file of [asset.executable, asset.harness, RUNTIME_RECORD]) {
      if (!contents.has(`${nativeRelative}/${file}`)) {
        throw new Error(`Packed archive is missing ${file}`)
      }
    }
    const filename = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}-${asset.platform}.tgz`
    const destination = join(opts.outputDir, filename)
    const sha256 = await digest(join(stage, packed.filename))
    await cp(join(stage, packed.filename), destination, { errorOnExist: true, force: false })
    await writeFile(`${destination}.sha256`, `${sha256}  ${filename}\n`, { flag: 'wx' })
    process.stdout.write(`${JSON.stringify({ filename, size: packed.size, unpackedSize: packed.unpackedSize, sha256, runtime: manifest.antigravityRuntime }, null, 2)}\n`)
  } finally {
    // Remove only this invocation's verified child of the project directory.
    const absolute = resolve(stage)
    if (dirname(absolute) !== root || !basename(absolute).startsWith('.pack-')) throw new Error('Unsafe packaging cleanup path')
    await rm(absolute, { recursive: true, force: true })
  }
}

void main().catch(error => {
  process.stderr.write(`Packaging failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
