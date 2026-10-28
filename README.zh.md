---
description: "面向 DeepSeek Harness 的一次性原生 Antigravity 子智能体提供方，可选择原生认证方式、模型与思考强度。"
kind: "package-bundle"
---

# @ashenjyy/dsh-subagent-antigravity

[English](README.md) | 中文

## 概述

将本 Bundle 安装到 **DeepSeek Harness 0.2.1-rc.3** 的 Profile，即可把自包含文本任务交给真正的 **Google Antigravity ACP Server 1.4.3**。每次任务启动新的 ACP Server 与配套原生 harness，创建一个会话并执行一轮。推理、文件读写、命令执行和工具循环由 Antigravity 完成；DSH 负责派发、进程管理、取消和结果通知。

实现沿用官方 [`@deepseek-ai/dsh-subagent-codex`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.3/packages/subagent/subagent-codex) 的分层。这是社区插件，不是 DeepSeek 或 Google 官方集成。它不调用 `agy --print`、不操纵 App 界面，也不把模型接进 DSH 的 Agent 循环代替原生执行。

公开 Bundle **不限定模型或 effort**。省略配置时使用原生默认值；显式配置必须由 ACP 支持并回读确认。任何配置或执行失败都不会回退到其他模型、后端或宿主 CLI。

**0.2.1** 的 Windows x64 完整发行包已内置固定版本原生运行时。认证方式仍可选择，默认沿用 ACP 已有选择。从 0.1.0 升级并希望保持 ADC 行为时，请设置 `authMethod: agent-platform` 与 `agentPlatformMode: adc`。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [进一步探索](#进一步探索)
- [模型体验](#模型体验)
- [已知限制与延期工作](#已知限制与延期工作)
- [开发备注](#开发备注)

## 使用本包

### 安装 Bundle

从 [GitHub Releases](https://github.com/AshenJyy/dsh-subagent-antigravity/releases) 下载 **`ashenjyy-dsh-subagent-antigravity-0.2.1-win32-x64.tgz`**。这是 **Windows x64 完整包**，内含 ACP Server 1.4.3、配套原生 harness 及校验记录。通过 DSH 插件页或 CLI 安装到实际使用的 Profile 即可，无需再执行运行时安装命令，也无需下载运行时。

完整包通过 `os`/`cpu` 限制防止误装到其他平台，仍需要 DSH 依赖和可用的认证配置，不包含账号或凭据。请使用本仓库的发行包，避免与其他同名包混淆。

```sh
dsh plugin --profile web add /absolute/path/to/the-release-package.tgz
```

运行时已放在包内 `native/1.4.3/win32-x64/`，省略 `runtimeDir` 即可直接使用。保留的 `dsh-antigravity-install` 命令供开发或显式自定义运行时目录使用；正常安装此发行包不需要运行它。

启用后注册全局工具 `subagent_antigravity`。仅启用不会启动原生进程；委派任务或主动执行认证命令时才会启动。DSH 提示重启时请重启。本包不会改写内置 Official 目录。

### 身份验证

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

```sh
dsh-antigravity-auth --method oauth-personal --gemini-home /absolute/path/to/your-acp-home
```

若安装包的 bin 目录不在 PATH 中，可用 `node /absolute/path/to/installed/package/lib/auth-cli.js` 携带相同参数执行。Provider 中设置相同的 `geminiHome`；两处都省略则使用原生目录。命令支持 `--runtime-dir`、`--gemini-home`、`--project`、`--location`、`--adc-path`、`--agent-platform-mode`、`--timeout-ms`，路径须为绝对路径。命令总期限默认为 600000 毫秒，与 Provider 的启动期限独立。命令不接收明文 API Key 参数；通过对应的原生环境提供密钥，不要提交到 Profile 补丁或仓库。

认证命令只执行 `initialize`，以及显式方法的 `authenticate`，不建会话、不发送 prompt。命令成功**不能证明** API Key、ADC、账号权益、配额或推理可用；`native` 模式也不会验证继承的登录是否有效。ACP 1.4.3 没有受支持的“仅使用缓存”或“禁止打开浏览器”认证模式：OAuth 缺失或失效时，委派任务仍可能触发原生浏览器流程，并受 `startupTimeoutMs` 限制。首次登录建议主动完成，后续也需考虑重新认证导致的启动交互或失败。

ACP 使用独立的设置与凭据存储。App 或 `agy` 已登录，不代表 ACP 必然能复用；本包不会复制或转换它们的 token。`geminiHome` 设置 `GEMINI_HOME`，指向持久的原生目录本身，ACP 设置保存在其 `antigravity-acp/` 下。它还影响原生配置、会话存储和共享 MCP、skills、hooks 的发现，并非仅是 token 路径。显式非网关认证会写入 `auth.type`，企业许可选择还可能更新项目及区域。使用不同认证方式的 Provider 应配置不同的持久目录，避免相互覆盖认证选择。macOS 原生 Keychain 账号仍可能共用，因此不同目录本身不等于完整凭据隔离。

**Agent Platform：**`agentPlatformMode: native` 沿用 Google 原生选择：存在非空 `GOOGLE_API_KEY` 时走 Express，否则 ADC 需要环境或原生设置提供项目及区域。选择 `adc` 会移除该 Key 覆盖；选择 `api-key` 要求 Key 存在，缺失时直接失败。这些模式仅作用于显式 `authMethod: agent-platform`。在运行 DSH 的机器建立 ADC：

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

原生设置尚未提供项目或区域时，为 Agent Platform ADC 配置 `gcpProject`、`gcpLocation`。DSH 无法发现标准 ADC 文件时可配置 `adcPath`；本插件只传递路径，不读取或复制凭证内容。ACP 认证本身不会执行 `gcloud` 登录。企业 OAuth 使用原生许可选择器及 ACP 已保存的项目、区域，不使用这些 Agent Platform 覆盖值。

**网关：**显式选择会启用原生网关能力。请提供受支持的配置，通常是 `AGY_LLM_GATEWAY_URL` 及所需的 `AGY_LLM_GATEWAY_API_KEY` 或 `AGY_LLM_GATEWAY_HEADERS`。网关认证不会保存 `auth.type`，后续委派仍应配置 `authMethod: gateway`。原生管理员策略优先；管理员强制网关也可通过 `native` 继承。只提供 Key 或网关 URL，不等于已经选择相应认证方式。

DSH 会清理子进程环境。显式认证路线会传递其所需的原生变量；`native` 不保证自动继承 shell 中的全部敏感变量。需要时通过 Provider 的 `env` 提供明确的部署环境。账号授权与费用由原生执行决定；本包不会打开计费、启用 API 或创建订阅。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `providerName` | `antigravity` | `ctx.subagents` 上的唯一实例名 |
| `authMethod` | `native` | 继承原生选择，或显式选择上表中的方法 |
| `agentPlatformMode` | `native` | 显式 `agent-platform` 的原生选择、`adc` 或 `api-key` 模式 |
| `geminiHome` | 原生目录 | 可选的持久原生目录，须为绝对路径 |
| `model` | 原生默认值 | 可选的 ACP `model` 精确配置值 |
| `effort` | 原生默认值 | 可选的 ACP `thinking_level` 精确值 |
| `allowedModels` | 不限制 | 可选的本地模型 family 白名单 |
| `allowedEfforts` | 不限制 | 可选的本地 effort 白名单 |
| `disabledTools` | 原生默认值 | 可选的原生会话禁用工具 ID |
| `gcpProject` | 原生环境/设置 | 可选的 Agent Platform 项目覆盖值，并非所有登录方式都需要 |
| `gcpLocation` | 原生环境/设置 | 可选的 Agent Platform 区域覆盖值 |
| `adcPath` | 原生 ADC 发现 | 可选的 ADC 文件绝对路径 |
| `runtimeDir` | 包内目录 | 可选的已安装原生文件目录 |
| `permissionMode` | `deny` | 拒绝审批；或 `allow-once` 允许受支持的普通工具单次审批 |
| `env` | `{}` | 叠加在 DSH 已清理环境之上的显式变量 |
| `startupTimeoutMs` | `90000` | 初始化、认证方式选择、建会话、配置的总期限 |
| `disposeEofGraceMs` | `1000` | stdin 关闭后等待原生退出的宽限 |
| `disposeGraceMs` | `3000` | DSH 受管进程终止宽限 |
| `maxOutputBytes` | `8388608` | 保留的助手文本上限，超出明确失败 |

模型和 effort 固定在 Provider 实例中，不是工具调用的动态参数。需要多档配置时挂载多个实例和不同工具名。使用 ACP 实际公布的值，不要从 App 或 CLI 标签猜测。

原生权限模式保持 `default`。`allow-once` 仅允许识别出的普通 read/edit/execute/search/fetch 请求；不切换 YOLO、不代答用户问题、不永久授权、不自动批准未知或 MCP `other` 请求。这里的策略不等同于操作系统沙箱。

### 暴露工具

Bundle 插入以下 Host 条目，所有预设均可看到工具：

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

首次委派前设置认证方式及可选模型配置；Cloud 项目并非所有登录方式的前提。保留 `maxDepth: provider-managed`；本外部提供方不支持 DSH 深度强制、输出 schema、agentPreset 或 agentOptions。

### 你会得到什么

原生会话及配置就绪后，工具先返回 child ID，执行在后台继续，最终由 DSH 向父 Agent 通知。结果包含 ACP 助手文本、停止原因与可选安全诊断。推理、工具日志、stderr 和原始协议包不进入父回答。ACP 没有 Codex 的 final/partial 阶段标签，因此本版汇集助手文本，不声称能作相同的阶段筛选。

### 失败与恢复

载荷缺失、模型不可用、回读不一致、认证错误、协议不支持都会明确失败；不查找 PATH、不替换模型、不自动重试任务。取消不会回滚已经发生的文件或外部修改。

## 理解实现

<details>
<summary>实现细节</summary>

### 设计理念

- 每次任务一个原生进程、一个新会话、一轮输入；不池化、不恢复、不追加输入。
- Antigravity 自行执行工具；ACP 客户端不提供 DSH 文件或终端工具。
- 复用 `ctx.subagents`、`ctx.subprocess`、`settleRunResult`、`subprocessRunHandle`。
- 显式模型配置必须生效；本地白名单作为额外部署策略，不限制公开包的模型范围。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 配置、注册提供方 |
| [`src/auth.ts`](src/auth.ts) | 原生认证选择及各路线的环境配置 |
| [`src/auth-cli.ts`](src/auth-cli.ts) | 不建会话、不发送 prompt 的主动认证命令 |
| [`src/run.ts`](src/run.ts) | 启动、取消、结果归一化、完整进程清理 |
| [`src/wire.ts`](src/wire.ts) | 基于 DSH JSON-RPC transport 的最小 ACP v1 适配 |
| [`src/model-policy.ts`](src/model-policy.ts) | 精确选项匹配、回读、可选本地策略 |
| [`src/runtime.ts`](src/runtime.ts) | 固定版本载荷定位与完整性缓存 |
| [`src/install.ts`](src/install.ts) | 官方载荷显式下载安装 |
| [`cordis.patch.yml`](cordis.patch.yml) | 提供方与全局工具装配 |

### 运行流程

定位载荷 → 经 DSH 启动进程 → 验证 `antigravity-acp / 1.4.3 / ACP v1` → 沿用原生认证或选择配置的方法 → 新建会话 → 设置并核对配置 → 发布任务 → 发送一轮文本 → 读取权威终态 → 关闭 stdin → 必要时终止并等待整个受管进程范围退出 → 通知父 Agent。

取消先本地结算，再尽力发送 `session/cancel`。清理必须包含子孙进程。提前退出、空成功答案和未知终态不会被判作成功。

### 性能

完整包首次使用时无需下载或额外解压运行时。首次使用或文件元数据改变时计算摘要，后续使用缓存，并合并并发定位请求。stderr 通过带背压的流转发；助手文本分块、有界保留，丢弃不需要的推理和工具载荷。复用 DSH 并发准入，不新增重复调度队列。保留每任务独立进程，不承诺未经测量的提速倍数。

</details>

## 进一步探索

- [官方 Codex 提供方](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.3/packages/subagent/subagent-codex)
- [Subagent 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/docs/subsystems/subagent.zh.md)
- [固定版本官方载荷](https://github.com/agentclientprotocol/registry/blob/06229c691d24d039e2363ba12abe5c9dfae5bc66/antigravity-acp/agent.json)
- [ADC 文档](https://docs.cloud.google.com/docs/authentication/application-default-credentials)
- [协议核查记录](docs/ACP-VERIFICATION.md)

## 模型体验

### 子级请求

Antigravity 在指定工作目录中获得独立、自包含文本任务，使用自身上下文、工具及模型请求。它不继承父对话、不获得 DSH 工具、不自动创建独立 Git worktree。原生请求与费用跟随所选账号、项目或网关配置。

### 父级调度与结果

父 Agent 获得启动确认及最终助手文本或失败诊断；子级上下文、推理和工具记录不进入父上下文。本包不承诺跨任务模型缓存复用。

## 已知限制与延期工作

- 固定兼容 DSH `0.2.1-rc.3`、ACP runtime `1.4.3` 与 ACP v1；升级需重新确认接口。
- 配置覆盖原生公布的认证路线；0.2.0 新增流程仅据源码核对，未逐一真实登录或执行推理。账号及企业策略仍可能限制可用方法。
- OAuth 首次登录或重新认证可能打开浏览器；主动认证命令不保证后续任务完全无交互。
- 新会话不等于 `ephemeral`。ACP 可保存原生会话；本包不恢复它们，也不删除原生记录。
- ACP 是独立后端，会发现共享 MCP、skills、hooks，但不保证 App 安装的整个插件包或界面功能可用。
- 白名单约束本适配器的模型选择。原生 hooks、MCP、插件以及封闭运行时内部的辅助行为，不能仅靠顶层配置证明全部使用同一模型；严格部署还应管理这些入口及服务端模型权限。
- 不提供任务问答界面；不支持的客户端请求失败，斜杠命令输入被拒绝。原生认证浏览器流程与任务问答不同。
- 仅文本、单轮；无追加输入、输出 schema、DSH 进度流、自动重试或副作用回滚。
- 启动期限不限制执行中的任务，运行任务通过 DSH 取消。
- 已观察 Windows x64 的启动与非推理配置流程；其他平台仅固定官方发行元数据，未运行验证。

## 开发备注

```sh
npm ci --ignore-scripts
npm run pack:bundle
```

请在 Windows x64 构建此发行包。`pack:bundle` 编译适配器，只将公开文件清单复制到暂存目录，并解压一份通过官方摘要校验的全新运行时，不复制已有登录目录。可用 `npm run pack:bundle -- --archive /absolute/path/to/official.zip` 复用已下载的官方 ZIP，同样核对摘要。输出带 `win32-x64` 后缀的 TGZ 和 SHA-256 文件；直接 `npm pack` 仍生成仅含适配器的开发包，不是完整发行包。

安装发行包不会启动原生 Agent 或执行下载钩子。完整包包含原样 Google 二进制和校验记录；适配器包含 ESM 与类型声明。保留上游 MIT 归属与 `NOTICE` 中的运行时声明，适配器的 MIT 许可不覆盖 Google 运行时。此次交付仅编译和核对归档内容、摘要，按要求没有编写或运行自动化测试，也没有执行模型推理冒烟测试。
