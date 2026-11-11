export { DEFAULT_RUNTIME_VERSION } from './runtime-manifest.js';
export interface ResolvedRuntime {
    readonly argv: string[];
    readonly env: Record<string, string>;
    readonly directory: string;
}
export declare function runtimeDirectory(runtimeDir?: string): string;
/** A configured CLI is deployment-owned; otherwise use the verified bundled CLI. */
export declare function resolveRuntime(runtimeDir?: string, agyPath?: string, geminiHome?: string): Promise<ResolvedRuntime>;
