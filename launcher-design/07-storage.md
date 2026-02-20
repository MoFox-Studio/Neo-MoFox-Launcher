# 07 — 数据持久化与目录结构（StorageService）

## 职责

统一管理所有由 Launcher 自身维护的数据文件的读写，包括：

- Launcher 全局状态
- 实例记录表
- Bot 相关的 TOML 配置写入（仅在安装向导阶段执行一次）

---

## 目录结构总览

```
<launcherDataDir>/                     ← 默认: %APPDATA%\Neo-MoFox-Launcher
│
├── state.json                         ← Launcher 全局状态
├── instances.json                     ← 所有实例记录
│
└── logs/
    ├── launcher.log                   ← Launcher 自身日志
    └── <instanceId>/
        ├── 2026-02-18.log
        └── 2026-02-19.log

<installDir>/                          ← 用户在向导中指定，默认: D:\Neo-MoFox_Bots
│
├── <instanceId>/                      ← 例如: bot-123456789
│   ├── neo-mofox/                     ← Neo-MoFox 源码目录
│   │   ├── main.py
│   │   ├── pyproject.toml
│   │   ├── .venv/
│   │   └── config/
│   │       ├── core.toml              ← 向导写入 owner_list
│   │       ├── model.toml             ← 向导写入 api_key
│   │       └── plugins/
│   │           └── napcat_adapter/
│   │               └── config.toml   ← 向导写入 wsPort
│   └── napcat/                        ← NapCat 一键版安装目录
│       ├── NapCatWinBootMain.exe
│       └── config/
│           ├── onebot11_<qqNumber>.json  ← 向导写入 WS 客户端配置
│           └── napcat_<qqNumber>.json   ← 日志等级配置
│
└── bot-987654321/                     ← 另一个实例
    └── ...
```

---

## state.json 结构

```json
{
  "launcherVersion": "1.0.0",
  "defaultInstallDir": "D:\\Neo-MoFox_Bots"
}
```

| 字段 | 作用 |
|------|------|
| `launcherVersion` | Launcher 自身版本号 |
| `defaultInstallDir` | 下次新增实例时的默认安装目录建议值 |

---

## instances.json 结构

```json
{
  "version": 1,
  "instances": [
    {
      "id": "bot-123456789",
      "displayName": "My Bot",
      "qqNumber": "123456789",
      "channel": "main",
      "enabled": true,
      "neomofoxDir": "D:\\Neo-MoFox_Bots\\bot-123456789\\neo-mofox",
      "napcatDir": "D:\\Neo-MoFox_Bots\\bot-123456789\\napcat",
      "wsPort": 8095,
      "createdAt": "2026-02-18T10:00:00Z",
      "lastStartedAt": "2026-02-18T12:00:00Z",
      "napcatVersion": "v4.5.3",
      "neomofoxVersion": "a1b2c3d",
      "installCompleted": true,
      "installProgress": null
    }
  ]
}
```

`version` 字段用于未来格式迁移（StorageService 在读取时按版本号做 migrate）。

---

## TOML 写入规则

StorageService 通过 `@iarna/toml` 解析和写入 TOML 文件，遵循以下原则：

1. **保留注释**：`@iarna/toml` 支持注释保留，不破坏已有注释
2. **最小写入**：每次只修改目标字段，不重写整个文件
3. **写前备份**：每次修改前将原文件备份为 `<filename>.bak`，写入成功后删除备份

### 写入映射表（安装向导阶段）

| TOML 文件 | 字段路径 | 写入值来源 |
|-----------|----------|------------|
| `config/core.toml` | `permissions.owner_list` | `["qq:<ownerQQNumber>"]` |
| `config/model.toml` | `api_providers[0].api_key` | 用户输入的 `apiKey` |
| `config/plugins/napcat_adapter/config.toml` | `napcat_server.port` | 用户输入的 `wsPort` |
| `config/plugins/napcat_adapter/config.toml` | `plugin.enabled` | `true` |

---

## StorageService 接口

### 通用 JSON

| 方法 | 说明 |
|------|------|
| `readState()` | 读取 state.json，不存在时返回默认值 |
| `writeState(patch)` | 合并更新 state.json |
| `readInstances()` | 读取 instances.json |
| `writeInstances(list)` | 全量写入 instances.json（内部做原子写入：先写 .tmp 再 rename） |

### TOML 操作

| 方法 | 说明 |
|------|------|
| `readToml(filePath)` | 解析 TOML 文件，返回 JS 对象 |
| `writeTomlField(filePath, keyPath, value)` | 按点分路径写入单个字段 |

### 原子写入实现

防止写入中途 Launcher 崩溃导致文件损坏：

```
writeFile(filePath, content):
  tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, filePath)   // 原子替换
```

---

## launcherDataDir 确定规则

优先级从高到低：

1. 命令行参数 `--data-dir <path>`
2. 环境变量 `NEO_MOFOX_LAUNCHER_DATA`
3. 默认值：`path.join(process.env.APPDATA, 'Neo-MoFox-Launcher')`

Launcher 启动时若目录不存在则自动创建（`fs.mkdirSync(dir, { recursive: true })`）。
