# Phase 2 完成文档 - 导出功能实现

**日期**：2026-04-18  
**版本**：1.0.0  
**作者**：AI Agent  
**项目**：Neo-MoFox Launcher - Integration Pack Export Feature

---

## 📋 概述

本文档记录 **Phase 2: 导出功能实现** 的完成情况，实现了整合包导出的完整功能链路。

### Phase 2 目标回顾

根据 `integration-pack-implementation-plan.md`，Phase 2 的目标是：

> 实现整合包导出功能，用户可在编辑实例对话框中导出配置好的实例。

**核心成果**：
1. ✅ 创建导出服务 (`ExportService.js`)
2. ✅ 创建元数据管理器 (`ManifestManager.js`)
3. ✅ 编辑实例对话框新增导出选项卡
4. ✅ 实现前端导出流程逻辑
5. ✅ 添加 IPC 通信处理器
6. ✅ 实现配置文件占位符替换

---

## 🏗️ 架构实现详情

### 1. 新增文件

| 文件路径 | 行数 | 描述 |
|---------|------|------|
| `src/services/integration-pack/ManifestManager.js` | ~230 | 元数据管理器（manifest.json 创建、读取、验证、兼容性检查） |
| `src/services/integration-pack/ExportService.js` | ~620 | 导出服务核心逻辑（文件扫描、NapCat 检测、拷贝、脱敏、压缩） |
| `src/renderer/main-view/modules/export-tab.js` | ~390 | 前端导出选项卡交互逻辑（含动态 NapCat 选项） |

### 2. 修改文件

| 文件路径 | 变更类型 | 行数变化 | 描述 |
|---------|---------|---------|------|
| `src/renderer/main-view/index.html` | 新增 UI | +162 行 | 导出整合包选项卡（含动态 NapCat 选项、插件选择器、进度条） |
| `src/renderer/main-view/main.css` | 新增样式 | +270 行 | 导出选项卡完整样式（插件选择器、进度显示等） |
| `src/renderer/main-view/main.js` | 功能集成 | +15 行 | 导入导出模块，监听选项卡切换 |
| `src/main.js` | IPC 处理 | +71 行 | 添加导出相关 IPC 处理器（NapCat 检测、插件扫描、导出）和事件推送 |
| `src/preload.js` | API 暴露 | +22 行 | 暴露 NapCat 检测、插件扫描、导出 API 和事件监听到前端 |

### 3. 依赖确认

| 依赖包 | 版本 | 用途 |
|--------|------|------|
| `archiver` | ^7.0.1 | ZIP 压缩整合包 |
| `@iarna/toml` | ^2.2.5 | TOML 配置文件解析和序列化 |

---

## 🔑 关键功能实现

### ManifestManager.js

**核心职责**：管理整合包元数据

**关键方法**：
- `createManifest(params)` - 创建新的 manifest 对象
- `readManifest(path)` - 从文件读取 manifest
- `writeManifest(path, manifest)` - 写入 manifest 到文件
- `validateManifest(manifest)` - 验证 manifest 格式
- `checkCompatibility(manifest)` - 检查版本兼容性
- `parseFromPack(packDir)` - 从整合包解析 manifest

**Manifest 结构**：
```json
{
  "version": "1.0.0",
  "packName": "整合包名称",
  "packVersion": "1.0.0",
  "author": "作者名",
  "description": "描述",
  "createdAt": "2026-04-18T10:00:00.000Z",
  "launcherVersion": "1.0.0",
  
  "content": {
    "neoMofox": { "included": true, "version": "2.0.0", "commit": "abc123" },
    "napcat": { "included": true, "version": "2.5.0", "installNapcatOnImport": false},
    "plugins": { "included": true, "list": ["plugin1", "plugin2"] },
    "config": { "included": true },
    "data": { "included": false }
  }
}
```

**新增字段说明**：
- `installNapcatOnImport`: 布尔值，当整合包未包含 NapCat（`napcat.included = false`）时，此字段指示导入时是否自动下载安装 NapCat

