/**
 * One native Antigravity process and one ACP session per delegated task.
 * Based on the MIT-licensed DeepSeek Harness out-of-process provider design;
 * see NOTICE. DSH owns scheduling/processes; Antigravity owns the agent loop.
 */
import { randomUUID } from 'node:crypto';
import { brandString } from '@deepseek-ai/dsh-brand';
import { settleRunResult, subprocessRunHandle, } from '@deepseek-ai/dsh-subagent';
import { scrubbedParentEnv, } from '@deepseek-ai/dsh-subprocess';
import { authenticationEnvironment, resolveAuthMethod } from './auth.js';
import { resolveRuntime } from './runtime.js';
import { AntigravityWire } from './wire.js';
class RunFailure extends Error {
    constructor(stage, category, cause, outcome) {
        const exit = outcome?.exitCode === null || outcome?.exitCode === undefined ? '' : `; exit code: ${outcome.exitCode}`;
        const signal = outcome?.signal ? `; signal: ${outcome.signal}` : '';
        super(`Antigravity failure (stage: ${stage}; category: ${category}${exit}${signal})`, { cause });
        this.name = 'AntigravityRunFailure';
    }
}
function textTask(prompt) {
    if (prompt.length === 0 || prompt.some(block => block.type !== 'text')) {
        throw new RunFailure('configuration', 'invalid-input');
    }
    const texts = prompt.map(block => block.text);
    if (texts.every(text => text.trim() === '') || texts.some(text => text.trimStart().startsWith('/'))) {
        // Do not turn user text into native /model, /boost, or other commands.
        throw new RunFailure('configuration', 'invalid-input');
    }
    return texts;
}
/** Pipe forwarding uses stream backpressure and never stores full diagnostics. */
function forwardStderr(input) {
    if (!input)
        return () => { };
    const sink = process.stderr;
    const detach = () => { input.unpipe(sink); input.resume(); };
    const inputError = () => { detach(); };
    const sinkError = () => { detach(); };
    input.on('error', inputError);
    sink.on('error', sinkError);
    input.pipe(sink, { end: false });
    return () => {
        input.unpipe(sink);
        input.off('error', inputError);
        sink.off('error', sinkError);
        // Native stderr is never part of the model-visible result.
        input.resume();
    };
}
async function waitWithin(child, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.ceil(ms));
    try {
        return await child.waitForExit(controller.signal);
    }
    finally {
        clearTimeout(timer);
    }
}
/** Observe pipe completion from spawn, before an exit can race its final data. */
function observeStdoutDrain(input) {
    const drained = Promise.withResolvers();
    let settled = false;
    let timer;
    const finish = () => {
        if (settled)
            return;
        settled = true;
        if (timer !== undefined)
            clearTimeout(timer);
        input?.off('end', finish);
        input?.off('close', finish);
        drained.resolve();
    };
    input?.once('end', finish);
    input?.once('close', finish);
    if (input === undefined || input.readableEnded || input.destroyed)
        finish();
    return {
        waitAfterExit: graceMs => {
            // This bound starts only after command exit. It handles descendants
            // retaining stdout; it is not a deadline for a live agent's output.
            if (!settled && timer === undefined)
                timer = setTimeout(finish, Math.ceil(graceMs));
            return drained.promise;
        },
        close: finish,
    };
}
function childEnvironment(spec, runtimeEnv) {
    // The subprocess service adds its scrubbed base. Runtime helper paths must
    // win over the explicit overlay; auth tombstones remove conflicting routes.
    return { ...spec.env, ...authenticationEnvironment(spec), ...runtimeEnv };
}
/** Establish native execution before handing lifecycle ownership to DSH. */
export async function startAntigravityRun(request, spec) {
    const texts = textTask(request.prompt);
    request.signal.throwIfAborted();
    const authMethod = resolveAuthMethod(spec.authMethod);
    let runtime;
    try {
        runtime = await resolveRuntime(spec.runtimeDir);
    }
    catch (cause) {
        throw new RunFailure('runtime', 'unavailable', cause);
    }
    request.signal.throwIfAborted();
    let env;
    try {
        env = childEnvironment(spec, runtime.env);
    }
    catch (cause) {
        throw new RunFailure('configuration', 'invalid-input', cause);
    }
    const effectiveEnv = { ...scrubbedParentEnv(), ...env };
    const gatewayAuthEnabled = /^(?:1|true|yes|on)$/i.test(effectiveEnv.AGY_ACP_ENABLE_GATEWAY_AUTH?.trim() ?? '');
    let child;
    try {
        child = spec.spawn({
            argv: runtime.argv,
            cwd: spec.cwd,
            stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
            graceMs: spec.disposeGraceMs,
            env,
        });
    }
    catch (cause) {
        throw new RunFailure('runtime', 'unavailable', cause);
    }
    const stdoutDrain = observeStdoutDrain(child.stdout);
    const stopStderr = forwardStderr(child.stderr);
    let outcome;
    let wire;
    let disposal;
    const disposeProcess = () => disposal ??= (async () => {
        try {
            try {
                child.stdin?.end();
            }
            catch { /* already closed */ }
            let exited = false;
            try {
                exited = await waitWithin(child, spec.disposeEofGraceMs);
            }
            catch { /* escalate and prove exit */ }
            if (!exited) {
                child.terminate();
                if (!await child.waitForExit())
                    throw new RunFailure('teardown', 'cleanup');
            }
            await child.done.catch(() => { });
            await new Promise(resolve => setImmediate(resolve));
        }
        catch (cause) {
            throw new RunFailure('teardown', 'cleanup', cause, outcome);
        }
        finally {
            wire?.close();
            stdoutDrain.close();
            stopStderr();
        }
    })();
    // Command exit does not imply that stdout is drained. Wait for its end/close
    // (bounded only for abnormal retained pipes), then let terminal-response
    // promise continuations settle before offering process failure to the race.
    const processFailure = child.done.then(async (value) => {
        outcome = value;
        await stdoutDrain.waitAfterExit(spec.disposeEofGraceMs);
        await new Promise(resolve => setImmediate(resolve));
        throw new RunFailure('process', 'process-exit', undefined, value);
    }, cause => { throw new RunFailure('process', 'unavailable', cause); });
    void processFailure.catch(() => { });
    const runAbort = new AbortController();
    const requestCancel = () => {
        if (runAbort.signal.aborted)
            return;
        runAbort.abort(new Error('Antigravity task cancelled'));
        wire?.interrupt();
    };
    const onAbort = () => requestCancel();
    request.signal.addEventListener('abort', onAbort, { once: true });
    if (request.signal.aborted)
        onAbort();
    const startupDeadline = new AbortController();
    const startupTimer = setTimeout(() => startupDeadline.abort(), Math.ceil(spec.startupTimeoutMs));
    const startupSignal = AbortSignal.any([runAbort.signal, startupDeadline.signal]);
    let stage = 'initialize';
    try {
        if (!child.stdin || !child.stdout)
            throw new RunFailure('initialize', 'protocol');
        wire = new AntigravityWire(child.stdout, child.stdin, {
            authMethod,
            gatewayAuthEnabled,
            ...(spec.model === undefined ? {} : { model: spec.model }),
            ...(spec.effort === undefined ? {} : { effort: spec.effort }),
            ...(spec.allowedModels === undefined ? {} : { allowedModels: spec.allowedModels }),
            ...(spec.allowedEfforts === undefined ? {} : { allowedEfforts: spec.allowedEfforts }),
            ...(spec.disabledTools === undefined ? {} : { disabledTools: spec.disabledTools }),
            permissionMode: spec.permissionMode, maxOutputBytes: spec.maxOutputBytes,
        });
        wire.start();
        await Promise.race([wire.initialize(startupSignal), processFailure]);
        stage = 'session';
        await Promise.race([wire.startSession(spec.cwd, startupSignal), processFailure]);
        startupSignal.throwIfAborted();
    }
    catch (cause) {
        request.signal.removeEventListener('abort', onAbort);
        const failure = new RunFailure(stage, startupDeadline.signal.aborted ? 'deadline' : 'protocol', cause, outcome);
        try {
            await disposeProcess();
        }
        catch (cleanup) {
            throw new AggregateError([failure, cleanup], 'Antigravity startup and cleanup failed');
        }
        if (runAbort.signal.aborted)
            throw new Error('Antigravity request aborted before publication');
        throw failure;
    }
    finally {
        clearTimeout(startupTimer);
    }
    const readyWire = wire;
    let diagnostic;
    const result = settleRunResult({
        attempt: async () => {
            try {
                return await Promise.race([readyWire.runTurn(texts, runAbort.signal), processFailure]);
            }
            catch (cause) {
                const failure = cause instanceof RunFailure ? cause : new RunFailure('prompt', 'protocol', cause, outcome);
                diagnostic = readyWire.collectDiagnostic() ?? failure.message;
                throw failure;
            }
        },
        collectOutput: () => readyWire.collectOutput(),
        collectDiagnostic: () => diagnostic ?? readyWire.collectDiagnostic(),
        cancelled: () => runAbort.signal.aborted,
        onError: spec.onError,
        signal: request.signal,
        onAbort,
    });
    return subprocessRunHandle({
        id: brandString(randomUUID()), result, signal: request.signal,
        onAbort, requestCancel, teardown: disposeProcess,
    });
}
