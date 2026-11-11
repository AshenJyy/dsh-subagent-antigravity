---
description: "A one-shot native Antigravity subagent provider for DeepSeek Harness, with selectable native authentication, model, and effort."
kind: "package-bundle"
---

# @ashenjyy/dsh-subagent-antigravity

English | [中文](README.zh.md)

[Download](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/latest) · [Documentation](docs/README.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

## Summary

Run delegated text tasks in **Antigravity CLI 1.5.5 through `agy acp`** from DeepSeek Harness. Each task starts a fresh native process and session. Antigravity handles reasoning and tools; DSH manages delegation, cancellation, and result delivery.

The architecture follows the official [Codex subagent provider](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.1/packages/subagent/subagent-codex). This is a community integration. It launches `agy acp` over stdio. The release bundles the official CLI; an existing CLI can be selected with `agyPath`. The Antigravity App does not need to run.

| Requirement | Supported |
|---|---|
| Platform | Windows x64 |
| DeepSeek Harness | `0.2.1` from rc.3, and `0.2.2` from rc.1; subsequent RCs and stable releases within these series |
| Native runtime | Official agy CLI 1.5.5, included in the release TGZ; optional existing `agyPath` |
| Host dependencies | DSH packages, Cordis, and Schemastery supplied by the host/Profile |
| Model and effort | Native defaults or explicit ACP-supported values; unrestricted by default, no fallback |

The compatibility range is `>=0.2.1-rc.3 <0.2.2-0 || >=0.2.2-rc.1 <0.2.3-0`. The latest source review and compilation cover Harness `0.2.2-rc.1`, Cordis 4.1.0, and Schemastery 3.19.0. Each supported series admits subsequent RCs and its stable release without individual registration; 0.2.3 is excluded. This policy does not claim future releases were exercised. See the [compatibility record](docs/ACP-VERIFICATION.md#024-harness-022-series).

## Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further exploration](#further-exploration)
- [Model experience](#model-experience)
- [Known limitations and deferred work](#known-limitations-and-deferred-work)
- [Dev note](#dev-note)

## Use this package

### Installing the Bundle

Download **`ashenjyy-dsh-subagent-antigravity-0.3.0-win32-x64.tgz`** from [v0.3.0](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.3.0). Choose the release TGZ, not GitHub's source-code archive. Install it through DSH's Plugins page or the CLI for your Profile:

```powershell
dsh plugin --profile desktop add "C:/path/to/ashenjyy-dsh-subagent-antigravity-0.3.0-win32-x64.tgz"
```

The TGZ contains official `agy.exe` and its integrity record. Leave `runtimeDir` and `agyPath` unset to use it; no separate installation is needed. Set `agyPath` to your existing CLI executable to follow its updates. The host must supply a compatible dependency set. Restart DSH if prompted.

### Authentication

**Installation does not open a login page. Configure authentication before the first task.** The default `native` reuses agy CLI's saved authentication and settings without sending `authenticate`. Use the same Windows user and native home as your signed-in CLI. App/IDE credential sharing follows Google's credential manager; this plugin does not copy tokens.

Choose cached CLI authentication, personal Google OAuth, Gemini Enterprise OAuth, Gemini API key, or Agent Platform. Explicit methods must be advertised by the running CLI. Legacy gateway configuration does not guarantee runtime support.

<a id="first-login-on-windows-desktop"></a>

See the **[authentication guide](docs/AUTHENTICATION.md)** for Windows login commands, provider settings, and ADC path troubleshooting. To retain an explicit ADC route use `authMethod: agent-platform` and `agentPlatformMode: adc`; to inherit agy login choose `native` for both.

### Configuration

Set provider fields in DSH's plugin settings or your Profile patch. `model` and `effort` are optional; explicit values must be advertised by ACP and confirmed after selection. Unsupported settings fail without selecting another model.

Tool permission defaults to `deny`. Use `allow-once` when this provider should approve supported ordinary tool operations. See the [configuration reference](docs/CONFIGURATION.md) for every field and permission boundary.

### Exposing the tool

The bundle registers the provider and global **`subagent_antigravity`** tool automatically. The [bundle wiring](docs/CONFIGURATION.md#exposing-the-tool) documents the two entries and `maxDepth: provider-managed`.

### What you get

The parent receives a child ID after native startup and configuration, then an asynchronous completion containing assistant text or a failure diagnostic. Native thoughts, tool transcripts, raw protocol data, and credentials are not copied into the parent answer.

### Failure and recovery

<a id="windows-credential-path-troubleshooting"></a>

Missing runtime files, authentication failures, and unsupported model settings fail explicitly. There is no automatic task retry, model substitution, execution-entry fallback, or rollback of completed side effects. For session or credential errors, start with [Windows troubleshooting](docs/AUTHENTICATION.md#windows-credential-path-troubleshooting).

## Understand the implementation

The [architecture guide](docs/ARCHITECTURE.md) covers source responsibilities, ACP startup, result handling, cancellation, and performance. Runtime integrity caching, concurrent-check coalescing, stream backpressure, and bounded output reduce adapter overhead while preserving one native process per task.

## Further exploration

- [Documentation index](docs/README.md)
- [Official Codex provider](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.1/packages/subagent/subagent-codex)
- [DSH Subagent subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/subagent.md)
- [Official agy ACP interface](https://antigravity.google/docs/ide/extensions/acp)
- [Protocol and compatibility evidence](docs/ACP-VERIFICATION.md)

Carbon + low was accepted in a configuration-only session with agy 1.5.5 using cached login. No model inference was performed. See the [verification record](docs/ACP-VERIFICATION.md).

## Model experience

Give the child a self-contained text task and working directory. It uses Antigravity's own context and tools; it does not inherit the parent conversation or receive DSH tools. See [child requests and results](docs/ARCHITECTURE.md#child-request).

## Known limitations and deferred work

One text prompt per session; no resume, task-question UI, automatic retry, or execution deadline beyond startup. Native sessions can persist. App-only plugins are not automatically inherited, and OAuth can require interaction. Full boundaries and verification limits are in the [architecture guide](docs/ARCHITECTURE.md#known-limitations-and-deferred-work).

## Dev note

Use Windows x64 and Node.js 24 for release packaging:

```sh
npm ci --ignore-scripts
npm run pack:bundle
```

See [Contributing](CONTRIBUTING.md) for the repository layout, build and release steps. Plain `npm pack` creates an adapter-only archive; `pack:bundle` creates the complete Windows TGZ. The adapter is MIT-licensed; Google's bundled binaries retain their own terms in [NOTICE](NOTICE).
