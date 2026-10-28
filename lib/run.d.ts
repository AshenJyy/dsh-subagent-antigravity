import { type SubagentRun, type SubagentStartRequest, type SubagentStopReason } from '@deepseek-ai/dsh-subagent';
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
export interface AntigravityRunSpec {
    cwd: string;
    model?: string;
    effort?: string;
    allowedModels?: readonly string[];
    allowedEfforts?: readonly string[];
    disabledTools?: readonly string[];
    gcpProject: string;
    gcpLocation: string;
    adcPath?: string;
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
