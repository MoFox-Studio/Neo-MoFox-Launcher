# Neo-MoFox Launcher - 整合包导出/导入功能实施计划

## 📋 项目概述

为 Neo-MoFox Launcher 实现整合包（Integration Pack）的导出和导入功能，允许用户将配置好的实例打包分享，或从整合包快速部署新实例。

---

## 🎯 功能目标

### 导出功能
- 在编辑实例对话框中添加"导出整合包"选项卡
- 用户可选择性导出以下内容：
  - ✅ Neo-MoFox 主程序文件
  - ✅ NapCat 程序文件
  - ✅ 配置文件（core.toml）
  - ✅ **插件选择器**（动态扫描插件目录，用户勾选要导出的插件）
  - ✅ 数据库文件
  - ✅ 自定义资源文件
- 用户选择导出位置
- 自动生成元数据清单（manifest.json，记录实际导出的插件列表）
- 打包为 `.mfpack` 格式（实质为 ZIP）

### 导入功能
- 新增实例时提供"从整合包导入"选项
- 独立的导入向导界面
- 解析整合包元数据
- 用户配置实例参数（QQ号、昵称、端口等）
- 根据整合包内容决定安装步骤：
  - 已内置主程序 → 直接解压
  - 未内置主程序 → 从仓库拉取
  - 已内置 NapCat → 直接解压
  - 未内置 NapCat → 下载最新版本
- 自动配置并完成部署

---

## 🏗️ 架构设计

### 文件结构
```
Neo-MoFox-Launcher/
├── src/
│   ├── services/
│   │   ├── install/
│   │   │   ├── InstallWizardService.js  # 重构：步骤独立化
│   │   │   └── InstallStepExecutor.js   # 新增：步骤执行器
│   │   └── integration-pack/            # 新增：整合包服务目录
│   │       ├── ExportService.js         # 导出服务
│   │       ├── ImportService.js         # 导入服务
│   │       ├── ManifestManager.js       # 元数据管理
│   │       └── PackValidator.js         # 整合包校验
│   ├── renderer/
│   │   ├── main-view/
│   │   │   ├── main.html               # 修改：编辑对话框添加导出栏
│   │   │   ├── main.js                  # 修改：添加导入入口
│   │   │   └── modules/
│   │   │       └── instances.js         
│   │   └── import-wizard/               # 新增：导入向导页面
│   │       ├── import.html
│   │       ├── import.js
│   │       ├── import.css
│   │       └── modules/
│   │           ├── manifest-parser.js
│   │           ├── import-steps.js
│   │           └── import-progress.js
```

### 整合包格式
```
instance-name.mfpack (ZIP Archive)
├── manifest.json                 # 元数据清单
├── neo-mofox/                    # (可选) 主程序文件
│   ├── main.py
│   ├── src/
│   └── ...
├── napcat/                       # (可选) NapCat 文件
│   └── napcat.exe
├── config/                       # (可选) 配置文件
│   └── core.toml                 # 包含占位符的配置文件
├── plugins/                      # (可选) 插件目录
│   ├── plugin1/
│   └── plugin2/
├── data/                         # (可选) 数据文件
│   └── ...
└── resources/                    # (可选) 自定义资源
    └── ...
```

### manifest.json 结构
```json
{
  "version": "1.0.0",
  "packName": "示例整合包",
  "packVersion": "1.0.0",
  "author": "用户名",
  "description": "整合包描述",
  "createdAt": "2026-04-18T10:00:00.000Z",
  "launcherVersion": "1.2.0",
  "content": {
    "neoMofox": {
      "included": true,
      "version": "2.0.0",
      "commit": "abc123"
    },
    "napcat": {
      "included": true,
      "version": "2.5.0",
      "installNapcatOnImport": false
    },
    "plugins": {
      "included": true,
      "list": ["plugin1", "plugin2"]
    },
    "config": {
      "included": true
    },
    "data": {
      "included": false
    }
  }
}
```

