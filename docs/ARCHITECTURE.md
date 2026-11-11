# Architecture and execution behavior

[Home](../README.md) · [Documentation](README.md) · [中文](ARCHITECTURE.zh.md)

## Design principles

- **One process, session, and prompt per delegation.** No pool, resume, follow-up input, or reused history.
- **Native execution.** ACP clients advertise no filesystem or terminal implementation; Antigravity performs its own tool calls.
- **Shared Harness lifecycle.** `ctx.subagents`, `ctx.subprocess`, `settleRunResult`, and `subprocessRunHandle` own the same boundaries as the official product provider.
- **Explicit settings remain explicit.** The runtime must accept requested model/effort values. Optional local allowlists reject changes outside the deployment's policy.

## Source map

| File | Responsibility |
|---|---|
| [`src/index.ts`](../src/index.ts) | Configuration schema and provider registration |
| [`src/auth.ts`](../src/auth.ts) | Native authentication selection and method-specific environment |
| [`src/auth-cli.ts`](../src/auth-cli.ts) | Explicit native authentication command without a session or prompt |
| [`src/run.ts`](../src/run.ts) | Managed subprocess, startup, cancellation, result settlement, teardown |
| [`src/wire.ts`](../src/wire.ts) | Minimal ACP v1 adapter over DSH's shared JSON-RPC line transport |
| [`src/model-policy.ts`](../src/model-policy.ts) | Advertised choices, exact selection, optional local policy |
| [`src/runtime.ts`](../src/runtime.ts) | Bundled CLI verification or explicit agyPath resolution |
| [`src/install.ts`](../src/install.ts) | Explicit official-payload download and verified installation |
| [`cordis.patch.yml`](../cordis.patch.yml) | Provider and global tool registration |

## Run flow

Resolve the bundled or configured agy CLI → spawn `agy acp` through `ctx.subprocess` → validate `Antigravity ACP Server`, stable CLI 1.x from 1.5.5, ACP v1 → retain native authentication or select the configured method → create a fresh session → set and verify configured model/effort using `thought_level` → publish the run → send one text prompt → collect the authoritative ACP terminal result → close stdin and wait → escalate managed-range termination when necessary → notify the parent after cleanup.

Cancellation settles locally and sends `session/cancel` best effort. Process cleanup waits for the entire managed range, including descendants. Early exit never becomes successful completion. Successful empty answers and unknown terminal reasons are errors.

## Performance

The complete bundle requires no runtime download or extraction at first use. Runtime resolution coalesces concurrent checks and verifies hashes on first use or metadata changes; later tasks reuse verified metadata. Stderr forwarding uses stream backpressure instead of synchronous file writes. Assistant text is accumulated in bounded chunks; thought and tool payloads are not retained. DSH's existing admission control governs concurrency. No-op model/effort/mode setters are skipped. The configured external CLI is resolved without hashing the bundled binary or running a separate version command; initialize provides its identity. These changes reduce adapter overhead without changing the one-process-per-task architecture; no measured speedup is claimed.

## Child request

Antigravity receives the self-contained text task in the selected working directory. It has its own context and native tools. The provider does not inherit the parent conversation, supply DSH tools to the child, or create a separate Git worktree. Native model requests and their costs follow the selected account, project, or gateway configuration.

## Parent scheduling and result

The parent sees the launch acknowledgment and eventual assistant result or safe failure diagnostic. The child context and native tool transcript are not inserted into the parent's context. Native model cache behavior belongs to Antigravity and its backend; this package does not promise cross-task cache reuse.

## Known limitations and deferred work

- **Compatibility range:** DSH `>=0.2.1-rc.3 <0.2.2-0 || >=0.2.2-rc.1 <0.2.3-0`; subsequent RCs and stable releases within the 0.2.1 and 0.2.2 series are admitted without per-version registration. Cordis and Schemastery peers accept the matching 4.0/4.1 and 3.18/3.19 host lines. An upstream breaking change can still require an adapter update. Bundled CLI `1.5.5` is pinned; external CLI 1.x from 1.5.5 is admitted after identity and protocol-shape checks. ACP v1 remains required.
- **Authentication evidence:** Cached CLI login and Carbon + low configuration were observed on CLI 1.5.5 without an authenticate request or model inference. Explicit authentication routes were not each exercised. Account and enterprise policy may make a method unavailable.
- **OAuth can require interaction:** First login or reauthentication can open a browser. The authentication command does not make later tasks strictly noninteractive.
- **Fresh is not ephemeral:** ACP can persist its own sessions. The adapter does not resume them, but does not claim Codex's `ephemeral: true` guarantee or erase native records.
- **App plugins are not automatically inherited:** Native agy customization discovery applies. It is a separate CLI session, not an attached App session; App-only UI features may be unavailable. Customization execution was not exercised.
- **Local allowlists govern this adapter's selections:** Hooks, MCP servers, plugins, and Google's closed runtime can perform their own work. The adapter cannot attest that every internal or external auxiliary operation uses the selected model. Strict deployments should additionally control native hooks/plugins, tools, and server-side model access.
- **No task-question UI:** Agent questions and unsupported client requests cannot be answered. Slash-command prompts are rejected instead of being interpreted as model or mode changes. Native authentication browser flows are separate from these task questions.
- **Text only, one turn:** Non-text blocks are rejected; no follow-up, structured output, live DSH progress transcript, automatic retries, or side-effect rollback.
- **No task execution deadline:** The startup deadline does not limit a running task. DSH cancellation remains the stop mechanism.
- **Platform evidence:** Windows x64 startup and non-inference configuration were observed. No other platforms are distributed.
