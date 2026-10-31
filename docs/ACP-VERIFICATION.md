# ACP verification record

[Home](../README.md) · [Documentation](README.md) · [Current authentication guide](AUTHENTICATION.md)

The 0.1.0 observations below were made on Windows x64, 2026-10-28. These were native protocol/configuration operations, not automated tests or model tasks. The 0.2.0 authentication expansion was reviewed against the pinned runtime's source; its additional login routes were not exercised.

## Original observation baselines

- DeepSeek Harness: `dsh-v0.2.1-rc.3`, commit `1f81c047fc48fa190a683e469daa699857e9afe8`.
- Antigravity ACP runtime: `1.4.3`, from official registry commit `06229c691d24d039e2363ba12abe5c9dfae5bc66`.
- Windows archive SHA-256: `54c2e16378d9a4952e1da70e355f3c33c4f284308d6de48ab3e6e34a127bd325`.
- Official archive contained `agy_acp_server.exe` and `localharness_external.exe`; the archive digest was verified before launching.

## 0.1.0 observed operations

1. `initialize` returned ACP `protocolVersion: 1`, agent name `antigravity-acp`, version `1.4.3`.
2. A session without authentication returned `Authentication required`.
3. The selected Agent Platform route accepted project/location configuration. `authenticate` itself does not verify ADC.
4. `session/new` returned a model-family selector, a separate `thinking_level` selector, and `mode`.
5. `model = gemini-4-argon` was accepted. `thinking_level = low`, `medium`, and `high` were set sequentially and each response was checked for the expected model and effort. `mode` remained `default`.
6. No `session/prompt` was sent. No model inference, file task, command task, throughput benchmark, cancellation test, or DSH integration test was performed.

The concrete Argon configuration informed the optional local deployment policy. It is **not** a public model restriction: the package supports exact model and effort values exposed by its pinned ACP configuration surface.

## Important boundaries

The Agent Platform model catalogue is generated locally by the native runtime. Seeing a model or selecting it does not establish cloud authorization, region availability, quota, or a successful inference request. Native ADC was established separately; its contents are not included in this repository.

Source inspection of the pinned native wrapper confirmed that it discovers shared MCP/skills/hooks and supports `session/new._meta.antigravity.disabledTools`. That private extension is tied to the pinned runtime. The public bundle does not send a disabled-tool list by default.

The adapter preserves the DSH subprocess and asynchronous activation contracts. TypeScript compilation is the build check; no automated tests were requested or run.

## 0.2.0 authentication source review

