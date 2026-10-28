/** Optional exact model policy over the pinned runtime's advertised choices. */
export type Effort = string;
export declare const ACP_AGENT_NAME = "antigravity-acp";
export declare const ACP_AGENT_VERSION = "1.4.3";
type JsonObject = Record<string, unknown>;
/** Only provider-authored, payload-free errors may leave the wire adapter. */
export declare class AntigravityProtocolError extends Error {
    constructor(message: string);
}
export declare function record(value: unknown): JsonObject;
export interface ModelPolicy {
    readonly model?: string;
    readonly effort?: string;
    readonly allowedModels?: readonly string[];
    readonly allowedEfforts?: readonly string[];
}
export declare function validChoice(value: unknown): value is string;
export interface SelectOption {
    readonly currentValue: string;
    readonly values: ReadonlySet<string>;
}
export interface ModelSelection {
    readonly model?: SelectOption;
    readonly effort?: SelectOption;
    readonly mode?: SelectOption;
}
/** Validate availability before selecting; this does not prove backend access. */
export declare function readSelection(options: unknown): ModelSelection;
export declare function requireChoice(option: SelectOption | undefined, value: string): void;
export declare function assertCurrent(option: SelectOption | undefined, value: string): void;
export declare function assertSelection(selection: ModelSelection, policy: ModelPolicy): void;
/** Reject slash commands before submission without rewriting the user's text. */
export declare function assertPrompt(texts: readonly string[]): void;
export {};
