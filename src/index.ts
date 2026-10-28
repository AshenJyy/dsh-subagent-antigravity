/**
 * Native Antigravity one-shot providers for DeepSeek Harness 0.2.1-rc.3.
 * Adapted from the MIT-licensed DeepSeek Harness provider architecture.
 * See NOTICE for the upstream revision and attribution.
 */

import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  assertPositiveFinite,
  assertUsableCwd,
  NO_START_CAPABILITIES,
  type ResolvedSubagentStartRequest,
  type SubagentCapabilities,
  type SubagentProvider,
  type SubagentRun,
} from '@deepseek-ai/dsh-subagent'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  AUTH_METHODS, resolveAuthMethod, resolveAgentPlatformMode,
  type AuthenticationConfig,
} from './auth.js'
import { startAntigravityRun, type AntigravityRunSpec } from './run.js'

export const name = 'subagent-antigravity'
export const inject = ['subagents', 'subprocess']

export type AntigravityEffort = string
export type AntigravityPermissionMode = 'deny' | 'allow-once'

/** Deployment configuration for the native Antigravity runtime. */
export interface Config extends AuthenticationConfig {
  /** Defaults to antigravity. Multiple configured provider instances may coexist. */
  providerName?: string
  /** Native model identifier; omitted leaves the runtime's default in effect. */
  model?: string
  /** Native thinking-level value; omitted leaves the runtime's default in effect. */
  effort?: string
  /** Optional deployment restriction, checked against the selected native model. */
  allowedModels?: string[]
  /** Optional deployment restriction, checked against the selected native effort. */
  allowedEfforts?: string[]
  /** Optional native tool identifiers disabled for this provider's sessions. */
  disabledTools?: string[]
  /** Absolute installation directory prepared by dsh-antigravity-install. */
  runtimeDir?: string
  permissionMode?: AntigravityPermissionMode
  disposeGraceMs?: number
  disposeEofGraceMs?: number
  startupTimeoutMs?: number
  maxOutputBytes?: number
}

export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default('antigravity'),
  authMethod: z.union(AUTH_METHODS).default('native'),
  agentPlatformMode: z.union(['native', 'adc', 'api-key'] as const).default('native'),
  geminiHome: z.string().min(1),
  model: z.string().min(1),
  effort: z.string().min(1),
  allowedModels: (z.array(z.string().min(1)).min(1) as z<string[] | undefined>).default(undefined),
  allowedEfforts: (z.array(z.string().min(1)).min(1) as z<string[] | undefined>).default(undefined),
  disabledTools: (z.array(z.string().min(1)) as z<string[] | undefined>).default(undefined),
  gcpProject: z.string().min(1),
  gcpLocation: z.string().min(1),
  adcPath: z.string().min(1),
  runtimeDir: z.string().min(1),
  permissionMode: z.union(['deny', 'allow-once'] as const).default('deny'),
  env: z.dict(z.string()).default({}),
  disposeGraceMs: z.number().default(3_000),
  disposeEofGraceMs: z.number().default(1_000),
  startupTimeoutMs: z.number().default(90_000),
  maxOutputBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8 * 1024 * 1024),
})

type OptionalConfigFields = 'model' | 'effort' | 'allowedModels' | 'allowedEfforts'
  | 'disabledTools' | 'gcpProject' | 'gcpLocation' | 'adcPath' | 'geminiHome' | 'runtimeDir'
type ResolvedConfig = Required<Omit<Config, OptionalConfigFields>>
  & Pick<Config, OptionalConfigFields>

function optionalText(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`subagent-antigravity: ${field} must be a nonempty string`)
  }
  return value.trim()
}

function optionalAbsolutePath(value: string | undefined, field: string): string | undefined {
  const path = optionalText(value, field)
  if (path !== undefined && !isAbsolute(path)) {
    throw new Error(`subagent-antigravity: ${field} must be an absolute path`)
  }
  return path
}

function optionalList(value: string[] | undefined, field: string, allowEmpty = false): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`subagent-antigravity: ${field} must be ${allowEmpty ? 'an' : 'a nonempty'} array`)
  }
  const entries = Array.from(value, entry => {
    const text = optionalText(entry, field)
    if (text === undefined) throw new Error(`subagent-antigravity: ${field} entries must be nonempty strings`)
    return text
  })
  if (new Set(entries).size !== entries.length) {
    throw new Error(`subagent-antigravity: ${field} must not contain duplicates`)
  }
  return entries
}

