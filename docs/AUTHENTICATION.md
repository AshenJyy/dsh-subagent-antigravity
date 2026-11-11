# Authentication and cached agy login

[Home](../README.md) · [Documentation](README.md) · [中文](AUTHENTICATION.zh.md)

## Reuse an existing login

Version 0.3.0 launches `agy acp`. With `authMethod: native` (the default), the plugin sends no `authenticate` request: the CLI resolves its own saved account, settings, and credential store. Use the same Windows user and native home as the interactive CLI. The bundled agy executable uses that same native home; moving the executable does not require copying credentials.

Google documents [cached CLI login reuse](https://antigravity.google/docs/ide/extensions/acp) and [shared native sign-in](https://antigravity.google/docs/install). App/IDE sharing is handled by Google, not token copying in this plugin. CLI 1.5.5 was observed creating a session and accepting Carbon + low without an authenticate request or browser interaction. No model inference was run.

To use an existing CLI installation and its updates, set an absolute `agyPath` to its `agy.exe`. The package defaults to its bundled, verified CLI 1.5.5. The configured external CLI must identify as `Antigravity ACP Server`, ACP v1, stable CLI 1.x from 1.5.5. Newer admitted versions have not all been exercised.

```yaml
config:
  authMethod: native
  agentPlatformMode: native
  # Optional: use your own installed CLI instead of the bundled binary.
  # agyPath: C:/actual/path/agy.exe
  model: gemini-4-carbon
  effort: low
```

Keep `geminiHome` unset to use the native default. An explicit absolute home is passed as `agy acp --gemini-dir` and changes the CLI's settings, sessions, customizations, and credential discovery. It must be the same home used during login.

## First login and explicit methods

Installing the plugin does not open a browser. Sign in with your selected CLI interactively, or use the included authentication helper from your DSH Profile directory (Node.js 22 or later required):

```powershell
node ./node_modules/@ashenjyy/dsh-subagent-antigravity/lib/auth-cli.js --method oauth-personal
```

Use `--agy-path C:/actual/path/agy.exe` when configured, and `--gemini-home C:/actual/native-home` when configured. The helper performs initialize and explicit authenticate only; it sends no session or model task. `--method native` only checks initialization, not credential validity. Save matching authentication fields in DSH separately; helper flags do not edit the Profile.

| DSH `authMethod` | Use |
|---|---|
| `native` | Reuse CLI's current login/provider; no explicit authenticate |
| `oauth-personal` | Personal Google OAuth, browser login when needed |
| `oauth-business` | Gemini Enterprise OAuth and native project/license selection |
| `gemini-api-key` | Explicit Gemini API key route; supply `GEMINI_API_KEY` |
| `agent-platform` | Agent Platform; supply the native project/location and ADC or supported key mode |
| `gateway` | Legacy configuration retained, but only usable if the CLI advertises it; 1.5.5 inspection did not advertise it |

Explicit methods are checked against initialize.authMethods. Unsupported routes fail rather than selecting another account/provider. No credentials are bundled. API-key, Enterprise, and Agent Platform routes were not individually exercised with this new CLI adapter.

## Agent Platform ADC

Generate ADC through Google Cloud's normal login flow if you do not already have it, then configure an actual readable path. Preserve an explicit ADC route with:

```yaml
config:
  authMethod: agent-platform
  agentPlatformMode: adc
  gcpProject: YOUR_PROJECT_ID
  gcpLocation: global
  adcPath: C:/actual/path/application_default_credentials.json
```

`agentPlatformMode: adc` removes API-key conflicts from the child's environment. `api-key` requires `GOOGLE_API_KEY`; `native` leaves supported native key precedence in effect. API-key acceptance and backend access remain runtime-dependent. Keys belong in a secure process environment or private settings, never a public repository.

To inherit the current agy account instead, set both `authMethod` and `agentPlatformMode` to `native`. Project/location/ADC path fields can remain saved, but do not force authentication selection in native mode. Account/provider selection determines billing and permissions.

## Windows credential-path troubleshooting

| Symptom | Next step |
|---|---|
| `reason: model-unavailable` | The running CLI did not advertise the configured model. Check its models and account; there is no fallback. |
| `reason: effort-unavailable` | Use an effort advertised for the selected model. |
| `Authentication required` | Sign in with the same CLI/native home, or configure an explicit supported route. |
| ADC file not found | Check the actual absolute path as seen by DSH; restarting alone does not repair a wrong path. |
| Unsupported runtime identity/version | Point agyPath to a current official CLI; old standalone ACP executables are not accepted. |
| Explicit authentication succeeds but a task fails | Authentication selection does not prove quota, credentials, or inference access. |

Windows packaged-app filesystem redirection can make an apparent Roaming path differ between applications. Use a real readable file path rather than copying an example. Never share ADC contents or raw native logs.

Only adapter-authored diagnostics enter DSH errors; raw RPC errors and native stderr are not copied into model-visible results. Native CLI logs remain under its own home.