---
description: "A one-shot native Antigravity subagent provider for DeepSeek Harness users choosing a product backend or configuring unattended delegation."
kind: "package-bundle"
---

# @ashenjyy/dsh-subagent-antigravity

English | [中文](README.zh.md)

## Summary

Install this bundle into a DeepSeek Harness **0.2.1-rc.3** Profile when delegated work should run in a genuine Antigravity agent in the parent workspace. Every delegation starts a fresh **Google Antigravity ACP Server 1.4.3** and matching native harness, creates one session, and sends one self-contained text task. Antigravity owns reasoning, its tools, and the agent loop. DSH owns delegation, subprocess lifetime, cancellation, and result delivery.

The implementation follows the official [`@deepseek-ai/dsh-subagent-codex`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.3/packages/subagent/subagent-codex) provider's architecture. This is a community package, not an official DeepSeek or Google integration. It does not wrap `agy --print`, automate the Antigravity App, or run a model inside DSH's agent loop.

No model or reasoning effort is restricted by the public bundle. Omitted model settings retain native defaults. Explicit settings must be supported by the ACP runtime and successfully read back; there is no fallback to another model, backend, or host executable.

## Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further exploration](#further-exploration)
- [Model experience](#model-experience)
- [Known limitations and deferred work](#known-limitations-and-deferred-work)
- [Dev note](#dev-note)

## Use this package

### Installing the Bundle

Download the `.tgz` package from [GitHub Releases](https://github.com/AshenJyy/dsh-subagent-antigravity/releases). Add that package as a local bundle using the DSH plugin installer or Plugins page for your Profile. Use the release artifact rather than an unrelated similarly named npm package.

For the CLI, select the Profile you actually use:

```sh
dsh plugin --profile web add /absolute/path/to/the-release-package.tgz
```

Then run the installer belonging to that installed package:

```sh
node /absolute/path/to/installed/package/lib/install.js
```

It downloads the pinned Google payload for the current platform, verifies the official registry SHA-256, and installs the executable and matching harness under the package's `native/1.4.3/` directory. Native binaries are not redistributed in the npm archive. An alternative absolute directory can be supplied with `--runtime-dir`; configure the same directory in the provider. `--archive` accepts an already downloaded official ZIP and applies the same digest verification.

Enabling the bundle registers one provider and the global `subagent_antigravity` tool. No native process starts until a task is delegated. Restart when DSH requests it. This package does not modify built-in Official catalog entries.

### Authentication

This release supports **Gemini Enterprise Agent Platform with Application Default Credentials (ADC)**. Configure a Google Cloud project and location, and establish ADC on the machine running DSH:

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Use `adcPath` when DSH cannot discover the standard ADC file, or when the login was performed inside an application with redirected user directories. The provider forwards the path without reading or copying the credential contents. Native Google authentication and project permissions remain authoritative.

The ACP `authenticate` response and model list do **not** prove ADC validity, project entitlement, quota, or inference access. Google Cloud reports those failures during native execution. The package never changes billing settings, enables APIs, creates subscriptions, or switches to an API key on failure. Ambient Google API keys and enterprise-gateway overrides are removed from the child environment to preserve the selected ADC route.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `antigravity` | Unique registration name on `ctx.subagents` |
| `model` | Native default | Optional exact ACP `model` configuration value |
| `effort` | Native default | Optional exact ACP `thinking_level` value |
| `allowedModels` | Unrestricted | Optional deployment allowlist of ACP model-family values |
| `allowedEfforts` | Unrestricted | Optional deployment allowlist of reasoning values |
| `disabledTools` | Native defaults | Optional native tool IDs disabled for the session |
| `gcpProject` | `GOOGLE_CLOUD_PROJECT` | Agent Platform project; explicit configuration takes precedence |
| `gcpLocation` | `global` | Agent Platform location supported by the selected model |
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

Configure the provider row with your project before the first delegation. Preserve `maxDepth: provider-managed`: this external provider does not implement DSH-enforced depth, output schemas, agent presets, or agent options.

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
| [`src/run.ts`](src/run.ts) | Managed subprocess, startup, cancellation, result settlement, teardown |
| [`src/wire.ts`](src/wire.ts) | Minimal ACP v1 adapter over DSH's shared JSON-RPC line transport |
| [`src/model-policy.ts`](src/model-policy.ts) | Advertised choices, exact selection, optional local policy |
| [`src/runtime.ts`](src/runtime.ts) | Pinned native-payload resolution and integrity cache |
| [`src/install.ts`](src/install.ts) | Explicit official-payload download and verified installation |
| [`cordis.patch.yml`](cordis.patch.yml) | Provider and global tool registration |

### Run flow

Resolve the installed native pair → spawn through `ctx.subprocess` → validate `antigravity-acp`, version `1.4.3`, ACP v1 → select Agent Platform authentication → create a fresh session → set and verify configured model/effort → publish the run → send one text prompt → collect the authoritative ACP terminal result → close stdin and wait → escalate managed-range termination when necessary → notify the parent after cleanup.

Cancellation settles locally and sends `session/cancel` best effort. Process cleanup waits for the entire managed range, including descendants. Early exit never becomes successful completion. Successful empty answers and unknown terminal reasons are errors.

### Performance

Native installation is performed once. Runtime resolution coalesces concurrent checks and verifies hashes on first use or metadata changes; later tasks reuse verified metadata. Stderr forwarding uses stream backpressure instead of synchronous file writes. Assistant text is accumulated in bounded chunks; thought and tool payloads are not retained. DSH's existing admission control governs concurrency. These changes reduce adapter overhead without changing the one-process-per-task architecture; no measured speedup is claimed.

</details>

## Further exploration

- [Official Codex provider at the compatibility baseline](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.3/packages/subagent/subagent-codex)
- [DSH Subagent subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/docs/subsystems/subagent.md)
- [Pinned official Antigravity ACP distribution](https://github.com/agentclientprotocol/registry/blob/06229c691d24d039e2363ba12abe5c9dfae5bc66/antigravity-acp/agent.json)
- [Google ADC setup](https://docs.cloud.google.com/docs/authentication/application-default-credentials)
- [Protocol verification record](docs/ACP-VERIFICATION.md)

## Model experience

### Child request

Antigravity receives the self-contained text task in the selected working directory. It has its own context and native tools. The provider does not inherit the parent conversation, supply DSH tools to the child, or create a separate Git worktree. Native model requests and their costs belong to the selected Google Cloud project and account configuration.

### Parent scheduling and result

The parent sees the launch acknowledgment and eventual assistant result or safe failure diagnostic. The child context and native tool transcript are not inserted into the parent's context. Native model cache behavior belongs to Antigravity and its backend; this package does not promise cross-task cache reuse.

## Known limitations and deferred work

- **Exact compatibility baseline:** DSH `0.2.1-rc.3`, ACP runtime `1.4.3`, ACP protocol v1. Other releases require a deliberate compatibility update.
- **ADC route only in this release:** Personal OAuth, Enterprise license login, API-key, and enterprise-gateway flows are not selected by this provider.
- **Fresh is not ephemeral:** ACP can persist its own sessions. The adapter does not resume them, but does not claim Codex's `ephemeral: true` guarantee or erase native records.
- **App plugins are not automatically inherited:** ACP 1.4.3 discovers shared MCP, skills, and hooks. It is a separate backend, not an attached App session; App-only plugin packages and UI features may be unavailable.
- **Local allowlists govern this adapter's selections:** Hooks, MCP servers, plugins, and Google's closed runtime can perform their own work. The adapter cannot attest that every internal or external auxiliary operation uses the selected model. Strict deployments should additionally control native hooks/plugins, tools, and server-side model access.
- **No human interaction:** Questions and unsupported client requests cannot be answered. Slash-command prompts are rejected instead of being interpreted as model or mode changes.
- **Text only, one turn:** Non-text blocks are rejected; no follow-up, structured output, live DSH progress transcript, automatic retries, or side-effect rollback.
- **No task execution deadline:** The startup deadline does not limit a running task. DSH cancellation remains the stop mechanism.
- **Platform evidence:** Windows x64 startup and non-inference configuration were observed. Other pinned platform downloads are listed by the official registry but were not exercised here.

## Dev note

```sh
npm ci --ignore-scripts
npm run build
npm pack
```

The runtime installer is explicit; installing JS dependencies does not execute or download the native agent. The release includes compiled ESM and declarations. Preserve the upstream MIT notice. Protocol/configuration verification and TypeScript compilation are separate from model execution; no automated tests or inference smoke tests were run for this delivery.