function resolveConfig(config: Config): ResolvedConfig {
  const permissionMode = config.permissionMode ?? 'deny'
  if (permissionMode !== 'deny' && permissionMode !== 'allow-once') {
    throw new Error('subagent-antigravity: permissionMode must be deny or allow-once')
  }
  const suppliedEnv = config.env ?? {}
  if (typeof suppliedEnv !== 'object' || suppliedEnv === null || Array.isArray(suppliedEnv)
    || Object.values(suppliedEnv).some(value => typeof value !== 'string')) {
    throw new Error('subagent-antigravity: env must map environment names to strings')
  }
  const resolved: ResolvedConfig = {
    providerName: optionalText(config.providerName, 'providerName') ?? 'antigravity',
    authMethod: resolveAuthMethod(config.authMethod),
    agentPlatformMode: resolveAgentPlatformMode(config.agentPlatformMode),
    geminiHome: optionalAbsolutePath(config.geminiHome, 'geminiHome'),
    model: optionalText(config.model, 'model'),
    effort: optionalText(config.effort, 'effort'),
    allowedModels: optionalList(config.allowedModels, 'allowedModels'),
    allowedEfforts: optionalList(config.allowedEfforts, 'allowedEfforts'),
    disabledTools: optionalList(config.disabledTools, 'disabledTools', true),
    gcpProject: optionalText(config.gcpProject, 'gcpProject'),
    gcpLocation: optionalText(config.gcpLocation, 'gcpLocation'),
    adcPath: optionalAbsolutePath(config.adcPath, 'adcPath'),
    runtimeDir: optionalAbsolutePath(config.runtimeDir, 'runtimeDir'),
    permissionMode,
    env: { ...suppliedEnv },
    disposeGraceMs: config.disposeGraceMs ?? 3_000,
    disposeEofGraceMs: config.disposeEofGraceMs ?? 1_000,
    startupTimeoutMs: config.startupTimeoutMs ?? 90_000,
    maxOutputBytes: config.maxOutputBytes ?? 8 * 1024 * 1024,
  }
  if (resolved.authMethod !== 'agent-platform' && resolved.agentPlatformMode !== 'native') {
    throw new Error('subagent-antigravity: adc or api-key agentPlatformMode requires authMethod=agent-platform')
  }
  for (const field of ['disposeGraceMs', 'disposeEofGraceMs', 'startupTimeoutMs'] as const) {
    assertPositiveFinite('subagent-antigravity', field, resolved[field])
    if (resolved[field] > MAX_TIMER_DELAY_MS) {
      throw new Error(`subagent-antigravity: ${field} exceeds the maximum timer duration`)
    }
  }
  if (!Number.isSafeInteger(resolved.maxOutputBytes) || resolved.maxOutputBytes <= 0) {
    throw new Error('subagent-antigravity: maxOutputBytes must be a positive safe integer')
  }
  return resolved
}

class AntigravityProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false

  constructor(
    readonly name: string,
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
  ) {}

  async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    request.signal.throwIfAborted()
    let cwd: string
    try {
      cwd = assertUsableCwd('subagent-antigravity', 'child cwd', request.cwd)
    } catch (cause: unknown) {
      throw new Error('subagent-antigravity: child working directory is unavailable', { cause })
    }
    const spec: AntigravityRunSpec = {
      cwd,
      authMethod: this.config.authMethod,
      agentPlatformMode: this.config.agentPlatformMode,
      ...(this.config.geminiHome === undefined ? {} : { geminiHome: this.config.geminiHome }),
      ...(this.config.model === undefined ? {} : { model: this.config.model }),
      ...(this.config.effort === undefined ? {} : { effort: this.config.effort }),
      ...(this.config.allowedModels === undefined ? {} : { allowedModels: [...this.config.allowedModels] }),
      ...(this.config.allowedEfforts === undefined ? {} : { allowedEfforts: [...this.config.allowedEfforts] }),
      ...(this.config.disabledTools === undefined ? {} : { disabledTools: [...this.config.disabledTools] }),
      ...(this.config.gcpProject === undefined ? {} : { gcpProject: this.config.gcpProject }),
      ...(this.config.gcpLocation === undefined ? {} : { gcpLocation: this.config.gcpLocation }),
      ...(this.config.adcPath === undefined ? {} : { adcPath: this.config.adcPath }),
      ...(this.config.runtimeDir === undefined ? {} : { runtimeDir: this.config.runtimeDir }),
      permissionMode: this.config.permissionMode,
      env: { ...this.config.env },
      disposeGraceMs: this.config.disposeGraceMs,
      disposeEofGraceMs: this.config.disposeEofGraceMs,
      startupTimeoutMs: this.config.startupTimeoutMs,
      maxOutputBytes: this.config.maxOutputBytes,
      spawn: spawnSpec => this.ctx.subprocess.spawn(spawnSpec),
      onError: (_error, stopReason) => {
        this.ctx.logger.warn(`subagent-antigravity "${this.name}": child run failed (${stopReason})`)
      },
    }
    return startAntigravityRun(request, spec)
  }
}

/** Register one provider with optional deployment-owned model and effort settings. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  ctx.subagents.registerProvider(new AntigravityProvider(resolved.providerName, ctx, resolved))
}
