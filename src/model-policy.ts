/** Optional exact model policy over the pinned runtime's advertised choices. */

export type Effort = string

export const ACP_AGENT_NAME = 'antigravity-acp'
export const ACP_AGENT_VERSION = '1.4.3'

type JsonObject = Record<string, unknown>

/** Only provider-authored, payload-free errors may leave the wire adapter. */
export class AntigravityProtocolError extends Error {
  constructor(message: string) {
    super(`subagent-antigravity: ${message}`)
    this.name = 'AntigravityProtocolError'
  }
}

export function record(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AntigravityProtocolError('invalid ACP object')
  }
  return value as JsonObject
}

export interface ModelPolicy {
  readonly model?: string
  readonly effort?: string
  readonly allowedModels?: readonly string[]
  readonly allowedEfforts?: readonly string[]
}

export function validChoice(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512
}

export interface SelectOption {
  readonly currentValue: string
  readonly values: ReadonlySet<string>
}

/** ACP select choices can be flat or grouped; neither form implies aliases. */
function selectValues(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value) || value.length > 256) {
    throw new AntigravityProtocolError('invalid ACP configuration choices')
  }
  const values = new Set<string>()
  for (const item of value) {
    const entry = record(item)
    const options = entry.options === undefined ? [entry] : entry.options
    if (!Array.isArray(options) || options.length > 256) {
      throw new AntigravityProtocolError('invalid ACP configuration group')
    }
    for (const option of options) {
      const choice = record(option)
      if (typeof choice.value !== 'string' || choice.value.length === 0
        || values.has(choice.value)) {
        throw new AntigravityProtocolError('invalid ACP configuration value')
      }
      values.add(choice.value)
    }
  }
  return values
}

function selectOption(options: readonly JsonObject[], id: string): SelectOption | undefined {
  const matches = options.map(record).filter(option => option.id === id)
  if (matches.length === 0) return undefined
  const selected = matches[0]
  if (matches.length !== 1 || selected?.type !== 'select'
    || typeof selected.currentValue !== 'string') {
    throw new AntigravityProtocolError('missing required ACP configuration option')
  }
  const values = selectValues(selected.options)
  if (!values.has(selected.currentValue)) {
    throw new AntigravityProtocolError('ACP configuration is not in its advertised choices')
  }
  return { currentValue: selected.currentValue, values }
}

export interface ModelSelection {
  readonly model?: SelectOption
  readonly effort?: SelectOption
  readonly mode?: SelectOption
}

/** Validate availability before selecting; this does not prove backend access. */
export function readSelection(options: unknown): ModelSelection {
  if (options === undefined || options === null) return {}
  if (!Array.isArray(options) || options.length > 64) {
    throw new AntigravityProtocolError('invalid ACP configuration options')
  }
  const entries = options.map(record)
  return {
    model: selectOption(entries, 'model'),
    effort: selectOption(entries, 'thinking_level'),
    mode: selectOption(entries, 'mode'),
  }
}

export function requireChoice(option: SelectOption | undefined, value: string): void {
  if (option === undefined || !option.values.has(value)) {
    throw new AntigravityProtocolError('configured ACP choice is unavailable')
  }
}

export function assertCurrent(option: SelectOption | undefined, value: string): void {
  requireChoice(option, value)
  if (option?.currentValue !== value) {
    throw new AntigravityProtocolError('ACP did not retain the configured choice')
  }
}

export function assertSelection(selection: ModelSelection, policy: ModelPolicy): void {
  if (policy.model !== undefined) assertCurrent(selection.model, policy.model)
  if (policy.effort !== undefined) assertCurrent(selection.effort, policy.effort)
  if (policy.allowedModels !== undefined
    && (selection.model === undefined || !policy.allowedModels.includes(selection.model.currentValue))) {
    throw new AntigravityProtocolError('ACP model is outside the configured allowlist')
  }
  if (policy.allowedEfforts !== undefined
    && (selection.effort === undefined || !policy.allowedEfforts.includes(selection.effort.currentValue))) {
    throw new AntigravityProtocolError('ACP effort is outside the configured allowlist')
  }
}

/** Reject slash commands before submission without rewriting the user's text. */
export function assertPrompt(texts: readonly string[]): void {
  if (texts.length === 0 || !texts.some(text => typeof text === 'string' && text.trim())) {
    throw new AntigravityProtocolError('a non-empty text prompt is required')
  }
  // Checking every block also covers runtimes that dispatch each text block.
  if (texts.some(text => typeof text !== 'string' || text.trimStart().startsWith('/'))) {
    throw new AntigravityProtocolError('slash-command prompts are unsupported')
  }
}