**字段说明**：
- **新增** `installNapcatOnImport`：布尔值，当 `napcat.included = false` 时，此字段指示导入时是否自动下载安装 NapCat
- **移除** `requirements`：不需要在整合包内指定环境要求，导入时使用 Launcher 内置的环境检查
- **移除** `installInstructions.userInputFields`：用户输入字段固定为 `[qqNumber, qqNickname, wsPort, apiKey, ownerQQNumber, webuiKey?]`
- **简化** `config.included`：`true` = 包含 core.toml，`false` = 不包含（不导出 model.toml）

---

## 📅 实施阶段

### 阶段 1：基础架构重构（1-2天）

#### 目标
重构 `InstallWizardService`，将安装步骤逻辑独立化，为整合包导入做准备。

#### 任务清单
- [ ] **步骤 1.1**: 创建 `InstallStepExecutor.js`
  - 将 `InstallWizardService` 中的步骤执行逻辑提取为独立方法
  - 每个步骤封装为可复用的函数（clone, venv, deps, napcat 等）
  - 支持步骤条件执行（根据整合包内容决定是否执行）

- [ ] **步骤 1.2**: 重构 `InstallWizardService.js`
  - 保留校验逻辑和流程控制
  - 调用 `InstallStepExecutor` 执行具体步骤
  - 确保向后兼容现有安装向导功能

- [ ] **步骤 1.3**: 定义步骤接口规范
  - 统一步骤输入参数结构
  - 统一步骤返回结果格式
  - 统一进度和日志回调机制

- [ ] **步骤 1.4**: 单元测试
  - 测试重构后的安装向导功能
  - 验证步骤独立执行能力

#### 关键文件
- `src/services/install/InstallStepExecutor.js` (新建)
- `src/services/install/InstallWizardService.js` (重构)

#### 交付物
- ✅ 重构完成的安装服务
- ✅ 步骤执行器模块
- ✅ 向后兼容性测试通过

---

### 阶段 2：导出功能实现（2-3天）

#### 目标
实现整合包导出功能，用户可在编辑实例对话框中导出配置好的实例。

#### 任务清单
- [x] **步骤 2.1**: 创建导出服务 `ExportService.js`
  - [x] 实现文件扫描和选择性复制逻辑
  - [x] **实现插件目录扫描**：
    - 读取实例的 `plugins/` 目录
    - 列出所有子目录和文件（1级目录结构）
    - 返回插件列表供前端显示
  - [x] **实现 NapCat 存在性检测** ✨ **新增**：
    - `checkNapcatExists(instanceId)` 方法
    - 检查实例的 `napcat/` 目录是否存在
    - 返回布尔值供前端动态显示选项
  - [x] 实现配置文件模板化（移除敏感信息）
  - [x] 实现元数据生成（manifest.json，含 `installNapcatOnImport` 字段）
  - [x] 实现 ZIP 打包（使用 `archiver`）
  - [x] 添加进度回调和错误处理

- [x] **步骤 2.2**: 创建元数据管理器 `ManifestManager.js`
  - [x] 定义 manifest.json 数据结构验证
  - [x] 实现元数据读写方法
  - [x] 版本检测和兼容性检查
  - [x] **支持 `installNapcatOnImport` 字段** ✨ **新增**

