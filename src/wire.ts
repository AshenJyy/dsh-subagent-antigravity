/**
 * Minimal Antigravity ACP 1.4.3 adapter, following the MIT-licensed
 * @deepseek-ai/dsh-subagent-codex 0.2.1-rc.5 wire's separation of transport,
 * product protocol, permissions, cancellation, and answer selection.
 * The shared JSON-RPC transport owns framing and request correlation.
 */

import type { Readable, Writable } from 'node:stream'
import { createRequire } from 'node:module'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SubagentResult } from '@deepseek-ai/dsh-subagent'
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol'
import { AUTH_METHODS, type AuthMethod } from './auth.js'
import {
  ACP_AGENT_NAME,
  ACP_AGENT_VERSION,
  AntigravityProtocolError,
  assertCurrent,
  assertPrompt,
  assertSelection,
  readSelection,
  record,
  requireChoice,
  validChoice,
  type ModelPolicy,
  type ModelSelection,
} from './model-policy.js'

export type { Effort } from './model-policy.js'

type JsonObject = Record<string, unknown>

// Identify this adapter, independently of whichever compatible DSH host loads it.
// Read once through Node's module cache, not on every delegated task.
const { version: CLIENT_VERSION } = createRequire(import.meta.url)('../package.json') as { version: string }

export interface AntigravityWireOptions extends ModelPolicy {
  /** Native inheritance skips authenticate and lets session/new resolve state. */
  readonly authMethod?: AuthMethod
  /** Computed from the child's actual environment, never the host's environment. */
  readonly gatewayAuthEnabled?: boolean
  readonly disabledTools?: readonly string[]
  readonly permissionMode: 'deny' | 'allow-once'
  readonly maxOutputBytes: number
}

const ORDINARY_TOOL_KINDS = new Set(['read', 'edit', 'execute', 'search', 'fetch'])
const UNATTENDED_TOOL = /(?:^|\W)(?:switch_mode|ask_question|schedule)(?:$|\W)/i

function validChoices(values: readonly string[] | undefined): boolean {
  return values === undefined || (Array.isArray(values) && values.length <= 256 && values.every(validChoice))
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new AntigravityProtocolError('invalid ACP identifier')
  }
  return value
}

/** One connection, one fresh session, one prompt; no reusable session surface. */
export class AntigravityWire {
  private readonly transport: JsonRpcLineTransport
  private readonly options: AntigravityWireOptions
  private readonly fatal = Promise.withResolvers<never>()
  private failure: AntigravityProtocolError | undefined
  private sessionId: string | undefined
  private provisionalSessionId: string | undefined
  private knownLegacyModel: {
    readonly id: string
    readonly model: string | undefined
    readonly effort: string | undefined
  } | undefined
  private initialized = false
  private sessionStarting = false
  private ready = false
  private turnStarted = false
  private terminalObserved = false
  private closed = false
  private outputBytes = 0
  private readonly outputChunks: string[] = []
  private pendingOutput = ''
  private diagnostic: string | undefined

  constructor(
    private readonly input: Readable,
    output: Writable,
    options: AntigravityWireOptions,
  ) {
    if ((options.model !== undefined && !validChoice(options.model))
      || (options.effort !== undefined && !validChoice(options.effort))
      || !validChoices(options.allowedModels) || !validChoices(options.allowedEfforts)
      || !validChoices(options.disabledTools)
      || !AUTH_METHODS.includes(options.authMethod ?? 'native')
      || (options.gatewayAuthEnabled !== undefined && typeof options.gatewayAuthEnabled !== 'boolean')
      || (options.permissionMode !== 'deny' && options.permissionMode !== 'allow-once')
      || !Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes < 1) {
      throw new AntigravityProtocolError('invalid wire options')
    }
    this.options = {
      ...options,
      ...(options.allowedModels === undefined ? {} : { allowedModels: [...options.allowedModels] }),
      ...(options.allowedEfforts === undefined ? {} : { allowedEfforts: [...options.allowedEfforts] }),
      ...(options.disabledTools === undefined ? {} : { disabledTools: [...options.disabledTools] }),
    }
    this.transport = new JsonRpcLineTransport(input, output)
    void this.fatal.promise.catch(() => {})
    this.transport.onRequest((method, params) => this.handleServerRequest(method, params))
    this.transport.onNotification((method, params) => {
      try {
        this.handleNotification(method, params)
      } catch (error: unknown) {
        this.fail(error instanceof AntigravityProtocolError
          ? error : new AntigravityProtocolError('invalid ACP notification'))
      }
    })
    input.on('error', this.onStreamError)
    input.on('end', this.onInputEnd)
    // Retain error listeners through process teardown so late EPIPE cannot
    // become an unhandled EventEmitter error. Never expose raw stream errors.
    output.on('error', this.onStreamError)
  }

