# Configuration reference

[Home](../README.md) · [Documentation](README.md) · [中文](CONFIGURATION.zh.md)

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `antigravity` | Unique registration name on `ctx.subagents` |
| `authMethod` | `native` | Inherit native selection, or explicitly select a method in the [authentication guide](AUTHENTICATION.md) |
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

## Exposing the tool

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
