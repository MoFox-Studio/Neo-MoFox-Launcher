# 01 — 总体架构

## 模块层次图

```
┌────────────────────────────────────────────────────────────┐
│                    Launcher 主进程 (Node.js)                │
│                                                            │
│  ┌──────────────┐   ┌───────────────┐   ┌──────────────┐  │
│  │ InstallWizard│   │ UpdateChannel │   │  IPCServer   │  │
│  │   Service    │   │   Service     │   │(Named Pipe)  │  │
│  └──────┬───────┘   └──────┬────────┘   └──────┬───────┘  │
│         │                  │                   │           │
│  ┌──────▼──────────────────▼───────────────────▼───────┐  │
│  │                  InstanceManager                     │  │
│  │   instances: Map<instanceId, InstanceRecord>         │  │
│  └──────────────────────────┬───────────────────────────┘  │
│                             │  1:1                          │
│  ┌──────────────────────────▼───────────────────────────┐  │
│  │                  ProcessManager                       │  │
│  │  ┌─────────────────┐   ┌──────────────────────────┐  │  │
│  │  │  NapCat Process │   │  Neo-MoFox Process (uv)  │  │  │
│  │  │  (launcher.bat) │   │  (uv run main.py)        │  │  │
│  │  └─────────────────┘   └──────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌───────────────────┐   ┌──────────────────────────────┐  │
│  │NapCatInstaller    │   │       StorageService         │  │
│  │Service            │   │  (JSON + TOML 读写)           │  │
│  └───────────────────┘   └──────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 模块职责速览

| 模块 | 职责 | 详细文档 |
|------|------|----------|
| `InstallWizardService` | 首次运行检测、必填项收集、配置写入 | [02-install-wizard.md](./02-install-wizard.md) |
| `NapCatInstallerService` | 从 GitHub Releases 下载、解压、校验 NapCat | [03-napcat-installer.md](./03-napcat-installer.md) |
| `InstanceManager` | 实例 CRUD、状态聚合、持久化 | [04-instance-manager.md](./04-instance-manager.md) |
| `ProcessManager` | 子进程生命周期、崩溃恢复、日志管道 | [05-process-manager.md](./05-process-manager.md) |
| `UpdateChannelService` | GitHub Release 轮询、版本比对、拉取更新 | [06-update-channel.md](./06-update-channel.md) |
| `StorageService` | 统一读写 JSON 状态文件和 TOML 配置文件 | [07-storage.md](./07-storage.md) |
| `IPCServer` | Named Pipe 服务端，供 UI 进程订阅事件和发送命令 | 本文件末尾 |

---

## 启动入口逻辑

```
launcher.js 入口
  │
  ├─ StorageService.init()            // 确保数据目录存在
  │
  ├─ InstallWizardService.isReady()
  │     ├─ false → 执行安装向导流程（见 02）
  │     └─ true  → 跳过
  │
  ├─ InstanceManager.loadAll()        // 从 instances.json 还原所有实例
  │
  ├─ IPCServer.listen()               // 启动 Named Pipe
  │
  └─ ProcessManager.startAll()        // 按顺序启动所有 enabled=true 的实例
```

---

## IPC 协议（Named Pipe）

- Pipe 名称（Windows）：`\\.\pipe\neo-mofox-launcher`
- 消息格式：换行分隔的 JSON（NDJSON）

### 上行命令（UI → Launcher）

| action | payload | 说明 |
|--------|---------|------|
| `instance.list` | — | 获取所有实例状态快照 |
| `instance.start` | `{ instanceId }` | 启动指定实例 |
| `instance.stop` | `{ instanceId }` | 停止指定实例 |
| `instance.restart` | `{ instanceId }` | 重启指定实例 |
| `update.check` | `{ instanceId, channel }` | 检查更新 |
| `update.apply` | `{ instanceId, channel }` | 应用更新 |

### 下行事件（Launcher → UI）

| event | payload | 说明 |
|-------|---------|------|
| `instance.status` | `InstanceStatusSnapshot` | 实例状态变更推送 |
| `log.line` | `{ instanceId, source, line }` | 实时日志行 |
| `install.progress` | `{ step, percent, message }` | 安装向导进度 |
| `update.progress` | `{ instanceId, step, percent }` | 更新进度 |

---

## 关键数据类型

```typescript
// 实例记录（持久化）
interface InstanceRecord {
  id: string;                // e.g. "bot-123456789"
  displayName: string;
  qqNumber: string;
  channel: 'main' | 'dev';
  enabled: boolean;
  neomofoxDir: string;       // Neo-MoFox 根目录绝对路径
  napcatDir: string;         // NapCat 根目录绝对路径
  wsPort: number;            // Neo-MoFox <-> NapCat 通信端口
  createdAt: string;         // ISO 8601
}

// 运行时状态（内存）
interface InstanceRuntimeState {
  id: string;
  napcat: 'stopped' | 'starting' | 'running' | 'crashed';
  neomofox: 'stopped' | 'starting' | 'running' | 'crashed';
  napcatPid: number | null;
  neomofoxPid: number | null;
  restartCount: number;
  lastCrashAt: string | null;
}
```
