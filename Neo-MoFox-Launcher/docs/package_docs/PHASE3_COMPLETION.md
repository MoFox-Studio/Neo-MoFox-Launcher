# Phase 3 完成文档 - 导入向导 UI 开发

**日期**：2026-04-18  
**版本**：1.0.0  
**作者**：AI Agent  
**项目**：Neo-MoFox Launcher - Integration Pack Import Wizard UI

---

## 📋 概述

本文档记录 **Phase 3: 导入向导 UI 开发** 的完成情况，实现了整合包导入的完整前端界面和交互逻辑。

### Phase 3 目标回顾

根据 `integration-pack-implementation-plan.md`，Phase 3 的目标是：

> 创建独立的导入向导界面，支持整合包解析和用户参数输入。

**核心成果**：
1. ✅ 创建完整的导入向导界面（5 个步骤）
2. ✅ 实现安全警告横幅（免责声明）
3. ✅ 集成环境检测流程
4. ✅ 实现用户配置表单（带验证）
5. ✅ 实现安装确认摘要页面
6. ✅ 实现安装进度和日志显示
7. ✅ 修改主界面入口（选择对话框）

---

## 🏗️ 架构实现详情

### 1. 新增文件

| 文件路径 | 行数 | 描述 |
|---------|------|------|
| `src/renderer/import-wizard/import.html` | ~490 | 导入向导主页面（5步骤完整结构） |
| `src/renderer/import-wizard/import.css` | ~540 | 导入向导专用样式（安全警告、文件选择器、摘要页面等） |
| `src/renderer/import-wizard/import.js` | ~950 | 导入向导核心逻辑（状态管理、表单验证、步骤控制） |
| `docs/package_docs/PHASE3_COMPLETION.md` | ~450 | 本文档 |

**总计**：~2430 行新增代码 + 文档

### 2. 修改文件

| 文件路径 | 变更类型 | 行数变化 | 描述 |
|---------|---------|---------|------|
| `src/renderer/main-view/main.js` | 新增功能 | +130 行 | 添加 `showAddInstanceDialog()` 方法，实现选择对话框 |

---

## 🎨 界面设计

### 导入向导步骤流程

```
步骤 1: 选择整合包
  ├─ 安全警告横幅（醒目的红色脉冲动画）
  ├─ 文件选择器（支持 .mfpack 格式）
  └─ 整合包信息预览（解析后自动显示）

步骤 2: 环境检测
  ├─ Python 检测
  ├─ uv 检测
  └─ Git 检测

步骤 3: 用户配置
  ├─ 实例名称
  ├─ Bot QQ 号（5-12 位数字验证）
  ├─ Bot QQ 昵称
  ├─ 管理员 QQ 号（5-12 位数字验证）
  ├─ SiliconFlow API Key（密码框 + 显示/隐藏切换）
  ├─ WebSocket 端口（1024-65535 验证）
  ├─ WebUI API 密钥（可选，自动生成）
  └─ 安装路径（浏览按钮）

步骤 4: 安装确认
  ├─ 整合包信息摘要
  ├─ 包含内容清单（图标化显示）
  ├─ 实例配置摘要
  └─ 安装步骤预览（动态生成）

步骤 5: 安装执行
  ├─ 进度条（百分比显示）
  ├─ 当前步骤描述
  ├─ 实时日志输出（可展开/折叠）
  ├─ 步骤指示器（悬浮面板）
  └─ 安装结果（成功/失败）
```

### 关键 UI 组件

#### 1. 安全警告横幅

**设计亮点**：
- 醒目的红色边框 + 脉冲动画（2秒循环）
- 警告图标（48px，红色背景）
- 明确的免责声明文本
- 安全检查清单（3 条建议）

**CSS 动画**：
```css
@keyframes warningPulse {
  0%, 100% {
    border-color: rgba(var(--md-sys-color-error-rgb), 0.3);
    box-shadow: 0 0 0 0 rgba(var(--md-sys-color-error-rgb), 0.4);
  }
  50% {
    border-color: rgba(var(--md-sys-color-error-rgb), 0.5);
    box-shadow: 0 0 0 8px rgba(var(--md-sys-color-error-rgb), 0);
  }
}
```

