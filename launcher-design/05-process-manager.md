# 05 — 进程管理器（ProcessManager）

## 职责

负责每个实例中 **NapCat 进程** 和 **Neo-MoFox 进程** 的完整生命周期管理，包括：

- 启动、停止、重启
- stdout / stderr 日志捕获与转发
- 崩溃检测与自动恢复（带退避策略）
- 优雅关闭（Graceful Shutdown）

---

## 进程对模型

每个实例对应一个进程对，两个进程**有顺序依赖**：

```
启动顺序：NapCat 先启动 → 等待就绪 → 再启动 Neo-MoFox
停止顺序：Neo-MoFox 先停止 → NapCat 再停止
```

原因：Neo-MoFox 在启动时会主动连接 NapCat 的 WebSocket，若 NapCat 未就绪则连接失败。

---

## 进程启动详情

### NapCat 进程

```
工作目录: <napcatDir>
命令:     cmd /c launcher.bat <qqNumber>
环境变量: 继承父进程环境
```

**就绪检测**：监听 NapCat 的 stdout，检测到包含以下任一关键字时视为就绪：

- `WebUi User Panel Url`（WebUI 启动成功）
- `NapCat Loading Complete`
- `Bot Login`

超时：60 秒内未就绪则报 `NAPCAT_START_TIMEOUT` 错误。

### Neo-MoFox 进程

```
工作目录: <neomofoxDir>
命令:     <neomofoxDir>\.venv\Scripts\python.exe -m uv run main.py
          （或直接调用 uv run main.py，取决于 uv 是否在 PATH 中）
环境变量: VIRTUAL_ENV=<neomofoxDir>\.venv（确保 uv sync 使用正确的 venv）
```

**就绪检测**：检测 stdout 包含 `Bot 初始化成功` 或 `Napcat 客户端已连接`。

---

## 日志管道

每个进程的 stdout / stderr 均被捕获并：

1. **写入日志文件**：`<launcherDataDir>/logs/<instanceId>/<YYYY-MM-DD>.log`  
   格式：`[HH:mm:ss] [napcat|neomofox] [stdout|stderr] <line>`
2. **通过 IPC 实时推送**：`log.line { instanceId, source: 'napcat'|'neomofox', line }`
3. **日志轮转**：单文件超过 10 MB 时按日期归档，保留最近 7 天

---

## 崩溃恢复策略

采用**指数退避**（Exponential Backoff）：

| 重启次数 | 等待时间 |
|----------|----------|
| 1 | 3 秒 |
| 2 | 6 秒 |
| 3 | 12 秒 |
| 4 | 24 秒 |
| 5+ | 60 秒（上限） |

**熔断机制**：

- 若 10 分钟内重启次数 ≥ 5 次，标记实例状态为 `error`，停止自动重启
- 通过 IPC 推送 `instance.status` 事件通知 UI
- 用户可通过 `instance.restart` IPC 命令手动恢复

**崩溃类型区分**：

| 退出码 | 解释 | 自动重启 |
|--------|------|----------|
| 0 | 正常退出 | 否（视为用户主动关闭） |
| 非 0 | 崩溃 | 是（按退避策略） |
| `SIGKILL` | 被外部强制杀死 | 是 |
| `SIGINT` | 由 Launcher 发出的优雅关闭信号 | 否 |

---

## 优雅关闭流程

收到 `stop(instanceId)` 请求或 Launcher 进程本身收到 `SIGINT/SIGTERM` 时：

```
1. 向 Neo-MoFox 进程发送 SIGINT
2. 等待最多 15 秒，期间监听进程退出
3. 若 15 秒后仍未退出，发送 SIGKILL 强制终止
4. Neo-MoFox 进程退出后，向 NapCat 进程发送 SIGINT
5. 等待最多 10 秒，若未退出则 SIGKILL
6. 更新 InstanceRuntimeState
```

---

## 进程组隔离（Windows 专项）

Windows 上 `child_process.spawn` 默认情况下，父进程退出时子进程可能继续运行（孤儿进程）。  
采用以下措施保证 Launcher 退出时子进程一并退出：

- 使用 `{ detached: false }` 选项（默认），确保子进程与父进程绑定
- 在 Launcher 主进程注册 `process.on('exit')` 和 `process.on('SIGINT')` 钩子，执行上述优雅关闭流程
- 对于意外崩溃，通过 Windows Job Object API（通过 `ffi-napi` 或 `winax` 调用）将子进程加入同一 Job Object，设置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`

---

## 接口汇总

| 方法 | 参数 | 说明 |
|------|------|------|
| `start(instanceId)` | — | 按顺序启动进程对，等待就绪 |
| `stop(instanceId)` | — | 优雅停止进程对 |
| `restart(instanceId)` | — | stop + start |
| `startAll()` | — | 启动所有 enabled 实例 |
| `stopAll()` | — | 停止所有运行中的实例 |
| `getState(instanceId)` | — | 返回 `InstanceRuntimeState` |
| `attachLogListener(id, cb)` | `(line: LogLine) => void` | 订阅日志行 |
| `detachLogListener(id, cb)` | — | 取消订阅 |