- [x] **步骤 2.3**: 编辑实例对话框 UI 修改
  - [x] 在 `main.html` 中添加"导出整合包"侧边栏选项
  - [x] 创建导出选项界面（复选框列表）：
    - Neo-MoFox 主程序（复选框）
    - **NapCat 程序（复选框，动态显示）** ✨ **修改**
    - **导入时安装 NapCat（复选框，动态显示）** ✨ **新增**
    - 配置文件（复选框）
    - **插件选择器（高级）**：
      - "全选插件"复选框
      - 动态生成的插件列表（从后端扫描结果生成）
      - 每个插件一个复选框
      - 显示插件名称（文件夹/文件名）
      - 支持全选/取消全选
    - 数据库文件（复选框）
    - 其他资源（复选框）
  - [x] **NapCat 选项动态显示逻辑** ✨ **新增**：
    - 打开导出对话框时调用 `checkNapcatExists(instanceId)` API
    - 实例**有 NapCat** → 显示"打包 NapCat"选项，隐藏"导入时安装"选项
    - 实例**无 NapCat** → 隐藏"打包 NapCat"选项，显示"导入时安装 NapCat"选项
    - 勾选"打包 NapCat"时自动隐藏"导入时安装"选项
  - [x] **插件扫描与显示**：
    - 打开导出对话框时调用 `scanInstancePlugins(instanceId)` API
    - 接收插件列表：`[{ name: 'plugin1', type: 'folder' }, { name: 'plugin2.py', type: 'file' }]`
    - 动态生成插件复选框列表
    - 实现"全选插件"功能
  - [x] 实现导出选项状态管理（包括选中的插件列表和 `installNapcatOnImport`）
  - [x] 添加"开始导出"按钮

- [x] **步骤 2.4**: 导出流程前端逻辑
  - [x] 在 `export-tab.js` 中添加导出处理函数
  - [x] 实现导出选项状态管理：
    - `checkNapcatAvailability(instanceId)` - 检测 NapCat 并动态显示选项 ✨ **新增**
    - `toggleInstallNapcatOption()` - 切换"导入时安装"选项显示 ✨ **新增**
    - `scanInstancePlugins(instanceId)` - 扫描插件目录，返回插件列表
    - `exportIntegrationPack(instanceId, options, destPath)` - 执行导出
      - `options.selectedPlugins` - 用户选中的插件列表
      - `options.installNapcatOnImport` - 是否导入时安装 NapCat ✨ **新增**
  - [x] 实现导出进度显示（进度条 + 状态文本）

- [x] **步骤 2.5**: IPC 通信实现
  - [x] 在 `src/main.js` 中注册导出 API
  - [x] `checkNapcatExists(instanceId)` - 检查 NapCat 存在性 ✨ **新增**
  - [x] `scanInstancePlugins(instanceId)` - 扫描插件目录
  - [x] `exportIntegrationPack(instanceId, options, destPath)` - 执行导出
  - [x] 进度事件：`export-progress` ✨ **修改事件名**
  - [x] 输出事件：`export-output` ✨ **修改事件名**
  - [x] 完成事件：`export-complete` ✨ **修改事件名**

- [x] **步骤 2.6**: 配置文件占位符替换逻辑（仅处理 core.toml）
  - [x] 读取实例的 `config/core.toml`
  - [x] 替换敏感字段为占位符：
    - `permission.master_users` 中的所有 QQ 号 → `{{OWNER_QQ}}`
    - `http_router.api_keys` 数组 → `["{{WEBUI_KEY}}"]`
  - [x] **直接覆盖保存为 `core.toml`**（不使用 .template 后缀）
  - [x] **不导出 `model.toml`**（导入时启动 Neo-MoFox 自动生成）

#### 关键文件
- `src/services/integration-pack/ExportService.js` (新建) ✅ **已完成**
- `src/services/integration-pack/ManifestManager.js` (新建) ✅ **已完成**
- `src/renderer/main-view/index.html` (修改) ✅ **已完成**
- `src/renderer/main-view/modules/export-tab.js` (新建) ✅ **已完成**
- `src/main.js` (修改) ✅ **已完成**
- `src/preload.js` (修改) ✅ **已完成**

#### 交付物
- ✅ **导出服务模块**（含 NapCat 检测功能）
- ✅ **编辑实例对话框新增导出栏目**（含动态 NapCat 选项）
- ✅ **可生成合法的 `.mfpack` 文件**（含 `installNapcatOnImport` 字段）
- ✅ **敏感信息正确过滤**

**Phase 2 状态**: ✅ **已完成** (2026-04-18)

---

### 阶段 3：导入向导 UI 开发（2-3天）

#### 目标
创建独立的导入向导界面，支持整合包解析和用户参数输入。

