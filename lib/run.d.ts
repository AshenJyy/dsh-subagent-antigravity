import { type SubagentRun, type SubagentStartRequest, type SubagentStopReason } from '@deepseek-ai/dsh-subagent';
import { type SubprocessHandle, type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import { type AuthenticationConfig } from './auth.js';
export interface AntigravityRunSpec extends AuthenticationConfig {
    cwd: string;
    model?: string;
    effort?: string;
    allowedModels?: readonly string[];
    allowedEfforts?: readonly string[];
    disabledTools?: readonly string[];
    runtimeDir?: string;
    permissionMode: 'deny' | 'allow-once';
    env: Record<string, string>;
    disposeGraceMs: number;
    disposeEofGraceMs: number;
    startupTimeoutMs: number;
    maxOutputBytes: number;
    spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle;
    onError?: (error: Error, stopReason: SubagentStopReason) => void;
}
/** Establish native execution before handing lifecycle ownership to DSH. */
export declare function startAntigravityRun(request: SubagentStartRequest, spec: AntigravityRunSpec): Promise<SubagentRun>;
