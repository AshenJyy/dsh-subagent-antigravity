import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RUNTIME_VERSION, RUNTIME_RECORD, runtimeAsset } from './runtime-manifest.js';
export { DEFAULT_RUNTIME_VERSION } from './runtime-manifest.js';
const verified = new Map();
const pending = new Map();
export function runtimeDirectory(runtimeDir) {
    if (runtimeDir !== undefined) {
        if (!isAbsolute(runtimeDir))
            throw new Error('Antigravity runtimeDir must be an absolute directory path');
        return resolve(runtimeDir);
    }
    return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'native', DEFAULT_RUNTIME_VERSION, runtimeAsset().platform);
}
function fingerprint(stat) {
    return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
}
async function verifyBundle(directory) {
    const asset = runtimeAsset();
    const executable = join(directory, asset.executable);
    const recordPath = join(directory, RUNTIME_RECORD);
    const stats = await Promise.all([lstat(directory), lstat(recordPath), lstat(executable)]);
    const [folder, recordStat, binary] = stats;
    if (!folder.isDirectory() || folder.isSymbolicLink()
        || [recordStat, binary].some(s => !s.isFile() || s.isSymbolicLink())
        || recordStat.size > 16_384 || binary.size !== asset.size) {
        throw new Error('Invalid bundled agy installation; reinstall the complete TGZ');
    }
    const stamp = stats.map(fingerprint).join('|');
    if (verified.get(directory) === stamp)
        return;
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    if (record?.schema !== 2 || record.kind !== 'agy-cli' || record.version !== DEFAULT_RUNTIME_VERSION
        || record.platform !== asset.platform || record.url !== asset.url
        || record.sha512 !== asset.sha512 || record.size !== asset.size) {
        throw new Error('Bundled agy record does not match the pinned official release');
    }
    const hash = createHash('sha512');
    for await (const chunk of createReadStream(executable))
        hash.update(chunk);
    if (hash.digest('hex') !== asset.sha512)
        throw new Error('Bundled agy integrity check failed; reinstall the complete TGZ');
    const after = await Promise.all([lstat(directory), lstat(recordPath), lstat(executable)]);
    if (after.map(fingerprint).join('|') !== stamp)
        throw new Error('Bundled agy changed during verification');
    verified.set(directory, stamp);
}
/** A configured CLI is deployment-owned; otherwise use the verified bundled CLI. */
export async function resolveRuntime(runtimeDir, agyPath, geminiHome) {
    runtimeAsset();
    if (agyPath !== undefined && runtimeDir !== undefined)
        throw new Error('Choose agyPath or runtimeDir, not both');
    if (geminiHome !== undefined && !isAbsolute(geminiHome))
        throw new Error('geminiHome must be absolute');
    let executable;
    let directory;
    if (agyPath !== undefined) {
        if (!isAbsolute(agyPath) || !/\.exe$/i.test(agyPath))
            throw new Error('agyPath must name an absolute Windows agy executable');
        executable = await realpath(agyPath);
        const stat = await lstat(executable);
        if (!stat.isFile() || stat.size === 0)
            throw new Error('agyPath is not an executable file');
        directory = dirname(executable);
    }
    else {
        directory = runtimeDirectory(runtimeDir);
        let checking = pending.get(directory);
        if (!checking) {
            checking = verifyBundle(directory);
            pending.set(directory, checking);
        }
        try {
            await checking;
        }
        finally {
            if (pending.get(directory) === checking)
                pending.delete(directory);
        }
        executable = join(directory, runtimeAsset().executable);
    }
    return {
        argv: [executable, 'acp', ...(geminiHome === undefined ? [] : ['--gemini-dir', geminiHome])],
        env: {}, directory,
    };
}
