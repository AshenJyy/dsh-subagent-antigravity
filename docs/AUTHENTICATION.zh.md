# 登录与认证排错

[返回首页](../README.zh.md) · [文档目录](README.md) · [English](AUTHENTICATION.md)

**首次使用需要主动选择认证方式并完成配置。安装插件不会自动打开登录页面，0.2.3 也没有专门的登录按钮。** 完整 TGZ 包含运行时；账号、API Key、项目和凭据路径由使用者在本机配置。

每个 Provider 实例可以选择认证方式。默认 `native` 沿用 ACP 已有设置和企业策略，不发送 `authenticate`，也不会轮流尝试不同登录方式。显式方法必须受原生运行时及其策略支持；失败不会改用其他账号或路线。

| `authMethod` | 原生行为与配置 |
|---|---|
| `native` | 复用 ACP 已有认证选择、OAuth 缓存及适用的企业策略 |
| `oauth-personal` | Google 个人账号 OAuth；需要时打开原生浏览器登录 |
| `oauth-business` | Gemini Enterprise OAuth 与原生许可选择 |
| `gemini-api-key` | 使用 `GEMINI_API_KEY` 的 Gemini Developer API |
| `agent-platform` | Gemini Enterprise Agent Platform，通过 `agentPlatformMode` 选择 ADC 或 Express `GOOGLE_API_KEY` |
| `gateway` | 原生 Google 兼容企业网关，受管理员策略约束 |

首次 OAuth 登录或主动切换认证方式时，建议先执行安装包自带的认证命令：

```powershell
dsh-antigravity-auth --method oauth-personal --gemini-home "C:/path/to/your-acp-home"
```

若安装包的 bin 目录不在 PATH 中，可用 `node "C:/path/to/installed/package/lib/auth-cli.js"` 携带相同参数执行。Provider 中设置相同的 `geminiHome`；两处都省略则使用原生目录。命令支持 `--runtime-dir`、`--gemini-home`、`--project`、`--location`、`--adc-path`、`--agent-platform-mode`、`--timeout-ms`，路径须为绝对路径。命令总期限默认为 600000 毫秒，与 Provider 的启动期限独立。命令不接收明文 API Key 参数；通过对应的原生环境提供密钥，不要提交到 Profile 补丁或仓库。

认证命令只执行 `initialize`，以及显式方法的 `authenticate`，不建会话、不发送 prompt。命令成功**不能证明** API Key、ADC、账号权益、配额或推理可用；`native` 模式也不会验证继承的登录是否有效。ACP 1.4.3 没有受支持的“仅使用缓存”或“禁止打开浏览器”认证模式：OAuth 缺失或失效时，委派任务仍可能触发原生浏览器流程，并受 `startupTimeoutMs` 限制。首次登录建议主动完成，后续也需考虑重新认证导致的启动交互或失败。

ACP 使用独立的设置与凭据存储。App 或 `agy` 已登录，不代表 ACP 必然能复用；本包不会复制或转换它们的 token。`geminiHome` 设置 `GEMINI_HOME`，指向持久的原生目录本身，ACP 设置保存在其 `antigravity-acp/` 下。它还影响原生配置、会话存储和共享 MCP、skills、hooks 的发现，并非仅是 token 路径。显式非网关认证会写入 `auth.type`，企业许可选择还可能更新项目及区域。使用不同认证方式的 Provider 应配置不同的持久目录，避免相互覆盖认证选择。

**Agent Platform：**`agentPlatformMode: native` 沿用 Google 原生选择：存在非空 `GOOGLE_API_KEY` 时走 Express，否则 ADC 需要环境或原生设置提供项目及区域。选择 `adc` 会移除该 Key 覆盖；选择 `api-key` 要求 Key 存在，缺失时直接失败。这些模式仅作用于显式 `authMethod: agent-platform`。在运行 DSH 的机器建立 ADC：

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

原生设置尚未提供项目或区域时，为 Agent Platform ADC 配置 `gcpProject`、`gcpLocation`。DSH 无法发现标准 ADC 文件时可配置 `adcPath`；本插件只传递路径，不读取或复制凭证内容。ACP 认证本身不会执行 `gcloud` 登录。企业 OAuth 使用原生许可选择器及 ACP 已保存的项目、区域，不使用这些 Agent Platform 覆盖值。

**网关：**显式选择会启用原生网关能力。请提供受支持的配置，通常是 `AGY_LLM_GATEWAY_URL` 及所需的 `AGY_LLM_GATEWAY_API_KEY` 或 `AGY_LLM_GATEWAY_HEADERS`。网关认证不会保存 `auth.type`，后续委派仍应配置 `authMethod: gateway`。原生管理员策略优先；管理员强制网关也可通过 `native` 继承。只提供 Key 或网关 URL，不等于已经选择相应认证方式。

DSH 会清理子进程环境。显式认证路线会传递其所需的原生变量；`native` 不保证自动继承 shell 中的全部敏感变量。需要时通过 Provider 的 `env` 提供明确的部署环境。账号授权与费用由原生执行决定；本包不会打开计费、启用 API 或创建订阅。

## Windows Desktop 首次登录步骤

