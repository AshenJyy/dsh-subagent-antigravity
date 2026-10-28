# ACP verification record

Observed on Windows x64, 2026-10-28. These were native protocol/configuration operations, not automated tests or model tasks.

## Baselines

- DeepSeek Harness: `dsh-v0.2.1-rc.3`, commit `1f81c047fc48fa190a683e469daa699857e9afe8`.
- Antigravity ACP runtime: `1.4.3`, from official registry commit `06229c691d24d039e2363ba12abe5c9dfae5bc66`.
- Windows archive SHA-256: `54c2e16378d9a4952e1da70e355f3c33c4f284308d6de48ab3e6e34a127bd325`.
- Official archive contained `agy_acp_server.exe` and `localharness_external.exe`; the archive digest was verified before launching.

## Observed operations

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
