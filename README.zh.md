---
description: "面向 DeepSeek Harness 的一次性原生 Antigravity 子智能体提供方，可选择原生认证方式、模型与思考强度。"
kind: "package-bundle"
---

# @ashenjyy/dsh-subagent-antigravity

[English](README.md) | 中文

[下载](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/latest) · [文档目录](docs/README.md) · [版本记录](CHANGELOG.md) · [参与贡献](CONTRIBUTING.md)

## 概述

将 DeepSeek Harness 委派的文本任务交给 **Antigravity CLI 1.5.5 的 `agy acp` 入口**。每次任务启动独立原生进程和新会话，推理与工具执行由 Antigravity 完成，DSH 负责派发、取消和结果通知。

架构沿用官方 [Codex 子智能体提供方](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.1/packages/subagent/subagent-codex)。这是社区集成，通过 stdio 启动 `agy acp`。发行包内置官方 CLI，也可用 `agyPath` 指定已有 CLI，无需运行 Antigravity App。

| 项目 | 支持范围 |
|---|---|
| 平台 | Windows x64 |
| DeepSeek Harness | `0.2.1` 从 rc.3 起，`0.2.2` 从 rc.1 起；包含各系列后续 RC 和正式版 |
| 原生运行时 | 官方 agy CLI 1.5.5，已内置于发行 TGZ；也可指定已有 CLI |
| 宿主依赖 | DSH 包、Cordis、Schemastery 由宿主/Profile 提供 |
| 模型与 effort | 原生默认值或 ACP 支持的显式值，默认不限制、不回退 |

兼容范围为 `>=0.2.1-rc.3 <0.2.2-0 || >=0.2.2-rc.1 <0.2.3-0`。最近一次源码核对及编译覆盖 Harness `0.2.2-rc.1`、Cordis 4.1.0 和 Schemastery 3.19.0。各支持系列的后续 RC 及正式版无需逐个登记，不包含 0.2.3；这不表示已运行验证未来版本，具体见[兼容性记录](docs/ACP-VERIFICATION.md#024-harness-022-series)。

## 目录

- [使用本包](#使用本包)
- [理解实现](#理解实现)
- [进一步探索](#进一步探索)
- [模型体验](#模型体验)
- [已知限制与延期工作](#已知限制与延期工作)
- [开发备注](#开发备注)

## 使用本包

### 安装 Bundle

从 [v0.3.0](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.3.0) 下载 **`ashenjyy-dsh-subagent-antigravity-0.3.0-win32-x64.tgz`**，请选择发行 TGZ，而非 GitHub 自动生成的源码压缩包。通过 DSH 插件页安装，或在 CLI 中指定实际使用的 Profile：

```powershell
dsh plugin --profile desktop add "C:/path/to/ashenjyy-dsh-subagent-antigravity-0.3.0-win32-x64.tgz"
```

TGZ 已包含官方 `agy.exe` 及校验记录。省略 `runtimeDir` 和 `agyPath` 即可使用，无需另外安装。要跟随本机 CLI 的更新，可将 `agyPath` 设为已有 `agy.exe` 的绝对路径。宿主须提供相容的依赖组合；DSH 提示重启时请重启。

### 身份验证

**安装不会自动弹出登录页，请先配置认证再执行任务。** 默认 `native` 不发送认证请求，复用 agy CLI 已保存的登录和配置。请使用相同 Windows 用户及原生目录；App/IDE 共享登录由 Google 原生凭据管理处理，本插件不复制令牌。

可选择 CLI 现有登录、个人 Google OAuth、Gemini Enterprise OAuth、Gemini API Key 或 Agent Platform。显式方法须由运行中的 CLI 公布；保留旧网关配置不表示 CLI 一定支持。

<a id="windows-desktop-首次登录步骤"></a>

**[登录指南](docs/AUTHENTICATION.zh.md)** 提供 Windows 登录命令、插件配置和 ADC 路径排错步骤。保留显式 ADC 路线时设置 `authMethod: agent-platform` 和 `agentPlatformMode: adc`；复用 agy 当前登录时，两项都选 `native`。

### 配置

在 DSH 插件设置或 Profile 配置中修改提供方字段。`model` 和 `effort` 可省略；显式值必须由 ACP 公布并在设置后回读确认。不支持的配置会报错，不会替换成其他模型。

工具权限默认为 `deny`；需要批准受支持的普通工具操作时，可选择 `allow-once`。全部字段及权限边界见[配置参考](docs/CONFIGURATION.zh.md)。

### 暴露工具

Bundle 自动注册提供方和全局工具 **`subagent_antigravity`**。[工具装配说明](docs/CONFIGURATION.zh.md#暴露工具)记录了两个条目及 `maxDepth: provider-managed` 设置。

### 你会得到什么

原生会话启动并完成配置后返回子任务 ID，随后异步通知助手文本或失败诊断。原生推理、工具记录、原始协议数据及凭据不会复制到父 Agent 的答案中。

### 失败与恢复

<a id="windows-凭据路径排查"></a>

缺失运行时、认证失败及不支持的模型配置会明确失败。不会自动重试任务、替换模型、切换其他执行入口 或撤销已经产生的副作用。会话或凭据错误可先查阅 [Windows 排错说明](docs/AUTHENTICATION.zh.md#windows-凭据路径排查)。

## 理解实现

[架构文档](docs/ARCHITECTURE.zh.md)说明源码分工、ACP 启动、结果处理、取消及性能优化。通过运行时校验缓存、合并并发检查、流背压和有界输出减少适配层开销，保留每任务独立进程。

## 进一步探索

- [文档目录](docs/README.md)
- [官方 Codex 提供方](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.1/packages/subagent/subagent-codex)
- [DSH 子智能体子系统](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/subagent.md)
- [官方 agy ACP 接口](https://antigravity.google/docs/ide/extensions/acp)
- [协议与兼容性记录](docs/ACP-VERIFICATION.md)

已通过 agy 1.5.5 缓存登录创建会话并确认 Carbon + low 设置；未执行模型推理，见[验证记录](docs/ACP-VERIFICATION.md)。

## 模型体验

给子代理自包含的文本任务和工作目录。它使用 Antigravity 自身上下文与工具，不继承父对话，也不使用 DSH 工具。详见[子级请求与结果](docs/ARCHITECTURE.zh.md#子级请求)。

## 已知限制与延期工作

每会话一轮文本；不支持恢复会话、任务问答界面或自动重试，启动期限也不限制运行中的任务。原生会话可能持久保存，App 专属插件不会自动继承，OAuth 可能需要交互。完整边界与验证范围见[架构文档](docs/ARCHITECTURE.zh.md#已知限制与延期工作)。

## 开发备注

完整包构建使用 Windows x64 和 Node.js 24：

```sh
npm ci --ignore-scripts
npm run pack:bundle
```

目录结构、编译和发布流程见[贡献指南](CONTRIBUTING.md#中文)。普通 `npm pack` 只生成适配器包，`pack:bundle` 才生成 Windows 完整 TGZ。适配器采用 MIT 许可；内置 Google 程序保留其自身条款，见 [NOTICE](NOTICE)。
