# Material Design 3 主题系统使用指南

## 概述

启动器现已集成 Material Design 3 主题系统，使用 `@material/material-color-utilities` 库自动生成完整的 Material You 配色方案。

## 架构设计

### 后端（主进程）
- **ThemeService** (`src/services/theme/ThemeService.js`)
  - 使用 Material Color Utilities 计算主题
  - 生成 Light 和 Dark 两套完整配色
  - 将主题保存到 `{dataDir}/theme-computed.json`

### 前端（渲染进程）
- **theme-init.js** — 在页面加载时同步读取预计算主题，避免 FOUC
- **设置页面** — 调用 IPC API 更新主题

## API 使用

### 1. 获取当前主题

```javascript
// 异步获取
const result = await window.mofoxAPI.themeGet();
if (result.success) {
  const theme = result.theme;
  // theme.light - 浅色主题 CSS 变量
  // theme.dark - 深色主题 CSS 变量
  // theme.accentColor - 源颜色
  // theme.schemeType - 配色方案类型
}

// 同步获取（仅在初始化时使用）
const theme = window.mofoxAPI.themeGetSync();
```

### 2. 更新主题（用户更改设置时）

```javascript
// 当用户更改主题色或模式时
const settings = {
  theme: 'dark',           // 'light' | 'dark' | 'auto'
  accentColor: '#7c6bbd',  // 主题色
  schemeType: 'tonalSpot'  // 可选：配色方案类型
};

const result = await window.mofoxAPI.themeUpdate(settings);
if (result.success) {
  // 主题已重新计算并保存
  // 重新应用主题到页面
  applyTheme(result.theme);
}
```

### 3. 强制重新生成主题

```javascript
// 清除缓存并重新计算（通常不需要手动调用）
const result = await window.mofoxAPI.themeRegenerate(
  '#7c6bbd',    // accentColor
  'dark',       // themeMode
  {
    schemeType: 'tonalSpot'  // 配色方案类型
  }
);
```

## 配色方案类型

Material Design 3 提供四种配色方案：

| SchemeType | 描述 | 适用场景 |
|------------|------|----------|
| `tonalSpot` (默认) | 柔和、平衡的配色 | 通用应用 |
| `content` | 内容优先，低对比度 | 阅读类应用 |
| `vibrant` | 鲜艳、高饱和度 | 娱乐、社交应用 |
| `expressive` | 表现力强，动态感 | 创意工具 |

在用户设置中添加 `schemeType` 字段即可切换：

```javascript
await window.mofoxAPI.settingsWrite({
  schemeType: 'vibrant'
});

// 触发主题重新计算
const settings = await window.mofoxAPI.settingsRead();
await window.mofoxAPI.themeUpdate(settings);
```

## 前端应用主题示例

### 在设置页面实现主题切换

```javascript
// settings-page.js

// 监听主题色选择器变化
document.getElementById('accent-color-picker').addEventListener('change', async (e) => {
  const newColor = e.target.value;
  
  // 更新设置
  await window.mofoxAPI.settingsWrite({
    accentColor: newColor
  });
  
  // 重新计算主题
  const settings = await window.mofoxAPI.settingsRead();
  const result = await window.mofoxAPI.themeUpdate(settings);
  
  if (result.success) {
    // 应用到当前页面
    applyThemeToPage(result.theme);
  }
});

// 监听主题模式切换
document.getElementById('theme-mode-select').addEventListener('change', async (e) => {
  const newMode = e.target.value; // 'light' | 'dark' | 'auto'
  
  await window.mofoxAPI.settingsWrite({
    theme: newMode
  });
  
  const settings = await window.mofoxAPI.settingsRead();
  const result = await window.mofoxAPI.themeUpdate(settings);
  
  if (result.success) {
    applyThemeToPage(result.theme);
  }
});

// 应用主题到页面
function applyThemeToPage(theme) {
  const root = document.documentElement;
  const settings = await window.mofoxAPI.settingsRead();
  
  // 确定使用哪套配色
  let effectiveMode = settings.theme;
  if (effectiveMode === 'auto') {
    effectiveMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  // 设置 data-theme 属性
  root.setAttribute('data-theme', effectiveMode);
  
  // 应用 CSS 变量
  const palette = theme[effectiveMode];
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, value);
  }
}
```

## 生成的 CSS 变量

主题系统会生成以下 CSS 变量（完整的 Material Design 3 色彩系统）：

