---
description: "面向 DeepSeek Harness 的一次性原生 Antigravity 子智能体提供方，可选择原生认证方式、模型与思考强度。"
kind: "package-bundle"
---

# @ashenjyy/dsh-subagent-antigravity

[English](README.md) | 中文

[下载](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/latest) · [文档目录](docs/README.md) · [版本记录](CHANGELOG.md) · [参与贡献](CONTRIBUTING.md)

## 概述

将 DeepSeek Harness 委派的文本任务交给 **Google Antigravity ACP Server 1.4.3**。每次任务启动独立原生进程和新会话，推理与工具执行由 Antigravity 完成，DSH 负责派发、取消和结果通知。

架构沿用官方 [Codex 子智能体提供方](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.5/packages/subagent/subagent-codex)。这是社区集成，直接使用 ACP Server，无需安装 `agy` CLI 或 Antigravity App。

| 项目 | 支持范围 |
|---|---|
| 平台 | Windows x64 |
| DeepSeek Harness | `>=0.2.1-rc.3 <0.2.2-0`，包含后续 `0.2.1-rc.*` 和 `0.2.1` 正式版 |
| 原生运行时 | ACP Server 1.4.3 及配套 harness，已内置于发行 TGZ |
| 宿主依赖 | DSH 包、Cordis、Schemastery 由宿主/Profile 提供 |
| 模型与 effort | 原生默认值或 ACP 支持的显式值，默认不限制、不回退 |

最近一次源码核对覆盖 Harness rc.5。版本范围是兼容策略，不表示已运行验证未来版本，具体见[兼容性记录](docs/ACP-VERIFICATION.md#023-harness-021-series-and-host-peers)。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [进一步探索](#进一步探索)
- [模型体验](#模型体验)
- [已知限制与延期工作](#已知限制与延期工作)
- [开发备注](#开发备注)

## 使用本包

### 安装 Bundle

从 [v0.2.3](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.2.3) 下载 **`ashenjyy-dsh-subagent-antigravity-0.2.3-win32-x64.tgz`**，请选择发行 TGZ，而非 GitHub 自动生成的源码压缩包。通过 DSH 插件页安装，或在 CLI 中指定实际使用的 Profile：

```powershell
dsh plugin --profile desktop add "C:/path/to/ashenjyy-dsh-subagent-antigravity-0.2.3-win32-x64.tgz"
```

TGZ 已包含两个原生程序及校验记录。省略 `runtimeDir` 即可使用，无需单独安装或下载运行时。宿主须提供相容的依赖组合；DSH 提示重启时请重启。

### 身份验证

**安装不会自动弹出登录页，请先配置认证再执行任务。** 默认 `native` 使用 ACP 已保存的选择及企业策略，不会自动选择个人账号登录。App 或 `agy` 的登录状态不保证能直接继承。

可以选择 Google 个人账号 OAuth、Gemini Enterprise OAuth、Gemini API Key、Agent Platform ADC/Express、企业网关，或已有原生配置。具体可用方式由账号及管理员策略决定。

<a id="windows-desktop-首次登录步骤"></a>

**[登录指南](docs/AUTHENTICATION.zh.md)** 提供 Windows 登录命令、插件配置和 ADC 路径排错步骤。从 0.1.0 升级并保留原 ADC 路线时，设置 `authMethod: agent-platform` 和 `agentPlatformMode: adc`。

### 配置

在 DSH 插件设置或 Profile 配置中修改提供方字段。`model` 和 `effort` 可省略；显式值必须由 ACP 公布并在设置后回读确认。不支持的配置会报错，不会替换成其他模型。

工具权限默认为 `deny`；需要批准受支持的普通工具操作时，可选择 `allow-once`。全部字段及权限边界见[配置参考](docs/CONFIGURATION.zh.md)。

### 暴露工具

Bundle 自动注册提供方和全局工具 **`subagent_antigravity`**。[工具装配说明](docs/CONFIGURATION.zh.md#暴露工具)记录了两个条目及 `maxDepth: provider-managed` 设置。

### 你会得到什么

原生会话启动并完成配置后返回子任务 ID，随后异步通知助手文本或失败诊断。原生推理、工具记录、原始协议数据及凭据不会复制到父 Agent 的答案中。

### 失败与恢复

<a id="windows-凭据路径排查"></a>

缺失运行时、认证失败及不支持的模型配置会明确失败。不会自动重试任务、替换模型、回退到 CLI 或撤销已经产生的副作用。会话或凭据错误可先查阅 [Windows 排错说明](docs/AUTHENTICATION.zh.md#windows-凭据路径排查)。

## 理解实现

[架构文档](docs/ARCHITECTURE.zh.md)说明源码分工、ACP 启动、结果处理、取消及性能优化。通过运行时校验缓存、合并并发检查、流背压和有界输出减少适配层开销，保留每任务独立进程。

## 进一步探索

- [文档目录](docs/README.md)
- [官方 Codex 提供方](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.5/packages/subagent/subagent-codex)
- [DSH 子智能体子系统](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/docs/subsystems/subagent.md)
- [固定版本官方 ACP 发行记录](https://github.com/agentclientprotocol/registry/blob/06229c691d24d039e2363ba12abe5c9dfae5bc66/antigravity-acp/agent.json)
- [协议与兼容性记录](docs/ACP-VERIFICATION.md)

## 模型体验

给子代理自包含的文本任务和工作目录。它使用 Antigravity 自身上下文与工具，不继承父对话，也不使用 DSH 工具。详见[子级请求与结果](docs/ARCHITECTURE.zh.md#子级请求)。

## 已知限制与延期工作

每会话一轮文本；不支持恢复会话、任务问答界面或自动重试，启动期限也不限制运行中的任务。原生会话可能持久保存，App 专属插件不会自动继承，OAuth 可能需要交互。完整边界与验证范围见[架构文档](docs/ARCHITECTURE.zh.md#已知限制与延期工作)。

## 开发备注

使用 Windows x64 和 Node.js 22 或以上版本：

```sh
npm ci --ignore-scripts
npm run pack:bundle
```

目录结构、编译和发布流程见[贡献指南](CONTRIBUTING.md#中文)。普通 `npm pack` 只生成适配器包，`pack:bundle` 才生成 Windows 完整 TGZ。适配器采用 MIT 许可；内置 Google 程序保留其自身条款，见 [NOTICE](NOTICE)。
