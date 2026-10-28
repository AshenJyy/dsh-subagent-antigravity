#!/usr/bin/env node
/** Explicit native authentication setup; never creates a task or sends a prompt. */
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { AUTH_METHODS, authenticationEnvironment, resolveAuthMethod, } from './auth.js';
import { resolveRuntime } from './runtime.js';
import { AntigravityWire } from './wire.js';
const HELP = `Select or establish authentication in the official Antigravity ACP runtime.

Usage: dsh-antigravity-auth --method METHOD [options]

Methods: ${AUTH_METHODS.join(', ')}
  native initializes the protocol only; it does not change saved authentication.

Options:
  --runtime-dir ABSOLUTE_DIRECTORY
  --gemini-home ABSOLUTE_DIRECTORY
  --project PROJECT_ID                   Agent Platform project
  --location REGION                      Agent Platform location
  --adc-path ABSOLUTE_FILE
  --agent-platform-mode native|adc|api-key
  --timeout-ms MILLISECONDS               Default: 600000

OAuth uses the runtime's browser login and native credential store when needed.
Use GEMINI_API_KEY for Gemini Developer API and GOOGLE_API_KEY for Agent Platform
Express. Gateway uses the native AGY_LLM_GATEWAY_* variables and administrator
policy. Secrets are not accepted as command-line arguments.

Use the same GEMINI_HOME and environment for setup and DSH. This command sends
initialize and, for an explicit method, authenticate. It creates no session and
sends no model prompt. Success does not prove key validity, quota or inference
access. Agent Platform ADC itself is established separately with gcloud.
`;
function parseOptions(args) {
    if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
        process.stdout.write(HELP);
        return undefined;
    }
    const options = { timeoutMs: 600_000 };
    const seen = new Set();
    for (let i = 0; i < args.length; i += 2) {
        const flag = args[i];
        const value = args[i + 1];
        if (!flag || !value || value.startsWith('--') || seen.has(flag)) {
            throw new Error('Expected unique option/value pairs; see --help');
        }
        seen.add(flag);
        switch (flag) {
            case '--method':
                options.authMethod = resolveAuthMethod(value);
                break;
            case '--runtime-dir':
                options.runtimeDir = value;
                break;
            case '--gemini-home':
                options.geminiHome = value;
                break;
            case '--project':
                options.gcpProject = value;
                break;
            case '--location':
                options.gcpLocation = value;
                break;
            case '--adc-path':
                options.adcPath = value;
                break;
            case '--agent-platform-mode':
                if (value !== 'native' && value !== 'adc' && value !== 'api-key') {
                    throw new Error('Unsupported Agent Platform credential mode; see --help');
                }
                options.agentPlatformMode = value;
                break;
            case '--timeout-ms':
                options.timeoutMs = Number(value);
                break;
            default: throw new Error('Unknown authentication option; see --help');
        }
    }
    if (!seen.has('--method'))
        throw new Error('Choose an explicit --method; see --help');
    for (const path of [options.runtimeDir, options.geminiHome, options.adcPath]) {
        if (path !== undefined && (!path.trim() || !isAbsolute(path))) {
            throw new Error('Runtime, Gemini home and ADC paths must be absolute');
        }
    }
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 2_147_483_647) {
        throw new Error('Authentication timeout must be a positive supported integer');
    }
    return options;
}
async function within(promise, milliseconds) {
    let timer;
    try {
        return await Promise.race([
            promise.then(() => true, () => true),
            new Promise(resolve => { timer = setTimeout(() => resolve(false), milliseconds); }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
async function closeNative(child, closed) {
    try {
        child.stdin.end();
    }
    catch { /* already closed */ }
    if (await within(closed, 2_000))
        return;
    if (child.pid === undefined)
        return;
    if (process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true, stdio: 'ignore',
        });
        await new Promise(resolve => {
            killer.once('error', () => resolve());
            killer.once('close', () => resolve());
        });
    }
    else {
        try {
            process.kill(-child.pid, 'SIGTERM');
        }
        catch { /* already exited */ }
        if (!await within(closed, 1_000)) {
            try {
                process.kill(-child.pid, 'SIGKILL');
            }
            catch { /* already exited */ }
        }
    }
    if (!await within(closed, 5_000))
        throw new Error('Native authentication process did not finish cleanup');
}
async function main() {
    const options = parseOptions(process.argv.slice(2));
    if (!options)
        return;
    if (options.adcPath)
        await access(options.adcPath);
    const runtime = await resolveRuntime(options.runtimeDir);
    const env = { ...process.env, ...authenticationEnvironment(options), ...runtime.env };
    for (const key of Object.keys(env))
        if (env[key] === undefined)
            delete env[key];
    const child = spawn(runtime.argv[0], runtime.argv.slice(1), {
        env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const closed = Promise.withResolvers();
    const failure = Promise.withResolvers();
    void failure.promise.catch(() => { });
    child.once('error', () => {
        failure.reject(new Error('Could not launch the native authentication process'));
        closed.resolve();
    });
    child.once('close', () => {
        closed.resolve();
        setImmediate(() => failure.reject(new Error('Native authentication process exited before confirmation')));
    });
    const detachStderr = () => { child.stderr.unpipe(process.stderr); child.stderr.resume(); };
    child.stderr.on('error', detachStderr);
    process.stderr.on('error', detachStderr);
    child.stderr.pipe(process.stderr, { end: false });
    const controller = new AbortController();
    let interrupted = false;
    const interrupt = () => { interrupted = true; controller.abort(); };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const wire = new AntigravityWire(child.stdout, child.stdin, {
        authMethod: options.authMethod,
        gatewayAuthEnabled: /^(?:1|true|yes|on)$/i.test(env.AGY_ACP_ENABLE_GATEWAY_AUTH?.trim() ?? ''),
        permissionMode: 'deny', maxOutputBytes: 8 * 1024 * 1024,
    });
    try {
        wire.start();
        process.stderr.write(`Using native authentication method: ${options.authMethod}. No model task will be sent.\n`);
        await Promise.race([wire.initialize(controller.signal), failure.promise]);
        process.stdout.write(options.authMethod === 'native'
            ? 'ACP initialized. Saved authentication was left unchanged; its validity was not checked.\n'
            : `Native authentication selection completed for ${options.authMethod}. No session or model prompt was sent; service access remains unverified.\n`);
    }
    catch (error) {
        if (controller.signal.aborted) {
            throw new Error(interrupted ? 'Authentication cancelled' : 'Authentication setup timed out');
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', interrupt);
        try {
            await closeNative(child, closed.promise);
        }
        finally {
            wire.close();
            detachStderr();
            child.stderr.off('error', detachStderr);
            process.stderr.off('error', detachStderr);
        }
    }
}
void main().catch((error) => {
    process.stderr.write(`Antigravity authentication setup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
});