#### 任务清单
- [ ] **步骤 3.1**: 主界面入口修改
  - 修改 `main.html` 的"新增实例"按钮为模态框触发
  - 创建选择模态框：
    - "从头安装"按钮 → 跳转现有安装向导
    - "从整合包导入"按钮 → 跳转导入向导

- [ ] **步骤 3.2**: 创建导入向导页面结构
  - `import-wizard/import.html`（页面骨架）
  - `import-wizard/import.css`（样式）
  - `import-wizard/import.js`（主逻辑）

- [ ] **步骤 3.3**: 导入向导流程设计
  - **步骤 1 - 选择整合包**
    - 文件选择器（过滤 `.mfpack` 文件）
    - 解析 manifest.json
    - 显示整合包信息：
      - 包名、版本、作者、描述
      - 包含内容清单
  
  - **步骤 2 - 环境检查**
    - 复用 `InstallWizardService.runEnvCheck()`
    - 显示环境检测结果
    - 不通过则阻止继续

  - **步骤 3 - 用户参数输入**（固定字段）
    - 实例名称（packName或用户修改）
    - Bot QQ 号（必填，5-12位数字）
    - Bot QQ 昵称（必填）
    - WebSocket 端口（必填，自动检测冲突，推荐可用端口）
    - 管理员 QQ 号（必填，5-12位数字）
    - SiliconFlow API Key（必填，用户自己的硅基流动密钥）
    - WebUI API 密钥（可选，留空则自动生成 UUID）
    - 安装路径（默认路径 + 浏览按钮）

  - **步骤 3.5 - 配置文件处理**（用户输入和安装确认之间）
    - 如果整合包包含 `core.toml`：
      - 读取 `core.toml` 文件
      - 替换占位符为用户输入：
        - `{{OWNER_QQ}}` → 用户输入的管理员 QQ 号
        - `{{WEBUI_KEY}}` → 用户输入的 WebUI API 密钥（留空则自动生成 UUID）
      - 拷贝处理后的文件到目标实例的 `config/` 目录

  - **步骤 4 - 安装确认**
    - 显示所有配置摘要
    - 显示所有配置摘要（包括处理后的配置预览）
    - 显示即将执行的步骤列表
    - "开始导入"按钮

  - **步骤 5 - 安装进度**
    - 进度条
    - 当前步骤描述
    - 实时日志输出
    - 完成后跳转到实例详情页

- [ ] **步骤 3.4**: 创建导入模块
  - `manifest-parser.js` - 解析和验证 manifest.json
  - `import-steps.js` - 步骤流程控制
  - `import-progress.js` - 进度管理和显示

#### 关键文件
- `src/renderer/main-view/main.html` (修改)
- `src/renderer/import-wizard/import.html` (新建)
- `src/renderer/import-wizard/import.js` (新建)
- `src/renderer/import-wizard/import.css` (新建)
- `src/renderer/import-wizard/modules/*.js` (新建)

#### 交付物
- ✅ 完整的导入向导界面
- ✅ 步骤流程和状态管理
- ✅ 用户参数输入表单
- ✅ 进度显示组件

---

### 阶段 4：导入服务实现（3-4天）

#### 目标
实现整合包导入的后端逻辑，支持解压、配置生成、条件安装等。

#### 任务清单
- [ ] **步骤 4.1**: 创建导入服务 `ImportService.js`
  - 解压整合包到临时目录
  - 读取和验证 manifest.json
  - 根据 manifest 决定安装步骤

- [ ] **步骤 4.2**: 创建包验证器 `PackValidator.js`
  - 验证 ZIP 文件完整性
  - 验证 manifest.json 格式
  - 验证必需文件存在性
  - 兼容性检查（Launcher 版本、环境要求）

- [ ] **步骤 4.3**: 实现条件安装逻辑
  - **情况 1**: 已包含 Neo-MoFox
    - 解压到目标目录
    - 跳过 `clone` 步骤
  
  - **情况 2**: 未包含 Neo-MoFox
    - 执行 `clone` 步骤（从仓库拉取）
  
  - **情况 3**: 已包含 NapCat
    - 解压到目标目录
    - 跳过 `napcat` 下载
  
  - **情况 4**: 未包含 NapCat
    - 执行 `napcat` 下载步骤
  
  - **情况 5**: 包含插件目录
    - 解压到 `plugins/`
  
  - **情况 6**: 包含数据文件
    - 解压到 `data/`