**警告内容**：
```
⚠️ 安全警告

请仅导入来自可信来源的整合包。恶意整合包可能包含有害代码，
导致数据泄露、系统损坏或其他安全风险。

MoFox Studio 不对因导入非官方整合包导致的任何损失负责。

导入前请确认：
✓ 整合包来源是否可信
✓ 整合包作者是否可靠
✓ 是否有其他用户验证过此整合包的安全性
```

#### 2. 文件选择器

**特性**：
- 虚线边框，悬停时变为实线 + 高亮
- 大图标 + 提示文字
- 点击触发文件选择对话框
- 自动过滤 `.mfpack` 文件

**选择后自动显示**：
- 文件名（带文件图标）
- 解析状态（加载动画）
- 整合包元数据（版本、作者、描述、创建时间）
- 包含内容列表（图标化卡片）

#### 3. 整合包信息卡片

**显示内容**：
- Neo-MoFox（版本号）
- NapCat（版本号 或 "导入时自动下载安装"）
- 配置文件（core.toml）
- 插件（数量统计）
- 数据文件

**徽章样式**：
- 已内置：蓝色徽章
- 自动安装：紫色徽章

#### 4. 用户配置表单

**输入验证**：
- 实例名称：非空
- QQ 号：5-12 位数字（正则 `/^\d{5,12}$/`）
- Bot 昵称：非空
- 管理员 QQ：5-12 位数字
- API Key：非空
- WebSocket 端口：1024-65535
- 安装路径：非空

**增强功能**：
- 密码显示/隐藏切换（眼睛图标）
- WebUI 密钥自动生成（32 位随机字符串）
- 密码强度指示器（弱/中等/强，彩色进度条）
- 回车键智能跳转（最后一个输入框按回车进入下一步）

#### 5. 安装确认摘要

**布局**：
- 4 个摘要区块（网格布局）
- 标签化内容展示（图标 + 文字）
- 步骤列表预览（箭头图标）

**动态生成步骤列表**：
```javascript
function generateInstallSteps(content) {
  const steps = ['extract-pack'];
  
  if (!content.neoMofox?.included) {
    steps.push('clone');
  }
  
  steps.push('venv', 'deps', 'gen-config');
  
  if (!content.config?.included) {
    steps.push('write-core');
  }
  
  steps.push('write-model', 'write-adapter');
  
  if (!content.napcat?.included) {
    if (content.napcat?.installOnImport) {
      steps.push('napcat');
    }
  }
  
  steps.push('napcat-config', 'register');
  
  return steps;
}
```

#### 6. 安装进度界面

**组件**：
- 主进度条（宽度动态变化）
- 当前步骤文本（实时更新）
- 百分比显示（圆角标签）
- 日志输出区（可折叠，最大高度 400px）
- 步骤指示器（固定悬浮在右侧，仅桌面端显示）

**步骤指示器状态**：
- `pending`：灰色图标
- `running`：蓝色旋转图标
- `completed`：绿色对勾图标
- `failed`：红色错误图标

---

## 🔧 核心功能实现

### 1. 状态管理

```javascript
const state = {
  currentStep: 1,          // 当前步骤
  totalSteps: 5,           // 总步骤数
  
  packPath: null,          // 整合包文件路径
  packManifest: null,      // 整合包元数据
  
  envCheckPassed: false,   // 环境检测是否通过
  pythonCmd: null,         // Python 命令
  
  inputs: {                // 用户输入
    instanceName: '',
    qqNumber: '',
    qqNickname: '',
    ownerQQNumber: '',
    apiKey: '',
    wsPort: 8095,
    webuiApiKey: '',
    installDir: '',
  },
  
  installing: false,       // 是否正在安装
  installSteps: [],        // 安装步骤列表
};
```

### 2. 步骤导航逻辑

**前进验证**：
- 步骤 1：必须选择整合包
- 步骤 2：环境检测必须通过
- 步骤 3：表单验证必须通过
- 步骤 4：显示摘要
- 步骤 5：自动开始安装

**后退限制**：
- 步骤 1 和步骤 5 不显示"上一步"按钮

### 3. 整合包解析