### 主色（Primary）
- `--md-sys-color-primary`
- `--md-sys-color-primary-rgb` (RGB 格式，用于透明度)
- `--md-sys-color-on-primary`
- `--md-sys-color-primary-container`
- `--md-sys-color-on-primary-container`

### 次要色（Secondary）
- `--md-sys-color-secondary`
- `--md-sys-color-secondary-rgb`
- `--md-sys-color-on-secondary`
- `--md-sys-color-secondary-container`
- `--md-sys-color-on-secondary-container`

### 第三色（Tertiary）
- `--md-sys-color-tertiary`
- `--md-sys-color-tertiary-rgb`
- `--md-sys-color-on-tertiary`
- `--md-sys-color-tertiary-container`
- `--md-sys-color-on-tertiary-container`

### 错误色（Error）
- `--md-sys-color-error`
- `--md-sys-color-error-rgb`
- `--md-sys-color-on-error`
- `--md-sys-color-error-container`
- `--md-sys-color-on-error-container`

### 表面色（Surface）
- `--md-sys-color-background`
- `--md-sys-color-on-background`
- `--md-sys-color-surface`
- `--md-sys-color-on-surface`
- `--md-sys-color-surface-variant`
- `--md-sys-color-on-surface-variant`
- `--md-sys-color-surface-dim`
- `--md-sys-color-surface-bright`
- `--md-sys-color-surface-container-lowest`
- `--md-sys-color-surface-container-low`
- `--md-sys-color-surface-container`
- `--md-sys-color-surface-container-high`
- `--md-sys-color-surface-container-highest`

### 其他
- `--md-sys-color-outline`
- `--md-sys-color-outline-variant`
- `--md-sys-color-shadow`
- `--md-sys-color-scrim`
- `--md-sys-color-inverse-surface`
- `--md-sys-color-inverse-on-surface`
- `--md-sys-color-inverse-primary`

## 使用示例（CSS）

```css
/* 使用主色作为按钮背景 */
.btn-primary {
  background-color: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
}

/* 使用容器色作为卡片背景 */
.card {
  background-color: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
}

/* 使用表面层级 */
.surface-low {
  background-color: var(--md-sys-color-surface-container-low);
}

.surface-high {
  background-color: var(--md-sys-color-surface-container-high);
}

/* 使用 RGB 变量实现透明度 */
.overlay {
  background-color: rgba(var(--md-sys-color-primary-rgb), 0.5);
}
```

## 主题文件结构

生成的主题文件 `theme-computed.json` 结构：

```json
{
  "accentColor": "#7c6bbd",
  "themeMode": "dark",
  "schemeType": "tonalSpot",
  "generatedAt": "2026-04-11T10:30:00.000Z",
  "light": {
    "--md-sys-color-primary": "#6750a4",
    "--md-sys-color-primary-rgb": "103, 80, 164",
    ...
  },
  "dark": {
    "--md-sys-color-primary": "#d0bcff",
    "--md-sys-color-primary-rgb": "208, 188, 255",
    ...
  }
}
```

## 最佳实践

1. **避免频繁重新计算**：ThemeService 会缓存结果，只在必要时重新计算
2. **使用语义化变量**：优先使用 `primary`、`surface` 等语义化变量，而非硬编码颜色
3. **遵循 Material Design 3 规范**：参考 [Material Design 3 文档](https://m3.material.io/)
4. **测试两套主题**：确保 UI 在 Light 和 Dark 模式下都正常显示

## 迁移指南

如果你之前使用旧的主题系统（基于 HSL 计算），需要：

1. 移除手动颜色计算逻辑
2. 改为调用 `window.mofoxAPI.themeUpdate()`
3. CSS 变量名已标准化，需要更新对应的 CSS 代码
4. 移除对 `window.__themeApplySync()` 的调用（现在由后端处理）

## 故障排查

### 主题未生效
1. 检查控制台是否有错误日志
2. 确认 `theme-computed.json` 文件存在（在 userData 目录下）
3. 检查 `data-theme` 属性是否正确设置

### 颜色不符合预期
1. 确认 `accentColor` 格式正确（十六进制，如 `#7c6bbd`）
2. 尝试切换 `schemeType` 查看效果
3. 使用 `themeRegenerate` 强制重新计算

### 性能问题
- ThemeService 会缓存计算结果，正常情况下不会影响性能
- 如果频繁重新计算，检查是否有代码不当触发更新

---

更多信息请参考：
- [Material Design 3 官方文档](https://m3.material.io/)
- [@material/material-color-utilities 文档](https://github.com/material-foundation/material-color-utilities)
