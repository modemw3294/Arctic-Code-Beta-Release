<div align="center">

<img src="src/assets/arctic-code-logo.svg" width="96" height="96" alt="Arctic Code" />

# Arctic Code

**一个基于 Electron 的 AI 编程助手 · An Electron-based AI Coding Agent**

**Trae Solo 的开源平替 · An open-source alternative to Trae Solo**

by Orange Studio

[简体中文](#中文) · [English](#english)

![Version](https://img.shields.io/badge/version-beta.2-blue)
![Build](https://img.shields.io/badge/build-25427.01-lightgrey)
![Electron](https://img.shields.io/badge/electron-41.2.0-47848f)
![React](https://img.shields.io/badge/react-19.2-61dafb)
![License](https://img.shields.io/badge/license-Apache%202.0-green)

</div>

---

<a id="中文"></a>

## 🌐 中文

> ## ⚠️ 重要声明 / Beta 警告
>
> - 本软件目前处于 **Beta 测试阶段**，**功能极其不完善，Bug 极多**，可能在使用过程中出现崩溃、数据丢失、文件被错误修改等问题。
> - 项目代码中**包含大量由 AI 生成的代码**，未经充分人工审查，质量参差不齐，存在潜在的逻辑错误与安全隐患。
> - **请勿在生产环境或重要项目中使用**。使用前请务必备份你的代码与数据。
> - 本项目按 "AS IS"（原样）提供，作者不对任何使用本软件造成的损失负责。

Arctic Code 是一款基于 Electron + React 的桌面端 AI 编程助手，定位为 **Trae Solo 的开源平替**。它将多模型聊天、Agent 工具调用、文件改动审查、命令执行沙盒、MCP 协议、RAG 参考资料、Artifacts 预览、Skills 扩展等能力整合在一个本地桌面应用中。

### ✨ 主要功能

- **多模型 / 多 Provider** — 支持 OpenAI、Anthropic、Google、xAI、DeepSeek、Moonshot、Wisector 本地引擎，以及 Ollama / LM Studio 等本地服务；支持自定义模型与 OpenAI 兼容端点。
- **Agent 工具调用** — 内置约 25 个工具：`read_file`、`create_file`、`edit_file`、`search_replace`、`run_command`、`run_background_command`、`grep_files`、`find_files`、`list_directory`、`web_search`、`view_url_content`、`execute_python` 等。
- **文件改动审查** — Assistant 修改的文件汇总在输入框上方，可逐项保留或回滚。
- **撤回联动文件回滚** — 撤回对话时自动还原该轮产生的文件改动。
- **命令执行审批** — Shell 命令默认走用户审批弹窗，支持 cwd、超时、stdout/stderr 捕获与后台进程管理。
- **上下文压缩** — 滑窗摘要 + 工具结果驱逐 + Provider 缓存标记。
- **MCP 协议** — 可接入 Model Context Protocol Server。
- **Skills 系统** — 用 Markdown 写技能模板。
- **多任务 / 多工作区** — 任务树、工作区分组、Artifacts / References / Todo 任务隔离。
- **Artifacts 预览** — HTML / React / Markdown / 图表渲染。
- **主题与 i18n** — 深色 / 浅色 / 跟随系统；中英双语。
- **可中断流** — 任意时刻 Stop。

### 📦 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Electron 41 |
| 前端框架 | React 19 + Vite 8 |
| 构建打包 | electron-builder 26 |
| Markdown | react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight |
| 代码编辑 | @monaco-editor/react |
| 文档解析 | mammoth (.docx) · pdfjs-dist (.pdf) |
| 本地服务 | express + ws + cors（嵌入式 API 服务） |

### 🚀 快速开始

#### 环境要求

- **Node.js** ≥ 20
- **npm** ≥ 10
- 首次构建 Windows 包额外需要：**Wine** + **Mono**（macOS / Linux 跨平台构建）

#### 安装

```bash
git clone <repo-url>
cd "Arctic Code Beta 2"
npm install
```

#### 开发模式

```bash
npm run dev          # 同时启动 Vite 与 Electron（推荐）
npm run dev:web      # 仅启动 Vite，浏览器调试 UI
```

#### 构建

```bash
npm run build        # 仅前端 vite build
npm run dist         # 完整打包（vite build + electron-builder）
```

打包产物位于 `dist/`。默认仅构建当前平台；如需跨平台请在 `package.json` 中扩展 `build` 字段并安装 Wine / Mono。

### 🗂 项目结构

```
Arctic Code Beta 2/
├── electron/                  # Electron 主进程
│   ├── main.js                # 窗口创建、IPC 注册、菜单、命令执行、文件 IO
│   └── preload.js             # contextBridge 暴露 arcticAPI
├── src/
│   ├── App.jsx                # 顶层状态、Agent 主循环、工具调度
│   ├── main.jsx
│   ├── index.css              # 设计系统 / 主题变量
│   ├── components/
│   │   ├── ChatPanel/         # 聊天面板、流式渲染、文件改动条
│   │   ├── Sidebar/           # 任务列表、工作区、右键菜单
│   │   ├── RightPanel/        # Artifacts / Todo / References
│   │   ├── SettingsModal/     # 模型 / 工具 / 主题 / Python / MCP 设置
│   │   ├── CommandExecuteModal/   # 命令审批模态
│   │   ├── ToolConfirmModal/  # 工具权限模态
│   │   ├── RetractConfirmModal/   # 撤回确认（含文件回滚预告）
│   │   ├── ArtifactPreviewModal/  # Artifact 预览渲染
│   │   ├── SkillsView/ + SkillEditorModal/  # 技能管理
│   │   ├── DeleteProjectModal/
│   │   └── TitleBar/          # 自绘标题栏
│   ├── lib/
│   │   ├── tools.js           # 25+ Agent 工具实现
│   │   ├── toolsExec/         # 工具执行层（fs / shell / web …）
│   │   ├── toolsConfig.js     # 工具开关持久化
│   │   ├── toolPermissions.js # 权限策略：always / ask / never
│   │   ├── models.js          # 模型目录、Provider 配置
│   │   ├── providerRouting.js # 端点路由、API key 注入
│   │   ├── contextCompressor.js   # 上下文压缩 / 缓存标记
│   │   ├── references.js      # RAG 文档摄取与检索
│   │   ├── markdownComponents.jsx # Markdown 自定义渲染
│   │   ├── i18n.js
│   │   ├── tokens.js
│   │   ├── mcp/               # MCP 客户端
│   │   ├── skills/            # 技能加载器
│   │   └── subagents/         # 子代理（plan / search …）
│   ├── locales/               # zh-CN, en-US
│   ├── hooks/                 # useI18n, useLocalStorage
│   └── assets/                # arctic-code-logo.svg 等
└── package.json
```

### ⌨️ 常用快捷键

| 操作 | 快捷键 |
| --- | --- |
| 发送消息 | <kbd>Enter</kbd> |
| 换行 | <kbd>Shift</kbd> + <kbd>Enter</kbd> |
| 停止生成 | <kbd>Esc</kbd>（输入框聚焦时） |
| 新建任务 | <kbd>⌘ / Ctrl</kbd> + <kbd>N</kbd> |
| 打开设置 | <kbd>⌘ / Ctrl</kbd> + <kbd>,</kbd> |

### 🔐 安全模型

- **沙盒文件 IO** — 所有 fs 操作必须落在已添加为「工作区」的目录下，主进程会校验路径，拒绝越界访问。
- **命令默认确认** — Shell 命令默认走人工审批，可在设置中按工具配置 `always / ask / never`。
- **API Key 本地存储** — 仅存于本机 localStorage，**永远不上传**到 Orange Studio 服务器；所有模型请求由本机 Electron 直连 Provider。
- **可中断 / 可撤回** — 任意时刻可 Stop；任意一轮可 Retract，并连带回滚磁盘文件。

### 🐛 问题反馈

请提交 Issue，附：
- 操作系统版本（macOS / Windows / Linux）
- Arctic Code 版本号（设置 → 关于）
- 复现步骤与日志（可在 DevTools Console 中复制）

### 📄 开源协议

本项目采用 **Apache License 2.0** 协议开源。详见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE) 文件。

```
Copyright 2025 Orange Studio

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

---

<a id="english"></a>

## 🌐 English

> ## ⚠️ Important Notice / Beta Warning
>
> - This software is currently in **Beta** stage. It is **highly incomplete and contains many bugs**. Crashes, data loss, and incorrect file modifications can happen.
> - The codebase contains a **substantial amount of AI-generated code** that has not been thoroughly reviewed. Quality varies and there may be logic errors or security issues.
> - **Do not use this in production or on important projects.** Always back up your code and data before use.
> - This project is provided **"AS IS"** with no warranty of any kind. The authors are not responsible for any damage caused by use of this software.

Arctic Code is an Electron + React desktop AI coding agent, positioned as an **open-source alternative to Trae Solo**. It bundles multi-model chat, agentic tool-calling, file-change review, sandboxed command execution, MCP protocol, RAG references, Artifacts preview, and a Skills extension system into a single local desktop app.

### ✨ Features

- **Multi-model / multi-provider** — OpenAI, Anthropic, Google, xAI, DeepSeek, Moonshot, Wisector local engine, plus local servers (Ollama / LM Studio); custom models and OpenAI-compatible endpoints supported.
- **Agentic tool calling** — ~25 built-in tools: `read_file`, `create_file`, `edit_file`, `search_replace`, `run_command`, `run_background_command`, `grep_files`, `find_files`, `list_directory`, `web_search`, `view_url_content`, `execute_python`, and more.
- **File-change review** — assistant edits aggregated above the input with per-item keep/revert.
- **Retract = file rollback** — retracting a turn reverts the file mutations it produced.
- **Command approval** — shell commands gated by an approval popup with cwd, timeout, stdout/stderr capture, and background process management.
- **Context compression** — sliding-window summarization + tool-result eviction + provider cache markers.
- **MCP protocol** — connect any Model Context Protocol server.
- **Skills** — Markdown skill templates.
- **Multi-task / multi-workspace** — hierarchical task list, workspace grouping, task-scoped artifacts/references/todos.
- **Artifacts preview** — render HTML / React / Markdown / charts.
- **Theming & i18n** — dark / light / system; Chinese / English.
- **Stoppable streams** — Stop anytime.

### 📦 Tech Stack

| Layer | Tech |
| --- | --- |
| Desktop shell | Electron 41 |
| Frontend | React 19 + Vite 8 |
| Packaging | electron-builder 26 |
| Markdown | react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight |
| Code editor | @monaco-editor/react |
| Document parsing | mammoth (.docx) · pdfjs-dist (.pdf) |
| Local services | express + ws + cors |

### 🚀 Quick Start

#### Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- Cross-building Windows artifacts on macOS / Linux additionally needs **Wine** + **Mono**

#### Install

```bash
git clone <repo-url>
cd "Arctic Code Beta 2"
npm install
```

#### Development

```bash
npm run dev          # Vite + Electron concurrently (recommended)
npm run dev:web      # Vite-only; debug UI in a browser
```

#### Build

```bash
npm run build        # frontend only (vite build)
npm run dist         # full bundle (vite build + electron-builder)
```

Artifacts land in `dist/`. By default only the current platform is built; for cross-platform output extend the `build` field in `package.json` and install Wine / Mono.

### 🗂 Project Layout

See the Chinese section above for the annotated tree — file paths and one-line purpose for every directory.

### ⌨️ Shortcuts

| Action | Keys |
| --- | --- |
| Send | <kbd>Enter</kbd> |
| Newline | <kbd>Shift</kbd> + <kbd>Enter</kbd> |
| Stop generating | <kbd>Esc</kbd> (input focused) |
| New task | <kbd>⌘ / Ctrl</kbd> + <kbd>N</kbd> |
| Settings | <kbd>⌘ / Ctrl</kbd> + <kbd>,</kbd> |

### 🔐 Security Model

- **Sandboxed FS** — all fs operations must resolve under a registered workspace root; main process enforces this.
- **Command approval by default** — shell tools require human approval; per-tool policy `always / ask / never` configurable.
- **Local API keys** — keys live in localStorage on your machine only; **never** uploaded to Orange Studio servers. All provider requests go directly from your Electron process to the provider.
- **Stoppable / retractable** — Stop anytime; Retract any turn and have files rolled back automatically.

### 🐛 Bug Reports

Open an issue with:
- OS + version (macOS / Windows / Linux)
- Arctic Code version (Settings → About)
- Reproduction steps and DevTools console logs

### 📄 License

This project is licensed under the **Apache License 2.0**. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for details.

```
Copyright 2025 Orange Studio

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

---

<div align="center">

**Arctic Code** © 2025 Orange Studio — Licensed under Apache 2.0

</div>