**API 调用**：
```javascript
const result = await window.mofoxAPI.parseIntegrationPack(packPath);
```

**解析后操作**：
1. 保存 manifest 到 state
2. 显示整合包信息
3. 自动填充实例名称（使用 `packName`）
4. 生成内容列表

**错误处理**：
- 捕获解析错误并显示错误信息
- 清空 `packPath` 和 `packManifest`
- 允许用户重新选择

### 4. 环境检测集成

**复用现有 API**：
```javascript
const result = await window.mofoxAPI.checkEnvironment();
```

**检测项目**：
- Python（存储命令供后续使用）
- uv
- Git

**UI 更新**：
- ✅ 绿色对勾 + 版本号
- ❌ 红色叉号 + "未安装"

### 5. 表单验证

**验证函数**：
```javascript
function validateInputs() {
  let isValid = true;
  
  // 逐项验证
  if (!el.inputInstanceName.value.trim()) {
    showFieldError(el.inputInstanceName, '请输入实例名称');
    isValid = false;
  }
  
  const qqNumber = el.inputQqNumber.value.trim();
  if (!qqNumber) {
    showFieldError(el.inputQqNumber, '请输入 Bot QQ 号');
    isValid = false;
  } else if (!/^\d{5,12}$/.test(qqNumber)) {
    showFieldError(el.inputQqNumber, 'QQ 号必须为 5-12 位数字');
    isValid = false;
  }
  
  // ... 其他验证
  
  return isValid;
}
```

**错误显示**：
- 表单组添加 `error` 类（红色边框）
- 提示文字变为错误信息（红色）
- 自动聚焦到第一个错误输入框

**错误清除**：
- 输入框获得焦点时自动清除错误状态
- 恢复原始提示文字

### 6. 密码强度评估

**评分规则**：
- 长度 ≥8：+10 分
- 长度 ≥12：+10 分
- 长度 ≥16：+10 分
- 长度 ≥20：+10 分
- 包含小写字母：+15 分
- 包含大写字母：+15 分
- 包含数字：+15 分
- 包含特殊字符：+15 分

**强度等级**：
- 0-39 分：弱（红色）
- 40-69 分：中等（橙色）
- 70-100 分：强（绿色）

**UI 显示**：
- 彩色进度条（宽度 = 分数%）
- 文字提示："密码强度: 弱/中等/强"

### 7. 安装步骤生成

**逻辑**：
```javascript
function generateInstallSteps(content) {
  const steps = ['extract-pack'];  // 始终解压整合包
  
  // 如果整合包不包含 Neo-MoFox，需要克隆
  if (!content.neoMofox?.included) {
    steps.push('clone');
  }
  
  // 必须步骤
  steps.push('venv', 'deps', 'gen-config');
  
  // 如果整合包不包含配置文件，需要写入 core.toml
  if (!content.config?.included) {
    steps.push('write-core');
  }
  
  // 始终写入 model.toml 和适配器配置
  steps.push('write-model', 'write-adapter');
  
  // 如果整合包不包含 NapCat 但设置了自动安装
  if (!content.napcat?.included && content.napcat?.installOnImport) {
    steps.push('napcat');
  }
  
  // 始终配置 NapCat 和注册实例
  steps.push('napcat-config', 'register');
  
  return steps;
}
```

**步骤描述映射**：
```javascript
const descriptions = {
  'extract-pack': '解压整合包文件',
  'clone': '克隆 Neo-MoFox 仓库',
  'venv': '创建 Python 虚拟环境',
  'deps': '安装 Python 依赖',
  'gen-config': '生成配置文件',
  'write-core': '写入 core.toml',
  'write-model': '写入 model.toml',
  'write-adapter': '写入适配器配置',
  'napcat': '安装 NapCat',
  'napcat-config': '配置 NapCat',
  'register': '注册实例',
};
```

### 8. 事件监听

**进度事件**：
```javascript
window.mofoxAPI.onImportProgress?.(({ percent, message }) => {
  updateProgress(percent, message);
});
```

**输出事件**：
```javascript
window.mofoxAPI.onImportOutput?.((message) => {
  appendLog(message);
});
```