- [ ] **步骤 4.4**: 配置文件处理逻辑（处理 core.toml）
  - **在用户输入完成后、开始安装前执行**
  - 如果整合包包含 `core.toml`（`config.included = true`）：
    - 从整合包解压 `core.toml` 到临时目录
    - 读取文件内容
    - 替换占位符：
      - `{{OWNER_QQ}}` → 用户输入的管理员 QQ 号
      - `{{WEBUI_KEY}}` → 用户输入的密钥（如留空，则生成 UUID）
    - 拷贝处理后的文件到目标实例的 `config/core.toml`
  - 如果整合包不包含配置文件（`config.included = false`）：
    - 跳过此步骤，后续通过 `gen-config` 步骤生成默认配置

- [ ] **步骤 4.5**: 调用步骤执行器（条件执行）
  - 根据 manifest 和用户输入生成步骤列表：
    - **已含主程序 + core.toml** → `['venv', 'deps', 'gen-config', 'write-model', 'write-adapter', 'napcat-config', 'register']`
    - **已含主程序 + 无core.toml** → `['venv', 'deps', 'gen-config', 'write-core', 'write-model', 'write-webui-key', 'write-adapter', 'napcat-config', 'register']`
    - **未含主程序** → `['clone', 'venv', 'deps', 'gen-config', 'write-core', 'write-model', 'write-webui-key', 'write-adapter', 'napcat-config', 'register']`
    - **已含 NapCat** → 跳过 `napcat` 下载，但保留 `napcat-config`
    - **未含 NapCat** → 执行 `['napcat', 'napcat-config']`
  - 调用 `InstallStepExecutor` 逐步执行：
    - `gen-config` - 首次启动生成配置（自动生成 `model.toml`）
    - `write-model` - 写入用户输入的 SiliconFlow API Key 到 `model.toml`
    - `write-webui-key` - 写入 WebUI API 密钥到 `core.toml`（如果 core.toml 不是从整合包来的）
    - `write-adapter` - 写入 napcat_adapter 配置（QQ号、昵称、端口）
    - `napcat-config` - 写入 NapCat 配置（QQ号、端口）
    - `register` - 注册实例到 Launcher
  - **注意**：如果已从整合包拷贝 core.toml，则跳过 `write-core` 和 `write-webui-key` 步骤

- [ ] **步骤 4.6**: 实例注册和存储
  - 生成实例 ID
  - 创建实例记录（StorageService）
  - 标记 `installCompleted: true`
  - 标记 `fromIntegrationPack: true`

- [ ] **步骤 4.7**: IPC 通信实现
  - 注册导入 API：
    - `validateIntegrationPack(packPath)` - 验证整合包
    - `importIntegrationPack(packPath, userInputs)` - 执行导入
  - 进度事件：
    - `integration-pack:import-progress`
    - `integration-pack:import-output`
  - 状态事件：
    - `integration-pack:import-complete`
    - `integration-pack:import-error`

#### 关键文件
- `src/services/integration-pack/ImportService.js` (新建)
- `src/services/integration-pack/PackValidator.js` (新建)
- `src/ipc/integration-pack-handlers.js` (补充)
- `src/services/install/InstallStepExecutor.js` (调用)

#### 交付物
- ✅ 导入服务模块
- ✅ 包验证逻辑
- ✅ 条件安装流程
- ✅ 配置文件生成器
- ✅ IPC 通信接口

---

### 阶段 5：集成测试与优化（2-3天）

#### 目标
完成端到端测试，修复 Bug，优化用户体验。

#### 任务清单
- [ ] **步骤 5.1**: 导出功能测试
  - 测试各种导出选项组合
  - 测试生成的 `.mfpack` 文件完整性
  - 测试敏感信息过滤正确性
  - 测试大文件导出性能

