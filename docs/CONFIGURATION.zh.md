# 配置参考

[返回首页](../README.zh.md) · [文档目录](README.md) · [English](CONFIGURATION.md)

| 字段 | 默认值 | 含义 |
|---|---|---|
| `providerName` | `antigravity` | `ctx.subagents` 上的唯一实例名 |
| `authMethod` | `native` | 继承原生选择，或显式选择[登录指南](AUTHENTICATION.zh.md)中的方法 |
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

## 暴露工具

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
