# Changelog / 版本记录

[Home](README.md) · [中文首页](README.zh.md) · [Releases](https://github.com/AshenJyy/dsh-subagent-antigravity/releases)

Entries describe published release behavior. Documentation on the main branch may be newer than the README included in an existing TGZ. See the [verification record](docs/ACP-VERIFICATION.md) for the evidence and validation scope of each release.

以下记录已发布版本的行为。主分支文档可能比已有 TGZ 内的说明更新；各版本的核对依据与验证范围见 [ACP 记录](docs/ACP-VERIFICATION.md)。

## [0.2.5](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.2.5)

- Update the bundled official ACP Server and matching native harness from 1.4.3 to 1.4.5, pinned to ACP Registry commit `02b460362cfedf4d43b03df7aad6d79a353fe064` and its published archive hashes.
- Share the runtime version constant with the ACP identity check so the installed payload and protocol validation remain aligned.
- Preserve Harness compatibility, host peers, authentication choices, unrestricted model/effort configuration, and no-fallback behavior. This release does not claim verified Carbon inference.

将 Windows 完整包内置的 ACP Server 和配套原生 harness 升级至 1.4.5，同步官方摘要及协议版本校验；保留宿主兼容范围、登录与模型配置方式。本次未验证 Carbon 推理。

## [0.2.4](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.2.4)

- Add the Harness 0.2.2 series from rc.1, while retaining 0.2.1 support from rc.3. Each series accepts subsequent RCs and its stable release; 0.2.3 remains excluded.
- Accept the host's Cordis 4.1 and Schemastery 3.19 dependencies alongside the older supported lines. Pin source development to Harness 0.2.2-rc.1, Cordis 4.1.0, and Schemastery 3.19.0.
- Preserve the official provider lifecycle, ACP 1.4.3 runtime, authentication settings, and unrestricted model/effort selection. Include the reorganized bilingual documentation in the complete Windows bundle.

增加 Harness 0.2.2 系列支持（从 rc.1 起），保留 rc.3 起的 0.2.1 系列，继续复用宿主依赖；开发环境对齐新版。保留现有 ACP、登录配置及模型行为，完整包包含整理后的中英文文档。

## [0.2.3](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.2.3)

- Accept Harness `>=0.2.1-rc.3 <0.2.2-0`, including later 0.2.1 RCs and stable 0.2.1, without individual version registration.
- Reuse required host/Profile DSH, Cordis, and Schemastery peers. Keep exact rc.5 dependencies only for source development; omit development dependencies and the lockfile from the Windows bundle.
- Report the adapter's own package version in ACP client metadata.

支持 rc.3 起的 0.2.1 同系列；复用宿主依赖，精确 rc.5 版本仅用于源码开发；ACP 客户端元数据使用插件自身版本。

## [0.2.2](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.2.2)

- Align the compatibility baseline and dependencies with Harness `0.2.1-rc.5`.
- Preserve ACP 1.4.3, authentication choices, and the complete Windows x64 bundle.

将兼容基线及依赖更新为 Harness rc.5，保留 ACP 1.4.3、多种认证方式和 Windows 完整包。

## [0.2.1](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.2.1)

- Bundle ACP Server 1.4.3 and its matching native harness in the Windows x64 TGZ, with a runtime integrity record and archive checksum.
- Add the complete-bundle packaging workflow. Normal release installation no longer needs a separate runtime download.
- Retain the Harness `0.2.1-rc.3` baseline.

将 ACP Server 及配套 harness 封装进 Windows x64 TGZ，附带完整性记录和摘要；正常安装不再单独下载运行时，宿主基线仍为 rc.3。

## [0.2.0](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.2.0)

- Add selectable native authentication: personal OAuth, Enterprise OAuth, Gemini API key, Agent Platform ADC/Express, and policy-controlled gateway.
- Default to ACP's saved native selection and provide an explicit authentication command.
- Keep public model and effort selection unrestricted by default, without fallback.

增加可选认证路线和主动登录命令，默认沿用 ACP 已有选择；公开包默认不限制模型与 effort，失败不回退。

## [0.1.0](https://github.com/AshenJyy/dsh-subagent-antigravity/releases/tag/v0.1.0)

- Initial native ACP provider following the official Codex subagent architecture, with one process, session, and prompt per delegation.
- Start with Agent Platform ADC and the Harness `0.2.1-rc.3` baseline.

首个原生 ACP 提供方，沿用官方 Codex 子代理分层；每任务独立进程、会话和一轮输入，使用 Agent Platform ADC，面向 Harness rc.3。