The following facts come from read-only inspection of Python source embedded in the same [official Windows 1.4.3 archive](https://dl.google.com/agy-extensions/releases/windows/agy-acp-server-1.4.3-windows-x86_64.zip), whose SHA-256 is recorded above. Source references below are relative to the embedded `google3/cloud/developer_experience/antigravity_extensions/acp_server/` directory. No additional authentication, credential inspection, session prompt, or test was performed for this review.

- **Methods:** `server.py` advertises `oauth-personal`, `oauth-business`, `gemini-api-key`, and `agent-platform`. `gateway` is conditional on client capability, the `AGY_ACP_ENABLE_GATEWAY_AUTH` switch, and administrator policy. Explicit gateway selection in this adapter enables the capability and switch while retaining administrator restrictions. `native` is an adapter option, not an ACP method ID: it omits `authenticate` and lets native policy and saved `auth.type` determine the route. Providing a key alone does not choose a method.
- **Personal and Enterprise OAuth:** `server.py`, `credential_manager.py`, and `business_auth.py` reuse or refresh native cached credentials when possible, otherwise opening a loopback browser login. Enterprise login can also require license selection. Both explicit `authenticate` and the authentication check during `session/new` can trigger these interactions. No supported protocol method or runtime switch was found for cached-only login or prohibiting the browser. The native callback wait is 300 seconds; the adapter's configured startup deadline can expire sooner.
- **Gemini API key:** the native method reads `GEMINI_API_KEY`. Native `authenticate` can return success even without a usable key, and does not prove an inference request would succeed. The adapter uses environment configuration instead of a plaintext key CLI argument.
- **Agent Platform:** `server.py` selects Express when `GOOGLE_API_KEY` is present, otherwise using ADC with project and location from the environment or native settings. Native authentication checks configuration, not ADC validity. The adapter's `agentPlatformMode` can preserve native selection or explicitly require `adc` or `api-key`. ADC acquisition remains a separate Google Cloud authentication operation. Enterprise OAuth project/license selection uses its saved ACP settings and picker, not the Agent Platform environment overrides.
- **Gateway:** `gateway/resolution.py` applies administrator configuration before client metadata and environment values. A forced gateway can make `initialize.authMethods` empty; this is not proof that authentication is valid. `native` allows the runtime to apply that policy without selecting another method. Explicit gateway selection cannot bypass administrator restrictions. The pinned implementation uses the Google/genai protocol.
- **Settings and concurrency:** successful explicit non-gateway authentication writes `auth.type` to native settings. `settings_writer.py` uses a temporary file and atomic replacement, but concurrent writers are last-write-wins. The adapter does not temporarily rewrite and restore settings around a task. Separate persistent `geminiHome` directories avoid conflicting method settings across provider instances.
- **Credential boundaries:** `paths.py` gives ACP a separate `antigravity-acp/` namespace beneath `GEMINI_HOME` or the native `.gemini` home. Changing that home also affects native settings, sessions, and shared MCP/skills/hooks discovery. `credential_store.py` uses separate personal and business file stores; macOS can instead use fixed Keychain accounts (`gemini` service, `antigravity-acp` and `antigravity-acp-business` accounts). Separate homes alone therefore do not ensure full credential isolation. The inspected wrapper has no App/`agy` token-import bridge; the adapter does not copy or convert those tokens.

The added authentication CLI performs `initialize` and an optional explicit `authenticate` only. It creates no session and issues no model request. Its success must not be reported as verified credentials, quota, entitlement, or inference access. Selecting `native` performs no login validation. All new routes remain source-reviewed rather than live-login verified.

## 0.2.1 Windows x64 packaging

The complete Windows x64 release adds the original ACP 1.4.3 executable and matching native harness under `native/1.4.3/win32-x64/`, together with `.dsh-antigravity-runtime.json`. Its package manifest declares `os: ["win32"]` and `cpu: ["x64"]`.

The release builder compiles TypeScript, verifies the official ZIP against the pinned registry SHA-256, extracts a fresh pair into a temporary package directory, and checks that both binaries and the installation record are present in the npm archive. The source ZIP digest remains `54c2e16378d9a4952e1da70e355f3c33c4f284308d6de48ab3e6e34a127bd325`. The published TGZ has its own SHA-256 sidecar.

This is a packaging change. No login home, credentials, model settings, native session, or local configuration is copied. No new authentication, model execution, automated test, or inference smoke test is part of this release.

## 0.2.2 Harness 0.2.1-rc.5 compatibility

Reviewed on 2026-10-30 against the official `dsh-v0.2.1-rc.5` tag, commit [`b830ec950faba0a46dda564be3e2d854afed94f1`](https://github.com/deepseek-ai/deepseek-harness/commit/b830ec950faba0a46dda564be3e2d854afed94f1), and the published npm packages at `0.2.1-rc.5`.

- Compared complete Git trees for `packages/subagent/{subagent-codex,subagent-acp,subagent,tool-subagent}` and `packages/{core,sdk,subprocess,util}` between rc.3 and rc.5. Only package manifests changed in these directories; no source files were added, changed, or removed. This covers provider registration, run lifecycle and cancellation, tool activation, subprocess management, JSON-RPC transport, session/content types, and timeout helpers used by this adapter.
- Aligned the exact DSH engine, direct dependencies, peer dependencies, lockfile, and ACP client compatibility metadata with `0.2.1-rc.5`. The dependency layout continues to match the official Codex provider. Plugin version `0.2.2` is for Harness rc.5; plugin `0.2.1` remains the rc.3 bundle.
- Kept the pinned ACP 1.4.3 binaries and their integrity checks, cached runtime resolution, bounded output collection, stderr backpressure, and one native process per task. No new authentication or model restrictions were introduced.
- Validation scope: TypeScript compilation against the rc.5 packages, dependency-version inspection, and Windows x64 archive-content/hash inspection. No automated tests, DSH integration run, login, ACP session, or model inference was performed for this compatibility update. The earlier observations above remain historical evidence, not rc.5 runtime validation.
- Authentication instructions are included in both bundled READMEs. The existing Windows ADC path-visibility limitation is unchanged; this release does not automatically fix a locally configured credential path.

## 0.2.3 Harness 0.2.1 series and host peers

- The DSH engine and every DSH peer now use `>=0.2.1-rc.3 <0.2.2-0`. This admits later `0.2.1-rc.*` versions and stable `0.2.1` without per-version registration, and excludes `0.2.2` prereleases and releases. It is a declared compatibility policy; future versions are not claimed to have been exercised.
- Moved `dsh-brand`, `dsh-sdk-protocol`, `dsh-tool-subagent`, and Schemastery out of runtime dependencies into required peer dependencies. Cordis and the remaining DSH packages stay required peers. The host/Profile supplies the compatible packages; no private DSH copy, override, install hook, runtime version allowlist, or fallback resolver was added. The upstream packages themselves may still require a coherent, matching Harness version set.
- Exact rc.5 versions are retained only in source development dependencies and the development lockfile. The Windows packager omits development dependencies from the release manifest. No dependency lockfile or `node_modules` tree is included in the TGZ; `yauzl` is the only ordinary runtime dependency.
- ACP `clientInfo.version` is now read once from the adapter's own manifest via Node's module cache. It no longer reports a hard-coded host RC when used with another supported Harness release. ACP agent identity/version validation remains pinned to 1.4.3.
- Validation scope is compilation against the pinned development environment, metadata/diff review, and release archive-content/hash inspection. No automated tests, installation matrix, DSH integration run, login, ACP session, or model inference was performed for this release. The earlier source comparison remains the evidence for the reviewed rc.3–rc.5 interface compatibility.
