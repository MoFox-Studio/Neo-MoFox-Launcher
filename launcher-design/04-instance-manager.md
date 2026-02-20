# 04 — 多实例管理器（InstanceManager）

## 职责

维护所有 Bot 实例的权威记录，提供实例的增删查改（CRUD）和聚合状态查询接口。  
实例数据持久化到 `<launcherDataDir>/instances.json`，运行时状态仅保存在内存中。

---

## 数据模型

### 持久化字段（写入 instances.json）

```typescript
interface InstanceRecord {
  id: string;              // 格式: "<slug>-<qqNumber>"，例如 "bot-123456789"
  displayName: string;     // 用户起的名字，例如 "My Bot"
  qqNumber: string;        // Bot QQ 号
  channel: 'main' | 'dev'; // 跟踪的更新通道
  enabled: boolean;        // false = 不随 Launcher 启动自动运行
  neomofoxDir: string;     // Neo-MoFox 根目录绝对路径
  napcatDir: string;       // NapCat 根目录绝对路径
  wsPort: number;          // NapCat <-> Neo-MoFox 的 WebSocket 端口
  createdAt: string;       // ISO 8601
  lastStartedAt: string | null;
  napcatVersion: string | null; // 当前已安装的 NapCat 版本
  neomofoxVersion: string | null; // 当前 Neo-MoFox 的 git 版本 / commit hash
  installCompleted: boolean;     // 安装是否已完成
  installProgress: string | null; // 安装进度（断点续装用），例如 "3.5"
}
```

### 运行时状态（仅内存）

```typescript
type ProcessState = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed' | 'error';

interface InstanceRuntimeState {
  id: string;
  napcat: ProcessState;
  neomofox: ProcessState;
  napcatPid: number | null;
  neomofoxPid: number | null;
  restartCount: number;      // 本次 Launcher 运行周期内的自动重启次数
  lastCrashAt: string | null;
  uptimeSeconds: number;
}
```

---

## 核心接口

### 查询

| 方法 | 返回 | 说明 |
|------|------|------|
| `list()` | `InstanceRecord[]` | 返回所有实例的持久化记录 |
| `get(id)` | `InstanceRecord \| null` | 按 ID 查询 |
| `getStatus(id)` | `InstanceRuntimeState \| null` | 运行时状态 |
| `getStatusAll()` | `InstanceRuntimeState[]` | 所有实例运行时状态 |

### 变更

| 方法 | 说明 |
|------|------|
| `register(record)` | 新增实例，写入 instances.json |
| `remove(id)` | 删除实例记录（不删目录），要求实例处于 stopped 状态 |
| `setEnabled(id, bool)` | 启用/禁用自动启动 |
| `updateRecord(id, patch)` | 部分更新持久化字段（如更新版本号） |

---

## 实例 ID 生成规则

```
id = slugify(displayName).toLowerCase() + '-' + qqNumber
```

- `slugify`：将 displayName 中的非 ASCII 字符替换为 `-`，压缩连续 `-`
- 若 ID 已存在，追加数字后缀：`bot-123456789-2`

---

## 多实例端口分配

安装向导中用户填入 `wsPort`，`InstanceManager` 在注册前检查端口冲突：

- 扫描现有所有实例的 `wsPort`，若重复则抛出 `PORT_CONFLICT` 错误
- 提供 `suggestPort(basePort)` 方法：从 `basePort` 开始递增，返回第一个未被任何实例占用且系统可绑定的端口

---

## 多实例目录隔离

每个实例完全独立，互不干扰：

```
<installDir>/
  bot-123456789/
    neo-mofox/
    napcat/
  bot-987654321/
    neo-mofox/
    napcat/
```

`neomofoxDir` 和 `napcatDir` 均为绝对路径，`ProcessManager` 以此为工作目录启动进程。

---

## 启动顺序保证

`loadAll()` 后，`startAll()` 按 `createdAt` 升序逐一启动，相邻实例之间间隔 **3 秒**，避免端口竞争和日志混乱。

```
for each instance (sorted by createdAt):
  if instance.enabled:
    await ProcessManager.start(instance.id)
    await sleep(3000)
```

---

## 状态变更广播

每当 `InstanceRuntimeState` 发生变更，`InstanceManager` 通过以下路径通知订阅方：

```
InstanceRuntimeState 变更
  → InstanceManager.emit('statusChange', state)
    → IPCServer 监听并推送 instance.status 事件给所有连接的 UI 客户端
```

---

## 实例隔离的 NapCat 登录态

NapCat 的 QQ 登录态（Session）存储于 NapCat 自身的 `config/` 和 QQ 的用户数据目录中。  
每个实例使用独立的 `napcatDir`，NapCat 启动时通过命令行参数传入 QQ 号，天然隔离。

启动命令示例：
```bat
cd <napcatDir>
launcher.bat <qqNumber>
```

NapCat v4.5+ 支持通过 `--qq <qqNumber>` 参数快速登录已保存会话。