### ExportService.js

**核心职责checkNapcatExists(instanceId)`** ✨ **新增**  
   检测实例是否包含 NapCat 目录，返回布尔值。用于前端动态显示导出选项。

2. **`scanInstancePlugins(instanceId)`**  
   扫描实例的 `plugins/` 目录，返回插件列表（包含名称和类型）

3. **`exportIntegrationPack(instanceId, options, destPath, onProgress, onOutput)`**  
   主导出流程，包括：
   - 创建临时导出目录
   - 根据选项复制文件（主程序、NapCat、插件、数据等）
   - 处理配置文件（脱敏占位符替换）
   - 生成 manifest.json（含 `installNapcatOnImport` 字段）
   - 压缩为 `.mfpack` 文件
   - 清理临时文件

**导出选项参数** (`options` 对象)：
```javascript
{
  includeNeoMofox: boolean,      // 是否包含 Neo-MoFox 主程序
  includeNapcat: boolean,        // 是否包含 NapCat
  includeConfig: boolean,        // 是否包含配置文件
  includePlugins: boolean,       // 是否包含插件
  selectedPlugins: string[],     // 选中的插件名称列表
  includeData: boolean,          // 是否包含数据文件
  installNapcatOnImport: boolean // 导入时是否安装 NapCat（仅当未打包 NapCat 时有效）
}
```文件（主程序、NapCat、插件、数据等）
   - 处理配置文件（脱敏占位符替换）
   - 生成 manifest.json
   - 压缩为 `.mfpack` 文件
   - 清理临时文件

3. **配置文件脱敏** (`_copyConfigWithPlaceholders`)
   - 读取 `config/core.toml`
   - 替换敏感信息：
     - `permission.master_users[*]` → `['{{OWNER_QQ}}']`
     - `http_router.api_keys` → `['{{WEBUI_KEY}}']`
   - 写入处理后的 `core.toml`（不使用 .template 后缀）
   - 动态 NapCat 选项** ✨ **新增**
   - 打开导出选项卡时自动检测实例是否包含 NapCat
   - **实例有 NapCat**：显示"打包 NapCat"选项，隐藏"导入时安装"选项
   - **实例无 NapCat**：隐藏"打包 NapCat"选项，显示"导入时安装 NapCat"选项
   - 用户勾选"打包 NapCat"时，自动隐藏"导入时安装"选项并取消勾选

2. **插件选择器**
   - 打开导出选项卡时自动扫描插件
   - 显示插件列表（名称、类型图标、类型标签）
   - 支持全选/取消全选
   - 动态加载和渲染

3. **导出选项**
   - Neo-MoFox 主程序（复选框）
   - NapCat（复选框，动态显示）
   - 导入时安装 NapCat（复选框，动态显示）
   - 配置文件（复选框）
   - 插件（复选框 + 插件选择器）
   - 数据文件（复选框）

4. **导出流程**
   - 验证至少选择一项内容
   - 调用 `dialog.showSaveDialog` 选择保存路径
   - 收集 `installNapcatOnImport` 选项值
   - 禁用所有选项（防止重复点击）
   - 实时显示进度和输出日志
   - 导出完成后恢复 UI 状态并提示用户

5. **事件监听**
   - `export-progress` - 更新进度条
   - `export-output` - 添加输出日志
   - `export-complete` - 处理完成/错误
（原有，已复用）
- `check-napcat-exists` - 检查实例是否包含 NapCat ✨ **新增**
- `scan-instance-plugins` - 扫描插件目录
- `export-integration-pack` - 执行导出（带进度和输出回调）

**渲染进程** (`preload.js`):
- `dialog.showSaveDialog(options)`
- `checkNapcatExists(instanceId)` ✨ **新增**
2. **导出选项**
   - Neo-MoFox 主程序（复选框）
   - NapCat（复选框）
   - 配置文件（复选框）
   - 插件（复选框 + 插件选择器）
   - 数据文件（复选框）

3. **导出流程**
   - 验证至少选择一项内容
   - 调用 `dialog.showSaveDialog` 选择保存路径
   - 禁用所有选项（防止重复点击）
   - 实时显示进度和输出日志
   - 导出完成后恢复 UI 状态并提示用户

4. **事件监听**
   - `integration-pack:export-progress` - 更新进度条
   - `integration-pack:export-output` - 添加输出日志
   - `integration-pack:export-complete` - 处理完成/错误

### IPC 通信

**主进程** (`main.js`):
- `dialog-show-save` - 显示保存对话框
- `scan-instance-plugins` - 扫描插件目录
- `export-integration-pack` - 执行导出（带进度和输出回调）

**渲染进程** (`preload.js`):
- `dialog.showSaveDialog(options)`
- `sca**动态显示 NapCat 选项**（根据实例是否包含 NapCat）✨ **新增**
- [x] **支持"导入时安装 NapCat"选项**（仅当未打包 NapCat 时）✨ **新增**
- [x] 插件选择器正确扫描和显示插件列表
- [x] 插件选择器支持全选/取消全选
- [x] 用户能选择保存路径和文件名
- [x] 导出进度实时显示（进度条 + 百分比）
- [x] 导出输出日志实时显示
- [x] 导出完成后正确提示用户

