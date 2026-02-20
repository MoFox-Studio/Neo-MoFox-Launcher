# 06 — dev / main 更新通道（UpdateChannelService）

## 职责

按照每个实例配置的 `channel`（`main` 或 `dev`），独立管理 Neo-MoFox 和 NapCat 的版本检查与更新。  
不强制自动更新，提供事件推送让 UI 决策，支持手动触发更新。

---

## 更新目标

每个实例包含两个可独立更新的组件：

| 组件 | 更新来源 | 版本标识 |
|------|----------|----------|
| Neo-MoFox | GitHub 仓库 git 分支 | git commit hash（短 SHA） |
| NapCat | GitHub Releases | 语义版本号（`v4.x.x`） |

---

## 通道定义

| 通道 | Neo-MoFox 对应分支 | NapCat 对应 Release 标签 |
|------|-------------------|--------------------------|
| `main` | `main` | `latest` release（无 `pre` 标记） |
| `dev` | `dev` | `pre-release` / 最新 tag（包含 `alpha`/`beta`） |

---

## 版本检查流程

### Neo-MoFox 版本检查

```
UpdateChannelService.checkNeomofox(instanceId)
  │
  ├─ 1. 读取本地版本
  │       cd <neomofoxDir>
  │       git rev-parse --short HEAD   → localHash
  │
  ├─ 2. 获取远端版本
  │       git ls-remote origin refs/heads/<channel>   → remoteHash
  │       （不克隆仓库，只查询 HEAD 指针）
  │
  ├─ 3. 比对
  │       localHash === remoteHash → { upToDate: true }
  │       不同              → { upToDate: false, remoteHash, commitsBehind }
  │
  └─ 4. 推送 IPC 事件
          update.available { instanceId, component: 'neomofox', currentVersion, newVersion }
```

### NapCat 版本检查

```
UpdateChannelService.checkNapcat(instanceId)
  │
  ├─ 1. 读取 <napcatDir>/.launcher-meta.json → currentVersion
  │
  ├─ 2. 调用 GitHub API
  │       main  通道: GET /repos/NapNeko/NapCatQQ/releases/latest
  │       dev   通道: GET /repos/NapNeko/NapCatQQ/releases?per_page=5
  │                   取第一个 prerelease=true 的条目
  │
  ├─ 3. 比对 semver
  │       semver.gt(latestVersion, currentVersion) → 有更新
  │
  └─ 4. 推送 IPC 事件（同上）
```

---

## 定时检查

Launcher 启动后，后台定时任务按以下频率轮询（两个组件独立计时）：

| 通道 | 检查间隔 |
|------|----------|
| `main` | 每 6 小时 |
| `dev` | 每 1 小时 |

用 `setInterval` 实现，Launcher 退出时 `clearInterval`。

---

## 更新执行流程

收到 `update.apply { instanceId, component }` IPC 命令后：

### Neo-MoFox 更新

```
1. ProcessManager.stop(instanceId)         ← 停止整个实例
2. cd <neomofoxDir>
   git fetch origin <channel>
   git reset --hard origin/<channel>       ← 强制更新到远端最新
3. uv sync                                  ← 同步依赖（可能有新依赖）
4. InstanceManager.updateRecord(instanceId, { neomofoxVersion: newHash })
5. ProcessManager.start(instanceId)         ← 重启
6. 推送 update.progress { step: 'done' }
```

> **注意**：`git reset --hard` 会丢弃本地修改。若用户手动修改了非配置文件，更新后将丢失。  
> 文档中应明确告知用户：**所有自定义仅应写入 `config/` 目录，不要修改源码文件**。

### NapCat 更新

委托 `NapCatInstallerService.update(instanceId, onProgress)`（详见 [03-napcat-installer.md](./03-napcat-installer.md)）。

---

## 更新锁（防并发）

每个实例同一时刻只允许一个更新任务运行：

```
updateLocks: Map<instanceId, boolean>

applyUpdate(instanceId):
  if updateLocks.get(instanceId):
    throw new Error('UPDATE_IN_PROGRESS')
  updateLocks.set(instanceId, true)
  try:
    await doUpdate(instanceId)
  finally:
    updateLocks.delete(instanceId)
```

---

## IPC 事件汇总

| 事件 | payload | 触发时机 |
|------|---------|----------|
| `update.available` | `{ instanceId, component, currentVersion, newVersion, releaseNotes? }` | 检测到有新版本 |
| `update.progress` | `{ instanceId, component, step, percent, message? }` | 更新执行中 |
| `update.error` | `{ instanceId, component, error }` | 更新失败 |

---

## 网络失败处理

- 版本检查失败（网络超时、API 限流等）：静默忽略，不推送事件，等待下次定时检查
- 更新过程中网络中断：回滚到备份（Neo-MoFox 通过 `git stash` 恢复，NapCat 通过备份 zip 恢复）
- GitHub API 限流（60 req/h 未认证）：检查间隔拉大到 2 小时，推送 `update.rateLimit` 警告事件
