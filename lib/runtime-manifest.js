/** Pinned official ACP distribution. No registry/network lookup occurs at run time. */
export const DEFAULT_RUNTIME_VERSION = '1.4.5';
export const RUNTIME_REGISTRY_COMMIT = '02b460362cfedf4d43b03df7aad6d79a353fe064';
export const RUNTIME_RECORD = '.dsh-antigravity-runtime.json';
const ROOT = 'https://dl.google.com/agy-extensions/releases';
const assets = Object.fromEntries([
    ['darwin-arm64', 'macos', 'darwin-arm64', '886fff7767d08994ca39eb02c3d01a7532c7325a94aa33aaf52d52068733284f'],
    ['darwin-x64', 'macos', 'darwin-x86_64', 'b39f3573c03b9acb9df028853f647527f1f3133f32bd77e78b796e48a205114a'],
    ['linux-x64', 'linux', 'linux-x86_64', '923923a0d7dc8073f66cc6f78647a3107e3a7ee2b7e1a24df8b3927b5188013b'],
    ['linux-arm64', 'linux', 'linux-arm64', '7d64246633ae094f67e3bbcd2d679e89048f91346d5339313336e7483f40f056'],
    ['win32-x64', 'windows', 'windows-x86_64', 'd24f4c73c9f96d4f44384e281c855a56c72d8eaa9c5b0fad7ccb1635c6b63f50'],
    ['win32-arm64', 'windows', 'windows-arm64', 'ab0a9aac8349e08ef289be6d16da8f89e3abe60eba5158032ef78c4a1220261c'],
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
