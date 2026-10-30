---
description: "A one-shot native Antigravity subagent provider for DeepSeek Harness, with selectable native authentication, model, and effort."
kind: "package-bundle"
---

# @ashenjyy/dsh-subagent-antigravity

English | [中文](README.zh.md)

## Summary

Install this bundle into a DeepSeek Harness **0.2.1 series** Profile (`>=0.2.1-rc.3 <0.2.2-0`) when delegated work should run in a genuine Antigravity agent in the parent workspace. Every delegation starts a fresh **Google Antigravity ACP Server 1.4.3** and matching native harness, creates one session, and sends one self-contained text task. Antigravity owns reasoning, its tools, and the agent loop. DSH owns delegation, subprocess lifetime, cancellation, and result delivery.

The implementation follows the official [`@deepseek-ai/dsh-subagent-codex`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.5/packages/subagent/subagent-codex) provider's architecture. This is a community package, not an official DeepSeek or Google integration. It does not wrap `agy --print`, automate the Antigravity App, or run a model inside DSH's agent loop.

No model or reasoning effort is restricted by the public bundle. Omitted model settings retain native defaults. Explicit settings must be supported by the ACP runtime and successfully read back; there is no fallback to another model, backend, or host executable.

Version **0.2.3** includes the pinned native runtime in its Windows x64 release bundle. Authentication remains selectable, defaulting to ACP's own saved selection. Users upgrading from 0.1.0 who want its ADC behavior should set `authMethod: agent-platform` and `agentPlatformMode: adc`.

**0.2.3 supports the 0.2.1 series from rc.3 onward**, including subsequent `0.2.1-rc.*` releases and stable `0.2.1`, without registering each version. The range excludes `0.2.2` and its prereleases. All official DSH packages, Cordis, and Schemastery are peer dependencies supplied by the host/Profile; the adapter no longer installs its own pinned DSH dependencies. Use a coherent host dependency set matching your Harness release. The required SDK protocol and subagent tool packages are also peers, not optional features.