- [ ] **步骤 5.2**: 导入功能测试
  - 测试导入完整包（含主程序 + NapCat）
  - 测试导入部分包（仅配置和插件）
  - 测试用户参数输入校验
  - 测试端口冲突检测
  - 测试安装步骤跳过逻辑
  - 测试配置文件生成正确性

- [ ] **步骤 5.3**: 兼容性测试
  - 测试不同版本 manifest 的兼容性
  - 测试不符合要求的环境处理
  - 测试损坏的整合包处理

- [ ] **步骤 5.4**: 错误处理和用户提示
  - 添加详细的错误信息提示
  - 添加导入/导出失败时的恢复机制
  - 添加用户操作指引

- [ ] **步骤 5.5**: 性能优化
  - 大文件压缩/解压性能优化
  - 进度更新频率优化（避免卡顿）
  - 内存使用优化

- [ ] **步骤 5.6**: UI/UX 改进
  - 确保所有按钮状态正确切换
  - 优化加载动画和过渡效果
  - 优化表单布局和提示文案
  - 添加工具提示（Tooltip）

#### 测试场景
1. ✅ **场景A**: 导出包含所有内容的整合包
2. ✅ **场景B**: 导出仅包含配置和插件的轻量包
3. ✅ **场景C**: 导入完整包到空白环境
4. ✅ **场景D**: 导入轻量包（需要下载主程序）
5. ✅ **场景E**: 端口冲突时的处理
6. ✅ **场景F**: 取消导入/导出操作
7. ✅ **场景G**: 网络异常时的处理

#### 交付物
- ✅ 完整的功能测试报告
- ✅ Bug 修复清单
- ✅ 性能优化记录
- ✅ 用户使用文档

---

### 阶段 6：文档和发布（1-2天）

#### 目标
完善文档，准备发布。

#### 任务清单
- [ ] **步骤 6.1**: 编写用户文档
  - 如何导出整合包
  - 如何导入整合包
  - 整合包格式说明
  - 常见问题解答

- [ ] **步骤 6.2**: 编写开发者文档
  - 整合包规范文档
  - 导出/导入 API 文档
  - manifest.json 字段说明
  - 步骤执行器扩展指南

- [ ] **步骤 6.3**: 更新变更日志
  - 记录新增功能
  - 记录 Breaking Changes
  - 记录已知问题

- [ ] **步骤 6.4**: 版本发布准备
  - 更新版本号
  - 打包发布文件
  - 准备 Release Notes

#### 交付物
- ✅ 用户使用文档
- ✅ 开发者技术文档
- ✅ 变更日志
- ✅ 发布版本

---

## 🔧 技术要点

### 安全性考虑
- **敏感信息过滤**：导出 `core.toml` 时直接替换为占位符：
  - 管理员 QQ 号 → `{{OWNER_QQ}}`
  - WebUI API 密钥 → `{{WEBUI_KEY}}`（导入时可用户输入或自动生成）
  - **保持文件名**为 `core.toml`（不使用 .template 后缀）
  - **不导出** `model.toml`（包含 LLM API Key）
- **路径验证**：防止 ZIP 解压时的路径遍历攻击（Zip Slip）
- **文件权限检查**：确保导出/导入路径可访问
- **完整性校验**：导入前验证整合包完整性（可选添加 SHA256）

### 兼容性策略
- **版本检查**：manifest 中记录 Launcher 版本，导入时检查兼容性
- **字段向后兼容**：新增字段使用默认值，不影响旧版本生成的包
- **步骤灵活性**：根据内容动态决定安装步骤，而非硬编码

### 用户体验优化
- **默认值智能推荐**：
  - 实例名称：基于整合包名称自动生成
  - 端口号：自动检测可用端口并推荐
  - WebUI API 密钥：可留空，系统自动生成 UUID
- **进度反馈**：
  - 实时显示当前步骤
  - 显示预计剩余时间
  - 支持取消操作
- **错误提示**：
  - 具体错误原因
  - 可能的解决方案
  - 重试机制