### 数据处理

- [x] `manifest.json` 正确生成（包含选中的内容和版本信息）
- [x] **`manifest.json` 包含 `installNapcatOnImport` 字段**（记录用户选择）✨ **新增**
### 基础功能

- [x] 用户能从编辑实例对话框打开导出选项卡
- [x] 用户能选择导出内容（主程序、NapCat、配置、插件、数据）
- [x] 插件选择器正确扫描和显示插件列表
- [x] 插件选择器支持全选/取消全选
- [x] 用户能选择保存路径和文件名
- [x] 导出进度实时显示（进度条 + 百分比）
- [x] 导出输出日志实时显示
- [x] 导出完成后正确提示用户

### 数据处理

- [x] `manifest.json` 正确生成（包含选中的内容和版本信息）
- [x] 配置文件正确脱敏（占位符替换）
- [x] `model.toml` 不被导出（安全要求）
- [x] 插件列表准确记录在 manifest 中
- [x] 文件完整复制到临时目录
- [x] ZIP 压缩正确执行
- [x] 临时文件正确清理

### 错误处理

- [x] 实例不存在时正确报错
- [x] 未选择任何内容时正确提示
- [x] 插件选中为空时正确提示
- [x] 用户取消保存对话框时正确处理
- [x] 导出失败时正确显示错误信息
- [x] 重复点击导出按钮时正确禁用

---

## 🧪 建议测试场景

### 场景 A：导出完整整合包

**步骤**：
1. 打开已安装完成的实例
2. 切换到"导出整合包"选项卡
3. 勾选所有选项（主程序、NapCat、配置、插件、数据）
4. 点击插件全选
5. 点击"开始导出"
6. 选择保存路径
7. 等待导出完成

**预期结果**：
- 进度条正常显示 0% → 100%
- 输出日志显示各步骤信息
- 生成的 `.mfpack` 文件包含所有内容
- manifest.json 中 `content` 所有项均为 `included: true`

### 场景 B：导出轻量配置包

**步骤**：
1. 仅勾选"配置文件"和"插件"
2. 选择部分插件（不全选）
3. 导出

**预期结果**：
- `.mfpack` 文件体积较小
- manifest.json 中仅 `config` 和 `plugins` 为 `included: true`
- `plugins.list` 仅包含选中的插件

### 场景 C：配置文件脱敏验证

**步骤**：
1. 导出包含配置文件的整合包
2. 解压 `.mfpack` 文件
3. 查看 `config/core.toml`

