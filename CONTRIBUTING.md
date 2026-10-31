# Contributing

[Home](README.md) · [Documentation](docs/README.md) · [中文](#中文)

Keep changes close to the official Codex provider's architecture: DSH owns delegation and process lifetime; Antigravity owns the native agent loop. This repository's release target is Windows x64.

## Repository layout

| Path | Purpose |
|---|---|
| `src/` | TypeScript implementation |
| `lib/` | Compiled ESM and declarations, tracked with source changes |
| `locale/` | Plugin configuration translations |
| `cordis.patch.yml` | Provider and global tool registration |
| `docs/` | Authentication, configuration, architecture, and compatibility evidence |
| `scripts/pack.mjs` | Complete Windows release packaging |
| `package-lock.json` | Reproducible development dependency pins |
| `.github/` | Issue and pull request templates |

## Develop

Use Node.js 22 or later and npm on Windows x64. From the repository root:

```sh
npm ci --ignore-scripts
npm run build
```

Edit `src/` and regenerate `lib/` with the build command; include both in implementation changes. Keep English and Chinese documentation aligned. Documentation-only edits do not require regenerating `lib/` or replacing a released TGZ.

Required DSH peers use `>=0.2.1-rc.3 <0.2.2-0`; source development currently pins rc.5. Do not replace peer ranges with a list of individual RCs or add private runtime copies of the host packages. Review upstream interface changes before widening compatibility. ACP runtime 1.4.3 and its digest remain pinned independently.

## Build a complete release

```sh
npm run pack:bundle
```

This compiles the adapter, stages the public files, downloads and verifies the pinned official ZIP, and packages a fresh native executable pair. It emits a Windows x64 TGZ and `.sha256` sidecar. To reuse an official ZIP and choose an output directory:

```powershell
npm run pack:bundle -- --archive "C:/downloads/agy-acp-server-1.4.3-windows-x86_64.zip" --output-dir "C:/releases"
```

The existing ZIP receives the same checksum verification. Output files are not overwritten; use a fresh output directory or a new release version. Plain `npm pack` produces an adapter-only developer archive, not the complete installation bundle.

For a release, update the package version and lockfile consistently, update the changelog and download references, and publish the TGZ with its checksum as GitHub Release assets. Keep native binaries, generated archives, login homes, and local credentials out of Git. The Windows bundle excludes development dependencies and the dependency lockfile. Preserve [LICENSE](LICENSE) and [NOTICE](NOTICE); the adapter's MIT license does not relicense Google's binaries.

## Describe changes and validation

Explain the problem, resulting behavior, and relevant validation in each pull request. State what actually ran and any remaining limits. Compilation, archive inspection, ACP configuration, authentication, and model inference are distinct kinds of evidence; do not imply that one proves the others. Model execution may incur charges and is not part of the build command.

For a bug report, include the plugin and Harness versions, installation source, authentication method, reproduction steps, and a sanitized error. Never include tokens, API keys, ADC contents, or an unredacted native log.

## 中文

保持官方 Codex 提供方的分工：DSH 管理委派和进程生命周期，Antigravity 执行原生 Agent 循环。当前发行目标为 Windows x64。

- **源码与目录：** `src/` 为实现，`lib/` 为随源码提交的编译结果，`locale/` 为翻译，`docs/` 为说明，`scripts/pack.mjs` 为完整包构建入口。
- **开发：** 使用 Node.js 22 或以上及 npm，执行 `npm ci --ignore-scripts`，修改源码后执行 `npm run build` 并一并提交 `lib/`。同步维护中英文文档；仅文档修改无需重建或替换已有 TGZ。
- **兼容策略：** DSH 必需 peer 依赖保持 `>=0.2.1-rc.3 <0.2.2-0`，rc.5 精确依赖仅用于源码开发。不逐个登记 RC，也不增加宿主包的私有运行时副本。ACP 1.4.3 及摘要独立固定。
- **完整打包：** 执行 `npm run pack:bundle`；可用上方命令中的 `--archive` 复用官方 ZIP、`--output-dir` 指定目录。构建会重新校验官方 ZIP，并生成 TGZ 和 SHA-256 文件。已有输出不会覆盖；普通 `npm pack` 只有适配器。
- **发布：** 同步包版本与锁文件、版本记录和下载链接，将 TGZ 及摘要上传到 GitHub Release。原生程序、生成包、登录目录及凭据不提交 Git。保留 MIT 许可和 Google 程序归属说明。
- **提交说明：** 写清问题、变化、实际完成的验证及限制；区分编译、归档检查、协议配置、认证与模型推理，不将其中一种描述成其他验证。反馈错误时附版本、认证方式和脱敏信息，不提交凭据。