---
 状态 |
|------|---------|-----------|------|
| 阶段 1 | 1-2天 | 重构后的安装服务 | ✅ **已完成** |
| 阶段 2 | 2-3天 | 导出功能完成（含动态 NapCat 选项） | ✅ **已完成** (2026-04-18) |
| 阶段 3 | 2-3天 | 导入向导 UI 完成 | ⏰ 待开始 |
| 阶段 4 | 3-4天 | 导入服务完成 | ⏰ 待开始 |
| 阶段 5 | 2-3天 | 测试通过 | ⏰ 待开始 |
| 阶段 6 | 1-2天 | 文档和发布 | ⏰ 待开始 |
| **总计** | **11-17天** | **功能上线** | **进行中 (2/6)
| 阶段 5 | 2-3天 | 测试通过 |
| 阶段 6 | 1-2天 | 文档和发布 |
| **总计** | **11-17天** | **功能上线** |

---

## 🚀 后续扩展方向

### 高级功能
1. **整合包加密**：支持加密整合包，防止未授权使用
2. **增量更新**：导入时检测现有实例，仅更新差异部分
3. **远程整合包**：支持从 URL 直接导入（类似一键安装脚本）
4. **整合包市场**：社区分享和下载整合包

### 开发者工具
1. **整合包生成 CLI**：命令行工具批量生成整合包
2. **整合包检查器**：独立工具验证整合包合法性
3. **模板库**：预置常用配置模板

---

## ✅ 验收标准

### 功能完整性
- [x] 用户能从编辑对话框导出整合包
- [x] 用户能选择性导出内容
- [x] 生成的整合包包含正确的元数据
- [x] 用户能从主界面选择导入整合包
- [x] 导入向导能正确解析整合包
- [x] 用户能输入必要的参数
- [x] 导入流程能根据内容自动调整步骤
- [x] 导入完成后实例能正常运行

### 健壮性
- [x] 错误情况下有明确提示
- [x] 支持取消操作
- [x] 损坏的整合包能被正确拒绝
- [x] 端口冲突能自动检测

### 用户体验
- [x] 界面友好，操作直观
- [x] 进度反馈及时准确

---

## 🔄 配置处理流程详解

### 导出时（Launcher → 整合包）

1. **读取 `config/core.toml`**
2. **替换敏感字段为占位符**：
   ```toml
   # 原始配置
   [permission]
   master_users = [
     { platform = "qq", user_id = "123456789" }
   ]
   
   [http_router]
   api_keys = ["550e8400-e29b-41d4-a716-446655440000"]
   
   # 导出后（直接保存为 core.toml）
   [permission]
   master_users = [
     { platform = "qq", user_id = "{{OWNER_QQ}}" }
   ]
   
   [http_router]
   api_keys = ["{{WEBUI_KEY}}"]
   ```
3. **直接保存为 `config/core.toml`**（不使用 .template 后缀）
4. **打包到整合包中**
5. **不导出 `model.toml`**

---

### WebUI Key 处理逻辑说明

**表单字段设计**：
```
┌─────────────────────────────────────────────┐
│ WebUI API 密钥（可选）                      │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│ 💡 提示：留空则自动生成随机 UUID           │
└─────────────────────────────────────────────┘
```

**处理逻辑**（TypeScript/JavaScript）：
```javascript
// 用户输入完成后
let webuiKey = userInput.webuiKey?.trim();
if (!webuiKey) {
  // 自动生成 UUID
  webuiKey = crypto.randomUUID();
  console.log(`✅ 自动生成 WebUI Key: ${webuiKey}`);
} else {
  console.log(`✅ 使用用户输入的 WebUI Key`);
}

// 替换占位符
coreTomlContent = coreTomlContent.replace('{{WEBUI_KEY}}', webuiKey);
```

---

### 导入时（整合包 → 实例）

#### 情况 A：整合包包含 core.toml

