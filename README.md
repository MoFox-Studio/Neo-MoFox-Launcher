# Neo-MoFox Launcher

<div align="center">

![Neo-MoFox Launcher](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-AGPL--3.0-green)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Electron](https://img.shields.io/badge/Electron-33.0.0-47848F?logo=electron)

**一个优雅的 Neo-MoFox QQ 机器人实例管理启动器**

[特性](#✨-特性) • [快速开始](#🚀-快速开始) • [使用指南](#📖-使用指南) • [开发](#🛠️-开发) • [文档](#📚-文档)

</div>

---

## 📖 简介

Neo-MoFox Launcher 是一个基于 Electron 的桌面应用程序，专为 Neo-MoFox QQ 机器人框架设计的实例管理工具。它提供了直观的 Material Design 3 风格界面，让你能够轻松管理多个机器人实例，无需手动配置繁琐的参数。

### 为什么选择 Neo-MoFox Launcher？

- 🎯 **零配置上手** - 图形化安装向导，一步步引导完成所有配置
- 🚀 **一键部署** - 自动下载并配置 Neo-MoFox 和 NapCat
- 📦 **多实例管理** - 在同一台电脑上管理多个  Neo-MoFox
- 🔄 **自动更新** - 支持 main 和 dev 分支的版本切换
- 💎 **精美界面** - 遵循 Material Design 3 设计规范
- 🛡️ **稳定可靠** - 进程监控与自动崩溃恢复

---

## ✨ 特性

### 🎨 安装向导
- **环境自动检测** - 检查 Python、Git、uv 等必备工具（自动安装规划中）
- **智能配置** - 引导式填写 QQ 号、API Key、端口等信息
- **一站式部署** - 自动克隆仓库、创建虚拟环境、安装依赖
- **NapCat 集成** - 自动下载并配置 NapCat QQ 客户端

### 🎛️ 实例管理
- **实例卡片视图** - 直观展示所有机器人实例
- **状态实时监控** - 运行中、已停止、安装中等状态一目了然
- **快速操作** - 启动、停止、重启、编辑、删除实例
- **自定义描述** - 为每个实例添加备注说明

### 🔧 进程管理
- **生命周期管理** - 启动、停止、重启机器人进程
- **崩溃自动恢复** - 进程异常退出时自动重启
- **日志管理** - 完整的运行日志记录与查看
- **性能监控** - 实时显示 CPU、内存使用情况

### 📡 版本管理
- **双分支支持** - main（稳定版）和 dev（开发版）
- **一键切换** - 轻松在不同版本间切换（规划中）
- **自动更新检测** - 定期检查并提示可用更新（规划中）

---

## 🚀 快速开始

### 系统要求

- **操作系统**: Windows 10/11 (64-bit)
- **运行时**: Node.js 18+ (LTS)
- **必备工具**:
  - Python 3.11+
  - Git
  - uv (Python 包管理器)
- **硬件**: 
  - 至少 4GB RAM
  - 2GB 可用磁盘空间

### 安装步骤

#### 0. 安装 Node.js（必需）

在开始之前，请确保已安装 Node.js：

1. 访问 [Node.js 官网](https://nodejs.org/) 下载并安装 **LTS 版本**（推荐 18.x 或更高版本）
2. 安装完成后，打开命令行验证：
   ```bash
   node --version  # 应显示 v18.x.x 或更高
   npm --version   # 应显示 npm 版本号
   ```

> **💡 提示**: 如果是首次安装 Node.js，推荐使用 [nvm-windows](https://github.com/coreybutler/nvm-windows) 来管理 Node.js 版本。

#### 1. 克隆仓库

```bash
# 克隆项目到本地
git clone https://github.com/MoFox-Studio/Neo-MoFox-Launcher.git
cd Neo-MoFox-Launcher/Neo-MoFox-Luncher
```

#### 2. 安装依赖

```bash
# 使用 npm 安装项目依赖
npm install
```

#### 3. 启动程序

```bash
# 开发模式运行（推荐用于调试）
npm run dev

# 或正常启动
npm start
```

### 首次运行

1. **环境检测** - 程序会自动检测必备工具是否安装
   - 如有缺失，请按提示安装相关工具
   
2. **配置实例** - 填写第一个机器人实例的信息
   - 实例名称
   - QQ 号码
   - 安装路径
   - WebSocket 端口
   - API Key（大语言模型）
   - API 基础 URL

3. **自动安装** - 启动器将自动完成以下步骤
   - 克隆 Neo-MoFox 仓库
   - 创建 Python 虚拟环境
   - 安装项目依赖
   - 下载配置 NapCat
   - 生成配置文件

4. **启动运行** - 安装完成后即可启动你的第一个机器人！

---

## 📖 使用指南

### 主界面

主界面以卡片形式展示所有机器人实例：

- **实例卡片** - 显示实例名称、路径、QQ 号等信息
- **快捷操作** - 点击"启动"按钮进入实例详情页

### 添加新实例

1. 点击界面上的 **"+ 添加实例"** 卡片
2. 进入安装向导，按提示填写新实例的配置
3. 等待自动安装完成
4. 新实例将出现在主界面上

### 管理实例

#### 查看实例详情
- 点击实例卡片上的 **"启动"** 按钮
- 进入实例详情页，查看运行状态和日志

#### 编辑实例
- 点击实例卡片上的 **"设置"** 按钮
- 可修改实例名称和描述
- **注意**: 核心配置（QQ号、端口等）需手动编辑配置文件

#### 删除实例
- 在编辑窗口中点击 **"删除实例"** 按钮
- 确认后将删除实例记录及所有文件
- **警告**: 此操作不可撤销！

### 实例详情页

在实例详情页中，你可以：

- **启动/停止** - 控制机器人的运行状态
- **重启** - 快速重启机器人进程
- **查看日志** - 实时查看运行日志和错误信息
---

## 🛠️ 开发

### 开发环境搭建

```bash
# 克隆仓库
git clone https://github.com/MoFox-Studio/Neo-MoFox-Launcher.git
cd Neo-MoFox-Launcher/Neo-MoFox-Launcher

# 安装依赖
npm install

# 启动开发模式
npm run dev
```

### 项目结构

```
Neo-MoFox-Launcher/
├── launcher-design/          # 设计文档
│   ├── 01-architecture.md    # 架构设计
│   ├── 02-install-wizard.md  # 安装向导设计
│   ├── 03-napcat-installer.md # NapCat 安装器
│   ├── 04-instance-manager.md # 实例管理器
│   ├── 05-process-manager.md # 进程管理器
│   ├── 06-update-channel.md  # 更新通道
│   ├── 07-storage.md         # 数据持久化
│   └── 08-ui-design.md       # UI 设计规范
│
└── Neo-MoFox-Launcher/        # 主程序目录
    ├── src/
    │   ├── main.js           # Electron 主进程入口
    │   ├── preload.js        # 预加载脚本
    │   │
    │   ├── services/         # 后端服务
    │   │   ├── install/      # 安装相关服务
    │   │   │   ├── InstallWizardService.js    # 安装向导
    │   │   │   ├── NapCatInstallerService.js  # NapCat 安装器
    │   │   │   └── StorageService.js          # 数据存储
    │   │   ├── instance/     # 实例管理
    │   │   ├── process/      # 进程管理
    │   │   └── update/       # 更新服务
    │   │
    │   └── renderer/         # 渲染进程（UI）
    │       ├── main-view/    # 主视图
    │       │   ├── index.html
    │       │   ├── styles.css
    │       │   └── modules/
    │       │       └── instances.js   # 实例管理模块
    │       │
    │       ├── install-wizard/ # 安装向导
    │       │   ├── wizard.html
    │       │   ├── wizard.css
    │       │   └── wizard.js
    │       │
    │       ├── instance-view/ # 实例详情
    │       │   └── index.html
    │       │
    │       └── components/    # 通用组件
    │           └── dialog.css
    │
    ├── assets/               # 资源文件
    │   └── icon.ico         # 应用图标
    │
    └── package.json         # 项目配置
```

### 技术栈

**核心框架**
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- Node.js 18+ - JavaScript 运行时

**依赖库**
- [@iarna/toml](https://www.npmjs.com/package/@iarna/toml) - TOML 配置文件读写
- [tree-kill](https://www.npmjs.com/package/tree-kill) - 进程树管理

**UI 设计**
- Material Design 3 - 设计系统
- Material Symbols - 图标字体
- CSS Variables - 动态主题

### 构建打包（可选）

如果你想构建独立的可分发程序，项目使用 [Electron Forge](https://www.electronforge.io/) 进行打包：

```bash
# 打包应用（不生成安装程序）
npm run package

# 构建所有平台的安装包（Windows Squirrel 安装包 + ZIP 压缩包）
npm run make

# 仅构建 Linux deb 包
npm run make:deb
```

构建产物会输出到 `out/` 目录。

> **注意**: 目前项目仍在开发中，建议直接使用 `npm start` 运行。

### 开发规范

1. **代码风格**
   - 使用 2 空格缩进
   - 文件名使用 PascalCase（服务类）或 kebab-case（UI 组件）
   - 注释使用中文

2. **Git 提交**
   - feat: 新功能
   - fix: 修复 Bug
   - docs: 文档更新
   - style: 样式调整
   - refactor: 代码重构
   - perf: 性能优化
   - test: 测试相关
   - chore: 构建/工具相关

3. **分支管理**
   - `main` - 稳定版本
   - `dev` - 开发版本
   - `feature/*` - 功能分支

---

## 📚 文档

### 设计文档

详细的设计文档位于 [launcher-design/](./launcher-design/) 目录：

- [总体架构](./launcher-design/01-architecture.md) - 模块划分与依赖关系
- [安装向导](./launcher-design/02-install-wizard.md) - 安装流程设计
- [NapCat 安装器](./launcher-design/03-napcat-installer.md) - NapCat 集成方案
- [实例管理器](./launcher-design/04-instance-manager.md) - 多实例管理设计
- [进程管理器](./launcher-design/05-process-manager.md) - 进程生命周期管理
- [更新通道](./launcher-design/06-update-channel.md) - 版本更新机制
- [数据持久化](./launcher-design/07-storage.md) - 数据存储方案

### API 文档

Launcher 提供的主要 API（通过 preload 暴露）：

```javascript
// 实例管理
window.mofoxAPI.getInstances()
window.mofoxAPI.updateInstance(instanceId, data)
window.mofoxAPI.deleteInstance(instanceId)

// 安装相关
window.mofoxAPI.checkEnvironment()
window.mofoxAPI.startInstall(config)
window.mofoxAPI.installCleanup(instanceId)

// 对话框
window.customAlert(message, title)
window.customConfirm(message, title)
```

---

## 🤝 贡献

欢迎任何形式的贡献！无论是报告 Bug、提出新功能建议，还是提交代码改进。

### 如何贡献

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的更改 (`git commit -m 'feat: Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

### 贡献指南

- 遵循项目的代码风格
- 确保代码通过所有测试
- 更新相关文档
- 一个 PR 只做一件事

### Bug 报告

在提交 Bug 报告时，请包含：

- 详细的问题描述
- 复现步骤
- 预期行为和实际行为
- 系统环境信息
- 相关日志输出

---

## 📝 常见问题

### 安装失败怎么办？

1. 检查网络连接是否正常
2. 确认所有必备工具已正确安装
3. 查看日志文件 `%APPDATA%\Neo-MoFox-Launcher\logs\`
4. 尝试使用国内镜像源

### 可以在 Linux/Mac 上使用吗？

当前已支持 Windows 和基于 deb 包管理的 Linux 发行版（如 Ubuntu、Debian 等），macOS 支持仍在计划中。

### 如何备份配置？

备份以下目录即可：
- `%APPDATA%\Neo-MoFox-Launcher\` - 启动器数据
- 你的实例安装目录 - 机器人配置和数据

---

## 📄 许可证

本项目采用 [GNU Affero General Public License v3.0](./LICENSE) 开源协议。

```
Copyright (C) 2024-2026 MoFox Studio

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```

---

## 🙏 致谢

- [Neo-MoFox](https://github.com/MoFox-Studio/Neo-MoFox) - 强大的 QQ 机器人框架
- [NapCat](https://github.com/NapNeko/NapCatQQ) - 高性能的 QQ 协议实现
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Material Design 3](https://m3.material.io/) - 精美的设计系统

---

## 📮 联系我们

- **项目主页**: https://github.com/MoFox-Studio/Neo-MoFox-Launcher
- **Issue 追踪**: https://github.com/MoFox-Studio/Neo-MoFox-Launcher/issues
- **讨论区**: https://github.com/MoFox-Studio/Neo-MoFox-Launcher/discussions

---

<div align="center">

**⭐ 如果觉得这个项目不错，请给我们一个 Star！⭐**

Made with ❤️ by MoFox Studio

</div>
