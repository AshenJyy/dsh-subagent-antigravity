export { DEFAULT_RUNTIME_VERSION } from './runtime-manifest.js';
export interface ResolvedRuntime {
    readonly argv: string[];
    readonly env: Record<string, string>;
    readonly directory: string;
}
/** A custom directory names the installed pair itself, not a search root. */
export declare function runtimeDirectory(runtimeDir?: string): string;
/** Resolve only the pinned installed payload; never download or consult PATH. */
export declare function resolveRuntime(runtimeDir?: string): Promise<ResolvedRuntime>;
