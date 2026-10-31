---
description: "A one-shot native Antigravity subagent provider for DeepSeek Harness, with selectable native authentication, model, and effort."
kind: "package-bundle"
---

# @ashenjyy/dsh-subagent-antigravity

English | [中文](README.zh.md)

[Download](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/latest) · [Documentation](docs/README.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

## Summary

Run delegated text tasks in **Google Antigravity ACP Server 1.4.3** from DeepSeek Harness. Each task starts a fresh native process and session. Antigravity handles reasoning and tools; DSH manages delegation, cancellation, and result delivery.

The architecture follows the official [Codex subagent provider](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.5/packages/subagent/subagent-codex). This is a community integration. It uses the ACP Server directly and requires neither the `agy` CLI nor the Antigravity App.

| Requirement | Supported |
|---|---|
| Platform | Windows x64 |
| DeepSeek Harness | `>=0.2.1-rc.3 <0.2.2-0`: subsequent `0.2.1-rc.*` and stable `0.2.1` |
| Native runtime | ACP Server 1.4.3 and its matching harness, included in the release TGZ |
| Host dependencies | DSH packages, Cordis, and Schemastery supplied by the host/Profile |
| Model and effort | Native defaults or explicit ACP-supported values; unrestricted by default, no fallback |

The latest source review covers Harness rc.5. The version range is a compatibility policy, not a claim that future releases were exercised. See the [compatibility record](docs/ACP-VERIFICATION.md#023-harness-021-series-and-host-peers).

## Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further exploration](#further-exploration)
- [Model experience](#model-experience)
- [Known limitations and deferred work](#known-limitations-and-deferred-work)
- [Dev note](#dev-note)

## Use this package

### Installing the Bundle

Download **`ashenjyy-dsh-subagent-antigravity-0.2.3-win32-x64.tgz`** from [v0.2.3](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.2.3). Choose the release TGZ, not GitHub's source-code archive. Install it through DSH's Plugins page or the CLI for your Profile:

```powershell
dsh plugin --profile desktop add "C:/path/to/ashenjyy-dsh-subagent-antigravity-0.2.3-win32-x64.tgz"
```

The TGZ already contains both native executables and their integrity record. Leave `runtimeDir` unset; no separate runtime installation or download is needed. The host must supply a compatible dependency set. Restart DSH if prompted.

### Authentication

**Installation does not open a login page. Configure authentication before the first task.** The default `native` uses ACP's saved selection and enterprise policy; it does not automatically select personal-account login. App or `agy` login is not guaranteed to carry over.

Choose personal Google OAuth, Gemini Enterprise OAuth, Gemini API key, Agent Platform ADC/Express, an enterprise gateway, or existing native configuration. Account and administrator policy determine availability.

<a id="first-login-on-windows-desktop"></a>

See the **[authentication guide](docs/AUTHENTICATION.md)** for Windows login commands, provider settings, and ADC path troubleshooting. Upgrading from 0.1.0 while keeping its ADC route requires `authMethod: agent-platform` and `agentPlatformMode: adc`.

### Configuration

Set provider fields in DSH's plugin settings or your Profile patch. `model` and `effort` are optional; explicit values must be advertised by ACP and confirmed after selection. Unsupported settings fail without selecting another model.

Tool permission defaults to `deny`. Use `allow-once` when this provider should approve supported ordinary tool operations. See the [configuration reference](docs/CONFIGURATION.md) for every field and permission boundary.

### Exposing the tool

The bundle registers the provider and global **`subagent_antigravity`** tool automatically. The [bundle wiring](docs/CONFIGURATION.md#exposing-the-tool) documents the two entries and `maxDepth: provider-managed`.

### What you get

The parent receives a child ID after native startup and configuration, then an asynchronous completion containing assistant text or a failure diagnostic. Native thoughts, tool transcripts, raw protocol data, and credentials are not copied into the parent answer.

### Failure and recovery

<a id="windows-credential-path-troubleshooting"></a>

Missing runtime files, authentication failures, and unsupported model settings fail explicitly. There is no automatic task retry, model substitution, CLI fallback, or rollback of completed side effects. For session or credential errors, start with [Windows troubleshooting](docs/AUTHENTICATION.md#windows-credential-path-troubleshooting).

## Understand the implementation

The [architecture guide](docs/ARCHITECTURE.md) covers source responsibilities, ACP startup, result handling, cancellation, and performance. Runtime integrity caching, concurrent-check coalescing, stream backpressure, and bounded output reduce adapter overhead while preserving one native process per task.

## Further exploration

- [Documentation index](docs/README.md)
- [Official Codex provider](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.5/packages/subagent/subagent-codex)
- [DSH Subagent subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/docs/subsystems/subagent.md)
- [Pinned official ACP distribution](https://github.com/agentclientprotocol/registry/blob/06229c691d24d039e2363ba12abe5c9dfae5bc66/antigravity-acp/agent.json)
- [Protocol and compatibility evidence](docs/ACP-VERIFICATION.md)

## Model experience

Give the child a self-contained text task and working directory. It uses Antigravity's own context and tools; it does not inherit the parent conversation or receive DSH tools. See [child requests and results](docs/ARCHITECTURE.md#child-request).

## Known limitations and deferred work

One text prompt per session; no resume, task-question UI, automatic retry, or execution deadline beyond startup. Native sessions can persist. App-only plugins are not automatically inherited, and OAuth can require interaction. Full boundaries and verification limits are in the [architecture guide](docs/ARCHITECTURE.md#known-limitations-and-deferred-work).

## Dev note

Use Windows x64 and Node.js 22 or later:

```sh
npm ci --ignore-scripts
npm run pack:bundle
```

See [Contributing](CONTRIBUTING.md) for the repository layout, build and release steps. Plain `npm pack` creates an adapter-only archive; `pack:bundle` creates the complete Windows TGZ. The adapter is MIT-licensed; Google's bundled binaries retain their own terms in [NOTICE](NOTICE).