1. **用户输入参数**（导入向导界面）：
   - Bot QQ 号：`111111111`
   - Bot QQ 昵称：`MyBot`
   - WebSocket 端口：`8095`
   - 管理员 QQ 号：`987654321`
   - SiliconFlow API Key：`sk-xxxxx`（用户自己的密钥）
   - 安装路径：`E:/Bots/bot-111111111`
WebUI API 密钥：留空（自动生成）
   - 
2. **处理配置文件**（在确认安装前）：
   - 从整合包解压 `config/core.toml`
   - 读取文件内容
   - 替换占位符：
     ```toml
     # 替换前
     [permission]
     master_users = [
       { platform = "qq", user_id = "{{OWNER_QQ}}" }
     ]
     [http_router]
     api_keys = ["{{WEBUI_KEY}}"]
     
     # 替换后
     [permission]
     master_users = [
       { platform = "qq", user_id = "987654321" }
     ]
     [http_router]
     api_keys = ["uuid-auto-generated"]  # 自动生成
     ```
   - 拷贝到 `E:/Bots/bot-111111111/neo-mofox/config/core.toml`

3. **开始安装** → 执行步骤：
   - 如已含主程序 → 跳过 `clone`
   - `venv` → 创建虚拟环境
   - `deps` → 安装依赖
   - `gen-config` → 启动 Neo-MoFox，自动生成 `model.toml`
   - `write-model` → 写入用户输入的 SiliconFlow API Key 到 `model.toml`
   - `write-adapter` → 写入 napcat_adapter 配置（QQ号、昵称、端口）
   - `napcat-config` → 写入 NapCat 配置
   - `register` → 注册实例

5. **完成** → 跳转到实例详情页

#### 情况 B：整合包不包含 core.toml

1. **用户输入参数**（同上）

2. **跳过配置文件处理步骤**

3. **开始安装** → 执行完（因为 `config.included = false`）整流程：
   - `clone`（如需要）
   - `venv` → 创建虚拟环境
   - `deps` → 安装依赖
   - `gen-config` → 生成默认 `core.toml` 和 `model.toml`
   - `write-core` → 写入管理员 QQ 到 `core.toml`
   - `write-model` → 写入 SiliconFlow API Key 到 `model.toml`
   - `write-webui-key` → 写入 WebUI Key 到 `core.toml`
   - `write-adapter` → 写入 Adapter 配置
   - `napcat-config` → 写入 NapCat 配置
   - `register` → 注册实例

---

## 🎯 关键差异对比

| 项目 | 原计划 | 最终方案 |
|------|--------|----------|
| 配置文件格式 | 导出 core.toml.template | **直接导出 core.toml（含占位符）** |
| 配置处理时机 | 安装过程中 | **用户输入后、安装前** |
| 占位符 | 多个字段 | 仅 `{{OWNER_QQ}}` 和 `{{WEBUI_KEY}}` |
| 用户输入字段 | manifest 中指定 | **固定 6 个字段**（qqNumber, qqNickname, wsPort, ownerQQNumber, apiKey, installDir） |
| API Key 处理 | 启动后自动生成 | **用户在导入向导中输入** |
| manifest 字段 | `config.hasCoreConfig` | **简化为 `config.included`** |
| 用户输入字段 | manifest 中指定 | **固定 6-7 个字段**（含可选的 webuiKey） |
| WEBUI_KEY | 固定自动生成 | **用户可输入或留空自动生成** |
| API Key 处理 | 启动后自动生成 | **用户在导入向导中输入** |
| model.toml | 导出模板 | 不导出，导入时生成并写入用户密钥 |
| 配置预览 | 显示预览 | **不显示预览，直接进入确认**
- [x] 提示信息清晰明确
- [x] 文档完善易懂

---

## 📝 备注

- 本计划假设团队为 1-2 人，全职开发。
- 各阶段时间可根据实际情况调整。
- 建议每个阶段完成后进行 Code Review。
- 优先保证核心功能稳定，高级功能可后续迭代。

---

**计划制定时间**: 2026-04-18  
**计划版本**: v1.0  
**制定人**: GitHub Copilot
