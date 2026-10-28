/**
 * Native Antigravity one-shot providers for DeepSeek Harness 0.2.1-rc.3.
 * Adapted from the MIT-licensed DeepSeek Harness provider architecture.
 * See NOTICE for the upstream revision and attribution.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "subagent-antigravity";
export declare const inject: string[];
export type AntigravityEffort = string;
export type AntigravityPermissionMode = 'deny' | 'allow-once';
/** Deployment configuration for the native Agent Platform runtime. */
export interface Config {
    /** Defaults to antigravity. Multiple configured provider instances may coexist. */
    providerName?: string;
    /** Native model identifier; omitted leaves the runtime's default in effect. */
    model?: string;
    /** Native thinking-level value; omitted leaves the runtime's default in effect. */
    effort?: string;
    /** Optional deployment restriction, checked against the selected native model. */
    allowedModels?: string[];
    /** Optional deployment restriction, checked against the selected native effort. */
    allowedEfforts?: string[];
    /** Optional native tool identifiers disabled for this provider's sessions. */
    disabledTools?: string[];
    /** Omission falls back to the explicit or ambient GOOGLE_CLOUD_PROJECT. */
    gcpProject?: string;
    gcpLocation?: string;
    /** Absolute ADC file path explicitly forwarded to the child. */
    adcPath?: string;
    /** Absolute installation directory prepared by dsh-antigravity-install. */
    runtimeDir?: string;
    permissionMode?: AntigravityPermissionMode;
    /** Explicit entries layered over the subprocess service's scrubbed environment. */
    env?: Record<string, string>;
    disposeGraceMs?: number;
    disposeEofGraceMs?: number;
    startupTimeoutMs?: number;
    maxOutputBytes?: number;
}
export declare const Config: z<Config>;
/** Register one provider with optional deployment-owned model and effort settings. */
export declare function apply(ctx: Context, config: Config): void;