The latest source review covers rc.5; the relevant upstream provider, subagent, subprocess, SDK protocol, and timeout sources are unchanged from rc.3. The wider range is a compatibility policy, not a claim that unreleased versions were exercised. ACP integration, authentication, and performance behavior are preserved. See the [compatibility record](./docs/ACP-VERIFICATION.md#023-harness-021-series-and-host-peers).

## Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further exploration](#further-exploration)
- [Model experience](#model-experience)
- [Known limitations and deferred work](#known-limitations-and-deferred-work)
- [Dev note](#dev-note)

## Use this package

### Installing the Bundle

Download **`ashenjyy-dsh-subagent-antigravity-0.2.3-win32-x64.tgz`** from [GitHub Releases](https://github.com/AshenJyy/dsh-subagent-antigravity/releases). This **Windows x64 complete bundle** includes ACP Server 1.4.3, its matching native harness, and their integrity record. Add it as a local bundle using the DSH plugin installer or Plugins page for your Profile. No separate runtime installer or runtime download is needed.

The complete bundle has `os`/`cpu` constraints to prevent installation on the wrong platform. It still requires DSH dependencies and a usable authentication configuration; it does not include accounts or credentials. Use this repository's release artifact rather than an unrelated similarly named npm package.

For the CLI, select the Profile you actually use:

```sh
dsh plugin --profile web add /absolute/path/to/the-release-package.tgz
```

The runtime is already installed under the package's `native/1.4.3/win32-x64/` directory. Leave `runtimeDir` unset to use it. `dsh-antigravity-install` remains available for developers or an explicit custom runtime directory; normal installation of this release does not require it.

Enabling the bundle registers one provider and the global `subagent_antigravity` tool. Enabling it alone starts no native process; delegation and the explicit authentication command do. Restart when DSH requests it. This package does not modify built-in Official catalog entries.

### Authentication

**First use requires an explicit authentication choice and setup. Installing the plugin does not open a login page, and 0.2.3 has no dedicated login button.** The complete TGZ contains the runtime; users configure their account, API key, project, and credential paths locally.

Choose authentication per provider instance. The default, `native`, leaves selection to ACP's existing settings and enterprise policy. It does not send an `authenticate` request or try methods in sequence. An explicit method must be available under the runtime's policy; failure does not select another account or route.

| `authMethod` | Native behavior and setup |
|---|---|
| `native` | Reuse ACP's existing authentication selection, OAuth cache, and applicable enterprise policy |
| `oauth-personal` | Google personal-account OAuth; native browser login when required |
| `oauth-business` | Gemini Enterprise OAuth and native license selection |
| `gemini-api-key` | Gemini Developer API using `GEMINI_API_KEY` |
| `agent-platform` | Gemini Enterprise Agent Platform using ADC or Express `GOOGLE_API_KEY`, as controlled by `agentPlatformMode` |
| `gateway` | Native Google-compatible enterprise gateway, subject to administrator policy |

For an initial OAuth login or an intentional change of method, run the installed package's authentication command before delegating:

```sh
dsh-antigravity-auth --method oauth-personal --gemini-home /absolute/path/to/your-acp-home
```

If the package's bin directory is not on your PATH, use `node /absolute/path/to/installed/package/lib/auth-cli.js` with the same arguments. Use the same `geminiHome` in the provider. Omit both settings to use the native home. The command accepts `--runtime-dir`, `--gemini-home`, `--project`, `--location`, `--adc-path`, `--agent-platform-mode`, and `--timeout-ms`; paths must be absolute. Its overall deadline defaults to 600000 ms, independently of the provider's startup deadline. It accepts no plaintext API-key argument. Supply keys through the selected native environment, and do not commit secrets to a Profile patch or repository.

The command performs only `initialize` and, for an explicit method, `authenticate`; it creates no session and sends no prompt. A successful command is **not** proof of a usable API key, ADC, account entitlement, quota, or inference access. In `native` mode it does not validate the inherited login. ACP 1.4.3 has no supported cached-only or no-browser authentication mode: expired or missing OAuth credentials can open the native browser flow during delegation as well, subject to `startupTimeoutMs`. Complete initial login interactively, and treat later reauthentication as a possible startup failure or interaction.

ACP has its own settings and credentials. An App or `agy` login is not guaranteed to be available to ACP; this package does not copy or convert their tokens. `geminiHome` supplies `GEMINI_HOME`, the persistent native home directory itself, with ACP settings under `antigravity-acp/`. It also changes native configuration, session storage, and discovery of shared MCP, skills, and hooks; it is more than a token path. Explicit non-gateway authentication persists `auth.type` there, and Enterprise license selection can update project/location. Use separate persistent homes for provider instances that select different methods to avoid competing settings writes. On macOS the native Keychain accounts may still be shared, so separate homes alone do not guarantee complete credential isolation.

**Agent Platform:** `agentPlatformMode: native` follows Google's choice: a nonempty `GOOGLE_API_KEY` selects Express; otherwise ADC requires a project and location from its environment or saved native settings. Choose `adc` to remove that key override, or `api-key` to require the key and fail if it is absent. These modes apply only to explicit `authMethod: agent-platform`. To establish ADC on the machine running DSH:

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Configure `gcpProject` and `gcpLocation` for Agent Platform ADC when native settings do not already supply them. Use `adcPath` when DSH cannot discover the standard ADC file. The provider forwards the path without reading or copying credential contents; ACP authentication itself does not perform `gcloud` login. Enterprise OAuth uses its native license picker and saved ACP project/location instead of these Agent Platform overrides.

**Gateway:** explicit selection enables the native gateway capability. Supply a supported configuration, normally `AGY_LLM_GATEWAY_URL` with the applicable `AGY_LLM_GATEWAY_API_KEY` or `AGY_LLM_GATEWAY_HEADERS`. Gateway authentication does not persist `auth.type`, so configure `authMethod: gateway` for subsequent delegations. Native administrator policy remains authoritative; an administrator-forced gateway can also be inherited through `native`. Providing a key or gateway URL alone does not select its authentication method.

DSH scrubs its child environment. Selected explicit routes forward their necessary native variables; `native` does not promise to inherit every sensitive shell variable. Use provider `env` for an explicit deployment environment when needed. Native execution remains responsible for authorization and account charges. The package does not enable billing, APIs, or subscriptions.

#### First login on Windows Desktop

Choose one authentication route. These examples use the `desktop` Profile; substitute the correct directory for another Profile. Set the fields in DSH's plugin settings or edit the `subagent-antigravity` entry in `%USERPROFILE%/.dsh/profiles/desktop/cordis.patch.yml`. The YAML below overrides an existing entry; merge its fields if it already exists instead of inserting a duplicate provider.

**Google personal account or Gemini Enterprise OAuth:** locate the installed authentication command in PowerShell. This prefers DSH's Node executable; if that runtime path is absent, Node.js 22 or later must be on PATH.

```powershell
$profileDir = Join-Path $env:USERPROFILE '.dsh/profiles/desktop'
$authScript = Join-Path $profileDir 'node_modules/@ashenjyy/dsh-subagent-antigravity/lib/auth-cli.js'
$dshNode = Join-Path $env:USERPROFILE '.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe'
if (-not (Test-Path -LiteralPath $dshNode)) {
  $dshNode = (Get-Command node -ErrorAction Stop).Source
}
& $dshNode $authScript --method oauth-personal
```

Complete authorization in the browser opened by the native flow; an existing valid ACP login may be reused directly. For Gemini Enterprise OAuth, change the last argument to `oauth-business` and select a license in the native UI. Persist the same method in DSH:

```yaml
- id: subagent-antigravity
  config:
    authMethod: oauth-personal
```

Enterprise OAuth uses `authMethod: oauth-business`. These examples use the default native home; if login used `--gemini-home`, set the same absolute directory in the provider's `geminiHome`.

**Agent Platform pay-as-you-go / ADC:** using the Windows account that runs DSH, run the installed Google Cloud CLI from a regular PowerShell terminal:

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Complete browser authorization and note the credential location reported by gcloud. Persist the following fields in DSH, replacing the project/path placeholders and choosing the appropriate project location:

```yaml
- id: subagent-antigravity
  config:
    authMethod: agent-platform
    agentPlatformMode: adc
    gcpProject: YOUR_PROJECT_ID
    gcpLocation: global
    adcPath: C:/actual/path/application_default_credentials.json
```

Omit `adcPath` only when native default discovery works in the deployed environment. An explicit path must be an **absolute file path readable by DSH and its native child process**. Do not copy the example path or treat a successful login command as proof of that visibility.

**The authentication command does not save DSH configuration.** Its `--project`, `--location`, and `--adc-path` arguments configure that invocation only, not the Profile. Successful Agent Platform authentication also does not persist all these values in ACP settings. Keep the necessary fields in the provider configuration. The CLI does not perform gcloud login or verify model access.

**Gemini API key / Agent Platform Express:** no browser login is required. Set `authMethod: gemini-api-key` and `env.GEMINI_API_KEY`, or `authMethod: agent-platform`, `agentPlatformMode: api-key`, and `env.GOOGLE_API_KEY`, respectively. Supply keys through the DSH process's secure environment or private local settings; do not put real keys in command-line arguments, public repositories, or shared Profiles. Setting a variable in another terminal does not change an already-running DSH process's environment.

**Enterprise gateway:** use `authMethod: gateway` with administrator-provided gateway configuration. The enterprise gateway controls its authorization. `native` can also inherit forced gateway policy. Do not switch authentication routes to bypass administrator policy.

After saving, let DSH reload the configuration or restart it if needed. Normal restarts and subsequent tasks reuse persistent configuration; the native credential manager refreshes short-lived tokens while refresh credentials remain valid. Deleting/resetting a Profile, changing account/project, or revoking authorization requires the corresponding configuration update or login.

#### Windows credential-path troubleshooting

In a packaged application or a terminal subject to filesystem redirection, `AppData/Roaming` may be a virtual view whose actual files live under that application's `LocalCache/Roaming`. A successful `Test-Path` or token refresh in that terminal does not prove that independently running DSH can read the same apparent path. Prefer a regular Windows PowerShell terminal for login and path inspection. For a custom location, use the actual file location and ensure DSH runs as the same Windows user. Do not copy another user's or application's example path.

| Symptom | Next step |
|---|---|
| `The system cannot find the path specified`, pointing to the ADC file | Check the actual `adcPath` location and DSH's file access. Repeating login or restarting alone does not correct a wrong path. |
| `Authentication required` | Check the authentication method and complete configuration. `native` does not automatically select personal login; Agent Platform ADC also needs a project, location, and discoverable credentials. |
| 0.2.3 reports only `stage: session; category: protocol` | This wrapper is too generic and can hide an authentication failure. It does not establish protocol corruption or credential expiry. Inspect the local native diagnostic and remove sensitive information before sharing it. |
| Authentication command succeeds but a model request fails | Check account permissions, project, location, model availability, and quota. The authentication command sends no model request. |

The package includes no user credentials or preset local ADC path. Version 0.2.3 does not resolve Windows application-directory redirection automatically or verify credential paths through the actual DSH child process. These instructions are not a substitute for deployment validation.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `antigravity` | Unique registration name on `ctx.subagents` |
| `authMethod` | `native` | Inherit native selection, or explicitly select a method listed above |
| `agentPlatformMode` | `native` | For explicit `agent-platform`: native selection, `adc`, or `api-key` |
| `geminiHome` | Native home | Optional absolute, persistent native home directory |
| `model` | Native default | Optional exact ACP `model` configuration value |
| `effort` | Native default | Optional exact ACP `thinking_level` value |
| `allowedModels` | Unrestricted | Optional deployment allowlist of ACP model-family values |
| `allowedEfforts` | Unrestricted | Optional deployment allowlist of reasoning values |
| `disabledTools` | Native defaults | Optional native tool IDs disabled for the session |
| `gcpProject` | Native environment/settings | Optional Agent Platform project override; not required by all login methods |
| `gcpLocation` | Native environment/settings | Optional Agent Platform location override |
| `adcPath` | Native ADC discovery | Optional absolute ADC file path |
| `runtimeDir` | Package-local installation | Optional absolute directory containing the installed native pair |
| `permissionMode` | `deny` | `deny`, or `allow-once` for supported ordinary tool approvals |
| `env` | `{}` | Explicit child environment over DSH's credential-scrubbed base |
| `startupTimeoutMs` | `90000` | Deadline for initialization, authentication selection, session creation, and configuration |
| `disposeEofGraceMs` | `1000` | Grace after stdin EOF before process termination |
| `disposeGraceMs` | `3000` | Shared managed-process termination grace |
| `maxOutputBytes` | `8388608` | Maximum retained assistant text; overflow fails explicitly |

`model` and `effort` are deployment settings for a provider instance, not tool-call parameters. Multiple named instances may expose different settings. The current adapter validates the pinned runtime's `model`, `thinking_level`, and `mode` configuration surface. Use values advertised by ACP, not labels inferred from another Antigravity client.

The native permission mode remains `default`. `allow-once` answers recognized ordinary read/edit/execute/search/fetch approvals once. It does not select YOLO, answer user questions, grant permanent permission, or auto-approve unknown/MCP `other` requests. Neither setting is an OS sandbox.

### Exposing the tool

The bundle inserts these Host rows, making the tool available to all presets, including minimal:

```yaml
- insert:
    - id: subagent-antigravity
      name: '@ashenjyy/dsh-subagent-antigravity'
    - id: tool-subagent-antigravity
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: antigravity
        toolName: subagent_antigravity
        maxDepth: provider-managed
```

Configure the provider's authentication and optional model settings before the first delegation. A Cloud project is not a universal login requirement. Preserve `maxDepth: provider-managed`: this external provider does not implement DSH-enforced depth, output schemas, agent presets, or agent options.

### What you get

The tool returns a child ID after the native session and its requested settings are ready. Execution continues asynchronously, and DSH delivers a completion notification to the parent. The result contains ACP assistant text, a stop reason, and optional safe diagnostic facts. Thoughts, tools, raw protocol payloads, credential values, and stderr are not copied into the parent answer. ACP streams assistant chunks without Codex's final/partial phase labels, so assistant text is accumulated rather than claiming identical phase-based answer selection.

### Failure and recovery

Missing native payloads, unavailable model choices, mismatched readback, authentication errors, and unsupported protocol responses fail explicitly. There is no PATH lookup, CLI fallback, model substitution, or automatic task retry. Already-performed file or external changes are not rolled back.

## Understand the implementation

<details>
<summary>Implementation details</summary>

### Design principles

- **One process, session, and prompt per delegation.** No pool, resume, follow-up input, or reused history.
- **Native execution.** ACP clients advertise no filesystem or terminal implementation; Antigravity performs its own tool calls.
- **Shared Harness lifecycle.** `ctx.subagents`, `ctx.subprocess`, `settleRunResult`, and `subprocessRunHandle` own the same boundaries as the official product provider.
- **Explicit settings remain explicit.** The runtime must accept requested model/effort values. Optional local allowlists reject changes outside the deployment's policy.

### Source map

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Configuration schema and provider registration |
| [`src/auth.ts`](src/auth.ts) | Native authentication selection and method-specific environment |
| [`src/auth-cli.ts`](src/auth-cli.ts) | Explicit native authentication command without a session or prompt |
| [`src/run.ts`](src/run.ts) | Managed subprocess, startup, cancellation, result settlement, teardown |
| [`src/wire.ts`](src/wire.ts) | Minimal ACP v1 adapter over DSH's shared JSON-RPC line transport |
| [`src/model-policy.ts`](src/model-policy.ts) | Advertised choices, exact selection, optional local policy |
| [`src/runtime.ts`](src/runtime.ts) | Pinned native-payload resolution and integrity cache |
| [`src/install.ts`](src/install.ts) | Explicit official-payload download and verified installation |
| [`cordis.patch.yml`](cordis.patch.yml) | Provider and global tool registration |

### Run flow

Resolve the installed native pair → spawn through `ctx.subprocess` → validate `antigravity-acp`, version `1.4.3`, ACP v1 → retain native authentication or select the configured method → create a fresh session → set and verify configured model/effort → publish the run → send one text prompt → collect the authoritative ACP terminal result → close stdin and wait → escalate managed-range termination when necessary → notify the parent after cleanup.

Cancellation settles locally and sends `session/cancel` best effort. Process cleanup waits for the entire managed range, including descendants. Early exit never becomes successful completion. Successful empty answers and unknown terminal reasons are errors.

### Performance

The complete bundle requires no runtime download or extraction at first use. Runtime resolution coalesces concurrent checks and verifies hashes on first use or metadata changes; later tasks reuse verified metadata. Stderr forwarding uses stream backpressure instead of synchronous file writes. Assistant text is accumulated in bounded chunks; thought and tool payloads are not retained. DSH's existing admission control governs concurrency. These changes reduce adapter overhead without changing the one-process-per-task architecture; no measured speedup is claimed.

</details>

## Further exploration

- [Official Codex provider at the compatibility baseline](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.5/packages/subagent/subagent-codex)
- [DSH Subagent subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/docs/subsystems/subagent.md)
- [Pinned official Antigravity ACP distribution](https://github.com/agentclientprotocol/registry/blob/06229c691d24d039e2363ba12abe5c9dfae5bc66/antigravity-acp/agent.json)
- [Google ADC setup](https://docs.cloud.google.com/docs/authentication/application-default-credentials)
- [Protocol verification record](docs/ACP-VERIFICATION.md)

## Model experience

### Child request

Antigravity receives the self-contained text task in the selected working directory. It has its own context and native tools. The provider does not inherit the parent conversation, supply DSH tools to the child, or create a separate Git worktree. Native model requests and their costs follow the selected account, project, or gateway configuration.

### Parent scheduling and result

The parent sees the launch acknowledgment and eventual assistant result or safe failure diagnostic. The child context and native tool transcript are not inserted into the parent's context. Native model cache behavior belongs to Antigravity and its backend; this package does not promise cross-task cache reuse.

## Known limitations and deferred work

- **Compatibility range:** DSH `>=0.2.1-rc.3 <0.2.2-0`; subsequent 0.2.1 RCs and stable 0.2.1 are admitted without per-version registration. An upstream breaking change can still require an adapter update. ACP runtime `1.4.3` and ACP protocol v1 remain pinned.
- **Authentication evidence:** All advertised native routes are represented in configuration, but the added 0.2.0 flows were checked against source only. They were not each logged in or exercised with inference. Account and enterprise policy may make a method unavailable.
- **OAuth can require interaction:** First login or reauthentication can open a browser. The authentication command does not make later tasks strictly noninteractive.
- **Fresh is not ephemeral:** ACP can persist its own sessions. The adapter does not resume them, but does not claim Codex's `ephemeral: true` guarantee or erase native records.
- **App plugins are not automatically inherited:** ACP 1.4.3 discovers shared MCP, skills, and hooks. It is a separate backend, not an attached App session; App-only plugin packages and UI features may be unavailable.
- **Local allowlists govern this adapter's selections:** Hooks, MCP servers, plugins, and Google's closed runtime can perform their own work. The adapter cannot attest that every internal or external auxiliary operation uses the selected model. Strict deployments should additionally control native hooks/plugins, tools, and server-side model access.
- **No task-question UI:** Agent questions and unsupported client requests cannot be answered. Slash-command prompts are rejected instead of being interpreted as model or mode changes. Native authentication browser flows are separate from these task questions.
- **Text only, one turn:** Non-text blocks are rejected; no follow-up, structured output, live DSH progress transcript, automatic retries, or side-effect rollback.
- **No task execution deadline:** The startup deadline does not limit a running task. DSH cancellation remains the stop mechanism.
- **Platform evidence:** Windows x64 startup and non-inference configuration were observed. Other pinned platform downloads are listed by the official registry but were not exercised here.

## Dev note

```sh
npm ci --ignore-scripts
npm run pack:bundle
```

Source development dependencies and the lockfile pin the rc.5 build environment for reproducible compilation. These development pins do not constrain consumers: the Windows release manifest omits `devDependencies`, the TGZ contains no DSH packages or dependency lockfile, and its DSH peer ranges remain `>=0.2.1-rc.3 <0.2.2-0`. Updating Harness within this range does not require rebuilding the plugin solely to change a version pin.

Run the release build on Windows x64. `pack:bundle` compiles the adapter, stages only the public package files, and installs a fresh, checksum-verified official runtime into that staging directory. It never copies an existing login home. Use `npm run pack:bundle -- --archive /absolute/path/to/official.zip` to reuse an official ZIP with the same digest verification. It emits a `win32-x64.tgz` and SHA-256 sidecar. Plain `npm pack` remains an adapter-only developer archive, not the complete release.

Installing the release does not execute the native agent or run a download hook. The bundle includes the original Google binaries and their integrity record; the adapter includes compiled ESM and declarations. Preserve the upstream MIT notice and the runtime attribution in `NOTICE`; the adapter's MIT license does not relicense Google's runtime. Compilation and archive integrity checks are separate from model execution; no automated tests or inference smoke tests were run for this delivery.