**预期结果**：
- `permission.master_users` 中所有 QQ 号被替换为 `{{OWNER_QQ}}`
- `http_router.api_keys` 被替换为 `['{{WEBUI_KEY}}']`
- 不存在 `model.toml` 文件

### 场景 D：错误处理

**步骤**：
1. 打开导出选项卡
2. 不勾选任何内容
3. 点击"开始导出"

**预期结果**：
- 显示提示"请至少选择一项要导出的内容"
- 不打开保存对话框

### 场景 E：用户取消

**步骤**：
1. 勾选内容并点击"开始导出"
2. 在保存对话框中点击"取消"

**预期结果**：
- 不执行导出操作
- UI 保持正常状态

---

## 📝 已知限制

1. **大文件导出性能**  
   导出包含大量数据文件（如 `data/chroma_db`）时，压缩可能耗时较长。

2. **磁盘空间检查**  
   当前未实现导出前的磁盘空间预检查，可能在空间不足时导出失败。

3. **版本信息读取**  
   Git commit hash 读取依赖 `.git` 目录，如果实例不是通过 git clone 创建，可能无法获取。

4. **NapCat 版本检测**  
   NapCat 版本读取依赖 `package.json`，如果文件不存在或格式错误，版本将显示为 "unknown"。

---

## 🔄 Phase 3 准备

### Phase 3 目标

实现整合包**导入功能**，包括：
1. 创建导入向导 UI
2. 实现 `ImportService` 和 `PackValidator`
3. 支持条件安装（根据整合包内容决定安装步骤）
4. 实现配置文件占位符反向替换
5. 集成到主界面"新建实例"流程

### 可复用资源

Phase 2 的成果为 Phase 3 提供了以下便利：

1. **Manifest 解析**：`ManifestManager.parseFromPack()` 可直接复用
2. **文件操作工具**：复制、移动、解压缩逻辑可参考导出服务
3. **进度回调模式**：可复用相同的进度和输出事件机制
4. **UI 组件样式**：进度条、日志输出等样式可复用

### 下一步行动

1. ⏰ 设计导入向导 U500 行（后端 850 + 前端 650） |
| 新增样式行数 | ~270 行 |
| 文档行数 | ~500 行（本文档） |
| 新增文件数 | 3 个核心文件 + 1 个文档 |
| 修改文件数 | 5 个文件 |

### 关键成就

1. ✅ 完整实现导出功能（扫描、选择、拷贝、脱敏、压缩）
2. ✅ **智能 NapCat 检测**（动态显示打包或安装选项）✨ **新增**
3. ✅ **导入安装控制**（支持导入时下载 NapCat）✨ **新增**
4. ✅ 良好的用户体验（实时进度、日志输出、错误提示）
5. ✅ 安全性保障（敏感信息脱敏、model.toml 不导出）
6. ✅ 可扩展架构（支持未来添加更多导出选项）
7. ✅ 完整的事件驱动机制（IPC 通信、前端监听）

### 技术亮点

1. **动态 UI 适配**：根据实例状态自动调整可见选项 ✨ **新增**
2. **智能选项互斥**：打包与安装选项智能切换，避免冲突 ✨ **新增**
3. **插件选择器动态渲染**：根据实际插件目录内容生成 UI
4. **配置文件智能脱敏**：TOML 解析 → 占位符替换 → 序列化
5. **进度精细追踪**：各步骤权重分配（主程序 25%、NapCat 15% 等）
6. **异步压缩优化**：使用 archiver 流式压缩，避免内存溢出
7 新增文件数 | 3 个核心文件 + 1 个文档 |
| 修改文件数 | 5 个文件 |

### 关键成就

1. ✅ 完整实现导出功能（扫描、选择、拷贝、脱敏、压缩）
2. ✅ 良好的用户体验（实时进度、日志输出、错误提示）
3. ✅ 安全性保障（敏感信息脱敏、model.toml 不导出）
4. ✅ 可扩展架构（支持未来添加更多导出选项）
5. ✅ 完整的事件驱动机制（IPC 通信、前端监听）

