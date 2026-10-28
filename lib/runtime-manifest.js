/** Pinned official ACP distribution. No registry/network lookup occurs at run time. */
export const DEFAULT_RUNTIME_VERSION = '1.4.3';
export const RUNTIME_REGISTRY_COMMIT = '06229c691d24d039e2363ba12abe5c9dfae5bc66';
export const RUNTIME_RECORD = '.dsh-antigravity-runtime.json';
const ROOT = 'https://dl.google.com/agy-extensions/releases';
const assets = Object.fromEntries([
    ['darwin-arm64', 'macos', 'darwin-arm64', 'c57db0a9b8b712daa9c3c17cdb990a61842ea569f279e8bd79d7aa85a303b20b'],
    ['darwin-x64', 'macos', 'darwin-x86_64', '9392dbbdad7f0663dbfb5a0bf641297b0cf80d2ee9cd2d49a616bbbc7378731d'],
    ['linux-x64', 'linux', 'linux-x86_64', '0634ce5306ba92c932945455e7a83fda78e2d99c33fa8aa6ee0566206a382714'],
    ['linux-arm64', 'linux', 'linux-arm64', '05c153443b0b1175151c760eeddea538950bc9843e317d54786a1f03670182bc'],
    ['win32-x64', 'windows', 'windows-x86_64', '54c2e16378d9a4952e1da70e355f3c33c4f284308d6de48ab3e6e34a127bd325'],
    ['win32-arm64', 'windows', 'windows-arm64', 'fcd46431ad33d3b510ce0b98fe7b43d095bd8b3f1c363ee2d57faa7ee981c7bb'],
].map(([platform, folder, suffix, sha256]) => {
    const windows = folder === 'windows';
    return [platform, {
            platform: platform,
            archive: `${ROOT}/${folder}/agy-acp-server-${DEFAULT_RUNTIME_VERSION}-${suffix}.zip`,
            sha256: sha256,
            executable: windows ? 'agy_acp_server.exe' : 'agy_acp_server.par',
            harness: windows ? 'localharness_external.exe' : 'localharness_external',
            args: folder === 'linux' ? ['--uid='] : [],
        }];
}));
export function runtimeAsset() {
    const asset = assets[`${process.platform}-${process.arch}`];
    if (!asset) {
        throw new Error(`Antigravity ACP ${DEFAULT_RUNTIME_VERSION} has no pinned runtime for ${process.platform}-${process.arch}`);
    }
    return asset;
}
