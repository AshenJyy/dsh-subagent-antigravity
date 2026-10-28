/** Authentication routing shared by the provider and the explicit setup CLI. */
import { isAbsolute } from 'node:path'

export const AUTH_METHODS = [
  'native', 'oauth-personal', 'oauth-business', 'gemini-api-key', 'agent-platform', 'gateway',
] as const

export type AuthMethod = typeof AUTH_METHODS[number]
export type AgentPlatformMode = 'native' | 'adc' | 'api-key'

export interface AuthenticationConfig {
  authMethod?: AuthMethod
  /** Only used with authMethod=agent-platform; native preserves Express precedence. */
  agentPlatformMode?: AgentPlatformMode
  /** Absolute persistent .gemini directory; this is not its parent directory. */
  geminiHome?: string
  gcpProject?: string
  gcpLocation?: string
  adcPath?: string
  env?: Record<string, string>
}

export function resolveAuthMethod(value: unknown): AuthMethod {
  if (value === undefined) return 'native'
  if (typeof value !== 'string' || !(AUTH_METHODS as readonly string[]).includes(value)) {
    throw new Error('subagent-antigravity: unsupported authMethod')
  }
  return value as AuthMethod
}

export function resolveAgentPlatformMode(value: unknown): AgentPlatformMode {
  if (value === undefined) return 'native'
  if (value !== 'native' && value !== 'adc' && value !== 'api-key') {
    throw new Error('subagent-antigravity: agentPlatformMode must be native, adc or api-key')
  }
  return value
}

const GATEWAY_ENV = /^(?:AGY_LLM_GATEWAY_.*|AGY_GATEWAY_.*|AGY_CA_CERT|AGY_ACP_ENABLE_GATEWAY_AUTH)$/i
const GATEWAY_FORWARD_NAMES = [
  'AGY_LLM_GATEWAY_URL', 'AGY_LLM_GATEWAY_API_KEY', 'AGY_LLM_GATEWAY_HEADERS',
  'AGY_LLM_GATEWAY_CA_CERT', 'AGY_LLM_GATEWAY_PROXY_URL', 'AGY_LLM_GATEWAY_MODELS',
  'AGY_GATEWAY_URL', 'AGY_GATEWAY_API_KEY', 'AGY_GATEWAY_HEADERS', 'AGY_CA_CERT',
] as const

/**
 * Return overrides and undefined tombstones, never a copy of the parent env.
 * Native inheritance deliberately does not bypass DSH's credential scrub.
 * Explicit routes opt in only to their corresponding standard API key or
 * documented gateway variables. This module does not log credential values
 * or serialize them into authentication protocol metadata.
 */
export function authenticationEnvironment(
  config: AuthenticationConfig,
  ambient: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const method = resolveAuthMethod(config.authMethod)
  const mode = resolveAgentPlatformMode(config.agentPlatformMode)
  if (method !== 'agent-platform' && mode !== 'native') {
    throw new Error('subagent-antigravity: adc or api-key agentPlatformMode requires authMethod=agent-platform')
  }
  const explicit = config.env ?? {}
  if (typeof explicit !== 'object' || explicit === null || Array.isArray(explicit)
    || Object.entries(explicit).some(([key, value]) => !key || /[=\0]/.test(key)
      || typeof value !== 'string' || value.includes('\0'))) {
    throw new Error('subagent-antigravity: env must map valid environment names to strings without NUL bytes')
  }
  const env: NodeJS.ProcessEnv = { ...explicit }
  const names = new Set([...Object.keys(ambient), ...Object.keys(explicit)])

  const replace = (name: string, value: string | undefined): void => {
    // Windows treats env names case-insensitively. Remove aliases before
    // adding the canonical spelling, including aliases inherited by DSH.
    for (const key of names) {
      if (key.toUpperCase() === name.toUpperCase()) env[key] = undefined
    }
    env[name] = value
  }
  const selectedValue = (name: string): string | undefined => {
    const find = (source: NodeJS.ProcessEnv): string | undefined => {
      if (Object.hasOwn(source, name)) return name
      return process.platform === 'win32'
        ? Object.keys(source).find(key => key.toUpperCase() === name)
        : undefined
    }
    const explicitName = find(explicit)
    // A deliberately empty value must not expose an ambient key instead.
    if (explicitName !== undefined) return explicit[explicitName]
    const ambientName = find(ambient)
    return ambientName === undefined ? undefined : ambient[ambientName]
  }

  for (const [field, name] of [
    ['geminiHome', 'GEMINI_HOME'],
    ['gcpProject', 'GOOGLE_CLOUD_PROJECT'],
    ['gcpLocation', 'GOOGLE_CLOUD_LOCATION'],
    ['adcPath', 'GOOGLE_APPLICATION_CREDENTIALS'],
  ] as const) {
    const value = config[field]
    if (value === undefined) continue
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
      throw new Error(`subagent-antigravity: ${field} must be a nonempty string without NUL bytes`)
    }
    const text = value.trim()
    if ((field === 'geminiHome' || field === 'adcPath') && !isAbsolute(text)) {
      throw new Error(`subagent-antigravity: ${field} must be an absolute path`)
    }
    replace(name, text)
  }

  // No implicit authenticate, route flags or credential forwarding in native mode.
  if (method === 'native') return env

  if (method === 'gateway') {
    for (const name of GATEWAY_FORWARD_NAMES) replace(name, selectedValue(name))
    replace('AGY_ACP_ENABLE_GATEWAY_AUTH', 'true')
  } else {
    for (const name of names) if (GATEWAY_ENV.test(name)) env[name] = undefined
    replace('AGY_ACP_ENABLE_GATEWAY_AUTH', undefined)
    replace('AGY_CA_CERT', undefined)
  }

  const keyName = method === 'gemini-api-key' ? 'GEMINI_API_KEY'
    : method === 'agent-platform' && mode !== 'adc' ? 'GOOGLE_API_KEY' : undefined
  const key = keyName === undefined ? undefined : selectedValue(keyName)
  replace('GOOGLE_API_KEY', undefined)
  replace('GEMINI_API_KEY', undefined)

  if (method === 'gemini-api-key' || (method === 'agent-platform' && mode === 'api-key')) {
    if (!key?.trim()) {
      throw new Error(`subagent-antigravity: ${keyName} must be nonempty for the selected authentication route`)
    }
  }
  if (keyName !== undefined && key?.trim()) replace(keyName, key)
  return env
}
