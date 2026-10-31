# Authentication and troubleshooting

[Home](../README.md) · [Documentation](README.md) · [中文](AUTHENTICATION.zh.md)

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

```powershell
dsh-antigravity-auth --method oauth-personal --gemini-home "C:/path/to/your-acp-home"
```

If the package's bin directory is not on your PATH, use `node "C:/path/to/installed/package/lib/auth-cli.js"` with the same arguments. Use the same `geminiHome` in the provider. Omit both settings to use the native home. The command accepts `--runtime-dir`, `--gemini-home`, `--project`, `--location`, `--adc-path`, `--agent-platform-mode`, and `--timeout-ms`; paths must be absolute. Its overall deadline defaults to 600000 ms, independently of the provider's startup deadline. It accepts no plaintext API-key argument. Supply keys through the selected native environment, and do not commit secrets to a Profile patch or repository.

The command performs only `initialize` and, for an explicit method, `authenticate`; it creates no session and sends no prompt. A successful command is **not** proof of a usable API key, ADC, account entitlement, quota, or inference access. In `native` mode it does not validate the inherited login. ACP 1.4.3 has no supported cached-only or no-browser authentication mode: expired or missing OAuth credentials can open the native browser flow during delegation as well, subject to `startupTimeoutMs`. Complete initial login interactively, and treat later reauthentication as a possible startup failure or interaction.

ACP has its own settings and credentials. An App or `agy` login is not guaranteed to be available to ACP; this package does not copy or convert their tokens. `geminiHome` supplies `GEMINI_HOME`, the persistent native home directory itself, with ACP settings under `antigravity-acp/`. It also changes native configuration, session storage, and discovery of shared MCP, skills, and hooks; it is more than a token path. Explicit non-gateway authentication persists `auth.type` there, and Enterprise license selection can update project/location. Use separate persistent homes for provider instances that select different methods to avoid competing settings writes.

**Agent Platform:** `agentPlatformMode: native` follows Google's choice: a nonempty `GOOGLE_API_KEY` selects Express; otherwise ADC requires a project and location from its environment or saved native settings. Choose `adc` to remove that key override, or `api-key` to require the key and fail if it is absent. These modes apply only to explicit `authMethod: agent-platform`. To establish ADC on the machine running DSH:

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Configure `gcpProject` and `gcpLocation` for Agent Platform ADC when native settings do not already supply them. Use `adcPath` when DSH cannot discover the standard ADC file. The provider forwards the path without reading or copying credential contents; ACP authentication itself does not perform `gcloud` login. Enterprise OAuth uses its native license picker and saved ACP project/location instead of these Agent Platform overrides.

**Gateway:** explicit selection enables the native gateway capability. Supply a supported configuration, normally `AGY_LLM_GATEWAY_URL` with the applicable `AGY_LLM_GATEWAY_API_KEY` or `AGY_LLM_GATEWAY_HEADERS`. Gateway authentication does not persist `auth.type`, so configure `authMethod: gateway` for subsequent delegations. Native administrator policy remains authoritative; an administrator-forced gateway can also be inherited through `native`. Providing a key or gateway URL alone does not select its authentication method.

DSH scrubs its child environment. Selected explicit routes forward their necessary native variables; `native` does not promise to inherit every sensitive shell variable. Use provider `env` for an explicit deployment environment when needed. Native execution remains responsible for authorization and account charges. The package does not enable billing, APIs, or subscriptions.

## First login on Windows Desktop

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

## Windows credential-path troubleshooting

In a packaged application or a terminal subject to filesystem redirection, `AppData/Roaming` may be a virtual view whose actual files live under that application's `LocalCache/Roaming`. A successful `Test-Path` or token refresh in that terminal does not prove that independently running DSH can read the same apparent path. Prefer a regular Windows PowerShell terminal for login and path inspection. For a custom location, use the actual file location and ensure DSH runs as the same Windows user. Do not copy another user's or application's example path.

| Symptom | Next step |
|---|---|
| `The system cannot find the path specified`, pointing to the ADC file | Check the actual `adcPath` location and DSH's file access. Repeating login or restarting alone does not correct a wrong path. |
| `Authentication required` | Check the authentication method and complete configuration. `native` does not automatically select personal login; Agent Platform ADC also needs a project, location, and discoverable credentials. |
| 0.2.3 reports only `stage: session; category: protocol` | This wrapper is too generic and can hide an authentication failure. It does not establish protocol corruption or credential expiry. Inspect the local native diagnostic and remove sensitive information before sharing it. |
| Authentication command succeeds but a model request fails | Check account permissions, project, location, model availability, and quota. The authentication command sends no model request. |

The package includes no user credentials or preset local ADC path. Version 0.2.3 does not resolve Windows application-directory redirection automatically or verify credential paths through the actual DSH child process. These instructions are not a substitute for deployment validation.