先选定一种认证方式。以下示例使用 `desktop` Profile；使用其他 Profile 时替换对应目录。在 DSH 插件设置中填写配置字段，或编辑 `%USERPROFILE%/.dsh/profiles/desktop/cordis.patch.yml` 中的 `subagent-antigravity` 条目。下面的 YAML 是对已有条目的覆盖，不要再次插入同名 Provider；已有该条目时合并字段。

**Google 个人账号或 Gemini Enterprise OAuth：** 在 PowerShell 定位已安装的认证命令。以下命令优先使用 DSH 的 Node；没有该运行时路径时需要 PATH 中的 Node.js 22 或更高版本。

```powershell
$profileDir = Join-Path $env:USERPROFILE '.dsh/profiles/desktop'
$authScript = Join-Path $profileDir 'node_modules/@ashenjyy/dsh-subagent-antigravity/lib/auth-cli.js'
$dshNode = Join-Path $env:USERPROFILE '.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe'
if (-not (Test-Path -LiteralPath $dshNode)) {
  $dshNode = (Get-Command node -ErrorAction Stop).Source
}
& $dshNode $authScript --method oauth-personal
```

在原生流程打开的浏览器中完成授权；有效的已有 ACP 登录可能直接复用。Gemini Enterprise OAuth 将最后一个参数改为 `oauth-business`，并按原生界面选择许可。将同一方法保存到 DSH：

```yaml
- id: subagent-antigravity
  config:
    authMethod: oauth-personal
```

企业 OAuth 对应 `authMethod: oauth-business`。上述示例使用默认原生目录；如果登录时指定 `--gemini-home`，在 Provider 的 `geminiHome` 中填写同一个绝对目录。

**Agent Platform 按量付费 / ADC：** 用运行 DSH 的 Windows 账号，在普通 PowerShell 中执行已安装的 Google Cloud CLI：

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

完成浏览器授权，记下 gcloud 输出的凭据保存位置。然后在 DSH 中持久保存以下字段，把项目和路径占位符替换为自己的值，区域按项目需要填写：

```yaml
- id: subagent-antigravity
  config:
    authMethod: agent-platform
    agentPlatformMode: adc
    gcpProject: YOUR_PROJECT_ID
    gcpLocation: global
    adcPath: C:/actual/path/application_default_credentials.json
```

`adcPath` 可在原生默认发现确实可用时省略；显式填写时必须是 **DSH 及其原生子进程可读取的文件绝对路径**。不要照抄示例路径，也不要把登录命令的成功当作该路径对 DSH 可见的证明。

**认证命令不替你保存 DSH 配置。** `dsh-antigravity-auth` 的 `--project`、`--location`、`--adc-path` 只配置该次认证进程，不会写入 Profile；Agent Platform 的这些值也不会因认证成功就全部保存到 ACP 设置中。应把所需字段保留在 Provider 配置里。CLI 不执行 `gcloud` 登录，也不验证实际模型调用权限。

**Gemini API Key / Agent Platform Express：** 不需要浏览器登录。分别设置 `authMethod: gemini-api-key` 与 `env.GEMINI_API_KEY`，或 `authMethod: agent-platform`、`agentPlatformMode: api-key` 与 `env.GOOGLE_API_KEY`。通过 DSH 进程的安全环境或本机私有设置提供密钥；不要把真实密钥放入命令行、公开仓库或分享的 Profile。只在另一个终端设置变量，不会自动改变已经运行的 DSH 环境。

**企业网关：** 使用 `authMethod: gateway` 和管理员提供的网关配置；具体授权由企业网关管理。`native` 也可以沿用强制网关策略。不要改用其他认证方式绕过管理员策略。

保存后让 DSH 重载配置，必要时重启。正常重启和后续任务会继续使用持久配置；原生凭据管理器会在刷新凭据仍有效时刷新短期 token。删除/重置 Profile、换账号或项目、撤销授权后，需要相应更新配置或重新登录。

## Windows 凭据路径排查

在打包应用或受文件系统重定向影响的终端里，`AppData/Roaming` 可能是虚拟视图，实际文件位于该应用的 `LocalCache/Roaming`。该终端中的 `Test-Path` 或 token 刷新成功，不能证明独立运行的 DSH 可读取同一表面路径。优先在普通 Windows PowerShell 中登录和核对路径；使用自定义位置时，以实际文件位置为准，并确认 DSH 使用同一 Windows 账号。不要复制其他用户或应用示例中的路径。

| 现象 | 下一步 |
|---|---|
| `The system cannot find the path specified`，并指向 ADC 文件 | 核对 `adcPath` 的实际位置和 DSH 的文件访问范围。单纯重新登录或重启不会修正错误路径。 |
| `Authentication required` | 检查认证方式及完整配置。`native` 不会自动选择个人登录；Agent Platform ADC 还需要项目、区域及可发现的凭据。 |
| 0.2.3 只显示 `stage: session; category: protocol` | 这是过于笼统的包装错误，可能包含认证失败；不能据此断定协议损坏或凭据过期。查看本机原生日志中的原因，分享时先移除敏感信息。 |
| 认证命令成功，模型请求仍失败 | 继续检查账号权限、项目、区域、模型可用性和配额。认证命令不发送模型请求。 |

本包不包含用户凭据或预设的本机 ADC 路径。0.2.3 不会自动解析 Windows 应用目录映射，也没有用实际 DSH 子进程验证凭据路径的功能；README 中的步骤不能代替实际部署验证。
