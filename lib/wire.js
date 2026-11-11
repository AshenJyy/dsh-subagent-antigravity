/**
 * Minimal agy acp adapter, following the MIT-licensed
 * @deepseek-ai/dsh-subagent-codex 0.2.1-rc.5 wire's separation of transport,
 * product protocol, permissions, cancellation, and answer selection.
 * The shared JSON-RPC transport owns framing and request correlation.
 */
import { createRequire } from 'node:module';
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol';
import { AUTH_METHODS } from './auth.js';
import { ACP_AGENT_NAME, supportedAgyVersion, AntigravityProtocolError, assertCurrent, assertPrompt, assertSelection, readSelection, record, requireChoice, validChoice, } from './model-policy.js';
// Identify this adapter, independently of whichever compatible DSH host loads it.
// Read once through Node's module cache, not on every delegated task.
const { version: CLIENT_VERSION } = createRequire(import.meta.url)('../package.json');
const ORDINARY_TOOL_KINDS = new Set(['read', 'edit', 'execute', 'search', 'fetch']);
const UNATTENDED_TOOL = /(?:^|\W)(?:switch_mode|ask_question|schedule)(?:$|\W)/i;
function validChoices(values) {
    return values === undefined || (Array.isArray(values) && values.length <= 256 && values.every(validChoice));
}
function identifier(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
        throw new AntigravityProtocolError('invalid ACP identifier');
    }
    return value;
}
/** One connection, one fresh session, one prompt; no reusable session surface. */
export class AntigravityWire {
    input;
    transport;
    options;
    fatal = Promise.withResolvers();
    failure;
    sessionId;
    provisionalSessionId;
    knownLegacyModel;
    legacyModelIds = new Set();
    initialized = false;
    sessionStarting = false;
    ready = false;
    turnStarted = false;
    terminalObserved = false;
    closed = false;
    outputBytes = 0;
    outputChunks = [];
    pendingOutput = '';
    diagnostic;
    constructor(input, output, options) {
        this.input = input;
        if ((options.model !== undefined && !validChoice(options.model))
            || (options.effort !== undefined && !validChoice(options.effort))
            || !validChoices(options.allowedModels) || !validChoices(options.allowedEfforts)
            || !validChoices(options.disabledTools)
            || !AUTH_METHODS.includes(options.authMethod ?? 'native')
            || (options.gatewayAuthEnabled !== undefined && typeof options.gatewayAuthEnabled !== 'boolean')
            || (options.permissionMode !== 'deny' && options.permissionMode !== 'allow-once')
            || !Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes < 1) {
            throw new AntigravityProtocolError('invalid wire options');
        }
        this.options = {
            ...options,
            ...(options.allowedModels === undefined ? {} : { allowedModels: [...options.allowedModels] }),
            ...(options.allowedEfforts === undefined ? {} : { allowedEfforts: [...options.allowedEfforts] }),
            ...(options.disabledTools === undefined ? {} : { disabledTools: [...options.disabledTools] }),
        };
        this.transport = new JsonRpcLineTransport(input, output);
        void this.fatal.promise.catch(() => { });
        this.transport.onRequest((method, params) => this.handleServerRequest(method, params));
        this.transport.onNotification((method, params) => {
            try {
                this.handleNotification(method, params);
            }
            catch (error) {
                this.fail(error instanceof AntigravityProtocolError
                    ? error : new AntigravityProtocolError('invalid ACP notification'));
            }
        });
        input.on('error', this.onStreamError);
        input.on('end', this.onInputEnd);
        // Retain error listeners through process teardown so late EPIPE cannot
        // become an unhandled EventEmitter error. Never expose raw stream errors.
        output.on('error', this.onStreamError);
    }
    start() {
        this.assertOpen();
        this.transport.start();
    }
    async initialize(signal) {
        if (this.initialized)
            throw new AntigravityProtocolError('connection already initialized');
        const authMethod = this.options.authMethod ?? 'native';
        const response = record(await this.request('initialize', {
            protocolVersion: 1,
            clientCapabilities: {},
            clientInfo: { name: 'deepseek-harness-subagent-antigravity', version: CLIENT_VERSION },
        }, signal));
        const info = record(response.agentInfo);
        if (response.protocolVersion !== 1 || info.name !== ACP_AGENT_NAME
            || !supportedAgyVersion(info.version)) {
            throw new AntigravityProtocolError('unsupported ACP runtime identity or version');
        }
        if (authMethod !== 'native') {
            if (!Array.isArray(response.authMethods)) {
                throw new AntigravityProtocolError('ACP did not advertise authentication methods');
            }
            const advertised = response.authMethods.some(method => record(method).id === authMethod);
            if (!advertised) {
                throw new AntigravityProtocolError('configured authentication method is unavailable');
            }
            record(await this.request('authenticate', { methodId: authMethod }, signal));
        }
        // initialize (and some authenticate methods) does not prove that credentials
        // or model access are valid. Native state is resolved later by session/new.
        this.initialized = true;
    }
    async startSession(cwd, signal) {
        if (!this.initialized || this.sessionStarting || this.sessionId !== undefined) {
            throw new AntigravityProtocolError('invalid session lifecycle');
        }
        this.sessionStarting = true;
        if (this.options.disabledTools?.length) {
            throw new AntigravityProtocolError('agy acp does not advertise disabledTools support');
        }
        const session = record(await this.request('session/new', {
            cwd,
            mcpServers: [],
        }, signal));
        const id = identifier(session.sessionId);
        if (this.provisionalSessionId !== undefined && this.provisionalSessionId !== id) {
            throw new AntigravityProtocolError('ACP session identity changed during creation');
        }
        this.sessionId = id;
        let selection = readSelection(session.configOptions);
        requireChoice(selection.mode, 'default', 'mode');
        // Legacy notifications carry concrete IDs, while configOptions may expose
        // model families. Bind only a pair the server actually reports together;
        // never infer a family or effort by splitting a model identifier.
        if (session.models !== undefined && session.models !== null) {
            const models = record(session.models);
            if (Array.isArray(models.availableModels) && models.availableModels.length <= 1024) {
                for (const entry of models.availableModels)
                    this.legacyModelIds.add(identifier(record(entry).modelId));
            }
            if (validChoice(models.currentModelId)) {
                this.knownLegacyModel = {
                    id: models.currentModelId,
                    model: selection.model?.currentValue,
                    effort: selection.effort?.currentValue,
                };
            }
        }
        if (selection.mode?.currentValue !== 'default') {
            const mode = record(await this.setOption('mode', 'default', signal));
            selection = readSelection(mode.configOptions);
            assertCurrent(selection.mode, 'default', 'mode');
        }
        if (this.options.model !== undefined && selection.model?.currentValue !== this.options.model) {
            requireChoice(selection.model, this.options.model, 'model');
            const model = record(await this.setOption('model', this.options.model, signal));
            selection = readSelection(model.configOptions);
            assertCurrent(selection.model, this.options.model, 'model');
            assertCurrent(selection.mode, 'default', 'mode');
        }
        if (this.options.effort !== undefined && selection.effort?.currentValue !== this.options.effort) {
            requireChoice(selection.effort, this.options.effort, 'effort');
            const thinking = record(await this.setOption('thought_level', this.options.effort, signal));
            selection = readSelection(thinking.configOptions);
            assertCurrent(selection.effort, this.options.effort, 'effort');
        }
        this.verifySelection(selection);
        // CLI documents concrete slugs as family + effort. Bind only a concrete
        // slug that was advertised and whose family/effort were read back above.
        const concrete = `${selection.model?.currentValue}-${selection.effort?.currentValue}`;
        if (this.legacyModelIds.has(concrete)) {
            this.knownLegacyModel = { id: concrete, model: selection.model?.currentValue, effort: selection.effort?.currentValue };
        }
        this.assertOpen();
        this.ready = true;
    }
    async runTurn(texts, signal) {
        this.assertOpen();
        if (!this.ready || this.turnStarted) {
            throw new AntigravityProtocolError('a ready session accepts exactly one prompt');
        }
        assertPrompt(texts);
        this.turnStarted = true;
        const response = record(await this.request('session/prompt', {
            sessionId: this.sessionId,
            prompt: texts.map(text => ({ type: 'text', text })),
        }, signal));
        this.assertOpen();
        this.terminalObserved = true;
        const output = this.collectOutput();
        switch (response.stopReason) {
            case 'end_turn':
                if (output.length === 0) {
                    throw new AntigravityProtocolError('ACP completed without an answer');
                }
                return { output, stopReason: 'completed' };
            case 'max_tokens':
                return { output, stopReason: 'max-tokens' };
            case 'refusal':
                return { output, stopReason: 'refusal' };
            case 'cancelled':
                return { output, stopReason: 'aborted' };
            case 'max_turn_requests':
                throw new AntigravityProtocolError('ACP reached its turn-request limit');
            default:
                throw new AntigravityProtocolError('ACP returned an unknown terminal reason');
        }
    }
    /** Remote cancellation is best effort; the run owner still reaps the process. */
    interrupt() {
        const sessionId = this.sessionId ?? this.provisionalSessionId;
        if (sessionId === undefined || this.closed)
            return;
        try {
            this.transport.notify('session/cancel', { sessionId });
            void this.transport.flush().catch(() => { });
        }
        catch {
            // The process may already have stopped accepting protocol input.
        }
    }
    collectOutput() {
        const text = this.outputChunks.join('') + this.pendingOutput;
        return text.trim().length > 0 ? [{ type: 'text', text }] : [];
    }
    collectDiagnostic() {
        return this.diagnostic;
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.input.off('end', this.onInputEnd);
        this.transport.close();
    }
    setOption(configId, value, signal) {
        return this.request('session/set_config_option', { sessionId: this.sessionId, configId, value }, signal);
    }
    async request(method, params, signal) {
        this.assertOpen();
        if (signal.aborted)
            throw new AntigravityProtocolError('ACP operation aborted');
        // Passing the signal into the shared transport abandons its correlation
        // entry as well as settling the local fatal/abort race.
        try {
            return await Promise.race([
                this.fatal.promise,
                this.transport.request(method, params, signal),
            ]);
        }
        catch (error) {
            if (error instanceof AntigravityProtocolError)
                throw error;
            throw new AntigravityProtocolError(signal.aborted ? 'ACP operation aborted' : 'ACP request failed');
        }
    }
    assertOpen() {
        if (this.failure !== undefined)
            throw this.failure;
        if (this.closed)
            throw new AntigravityProtocolError('ACP connection is closed');
    }
    fail(error) {
        if (this.failure !== undefined || this.closed)
            return;
        this.failure = error;
        this.diagnostic = error.message;
        this.interrupt();
        this.fatal.reject(error);
    }
    onStreamError = () => {
        this.fail(new AntigravityProtocolError('ACP protocol stream failed'));
    };
    onInputEnd = () => {
        // A final response and EOF can share an event-loop turn. Let the response
        // traverse its promise continuations before deciding that EOF was early.
        setImmediate(() => {
            if (!this.terminalObserved && !this.closed && this.failure === undefined) {
                this.fail(new AntigravityProtocolError('ACP protocol stream closed before completion'));
            }
        });
    };
    verifySelection(selection) {
        assertSelection(selection, this.options);
        assertCurrent(selection.mode, 'default', 'mode');
        if (this.knownLegacyModel !== undefined
            && (this.knownLegacyModel.model !== selection.model?.currentValue
                || this.knownLegacyModel.effort !== selection.effort?.currentValue)) {
            this.knownLegacyModel = undefined;
        }
    }
    get hasModelPolicy() {
        return this.options.model !== undefined || this.options.effort !== undefined
            || this.options.allowedModels !== undefined || this.options.allowedEfforts !== undefined;
    }
    validateSession(params) {
        const id = identifier(params.sessionId);
        if (this.sessionId !== undefined) {
            if (id !== this.sessionId)
                throw new AntigravityProtocolError('ACP referenced another session');
            return;
        }
        if (!this.sessionStarting || (this.provisionalSessionId !== undefined && this.provisionalSessionId !== id)) {
            throw new AntigravityProtocolError('ACP referenced an unexpected session');
        }
        this.provisionalSessionId = id;
    }
    handleNotification(method, params) {
        if (this.closed || this.failure !== undefined)
            return;
        if (method !== 'session/update')
            return;
        this.validateSession(params);
        const update = record(params.update);
        switch (update.sessionUpdate) {
            case 'config_option_update':
                // agy emits notifications for our setters too. Intermediate choices
                // are not the final policy; no prompt or tool approval occurs yet.
                // Setter replies are checked before publication; later drift fails.
                if (this.ready)
                    this.verifySelection(readSelection(update.configOptions));
                else
                    readSelection(update.configOptions);
                return;
            case 'current_model_update':
                identifier(update.currentModelId);
                if (this.ready && this.hasModelPolicy && update.currentModelId !== this.knownLegacyModel?.id) {
                    throw new AntigravityProtocolError('ACP legacy model update cannot verify the configured model policy');
                }
                return;
            case 'current_mode_update':
                if (this.ready && update.currentModeId !== 'default') {
                    throw new AntigravityProtocolError('ACP permission mode drifted');
                }
                return;
            case 'agent_message_chunk': {
                if (!this.turnStarted || this.terminalObserved) {
                    throw new AntigravityProtocolError('ACP answer arrived outside the active prompt');
                }
                const content = record(update.content);
                if (content.type !== 'text')
                    return;
                if (typeof content.text !== 'string')
                    throw new AntigravityProtocolError('invalid ACP answer text');
                this.appendText(content.text);
                return;
            }
            // Thoughts, user messages, tools, plans, usage, and commands never enter
            // the returned answer and are not retained in memory.
            default:
                return;
        }
    }
    appendText(text) {
        if (text.length === 0)
            return;
        const bytes = Buffer.byteLength(text, 'utf8');
        if (bytes > this.options.maxOutputBytes - this.outputBytes) {
            throw new AntigravityProtocolError('ACP answer exceeded the output byte limit');
        }
        this.outputBytes += bytes;
        this.pendingOutput += text;
        // Coalesce tiny deltas without repeated joins of the full answer. The
        // number of retained chunks is bounded by the output cap / 16 KiB.
        if (this.pendingOutput.length >= 16_384) {
            this.outputChunks.push(this.pendingOutput);
            this.pendingOutput = '';
        }
    }
    async handleServerRequest(method, params) {
        try {
            this.assertOpen();
            this.validateSession(params);
            if (method !== 'session/request_permission') {
                throw new AntigravityProtocolError('unsupported ACP client request');
            }
            const tool = record(params.toolCall);
            const id = identifier(tool.toolCallId);
            const ordinary = this.ready && this.turnStarted && !this.terminalObserved
                && !id.startsWith('interaction_')
                && typeof tool.kind === 'string' && ORDINARY_TOOL_KINDS.has(tool.kind)
                && typeof tool.title === 'string' && !UNATTENDED_TOOL.test(tool.title)
                && !this.options.disabledTools?.some(name => tool.title === name || tool.title === `Run ${name}?`)
                && tool.status === 'pending'
                && (tool._meta === undefined || tool._meta === null);
            if (this.options.permissionMode === 'allow-once' && ordinary && Array.isArray(params.options)) {
                const choices = params.options.map(record).filter(option => option.kind === 'allow_once');
                if (choices.length === 1) {
                    const optionId = identifier(choices[0]?.optionId);
                    this.diagnostic = 'Antigravity permission decision: allowed one ordinary tool request.';
                    return { outcome: { outcome: 'selected', optionId } };
                }
            }
            this.diagnostic = 'Antigravity permission decision: denied unattended or unsupported request.';
            return { outcome: { outcome: 'cancelled' } };
        }
        catch (error) {
            const safe = error instanceof AntigravityProtocolError
                ? error : new AntigravityProtocolError('invalid ACP client request');
            this.fail(safe);
            throw safe;
        }
    }
}
