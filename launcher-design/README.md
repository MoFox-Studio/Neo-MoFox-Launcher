# Neo-MoFox Launcher — 后端设计总览

## 项目定位

Neo-MoFox Launcher 是一个运行于 Windows 平台、基于 **Node.js (Electron 主进程 / 纯 Node 可执行文件)** 的后端服务进程，负责：

- **一次性安装向导**：首次运行时收集必填项（QQ 号、API Key、端口等），写入 Neo-MoFox 配置文件
- **NapCat 自动下载与安装**：从 GitHub Releases 拉取 `NapCat.Shell.zip`，完成解压与路径管理
- **多实例管理**：允许同时运行多个 Neo-MoFox + NapCat 配对实例（例如多个 Bot 账号）
- **分支管理**：支持跟踪 `main`（稳定版）与 `dev`（开发版）两条更新通道
- **进程生命周期管理**：启动、停止、重启、崩溃自动恢复

Launcher **不提供**运行期配置修改入口，所有配置均在安装向导阶段一次性完成。

---

## 文档目录

| 文件 | 内容 |
|------|------|
| [01-architecture.md](./01-architecture.md) | 总体架构与模块依赖图 |
| [02-install-wizard.md](./02-install-wizard.md) | 安装向导流程与必填项收集 |
| [03-napcat-installer.md](./03-napcat-installer.md) | NapCat 自动下载 & 安装模块 |
| [04-instance-manager.md](./04-instance-manager.md) | 多实例管理器设计 |
| [05-process-manager.md](./05-process-manager.md) | 子进程管理与崩溃恢复 |
| [06-update-channel.md](./06-update-channel.md) | dev / main 更新通道管理 |
| [07-storage.md](./07-storage.md) | 数据持久化与目录结构 |
| [08-ui-design.md](./08-ui-design.md) | UI 设计风格指南与组件规范 |

---

## 技术选型概述

| 层面 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js ≥ 18 (LTS) | 与 Electron 主进程共享生态；`child_process`、`fs`、`net` 均成熟 |
| 打包 | `pkg` 或 Electron 主进程 | 产出单文件 exe，方便分发 |
| IPC | 本地 Unix Socket / Named Pipe | 供可选 UI 进程查询状态，无需暴露 HTTP 端口 |
| 配置写入 | `@iarna/toml` | 保留注释，与 Neo-MoFox 的 TOML 格式兼容 |
| 下载 | Node.js 内置 `https` + `follow-redirects` | 轻量，无冗余依赖 |
| 解压 | `yauzl` (zip) | 专为流式 zip 解压设计，内存占用小 |

---

## 核心数据流（概览）

```
首次启动
  └─► InstallWizardService (收集必填项)
        └─► NapCatInstallerService (下载 & 解压 NapCat)
              └─► InstanceManager (创建实例记录)
                    └─► ProcessManager (启动进程对)

日常启动
  └─► InstanceManager.loadAll()
        └─► ProcessManager.startAll()

更新命令
  └─► UpdateChannelService.checkAndUpdate(channel)
        └─► ProcessManager.restart(instanceId)
```

---

## 约定

- 所有路径均使用 **绝对路径**，不依赖当前工作目录
- 实例 ID 格式：`<slug>-<qqNumber>`，例如 `bot-123456789`
- 日志统一写入 `<launcherDataDir>/logs/<instanceId>/<date>.log`
- 与 Neo-MoFox 交互通过读写 TOML 文件完成，不调用其内部 API
