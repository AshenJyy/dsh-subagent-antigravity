/** Official Windows x64 CLI payload; no network lookup during delegation. */
export const DEFAULT_RUNTIME_VERSION = '1.5.5';
export const RUNTIME_MANIFEST_URL = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/windows_amd64.json';
export const RUNTIME_RECORD = '.dsh-antigravity-runtime.json';
export const CLI_ASSET = {
    platform: 'win32-x64',
    url: 'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.5.5-6740358537805824/windows-x64/cli_windows_x64.exe',
    sha512: '11e01089801b86db04d92d4cec3f67bbeff90ca1076ae46bc7475415ab5f3ad7b53419252b7b2c2a68066375b2b6821a6e74a0a959892dad656d3ef769d44955',
    size: 226117784,
    executable: 'agy.exe',
};
export function runtimeAsset() {
    if (process.platform !== 'win32' || process.arch !== 'x64') {
        throw new Error('This Antigravity bundle supports Windows x64 only');
    }
    return CLI_ASSET;
}
