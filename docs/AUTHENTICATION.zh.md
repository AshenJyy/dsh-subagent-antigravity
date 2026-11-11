# 登录与复用 agy 状态

[返回首页](../README.zh.md) · [文档目录](README.md) · [English](AUTHENTICATION.md)

## 复用已有登录

0.3.0 通过 `agy acp` 执行。默认 `authMethod: native` 不发送 `authenticate`，由 agy 自行读取已保存的账号、配置和原生凭据。请使用与交互式 agy 相同的 Windows 用户和原生目录。内置 agy 也使用该目录，程序所在位置不同不需要复制凭据。

Google 文档说明了 [CLI 缓存登录复用](https://antigravity.google/docs/ide/extensions/acp)和[本机统一登录](https://antigravity.google/docs/install)。App/IDE 凭据共享由 Google 负责；本插件不提取或转换令牌。已观察 agy 1.5.5 在不发送认证请求、不弹登录页的情况下建会话并接受 Carbon + low，未执行模型推理。

发行包内置官方 agy 1.5.5，无需额外安装。要跟随本机 CLI 的更新，可设置 `agyPath` 为其 `agy.exe` 绝对路径。外部 CLI 须返回 `Antigravity ACP Server`、ACP v1，版本为 1.5.5 起的稳定 1.x；允许后续版本不代表已逐一验证。

```yaml
config:
  authMethod: native
  agentPlatformMode: native
  # 可选：改用已有 CLI。
  # agyPath: C:/actual/path/agy.exe
  model: gemini-4-carbon
  effort: low
```

通常省略 `geminiHome`。显式设置时，会通过 `agy acp --gemini-dir` 传入；这会改变配置、会话、定制内容及凭据发现目录，必须与登录时一致。

## 首次登录与显式选择

安装插件不会自动弹出登录页。可直接启动选定的 agy 登录，或在 DSH Profile 目录使用附带的认证命令（需 Node.js 22 或以上）：

```powershell
node ./node_modules/@ashenjyy/dsh-subagent-antigravity/lib/auth-cli.js --method oauth-personal
```

使用外部 CLI 时补上 `--agy-path C:/actual/path/agy.exe`；自定义目录时补上 `--gemini-home C:/actual/native-home`。认证命令只执行初始化和显式认证，不建会话或发送模型任务。`--method native` 只检查初始化，不验证凭据。命令参数不会自动保存到 DSH 配置。

| `authMethod` | 用途 |
|---|---|
| `native` | 复用 CLI 当前账号/提供方，不显式认证 |
| `oauth-personal` | Google 个人账号，必要时打开浏览器 |
| `oauth-business` | Gemini Enterprise，由原生流程选择许可证/项目 |
| `gemini-api-key` | 显式 API Key 路线，提供 `GEMINI_API_KEY` |
| `agent-platform` | Agent Platform，配置项目、区域和 ADC 或受支持的 Key 模式 |
| `gateway` | 保留旧配置，但必须由 CLI 实际公布；本次 1.5.5 未公布此方法 |

显式方法必须出现在初始化返回的认证列表中；不可用就报错，不切换账号或提供方。本包没有凭据。新版适配器未逐一执行 API Key、Enterprise、Agent Platform 的登录和推理。

## Agent Platform ADC

需要固定使用已有 ADC 时：

```yaml
config:
  authMethod: agent-platform
  agentPlatformMode: adc
  gcpProject: YOUR_PROJECT_ID
  gcpLocation: global
  adcPath: C:/actual/path/application_default_credentials.json
```

`adc` 模式移除子进程中的 API Key 冲突；`api-key` 模式要求 `GOOGLE_API_KEY`，`native` 保留该路线的原生 Key 优先行为。实际接受程度由 CLI 决定。没有 ADC 时，通过 Google Cloud 的正常登录流程建立；不复制示例路径。Key 只放安全环境或本机私有设置。

要沿用 agy 当前登录，将 `authMethod` 与 `agentPlatformMode` 都设为 `native`。原项目、区域和 ADC 路径可以保留，但 native 不强制选择认证路线；实际账号/提供方决定费用及权限。

## Windows 凭据路径排查

| 现象 | 处理 |
|---|---|
| `reason: model-unavailable` | 运行中的 CLI 未公布指定模型；核对 CLI 模型列表与账号，不会回退 |
| `reason: effort-unavailable` | 使用所选模型实际公布的 effort |
| `Authentication required` | 使用相同 CLI/原生目录登录，或配置支持的显式认证路线 |
| 找不到 ADC 文件 | 核对 DSH 实际可见的绝对路径；仅重启不能修正错误路径 |
| 运行时身份/版本不支持 | agyPath 应指向新版官方 CLI；旧独立 ACP EXE 不适用 |
| 认证成功但任务失败 | 认证选择不证明额度、凭据或模型推理可用 |

Windows 打包应用可能重定向 Roaming 路径；请使用 DSH 能读到的真实路径。不要公开 ADC 内容或完整原生日志。

只有插件自行生成的安全诊断进入 DSH 错误；不把原始 RPC 错误和 stderr 复制给父模型。CLI 日志保留在其原生目录。