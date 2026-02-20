# 03 — NapCat 自动下载与安装（NapCatInstallerService）

## 职责

在安装向导 Phase 3.7 中被调用，完成 NapCat Shell 版本的下载、完整性校验、解压和目录放置。  
同时暴露 `update(instanceId)` 方法供 `UpdateChannelService` 在更新时调用。

---

## 安装策略选择

NapCat 官方提供两种 Windows 安装包：

| 包类型 | 文件名 | 特点 | Launcher 是否使用 |
|--------|--------|------|-------------------|
| Shell（标准版） | `NapCat.Shell.zip` | 需本机已安装 QQ，通过 `launcher.bat` 启动 | ❌ 不使用（需用户手动安装 QQ） |
| OneKey（一键版） | `NapCat.Shell.Windows.OneKey.zip` | 内置 QQ，包体较大（>1 GB），自带解压程序 | **✅ 使用** |

**结论**：Launcher 使用 **OneKey 一键版**，优势：
- 无需用户预装 QQ，开箱即用
- 版本隔离性好，每个实例使用独立的 QQ 环境
- 自带解压安装程序，自动化程度高

---

## GitHub Release 元数据获取

### API 端点

```
GET https://api.github.com/repos/NapNeko/NapCatQQ/releases/latest
```

返回 JSON 中取 `assets` 数组，筛选 `name` 值匹配 `NapCat.Shell.Windows.OneKey.zip` 的条目，读取：

- `browser_download_url`：下载地址
- `size`：文件大小（用于进度计算）
- `tag_name`（来自 release 根字段）：版本号，格式 `v4.x.x`

### 备用镜像列表

GitHub 直链在国内可能不稳定，按顺序尝试以下地址：

```
1. browser_download_url（原始 GitHub）
2. https://xget.xi-xu.me/gh/NapNeko/NapCatQQ/releases/download/<tag>/NapCat.Shell.Windows.OneKey.zip
3. https://kgithub.com/NapNeko/NapCatQQ/releases/download/<tag>/NapCat.Shell.Windows.OneKey.zip
```

每个地址设置 15 秒连接超时，失败后自动切换下一个。

---

## 下载流程

```
NapCatInstallerService.install(targetDir, onProgress)
  │
  ├─ 1. fetchLatestRelease()          → { downloadUrl, version, size }
  │
  ├─ 2. downloadToTemp(url, size)     → tmpZipPath
  │       ├─ 流式写入临时文件
  │       └─ 上报 progress: { step: 'downloading', percent: 0..100 }
  │
  ├─ 3. verifySHA256(tmpZipPath, expectedChecksum)
  │       └─ 若 GitHub Release 提供 .sha256 文件则校验，否则跳过
  │
  ├─ 4. extractZip(tmpZipPath, tmpExtractDir)
  │       ├─ 解压到临时目录（一键版 zip 包含安装程序）
  │       └─ 上报 progress: { step: 'extracting', percent: 0..100 }
  │
  ├─ 5. runOneKeyInstaller(tmpExtractDir, targetDir)
  │       ├─ 使用 child_process.spawn 运行一键版内置的解压/安装程序
  │       ├─ 传入目标路径参数（若支持静默安装参数）
  │       ├─ 监听安装进程输出，上报进度
  │       └─ 等待进程退出（exit code 0 = 成功）
  │
  ├─ 6. detectEntryDir(targetDir)
  │       └─ 统一 rename 为 targetDir/napcat
  │
  ├─ 7. verifyInstall(targetDir)
  │       └─ 检查 NapCatWinBootMain.exe 或 launcher.bat 存在
  │
  ├─ 8. cleanup(tmpZipPath, tmpExtractDir)
  │
  └─ return { version, napcatDir }
```

---

## 目录放置规则

```
<installDir>/
  <instanceId>/
    neo-mofox/          ← Neo-MoFox 源码
    napcat/             ← NapCat Shell 解压目录（统一命名）
      launcher.bat
      NapCatWinBootMain.exe   （一键版产物，Shell 版中为 launcher.bat）
      config/
        onebot11_<qqNumber>.json   ← 由向导写入
        napcat_<qqNumber>.json
```

---

## 一键版解压程序调用

一键版 zip 解压后包含自解压安装程序（通常为 `.exe` 或批处理脚本），需以子进程方式调用：

```typescript
const installerPath = path.join(tmpExtractDir, 'setup.exe'); // 或实际的安装程序名
const targetDir = path.join(installDir, instanceId, 'napcat');

const proc = spawn(installerPath, [
  '/S',           // 静默安装参数（若支持）
  `/D=${targetDir}` // 目标路径参数（若支持）
], {
  cwd: tmpExtractDir,
  windowsHide: true
});

proc.on('exit', (code) => {
  if (code === 0) {
    // 安装成功
  } else {
    // 安装失败，回退
  }
});
```

> **注意**：若一键版不支持命令行参数，则手动将解压后的文件复制到目标目录（fallback 方案）。

---

## 版本信息持久化

安装完成后调用 `InstanceManager.updateRecord(instanceId, { napcatVersion })` 将版本号写入实例记录：

```typescript
await InstanceManager.updateRecord(instanceId, {
  napcatVersion: version  // 例如 "v4.5.3"
});
```

`UpdateChannelService` 通过读取 `InstanceRecord.napcatVersion` 判断当前安装版本。

---

## 更新调用接口

```
NapCatInstallerService.update(instanceId, onProgress)
  │
  ├─ 1. 读取 .launcher-meta.json 获取当前版本
  ├─ 2. fetchLatestRelease() 获取最新版本
  ├─ 3. 比对版本号，相同则 return { upToDate: true }
  ├─ 4. ProcessManager.stop(instanceId)    ← 停止 NapCat 进程
  ├─ 5. 备份 config/ 目录
  ├─ 6. 执行 install()（覆盖 napcat/ 目录，还原 config/）
  └─ 7. ProcessManager.start(instanceId)   ← 重启 NapCat 进程
```