**步骤变化事件**：
```javascript
window.mofoxAPI.onImportStepChange?.(({ step, status }) => {
  updateStepIndicator(step, status);
});
```

**完成事件**：
```javascript
window.mofoxAPI.onImportComplete?.(({ success, instanceId, error }) => {
  onInstallComplete(success, instanceId, error);
});
```

---

## 🎨 样式设计亮点

### 1. 复用现有样式

通过 `@import` 复用安装向导样式：
```css
@import url('../install-wizard/wizard.css');
```

保证界面风格一致性，减少代码重复。

### 2. 安全警告动画

**脉冲效果**：
- 边框颜色从 30% 到 50% 透明度循环
- 阴影从 0px 扩散到 8px 并淡出
- 2 秒无限循环

**视觉层次**：
- 红色图标（48px）+ 背景
- 加粗标题（红色）
- 正文（黑色）
- 重点文字（红色加粗）
- 清单（灰色）

### 3. 整合包信息卡片

**滑入动画**：
```css
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**卡片结构**：
- 头部：蓝色背景 + 图标 + 文件名
- 主体：元数据网格 + 内容列表
- 分隔线：淡色边框

### 4. 摘要页面布局

**网格系统**：
- 2 列网格（响应式调整为 1 列）
- 16px 间距
- 自动换行

**标签样式**：
- 小写字母 + 0.5px 字间距
- 灰色背景
- 圆角标签

### 5. 步骤指示器（悬浮）

**定位**：
- `position: fixed`
- 右上角（距顶部 120px，右侧 48px）
- `z-index: 10`

**响应式隐藏**：
```css
@media (max-width: 1200px) {
  .install-steps {
    display: none;
  }
}
```

---

## 📱 响应式设计

### 移动端适配

**断点**：
- 768px：切换到移动布局
- 1200px：隐藏步骤指示器

**移动端变化**：
```css
@media (max-width: 768px) {
  .wizard-container {
    flex-direction: column;  /* 垂直布局 */
  }
  
  .wizard-sidebar {
    width: 100%;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  
  .wizard-steps {
    flex-direction: row;   /* 水平滚动 */
    overflow-x: auto;
  }
  
  .summary-grid {
    grid-template-columns: 1fr;  /* 单列 */
  }
}
```

---

## 🔌 预期 API 接口

### 需要后端实现的 API

#### 1. 选择整合包文件
```javascript
window.mofoxAPI.selectIntegrationPack()
// 返回: { success: boolean, filePath: string, fileName: string }
```

#### 2. 解析整合包
```javascript
window.mofoxAPI.parseIntegrationPack(packPath)
// 返回: { success: boolean, manifest: Object, error?: string }
```

#### 3. 环境检测（已存在）
```javascript
window.mofoxAPI.checkEnvironment()
// 返回: { python: {...}, uv: {...}, git: {...}, allPassed: boolean }
```

#### 4. 获取默认安装路径
```javascript
window.mofoxAPI.getDefaultInstallPath()
// 返回: { success: boolean, path: string }
```

#### 5. 选择目录
```javascript
window.mofoxAPI.selectDirectory()
// 返回: { success: boolean, path: string }
```

#### 6. 导入整合包
```javascript
window.mofoxAPI.importIntegrationPack({
  packPath: string,
  manifest: Object,
  inputs: Object,
  pythonCmd: string,
})
// 返回: { success: boolean, instanceId?: string, error?: string }
```

### 事件监听（需要实现）

#### 1. 导入进度
```javascript
window.mofoxAPI.onImportProgress(callback)
// 回调参数: { percent: number, message: string }
```

#### 2. 导入输出
```javascript
window.mofoxAPI.onImportOutput(callback)
// 回调参数: string (日志消息)
```

#### 3. 步骤变化
```javascript
window.mofoxAPI.onImportStepChange(callback)
// 回调参数: { step: string, status: 'running'|'completed'|'failed' }
```

#### 4. 导入完成
```javascript
window.mofoxAPI.onImportComplete(callback)
// 回调参数: { success: boolean, instanceId?: string, error?: string }
```

---

## 🔄 主界面集成

### 新增实例选择对话框

**触发**：点击"新增实例"按钮

**显示内容**：
1. **从头安装**
   - 图标：🔧 (construction)
   - 描述：完整配置一个全新的 Neo-MoFox 实例
   - 操作：跳转到 `wizard.html`

2. **从整合包导入**
   - 图标：📦 (package_2)
   - 描述：快速部署预配置的实例
   - 操作：跳转到 `import.html`

**交互**：
- 卡片悬停高亮 + 轻微右移
- 点击卡片直接跳转
- ESC 键或点击背景关闭
- "取消"按钮关闭

**样式注入**：
- 动态创建 `<style>` 标签
- ID: `install-option-styles`
- 避免重复注入

---

## ✅ 功能清单

### UI 组件

- [x] 5 步骤侧边栏导航
- [x] 安全警告横幅（脉冲动画）
- [x] 文件选择器（支持 .mfpack）
- [x] 整合包信息卡片（元数据 + 内容列表）
- [x] 环境检测面板（3 项检测）
- [x] 用户配置表单（8 个输入项）
- [x] 密码显示/隐藏切换
- [x] 密码强度指示器
- [x] WebUI 密钥自动生成
- [x] 安装确认摘要（4 个区块）
- [x] 进度条 + 百分比显示
- [x] 日志输出（可折叠）
- [x] 步骤指示器（悬浮面板）
- [x] 安装结果显示（成功/失败）

### 交互逻辑

- [x] 步骤前进验证
- [x] 步骤后退控制
- [x] 整合包解析
- [x] 环境检测执行
- [x] 表单验证（实时错误提示）
- [x] 回车键智能跳转
- [x] 输入框焦点清除错误
- [x] 安装步骤动态生成
- [x] 进度和日志实时更新
- [x] 步骤指示器状态变化
- [x] 重试功能（失败时）
- [x] 完成后关闭

### 主界面集成

- [x] 新增实例选择对话框
- [x] 卡片式选项布局
- [x] 跳转到导入向导
- [x] 跳转到安装向导
- [x] ESC 键关闭对话框

---

## 📊 代码统计

| 指标 | 数量 |
|------|------|
| 新增文件数 | 3 个（HTML + CSS + JS） |
| 修改文件数 | 1 个（main.js） |
| HTML 行数 | ~490 行 |
| CSS 行数 | ~540 行 |
| JavaScript 行数 | ~950 行 |
| 主界面修改 | +130 行 |
| **总计代码行数** | **~2110 行** |
| 文档行数 | ~450 行（本文档） |

---

## 🧪 建议测试场景

### 场景 A：完整导入流程

**步骤**：
1. 点击"新增实例"
2. 选择"从整合包导入"
3. 选择有效的 `.mfpack` 文件
4. 查看整合包信息是否正确显示
5. 点击"下一步"，查看环境检测
6. 填写所有配置项
7. 点击"下一步"，查看摘要
8. 确认信息无误后开始导入
9. 观察进度和日志
10. 导入成功后点击"完成"

**预期结果**：
- 每一步都能正常跳转
- 信息显示准确
- 进度条流畅更新
- 日志实时输出
- 成功提示正常显示

### 场景 B：表单验证

**步骤**：
1. 到达步骤 3（用户配置）
2. 不填写任何内容，直接点击"下一步"
3. 应显示第一个错误输入框的提示
4. 填写错误格式的 QQ 号（如 "123"）
5. 应显示格式错误提示
6. 依次测试所有输入项

**预期结果**：
- 空值验证正常
- 格式验证正常（QQ 号、端口）
- 错误提示清晰
- 错误状态可清除

### 场景 C：环境检测未通过

**步骤**：
1. 假设系统缺少 uv
2. 到达步骤 2（环境检测）
3. 查看检测结果

**预期结果**：
- uv 显示红色叉号 + "未安装"
- 底部显示错误提示
- "下一步"按钮点击后提示"环境检测未通过"
- 无法继续

### 场景 D：整合包解析失败

**步骤**：
1. 选择一个损坏的 `.mfpack` 文件
2. 查看解析结果

**预期结果**：
- 显示错误图标和错误信息
- packPath 和 packManifest 被清空
- 可以重新选择文件

### 场景 E：安装失败重试

**步骤**：
1. 模拟安装过程中出错
2. 查看失败提示
3. 点击"重试"按钮

**预期结果**：
- 显示错误图标和错误信息
- "重试"和"取消"按钮可见
- 点击"重试"后重新开始安装
- 进度和日志被重置

### 场景 F：响应式测试

**步骤**：
1. 调整浏览器窗口到 768px 以下
2. 查看布局变化

**预期结果**：
- 侧边栏变为顶部水平布局
- 步骤图标水平排列
- 摘要网格变为单列
- 步骤指示器隐藏（移动端）

---

## 📋 Phase 4 准备工作

### Phase 4 目标

实现整合包**导入后端服务**，包括：
1. 创建 `ImportService.js`
2. 创建 `PackValidator.js`
3. 实现整合包解压和验证
4. 实现配置文件占位符替换
5. 实现条件安装步骤执行
6. 添加 IPC 通信处理器
7. 实现进度和日志事件推送

### 需要实现的 API

| API 名称 | 文件位置 | 描述 |
|---------|---------|------|
| `selectIntegrationPack` | main.js | 打开文件选择对话框 |
| `parseIntegrationPack` | ImportService.js | 解压并解析 manifest.json |
| `importIntegrationPack` | ImportService.js | 执行导入流程 |
| `validatePack` | PackValidator.js | 验证整合包完整性 |

### 需要实现的工具方法

| 方法名称 | 文件位置 | 描述 |
|---------|---------|------|
| `extractPack` | ImportService.js | 解压 .mfpack 到临时目录 |
| `processConfigPlaceholders` | ImportService.js | 替换 core.toml 占位符 |
| `copyNeoMofox` | ImportService.js | 复制主程序到安装目录 |
| `copyNapcat` | ImportService.js | 复制 NapCat 到安装目录 |
| `copyPlugins` | ImportService.js | 复制插件到安装目录 |
| `copyData` | ImportService.js | 复制数据文件到安装目录 |
| `generateStepList` | ImportService.js | 根据 manifest 生成安装步骤 |

### 复用现有资源

Phase 3 的成果为 Phase 4 提供了以下便利：

1. **UI 已完成**：前端逻辑无需修改，只需实现后端 API
2. **事件机制已定义**：进度、输出、步骤变化、完成事件
3. **步骤生成逻辑**：可复用前端的 `generateInstallSteps()` 逻辑
4. **参数结构已确定**：`inputs` 对象结构固定

---

## 🎯 关键成就

### 用户体验

1. ✅ 醒目的安全警告（免责声明）
2. ✅ 直观的 5 步向导流程
3. ✅ 实时的整合包信息预览
4. ✅ 友好的表单验证（错误提示清晰）
5. ✅ 智能的输入辅助（回车跳转、自动生成密钥）
6. ✅ 详细的安装确认摘要
7. ✅ 实时的进度和日志显示
8. ✅ 灵活的重试机制

### 技术亮点

1. **状态驱动架构**：集中式状态管理，逻辑清晰
2. **组件化设计**：每个步骤独立封装，易于维护
3. **事件驱动通信**：松耦合的前后端交互
4. **动态步骤生成**：根据整合包内容智能调整流程
5. **优雅的错误处理**：多层级错误捕获和提示
6. **响应式布局**：适配桌面和移动端
7. **无障碍设计**：键盘导航（回车、ESC）支持

### 代码质量

1. **注释清晰**：每个模块和函数都有注释
2. **命名规范**：驼峰式命名，语义化标识符
3. **代码复用**：复用安装向导样式，减少冗余
4. **可扩展性**：易于添加新步骤或验证规则
5. **性能优化**：事件监听只绑定一次，避免内存泄漏

---

## 📝 任务清单

### Phase 3 完成项

- [x] 创建 import.html（5 步向导结构）
- [x] 创建 import.css（完整样式）
- [x] 创建 import.js（核心逻辑）
- [x] 实现安全警告横幅
- [x] 实现文件选择器
- [x] 实现整合包信息显示
- [x] 实现环境检测集成
- [x] 实现用户配置表单
- [x] 实现表单验证
- [x] 实现密码强度评估
- [x] 实现安装确认摘要
- [x] 实现进度和日志显示
- [x] 实现步骤指示器
- [x] 修改主界面入口
- [x] 创建选择对话框
- [x] 编写 Phase 3 完成文档

### Phase 4 待办项

- [ ] 创建 ImportService.js
- [ ] 创建 PackValidator.js
- [ ] 实现整合包解压
- [ ] 实现 manifest 解析和验证
- [ ] 实现占位符替换逻辑
- [ ] 实现条件安装步骤执行
- [ ] 添加 IPC 处理器（main.js）
- [ ] 暴露 API（preload.js）
- [ ] 实现进度事件推送
- [ ] 实现步骤变化事件推送
- [ ] 测试完整导入流程

---

## 🔄 版本控制

### Git 提交建议

```bash
# 提交 Phase 3 成果
git add src/renderer/import-wizard/
git add src/renderer/main-view/main.js
git add docs/package_docs/PHASE3_COMPLETION.md

git commit -m "feat: Phase 3 - 导入向导 UI 开发

- 创建完整的导入向导界面（5 个步骤）
- 实现安全警告横幅（脉冲动画 + 免责声明）
- 实现整合包信息预览（元数据 + 内容列表）
- 实现用户配置表单（实时验证 + 智能跳转）
- 实现密码强度评估（彩色进度条）
- 实现安装确认摘要（动态步骤生成）
- 实现进度和日志显示（实时更新）
- 实现步骤指示器（悬浮面板）
- 修改主界面入口（选择对话框）

功能亮点：
- 醒目的安全警告（红色脉冲动画）
- 直观的步骤流程（5 步向导）
- 友好的表单验证（错误提示清晰）
- 实时的进度显示（进度条 + 日志）
- 响应式布局（适配桌面和移动端）

设计特点：
- 复用安装向导样式，保持界面一致性
- Material Design 3 风格
- 支持深色/浅色主题
- 平滑的过渡动画

Refs: #整合包功能 Phase 3"
```

---

## 👥 交接信息

### 给下一个 AI 的建议

1. **熟悉 UI 流程**：
   - 运行导入向导，体验完整流程
   - 理解每个步骤的用途和验证逻辑
   - 查看整合包信息的显示格式

2. **开始 Phase 4 前**：
   - 阅读 `import.js` 了解前端事件监听
   - 理解 `generateInstallSteps()` 的逻辑
   - 熟悉 Phase 2 的导出流程（反向操作）

3. **Phase 4 开发提示**：
   - 解压整合包使用 `yauzl` 或 `adm-zip` 库
   - 占位符替换需要 TOML 解析和序列化
   - 记得调用 `InstallStepExecutor` 执行安装步骤
   - 进度计算要考虑解压和文件复制的耗时
   - 实现步骤变化事件（`running` → `completed` → `failed`）

4. **关键文件位置**：
   - 导入向导：`src/renderer/import-wizard/import.html`
   - 导入逻辑：`src/renderer/import-wizard/import.js`
   - 导入样式：`src/renderer/import-wizard/import.css`
   - 主界面集成：`src/renderer/main-view/main.js`（`showAddInstanceDialog` 方法）

5. **前后端接口约定**：
   - 查看"预期 API 接口"章节
   - 事件参数格式必须与前端监听器匹配
   - 错误处理统一使用 `{ success, error }` 格式

6. **测试建议**：
   - 先测试整合包解析（步骤 1）
   - 再测试完整导入流程（步骤 5）
   - 最后测试各种边界情况（解析失败、安装失败）

---

## 📖 相关文档

- [Phase 2 完成文档](./PHASE2_COMPLETION.md) - 导出功能实现
- [整合包实施计划](./integration-pack-implementation-plan.md) - 总体规划
- [安装向导设计](../wizard/) - 参考现有向导设计

---

**Phase 3 状态**：✅ **UI 开发完成，待实现后端服务**

**下一步**：进入 Phase 4，实现 ImportService 和 PackValidator，完成后端导入逻辑。

---

**编写日期**：2026-04-18  
**最后更新**：2026-04-18  
**版本**：1.0.0
