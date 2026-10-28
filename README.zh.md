---
description: "面向 DeepSeek Harness 用户的一次性原生 Antigravity 子智能体提供方，用于选择产品后端与配置无人值守委派。"
kind: "package-bundle"
---

# @ashenjyy/dsh-subagent-antigravity

[English](README.md) | 中文

## 概述

将本 Bundle 安装到 **DeepSeek Harness 0.2.1-rc.3** 的 Profile，即可把自包含文本任务交给真正的 **Google Antigravity ACP Server 1.4.3**。每次任务启动新的 ACP Server 与配套原生 harness，创建一个会话并执行一轮。推理、文件读写、命令执行和工具循环由 Antigravity 完成；DSH 负责派发、进程管理、取消和结果通知。

实现沿用官方 [`@deepseek-ai/dsh-subagent-codex`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.3/packages/subagent/subagent-codex) 的分层。这是社区插件，不是 DeepSeek 或 Google 官方集成。它不调用 `agy --print`、不操纵 App 界面，也不把模型接进 DSH 的 Agent 循环代替原生执行。

公开 Bundle **不限定模型或 effort**。省略配置时使用原生默认值；显式配置必须由 ACP 支持并回读确认。任何配置或执行失败都不会回退到其他模型、后端或宿主 CLI。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [进一步探索](#进一步探索)
- [模型体验](#模型体验)
- [已知限制与延期工作](#已知限制与延期工作)
- [开发备注](#开发备注)

## 使用本包

### 安装 Bundle

从 [GitHub Releases](https://github.com/AshenJyy/dsh-subagent-antigravity/releases) 下载 `.tgz`，通过 DSH 插件页或 CLI 安装到实际使用的 Profile。请使用本仓库的发行包，避免与其他同名包混淆。

```sh
dsh plugin --profile web add /absolute/path/to/the-release-package.tgz
node /absolute/path/to/installed/package/lib/install.js
```

第二条命令是该安装包自带的原生载荷安装器：从 Google 下载固定版本，核对官方 SHA-256，将可执行文件和配套 harness 放到包内 `native/1.4.3/`。npm 包不重新分发 Google 二进制。可用 `--runtime-dir` 指定绝对目录，并在 Provider 配置相同路径；`--archive` 可安装已下载的官方 ZIP，同样必须通过摘要校验。

启用后注册全局工具 `subagent_antigravity`。委派任务前不会启动原生进程。DSH 提示重启时请重启。本包不会改写内置 Official 目录。

### 身份验证

本版使用 **Gemini Enterprise Agent Platform + ADC**。在运行 DSH 的机器完成 Google Cloud 登录，配置项目及区域：

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

若登录工具与 DSH 的用户目录不同，可用 `adcPath` 指向已生成的 ADC 文件。本插件只传递路径，不读取或复制凭证内容。不要把凭证写进仓库或 Profile 补丁。

ACP 的 `authenticate` 成功以及返回模型目录，只能证明配置建立，不能证明 ADC 有效、项目授权、配额或推理可用。云端错误由原生执行返回。插件不会自动更换认证方式、打开计费、启用 API 或创建订阅。子进程移除会覆盖 ADC 路由的环境 API Key 与企业网关配置。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `providerName` | `antigravity` | `ctx.subagents` 上的唯一实例名 |
| `model` | 原生默认值 | 可选的 ACP `model` 精确配置值 |
| `effort` | 原生默认值 | 可选的 ACP `thinking_level` 精确值 |
| `allowedModels` | 不限制 | 可选的本地模型 family 白名单 |
| `allowedEfforts` | 不限制 | 可选的本地 effort 白名单 |
| `disabledTools` | 原生默认值 | 可选的原生会话禁用工具 ID |
| `gcpProject` | `GOOGLE_CLOUD_PROJECT` | Agent Platform 项目，显式配置优先 |
| `gcpLocation` | `global` | 所选模型支持的区域 |
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

首次委派前设置项目。保留 `maxDepth: provider-managed`；本外部提供方不支持 DSH 深度强制、输出 schema、agentPreset 或 agentOptions。

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
| [`src/run.ts`](src/run.ts) | 启动、取消、结果归一化、完整进程清理 |
| [`src/wire.ts`](src/wire.ts) | 基于 DSH JSON-RPC transport 的最小 ACP v1 适配 |
| [`src/model-policy.ts`](src/model-policy.ts) | 精确选项匹配、回读、可选本地策略 |
| [`src/runtime.ts`](src/runtime.ts) | 固定版本载荷定位与完整性缓存 |
| [`src/install.ts`](src/install.ts) | 官方载荷显式下载安装 |
| [`cordis.patch.yml`](cordis.patch.yml) | 提供方与全局工具装配 |

### 运行流程

定位载荷 → 经 DSH 启动进程 → 验证 `antigravity-acp / 1.4.3 / ACP v1` → 选择 Agent Platform → 新建会话 → 设置并核对配置 → 发布任务 → 发送一轮文本 → 读取权威终态 → 关闭 stdin → 必要时终止并等待整个受管进程范围退出 → 通知父 Agent。

取消先本地结算，再尽力发送 `session/cancel`。清理必须包含子孙进程。提前退出、空成功答案和未知终态不会被判作成功。

### 性能

载荷只安装一次。首次使用或文件元数据改变时计算摘要，后续使用缓存，并合并并发定位请求。stderr 通过带背压的流转发；助手文本分块、有界保留，丢弃不需要的推理和工具载荷。复用 DSH 并发准入，不新增重复调度队列。保留每任务独立进程，不承诺未经测量的提速倍数。

</details>

## 进一步探索

- [官方 Codex 提供方](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.3/packages/subagent/subagent-codex)
- [Subagent 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/docs/subsystems/subagent.zh.md)
- [固定版本官方载荷](https://github.com/agentclientprotocol/registry/blob/06229c691d24d039e2363ba12abe5c9dfae5bc66/antigravity-acp/agent.json)
- [ADC 文档](https://docs.cloud.google.com/docs/authentication/application-default-credentials)
- [协议核查记录](docs/ACP-VERIFICATION.md)

## 模型体验

### 子级请求

Antigravity 在指定工作目录中获得独立、自包含文本任务，使用自身上下文、工具及模型请求。它不继承父对话、不获得 DSH 工具、不自动创建独立 Git worktree。费用与原生缓存由 Google Cloud 项目、模型和原生运行时决定。

### 父级调度与结果

父 Agent 获得启动确认及最终助手文本或失败诊断；子级上下文、推理和工具记录不进入父上下文。本包不承诺跨任务模型缓存复用。

## 已知限制与延期工作

- 固定兼容 DSH `0.2.1-rc.3`、ACP runtime `1.4.3` 与 ACP v1；升级需重新确认接口。
- 本版只选择 Agent Platform ADC 路线，不选择个人 OAuth、企业许可 OAuth、API Key 或网关。
- 新会话不等于 `ephemeral`。ACP 可保存原生会话；本包不恢复它们，也不删除原生记录。
- ACP 是独立后端，会发现共享 MCP、skills、hooks，但不保证 App 安装的整个插件包或界面功能可用。
- 白名单约束本适配器的模型选择。原生 hooks、MCP、插件以及封闭运行时内部的辅助行为，不能仅靠顶层配置证明全部使用同一模型；严格部署还应管理这些入口及服务端模型权限。
- 无人工问答；不支持的客户端请求失败，斜杠命令输入被拒绝。
- 仅文本、单轮；无追加输入、输出 schema、DSH 进度流、自动重试或副作用回滚。
- 启动期限不限制执行中的任务，运行任务通过 DSH 取消。
- 已观察 Windows x64 的启动与非推理配置流程；其他平台仅固定官方发行元数据，未运行验证。

## 开发备注

```sh
npm ci --ignore-scripts
npm run build
npm pack
```

发行包包含 ESM 与类型声明；安装 JS 依赖不会启动或下载原生 Agent。保留上游 MIT 归属。此次交付进行协议/配置核查与 TypeScript 编译，按要求没有编写或运行自动化测试，也没有执行模型推理冒烟测试。
