/** Pinned official ACP distribution. No registry/network lookup occurs at run time. */
export declare const DEFAULT_RUNTIME_VERSION = "1.4.3";
export declare const RUNTIME_REGISTRY_COMMIT = "06229c691d24d039e2363ba12abe5c9dfae5bc66";
export declare const RUNTIME_RECORD = ".dsh-antigravity-runtime.json";
export interface RuntimeAsset {
    readonly platform: string;
    readonly archive: string;
    readonly sha256: string;
    readonly executable: string;
    readonly harness: string;
    readonly args: readonly string[];
}
export declare function runtimeAsset(): RuntimeAsset;
export interface RuntimeFileRecord {
    readonly name: string;
    readonly size: number;
    readonly sha256: string;
}
export interface RuntimeInstallRecord {
    readonly schema: 1;
    readonly version: typeof DEFAULT_RUNTIME_VERSION;
    readonly platform: string;
    readonly archiveSha256: string;
    readonly registryCommit: typeof RUNTIME_REGISTRY_COMMIT;
    readonly files: readonly RuntimeFileRecord[];
}