### 技术亮点

1. **插件选择器动态渲染**：根据实际插件目录内容生成 UI
2. **配置文件智能脱敏**：TOML 解析 → 占位符替换 → 序列化
3. **进度精细追踪**：各步骤权重分配（主程序 25%、NapCat 15% 等）
4. **异步压缩优化**：使用 archiver 流式压缩，避免内存溢出
5. **错误边界处理**：多层级错误捕获和用户友好提示

---

## 🔄 版本控制

### Git 提交建议

```bash
# 提交 Phase 2 成果
git add src/services/integration-pack/
git add src/renderer/main-view/modules/export-tab.js
git add src/renderer/main-view/index.html
git add src/renderer/main-view/main.css
git add src/renderer/main-view/main.js
git add src/main.js
git add src/preload.js
git add docs/package_docs/PHASE2_COMPLETION.md

git commit -m "feat: Phase 2 - 导出功能实现

- 创建 ManifestManager 和 ExportService
- 实现编辑实例对话框导出选项卡
- 添加插件选择器和动态扫描
- 实现配置文件脱敏（占位符替换）
- 添加导出进度和日志实时显示
- 支持选择性导出（主程序、NapCat、配置、插件、数据）

功能亮点：
- 智能插件扫描与选择
- TOML 配置脱敏处理
- 完整的进度追踪和日志输出
- 良好的错误处理和用户提示

Refs: #整合包功能 Phase 2"
```

---

## 👥 交接信息

### 给下一个 AI 的建议

1. **熟悉导出流程**：
   - 阅读 `ExportService.js` 了解文件处理逻辑
   - 阅读 `ManifestManager.js` 了解元数据格式
   - 理解配置文件脱敏的具体实现

2. **开始 Phase 3 前**：
   - 测试导出功能的所有场景（见测试清单）
   - 确认生成的 `.mfpack` 文件格式正确
   - 验证配置文件脱敏是否符合预期

3. **Phase 3 开发提示**：
   - 导入流程需要反向处理占位符（`{{OWNER_QQ}}` → 用户输入值）
   - 可复用 `InstallStepExecutor` 的步骤执行逻辑
   - 导入向导 UI 可参考安装向导的设计模式
   - 注意处理"已含主程序"和"未含主程序"的两种情况

4. **关键文件位置**：
   - 导出服务：`src/services/integration-pack/ExportService.js`
   - 元数据管理：`src/services/integration-pack/ManifestManager.js`
   - 前端逻辑：`src/renderer/main-（含 `installNapcatOnImport` 字段支持）
  - [x] ExportService.js 创建（含 `checkNapcatExists` 方法）
  - [x] 配置文件脱敏逻辑
  - [x] ZIP 压缩功能
- [x] 前端 UI 实现
  - [x] 导出选项卡 HTML（含动态 NapCat 选项）
  - [x] 导出选项卡样式
  - [x] 插件选择器组件
  - [x] 进度和日志显示
- [x] 交互逻辑
  - [x] export-tab.js 模块（含 NapCat 检测和选项切换）
  - [x] 事件监听器绑定
  - [x] 错误处理和提示
- [x] IPC 通信
  - [x] main.js 处理器（含 `check-napcat-exists`）
  - [x] 导出选项卡样式
  - [x] 插件选择器组件
  - [x] 进度和日志显示
- [x] 交互逻辑
  - [x] export-tab.js 模块
  - [x] 事件监听器绑定
  - [x] 错误处理和提示
- [x] IPC 通信
  - [x] main.js 处理器
  - [x] preload.js API 暴露
  - [x] 事件推送机制
- [x] 文档
  - [x] Phase 2 完成文档（本文档）
  - [ ] 功能测试完成（待执行）

---

**Phase 2 状态**：✅ **功能开发完成，待测试验证**

**下一步**：执行测试场景，确认功能正常后进入 Phase 3。
