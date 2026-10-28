/**
 * Minimal Antigravity ACP 1.4.3 adapter, following the MIT-licensed
 * @deepseek-ai/dsh-subagent-codex 0.2.1-rc.3 wire's separation of transport,
 * product protocol, permissions, cancellation, and answer selection.
 * The shared JSON-RPC transport owns framing and request correlation.
 */
import type { Readable, Writable } from 'node:stream';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { SubagentResult } from '@deepseek-ai/dsh-subagent';
import { type AuthMethod } from './auth.js';
import { type ModelPolicy } from './model-policy.js';
export type { Effort } from './model-policy.js';
export interface AntigravityWireOptions extends ModelPolicy {
    /** Native inheritance skips authenticate and lets session/new resolve state. */
    readonly authMethod?: AuthMethod;
    /** Computed from the child's actual environment, never the host's environment. */
    readonly gatewayAuthEnabled?: boolean;
    readonly disabledTools?: readonly string[];
    readonly permissionMode: 'deny' | 'allow-once';
    readonly maxOutputBytes: number;
}
/** One connection, one fresh session, one prompt; no reusable session surface. */
export declare class AntigravityWire {
    private readonly input;
    private readonly transport;
    private readonly options;
    private readonly fatal;
    private failure;
    private sessionId;
    private provisionalSessionId;
    private knownLegacyModel;
    private initialized;
    private sessionStarting;
    private ready;
    private turnStarted;
    private terminalObserved;
    private closed;
    private outputBytes;
    private readonly outputChunks;
    private pendingOutput;
    private diagnostic;
    constructor(input: Readable, output: Writable, options: AntigravityWireOptions);
    start(): void;
    initialize(signal: AbortSignal): Promise<void>;
    startSession(cwd: string, signal: AbortSignal): Promise<void>;
    runTurn(texts: readonly string[], signal: AbortSignal): Promise<SubagentResult>;
    /** Remote cancellation is best effort; the run owner still reaps the process. */
    interrupt(): void;
    collectOutput(): ContentBlock[];
    collectDiagnostic(): string | undefined;
    close(): void;
    private setOption;
    private request;
    private assertOpen;
    private fail;
    private readonly onStreamError;
    private readonly onInputEnd;
    private verifySelection;
    private get hasModelPolicy();
    private validateSession;
    private handleNotification;
    private appendText;
    private handleServerRequest;
}