  start(): void {
    this.assertOpen()
    this.transport.start()
  }

  async initialize(signal: AbortSignal): Promise<void> {
    if (this.initialized) throw new AntigravityProtocolError('connection already initialized')
    const authMethod = this.options.authMethod ?? 'native'
    const response = record(await this.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: authMethod === 'gateway' ? { auth: { _meta: { gateway: true } } } : {},
      clientInfo: { name: 'deepseek-harness-subagent-antigravity', version: CLIENT_VERSION },
    }, signal))
    const info = record(response.agentInfo)
    if (response.protocolVersion !== 1 || info.name !== ACP_AGENT_NAME
      || info.version !== ACP_AGENT_VERSION) {
      throw new AntigravityProtocolError('unsupported ACP runtime identity or version')
    }
    if (authMethod !== 'native') {
      if (!Array.isArray(response.authMethods)) {
        throw new AntigravityProtocolError('ACP did not advertise authentication methods')
      }
      const advertised = response.authMethods.some(method => record(method).id === authMethod)
      // The pinned runtime advertises no buttons under required enterprise
      // gateway policy. An explicit gateway selection may still authenticate
      // when the caller enabled the native gateway gate in the child process.
      const requiredGateway = authMethod === 'gateway' && response.authMethods.length === 0
        && this.options.gatewayAuthEnabled === true
      if (!advertised && !requiredGateway) {
        throw new AntigravityProtocolError('configured authentication method is unavailable')
      }
      record(await this.request('authenticate', { methodId: authMethod }, signal))
    }
    // initialize (and some authenticate methods) does not prove that credentials
    // or model access are valid. Native state is resolved later by session/new.
    this.initialized = true
  }

  async startSession(cwd: string, signal: AbortSignal): Promise<void> {
    if (!this.initialized || this.sessionStarting || this.sessionId !== undefined) {
      throw new AntigravityProtocolError('invalid session lifecycle')
    }
    this.sessionStarting = true
    const session = record(await this.request('session/new', {
      cwd,
      mcpServers: [],
      ...(this.options.disabledTools?.length
        ? { _meta: { antigravity: { disabledTools: [...this.options.disabledTools] } } }
        : {}),
    }, signal))
    const id = identifier(session.sessionId)
    if (this.provisionalSessionId !== undefined && this.provisionalSessionId !== id) {
      throw new AntigravityProtocolError('ACP session identity changed during creation')
    }
    this.sessionId = id
    let selection = readSelection(session.configOptions)
    assertCurrent(selection.mode, 'default')
    // Legacy notifications carry concrete IDs, while configOptions may expose
    // model families. Bind only a pair the server actually reports together;
    // never infer a family or effort by splitting a model identifier.
    if (session.models !== undefined && session.models !== null) {
      const models = record(session.models)
      if (validChoice(models.currentModelId)) {
        this.knownLegacyModel = {
          id: models.currentModelId,
          model: selection.model?.currentValue,
          effort: selection.effort?.currentValue,
        }
      }
    }
    if (this.options.model !== undefined) {
      requireChoice(selection.model, this.options.model)
      const model = record(await this.setOption('model', this.options.model, signal))
      selection = readSelection(model.configOptions)
      assertCurrent(selection.model, this.options.model)
      assertCurrent(selection.mode, 'default')
    }
    if (this.options.effort !== undefined) {
      requireChoice(selection.effort, this.options.effort)
      const thinking = record(await this.setOption('thinking_level', this.options.effort, signal))
      selection = readSelection(thinking.configOptions)
      assertCurrent(selection.effort, this.options.effort)
    }
    const mode = record(await this.setOption('mode', 'default', signal))
    selection = readSelection(mode.configOptions)
    this.verifySelection(selection)
    this.assertOpen()
    this.ready = true
  }

  async runTurn(texts: readonly string[], signal: AbortSignal): Promise<SubagentResult> {
    this.assertOpen()
    if (!this.ready || this.turnStarted) {
      throw new AntigravityProtocolError('a ready session accepts exactly one prompt')
    }
    assertPrompt(texts)
    this.turnStarted = true
    const response = record(await this.request('session/prompt', {
      sessionId: this.sessionId,
      prompt: texts.map(text => ({ type: 'text', text })),
    }, signal))
    this.assertOpen()
    this.terminalObserved = true
    const output = this.collectOutput()
    switch (response.stopReason) {
      case 'end_turn':
        if (output.length === 0) {
          throw new AntigravityProtocolError('ACP completed without an answer')
        }
        return { output, stopReason: 'completed' }
      case 'max_tokens':
        return { output, stopReason: 'max-tokens' }
      case 'refusal':
        return { output, stopReason: 'refusal' }
      case 'cancelled':
        return { output, stopReason: 'aborted' }
      case 'max_turn_requests':
        throw new AntigravityProtocolError('ACP reached its turn-request limit')
      default:
        throw new AntigravityProtocolError('ACP returned an unknown terminal reason')
    }
  }

  /** Remote cancellation is best effort; the run owner still reaps the process. */
  interrupt(): void {
    const sessionId = this.sessionId ?? this.provisionalSessionId
    if (sessionId === undefined || this.closed) return
    try {
      this.transport.notify('session/cancel', { sessionId })
      void this.transport.flush().catch(() => {})
    } catch {
      // The process may already have stopped accepting protocol input.
    }
  }

  collectOutput(): ContentBlock[] {
    const text = this.outputChunks.join('') + this.pendingOutput
    return text.trim().length > 0 ? [{ type: 'text', text }] : []
  }

  collectDiagnostic(): string | undefined {
    return this.diagnostic
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.input.off('end', this.onInputEnd)
    this.transport.close()
  }

  private setOption(configId: string, value: string, signal: AbortSignal): Promise<unknown> {
    return this.request('session/set_config_option', { sessionId: this.sessionId, configId, value }, signal)
  }

  private async request(method: string, params: JsonObject, signal: AbortSignal): Promise<unknown> {
    this.assertOpen()
    if (signal.aborted) throw new AntigravityProtocolError('ACP operation aborted')
    // Passing the signal into the shared transport abandons its correlation
    // entry as well as settling the local fatal/abort race.
    try {
      return await Promise.race([
        this.fatal.promise,
        this.transport.request(method, params, signal),
      ])
    } catch (error: unknown) {
      if (error instanceof AntigravityProtocolError) throw error
      throw new AntigravityProtocolError(signal.aborted ? 'ACP operation aborted' : 'ACP request failed')
    }
  }

  private assertOpen(): void {
    if (this.failure !== undefined) throw this.failure
    if (this.closed) throw new AntigravityProtocolError('ACP connection is closed')
  }

  private fail(error: AntigravityProtocolError): void {
    if (this.failure !== undefined || this.closed) return
    this.failure = error
    this.diagnostic = error.message
    this.interrupt()
    this.fatal.reject(error)
  }

  private readonly onStreamError = (): void => {
    this.fail(new AntigravityProtocolError('ACP protocol stream failed'))
  }

  private readonly onInputEnd = (): void => {
    // A final response and EOF can share an event-loop turn. Let the response
    // traverse its promise continuations before deciding that EOF was early.
    setImmediate(() => {
      if (!this.terminalObserved && !this.closed && this.failure === undefined) {
        this.fail(new AntigravityProtocolError('ACP protocol stream closed before completion'))
      }
    })
  }

  private verifySelection(selection: ModelSelection): void {
    assertSelection(selection, this.options)
    assertCurrent(selection.mode, 'default')
    if (this.knownLegacyModel !== undefined
      && (this.knownLegacyModel.model !== selection.model?.currentValue
        || this.knownLegacyModel.effort !== selection.effort?.currentValue)) {
      this.knownLegacyModel = undefined
    }
  }

  private get hasModelPolicy(): boolean {
    return this.options.model !== undefined || this.options.effort !== undefined
      || this.options.allowedModels !== undefined || this.options.allowedEfforts !== undefined
  }

  private validateSession(params: JsonObject): void {
    const id = identifier(params.sessionId)
    if (this.sessionId !== undefined) {
      if (id !== this.sessionId) throw new AntigravityProtocolError('ACP referenced another session')
      return
    }
    if (!this.sessionStarting || (this.provisionalSessionId !== undefined && this.provisionalSessionId !== id)) {
      throw new AntigravityProtocolError('ACP referenced an unexpected session')
    }
    this.provisionalSessionId = id
  }

  private handleNotification(method: string, params: JsonObject): void {
    if (this.closed || this.failure !== undefined) return
    if (method !== 'session/update') return
    this.validateSession(params)
    const update = record(params.update)
    switch (update.sessionUpdate) {
      case 'config_option_update':
        // The server emits this for its own replacements, not for our setters.
        this.verifySelection(readSelection(update.configOptions))
        return
      case 'current_model_update':
        identifier(update.currentModelId)
        if (this.hasModelPolicy && update.currentModelId !== this.knownLegacyModel?.id) {
          throw new AntigravityProtocolError('ACP legacy model update cannot verify the configured model policy')
        }
        return
      case 'current_mode_update':
        if (update.currentModeId !== 'default') {
          throw new AntigravityProtocolError('ACP permission mode drifted')
        }
        return
      case 'agent_message_chunk': {
        if (!this.turnStarted || this.terminalObserved) {
          throw new AntigravityProtocolError('ACP answer arrived outside the active prompt')
        }
        const content = record(update.content)
        if (content.type !== 'text') return
        if (typeof content.text !== 'string') throw new AntigravityProtocolError('invalid ACP answer text')
        this.appendText(content.text)
        return
      }
      // Thoughts, user messages, tools, plans, usage, and commands never enter
      // the returned answer and are not retained in memory.
      default:
        return
    }
  }

  private appendText(text: string): void {
    if (text.length === 0) return
    const bytes = Buffer.byteLength(text, 'utf8')
    if (bytes > this.options.maxOutputBytes - this.outputBytes) {
      throw new AntigravityProtocolError('ACP answer exceeded the output byte limit')
    }
    this.outputBytes += bytes
    this.pendingOutput += text
    // Coalesce tiny deltas without repeated joins of the full answer. The
    // number of retained chunks is bounded by the output cap / 16 KiB.
    if (this.pendingOutput.length >= 16_384) {
      this.outputChunks.push(this.pendingOutput)
      this.pendingOutput = ''
    }
  }

  private async handleServerRequest(method: string, params: JsonObject): Promise<unknown> {
    try {
      this.assertOpen()
      this.validateSession(params)
      if (method !== 'session/request_permission') {
        throw new AntigravityProtocolError('unsupported ACP client request')
      }
      const tool = record(params.toolCall)
      const id = identifier(tool.toolCallId)
      const ordinary = this.ready && this.turnStarted && !this.terminalObserved
        && !id.startsWith('interaction_')
        && typeof tool.kind === 'string' && ORDINARY_TOOL_KINDS.has(tool.kind)
        && typeof tool.title === 'string' && !UNATTENDED_TOOL.test(tool.title)
        && !this.options.disabledTools?.some(name => tool.title === name || tool.title === `Run ${name}?`)
        && tool.status === 'pending'
        && (tool._meta === undefined || tool._meta === null)
      if (this.options.permissionMode === 'allow-once' && ordinary && Array.isArray(params.options)) {
        const choices = params.options.map(record).filter(option => option.kind === 'allow_once')
        if (choices.length === 1) {
          const optionId = identifier(choices[0]?.optionId)
          this.diagnostic = 'Antigravity permission decision: allowed one ordinary tool request.'
          return { outcome: { outcome: 'selected', optionId } }
        }
      }
      this.diagnostic = 'Antigravity permission decision: denied unattended or unsupported request.'
      return { outcome: { outcome: 'cancelled' } }
    } catch (error: unknown) {
      const safe = error instanceof AntigravityProtocolError
        ? error : new AntigravityProtocolError('invalid ACP client request')
      this.fail(safe)
      throw safe
    }
  }
}
