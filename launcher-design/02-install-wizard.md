# 02 — 安装向导（InstallWizardService）

## 职责

首次运行时，弹出信息收集流程，将用户输入写入 Neo-MoFox 的 TOML 配置文件。  
**运行期不再提供配置修改**，配置文件由用户自行编辑（参考部署指南）。

---

## 触发条件

Launcher 启动时，当以下任一条件成立时进入向导：

1. `instances.json` 中不存在任何实例记录（全新安装）
2. 某个实例记录中 `installCompleted === false`（安装未完成的实例）
3. 带命令行参数 `--reconfigure <instanceId>` 强制重新配置指定实例

---

## 向导步骤

向导分为 3 个顺序阶段，每个阶段通过 IPC `install.progress` 事件上报进度。

### Phase 1 — 环境预检

| 检查项 | 方法 | 失败处理 |
|--------|------|----------|
| Python 版本 ≥ 3.11 | `spawn('python', ['--version'])` | 报错，终止向导，提示用户安装 |
| uv 已安装 | `spawn('uv', ['--version'])` | 报错，终止向导，提示 `pip install uv` |
| Git 已安装 | `spawn('git', ['--version'])` | 报错，终止向导 |
| 目标安装路径可写 | `fs.access(path, fs.constants.W_OK)` | 提示换路径 |

所有检查通过后，Phase 1 完成，`install.progress` 上报 `{ step: 'env-check', percent: 100 }`。

---

### Phase 2 — 必填项收集

向导通过 IPC 向 UI 进程请求以下字段（UI 以弹窗/表单形式展示）：

| 字段 | 类型 | 默认值 | 校验规则 | 用途 |
|------|------|--------|----------|------|
| `instanceName` | string | `"My Bot"` | 非空，1–32 字符 | 实例显示名 |
| `qqNumber` | string | — | 纯数字，5–12 位 | Bot QQ 号；写入 NapCat 启动参数 |
| `ownerQQNumber` | string | — | 纯数字，5–12 位 | 写入 `config/core.toml` 的 `owner_list` |
| `apiKey` | string | — | 非空，以 `sk-` 开头可选校验 | 写入 `config/model.toml` 的 `api_key` |
| `wsPort` | number | `8095` | 1024–65535，端口可用性检测 | NapCat WebSocket 反向连接端口 |
| `installDir` | string | `D:\Neo-MoFox_Bots` | 路径不含中文+空格 | Neo-MoFox 和 NapCat 的安装根目录 |
| `channel` | `'main' \| 'dev'` | `'main'` | 枚举 | 跟踪的 GitHub 发布分支 |

**端口可用性检测**：对 `wsPort` 创建临时 TCP 服务端，若绑定成功则端口可用，否则提示用户换端口。

收集完成后，`install.progress` 上报 `{ step: 'collect-inputs', percent: 100 }`，进入 Phase 3。

---

### Phase 3 — 安装执行

按顺序执行以下子步骤，每步完成后上报进度：

```
3.1  克隆 Neo-MoFox 仓库
3.2  创建 Python 虚拟环境（uv venv）
3.3  安装 Python 依赖（uv sync）
3.4  首次启动 Neo-MoFox 生成配置文件（uv run main.py，检测到 config/ 生成后 Ctrl+C）
3.5  写入 core.toml（owner_list）
3.6  写入 model.toml（api_key）
3.7  下载并安装 NapCat（委托 NapCatInstallerService）
3.8  写入 NapCat onebot11_<qqNumber>.json（WebSocket 客户端配置）
3.9  注册实例到 InstanceManager
3.10 更新实例记录，标记 installCompleted = true
```

---

## 子步骤详解

### 3.1 克隆 Neo-MoFox

```
git clone <repoUrl> <installDir>/<instanceId>/neo-mofox
```

- `main` 通道：克隆 `main` 分支
- `dev` 通道：克隆 `dev` 分支，命令追加 `--branch dev`
- 使用镜像地址列表（备用域名）进行重试，最多 3 次

### 3.4 首次启动 & 配置文件生成检测

- 使用 `child_process.spawn` 以 `detached: false` 启动 `uv run main.py`
- 监听 stdout/stderr，检测包含字符串 `config` 目录创建的日志行
- 检测到 `config/core.toml` 和 `config/model.toml` 均存在后，发送 `SIGINT` 终止进程
- 超时：60 秒未检测到配置文件，报错

### 3.5 写入 core.toml

使用 `@iarna/toml` 解析文件，找到 `permissions.owner_list`，写入：

```toml
owner_list = ["qq:<ownerQQNumber>"]
```

### 3.6 写入 model.toml

找到第一个 `[[api_providers]]` 条目的 `api_key` 字段，替换为用户输入值。

### 3.8 写入 NapCat onebot11 配置

在 NapCat 的 `config/` 目录写入 `onebot11_<qqNumber>.json`：

```json5
{
  "network": {
    "httpServers": [],
    "httpClients": [],
    "websocketServers": [],
    "websocketClients": [
      {
        "name": "neo-mofox-ws-client",
        "enable": true,
        "url": "ws://127.0.0.1:<wsPort>",
        "messagePostFormat": "array",
        "reportSelfMessage": false,
        "reconnectInterval": 3000,
        "token": ""
      }
    ]
  },
  "musicSignUrl": "",
  "enableLocalFile2Url": false,
  "parseMultMsg": false
}
```

同时写入 `config/napcat_<qqNumber>.json` 以关闭不必要的日志（减少噪音）：

```json5
{
  "fileLog": true,
  "consoleLog": true,
  "fileLogLevel": "info",
  "consoleLogLevel": "info"
}
```

---

## 错误处理原则

- 每个子步骤失败时，向 IPC 推送 `install.progress { step, error }` 事件
- Phase 3 中任意步骤失败，提供两个恢复选项：
  - **重试当前步骤**（断点续装）
  - **清理并重新开始**（删除已创建的目录，回到 Phase 2）
- 已完成步骤的结果持久化到实例记录中的 `installProgress` 字段，支持断点续装
