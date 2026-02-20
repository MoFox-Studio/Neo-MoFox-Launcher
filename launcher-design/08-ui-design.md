# 08 — UI 设计风格指南

## 设计理念

Neo-MoFox Launcher 采用 **Microsoft Fluent Design System**，遵循 Windows 11 现代化设计语言：

### Fluent Design 五大核心原则

- **光 (Light)**：使用光影引导视觉焦点，突出重要元素
- **深度 (Depth)**：通过层次和 Z 轴空间营造深度感
- **动效 (Motion)**：流畅自然的过渡动画提升用户体验
- **材质 (Material)**：Acrylic 亚克力和 Mica 云母材质增强沉浸感
- **缩放 (Scale)**：适应不同屏幕尺寸和输入方式

### 设计目标

- **Windows 原生体验**：与 Windows 11 系统完美融合
- **直观操作**：符合 Windows 用户习惯的交互模式
- **性能优先**：轻量级 UI，保持系统资源占用最小化

---

## 技术栈

| 层面 | 技术选择 |
|------|---------|
| 桌面框架 | **Electron Forge** (官方脚手架工具) |
| UI 框架 | **Vue 3** (Composition API + TypeScript) |
| 组件库 | **@fluentui/web-components** |
| 设计系统 | **Microsoft Fluent Design System 2** |
| 样式方案 | **Scoped CSS** + **Fluent Design Tokens** |
| 图标 | **@fluentui/svg-icons** (官方图标库) |
| 状态管理 | **Pinia** (Vue 官方推荐) |
| 路由 | 无需路由库(单窗口多步骤流程) |
| 打包工具 | **Vite** (渲染进程) + **Electron Builder** (最终打包) |

### 关键依赖

```json
{
  "dependencies": {
    "@fluentui/web-components": "^2.6.0",
    "@microsoft/fast-element": "^1.12.0",
    "vue": "^3.4.0",
    "pinia": "^2.1.0"
  }
}
```

### 为什么选择 Electron Forge?

**Electron Forge** 是 Electron 官方维护的完整工具链，提供：

- ✅ **开箱即用**：集成开发环境、热重载、调试工具
- ✅ **多平台打包**：一键生成 Windows (exe/msi)、macOS (dmg)、Linux (deb/rpm)
- ✅ **自动更新**：内置 `update-electron-app` 支持
- ✅ **插件生态**：支持 Webpack、Vite、TypeScript 等插件
- ✅ **主流维护**：由 Electron 官方团队维护，长期支持

**初始化命令**：
```bash
npm init electron-app@latest neo-mofox-launcher -- --template=vite-typescript
```

**项目结构**：
```
neo-mofox-launcher/
├── src/
│   ├── main/           # Electron 主进程 (Node.js)
│   │   ├── index.ts
│   │   └── services/   # 后端服务模块
│   └── renderer/       # 渲染进程 (Vue 3)
│       ├── main.ts
│       ├── App.vue
│       └── components/
├── forge.config.js     # Electron Forge 配置
├── vite.config.ts      # Vite 配置 (渲染进程)
└── package.json
```

---

## 配色方案

### Fluent Design Tokens (浅色主题)

```css
:root {
  /* Accent Colors - Windows 11 默认蓝 */
  --accent-fill-rest: #0078d4;
  --accent-fill-hover: #106ebe;
  --accent-fill-active: #005a9e;
  --accent-foreground-rest: #ffffff;
  
  /* Neutral Colors */
  --neutral-fill-rest: #ffffff;
  --neutral-fill-hover: #f3f3f3;
  --neutral-fill-active: #e5e5e5;
  --neutral-stroke-rest: #d1d1d1;
  
  /* Text Colors */
  --neutral-foreground-rest: #242424;
  --neutral-foreground-hint: #616161;
  --neutral-foreground-disabled: #a6a6a6;
  
  /* Layer Colors (支持 Acrylic 半透明) */
  --layer-fill-base: rgba(243, 243, 243, 0.5);
  --layer-fill-alt: rgba(255, 255, 255, 0.7);
  
  /* Elevation Shadows */
  --elevation-shadow-card: 0 2px 4px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12);
  --elevation-shadow-flyout: 0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12);
  
  /* Semantic Colors */
  --success-fill: #107c10;
  --warning-fill: #ff8c00;
  --danger-fill: #d13438;
  --info-fill: #0078d4;
}
```

### 暗色主题 (Windows 11 Dark Mode)

```css
[data-theme="dark"] {
  /* Accent Colors */
  --accent-fill-rest: #60cdff;
  --accent-fill-hover: #3aa0f3;
  --accent-fill-active: #0078d4;
  
  /* Neutral Colors */
  --neutral-fill-rest: #2d2d2d;
  --neutral-fill-hover: #3a3a3a;
  --neutral-fill-active: #4a4a4a;
  --neutral-stroke-rest: #5a5a5a;
  
  /* Text Colors */
  --neutral-foreground-rest: #ffffff;
  --neutral-foreground-hint: #a6a6a6;
  --neutral-foreground-disabled: #5a5a5a;
  
  /* Layer Colors (Mica 材质) */
  --layer-fill-base: rgba(32, 32, 32, 0.7);
  --layer-fill-alt: rgba(45, 45, 45, 0.8);
  
  /* Elevation Shadows */
  --elevation-shadow-card: 0 2px 4px rgba(0,0,0,0.4), 0 0 2px rgba(0,0,0,0.3);
  --elevation-shadow-flyout: 0 8px 16px rgba(0,0,0,0.5), 0 0 2px rgba(0,0,0,0.4);
}
```

### Acrylic 亚克力材质

```css
/* 毛玻璃效果（需要配合 Electron 的 vibrancy API）*/
.acrylic-background {
  background: rgba(243, 243, 243, 0.7);
  backdrop-filter: blur(30px) saturate(125%);
  -webkit-backdrop-filter: blur(30px) saturate(125%);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.acrylic-dark {
  background: rgba(32, 32, 32, 0.7);
  backdrop-filter: blur(30px) saturate(125%);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
```

---

## 字体规范

### Segoe UI Variable - Windows 11 官方字体

```css
/* Windows 11 默认字体族 */
font-family: 'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont,
             'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', 
             'Helvetica Neue', Arial, sans-serif;
```

### Fluent Type Ramp (字阶系统)

| 类型 | 字号 | 行高 | 字重 | Fluent Token |
|------|------|------|------|-------------|
| Display | 28px | 36px | 600 | `--type-ramp-plus-6` |
| Title Large | 24px | 32px | 600 | `--type-ramp-plus-5` |
| Title | 20px | 28px | 600 | `--type-ramp-plus-4` |
| Subtitle | 16px | 22px | 600 | `--type-ramp-plus-2` |
| Body | 14px | 20px | 400 | `--type-ramp-base` |
| Caption | 12px | 16px | 400 | `--type-ramp-minus-1` |
| Code | 13px | 18px | 400 | Consolas, Cascadia Code |

---

## 核心界面设计

### 1. 首次安装向导

**流程步骤**：
1. 欢迎页
2. 必填配置（QQ 号、API Key、端口）
3. NapCat 下载进度
4. 完成确认

**设计要点**：
```
┌─────────────────────────────────────────┐
│  [Logo]  Neo-MoFox Launcher 安装向导     │
├─────────────────────────────────────────┤
│                                         │
│  ○ 欢迎                                 │
│  ● 配置基础信息  ← 当前步骤高亮         │
│  ○ 安装 NapCat                          │
│  ○ 完成                                 │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ QQ 号 *                           │  │
│  │ [_____________________]  @qq.com │  │
│  │                                   │  │
│  │ OpenAI API Key *                  │  │
│  │ [_____________________] 🔑 验证   │  │
│  │                                   │  │
│  │ 监听端口 *                        │  │
│  │ [8080___]  默认 8080             │  │
│  └───────────────────────────────────┘  │
│                                         │
│            [上一步]    [下一步 →]       │
└─────────────────────────────────────────┘
```

**组件使用** (Fluent UI Web Components):
- `<fluent-progress-ring>` (步骤指示)
- `<fluent-text-field>` (输入框)
- `<fluent-button>` (appearance="accent" / "neutral")
- `<fluent-progress>` (下载进度)

---

### 2. 主控制面板（可选）

若提供可视化管理界面，设计如下：

```
┌────────────────────────────────────────────────────────────────┐
│ Neo-MoFox Launcher                            [_][□][×]        │
├────────────────────────────────────────────────────────────────┤
│ ┌─ 今日一言 ───────────────────────────────────────────────┐  │
│ │ 💡 "代码是写给人看的，只是顺便让计算机执行而已。"          │  │
│ │                                        — Structure and... │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ ┌─ 快捷跳转 ───────────────────────────────────────────────┐  │
│ │ 📚 文档  │  📊 日志中心  │  ⚙️ 全局设置  │  🔧 故障排查   │  │
│ └──────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────┤
│ 实例列表                                      [+ 新建实例]     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ ┌─ bot-123456789 ─────────────────────────────────────────┐   │
│ │ ● 运行中  │  主分支  │  上次更新: 2小时前                │   │
│ │ Neo-MoFox: v1.2.3  │  NapCat: v2.1.0                   │   │
│ │ [▶ 重启] [■ 停止] [⚙ 日志] [↻ 更新]                   │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                │
│ ┌─ bot-987654321 ─────────────────────────────────────────┐   │
│ │ ○ 已停止  │  开发分支  │  上次更新: 1天前                │   │
│ │ Neo-MoFox: v1.3.0-dev  │  NapCat: v2.1.0               │   │
│ │ [▶ 启动] [🗑 删除] [⚙ 配置]                           │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**组件使用** (Fluent UI Web Components):
- `<fluent-card>` (卡片容器)
- `<fluent-badge>` (状态指示)
- `<fluent-button>` (appearance="accent" / "neutral" / "outline")
- `<fluent-tooltip>` (按钮提示)
- `<fluent-divider>` (分割线)

**Fluent 特有效果**：
- **Reveal Highlight**：鼠标悬停时的光晕效果
- **Acrylic Material**：卡片背景亚克力材质
- **Mica Alt**：窗口背景云母材质

**快捷跳转功能**：
| 入口 | 功能 | 实现方式 |
|------|------|---------|
| 📚 文档 | 打开官方文档网站 | `shell.openExternal()` |
| 📊 日志中心 | 查看所有实例日志汇总 | 打开日志浏览窗口 |
| ⚙️ 全局设置 | 修改 Launcher 配置 | 打开设置对话框 |
| 🔧 故障排查 | 常见问题自检工具 | 运行诊断脚本并展示结果 |

**每日一言数据源**：
```ts
// 随机名言库（可扩展）
interface Quote {
  text: string;
  author: string;
}

const quotes: Quote[] = [
  { text: '代码是写给人看的,只是顺便让计算机执行而已。', author: 'Structure and Interpretation of Computer Programs' },
  { text: '过早优化是万恶之源。', author: 'Donald Knuth' },
  { text: '任何傻瓜都能写出计算机能理解的代码，只有优秀的程序员才能写出人类能理解的代码。', author: 'Martin Fowler' },
  { text: '简单是可靠的前提。', author: 'Edsger W. Dijkstra' },
  { text: '先让它运行起来，再让它跑得快。', author: 'Kent Beck' }
];

// 或集成一言API
const fetchHitokoto = async (): Promise<Quote> => {
  const res = await fetch('https://v1.hitokoto.cn/?c=k');
  const data = await res.json();
  return { text: data.hitokoto, author: data.from };
};
```

---

## 组件规范

### Fluent Button (按钮)

| Appearance | 用途 | 示例 |
|------------|------|------|
| `accent` | 主要操作（下一步、确认） | `<fluent-button appearance="accent">` |
| `neutral` | 次要操作（取消、返回） | `<fluent-button appearance="neutral">` |
| `outline` | 边框按钮 | `<fluent-button appearance="outline">` |
| `stealth` | 透明按钮（图标按钮） | `<fluent-button appearance="stealth">` |

```vue
<!-- Accent 主要按钮 -->
<fluent-button appearance="accent" @click="nextStep">
  下一步
</fluent-button>

<!-- 危险操作 -->
<fluent-button appearance="accent" style="--accent-fill-rest: var(--danger-fill);">
  删除
</fluent-button>
```

### 表单输入

```vue
<template>
  <div class="form-group">
    <label for="qq-number">QQ 号 *</label>
    <fluent-text-field
      id="qq-number"
      v-model="qqNumber"
      placeholder="请输入 5-11 位数字"
      pattern="\d{5,11}"
      required
      @input="validateQQ"
    >
      <span slot="end">@qq.com</span>
    </fluent-text-field>
    <span v-if="qqError" class="error-hint">{{ qqError }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const qqNumber = ref('');
const qqError = ref('');

const validateQQ = () => {
  if (!/^\d{5,11}$/.test(qqNumber.value)) {
    qqError.value = 'QQ 号格式不正确';
  } else {
    qqError.value = '';
  }
};
</script>
```

### 加载状态

```vue
<template>
  <div class="loading-container">
    <fluent-progress-ring 
      v-if="isLoading"
    ></fluent-progress-ring>
    
    <!-- 进度条 -->
    <fluent-progress
      :value="downloadProgress"
      :max="100"
    ></fluent-progress>
    <p class="progress-hint">正在下载 NapCat... {{ downloadProgress }}%</p>
  </div>
</template>
```

---

## 动效规范

### Fluent Motion - 微软动画曲线

```css
/* Fluent 标准缓动曲线 */
:root {
  --curve-easy-ease: cubic-bezier(0.33, 0.00, 0.67, 1.00);
  --curve-accelerate: cubic-bezier(0.7, 0.0, 1.0, 1.0);
  --curve-decelerate: cubic-bezier(0.1, 0.9, 0.2, 1.0);
  
  /* Duration Tokens */
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 350ms;
}

/* 页面切换 - Connected Animation */
.page-transition {
  transition: transform var(--duration-normal) var(--curve-decelerate),
              opacity var(--duration-normal) var(--curve-decelerate);
}

/* 按钮悬停 - Reveal Effect */
.fluent-button:hover {
  transform: scale(1.02);
  transition: transform var(--duration-fast) var(--curve-easy-ease);
}

/* 卡片展开 */
.card-expand {
  transition: height var(--duration-normal) var(--curve-decelerate),
              opacity var(--duration-fast) var(--curve-decelerate);
}

/* Reveal Highlight 光晕效果 */
.reveal-highlight {
  position: relative;
  overflow: hidden;
}

.reveal-highlight::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(
    circle at center,
    rgba(255, 255, 255, 0.1) 0%,
    transparent 70%
  );
  opacity: 0;
  transition: opacity var(--duration-fast);
  pointer-events: none;
}

.reveal-highlight:hover::before {
  opacity: 1;
}
```

### 加载指示

- 使用 `<fluent-progress-ring>` 包裹异步内容
- 骨架屏 `<fluent-skeleton>` 用于首次加载
- 进度条 `<fluent-progress>` 显示下载/安装进度

---

## 响应式设计

### 窗口尺寸 & Mica 材质

```js
// Electron 主窗口 - Windows 11 Mica 效果
const mainWindow = new BrowserWindow({
  width: 900,
  height: 680,
  minWidth: 800,
  minHeight: 600,
  frame: false,          // 自定义标题栏
  transparent: true,     // 支持 Acrylic/Mica
  backgroundColor: '#00000000',
  vibrancy: 'under-window',  // macOS 毛玻璃
  backgroundMaterial: 'mica', // Windows 11 Mica 材质
  titleBarStyle: 'hidden',
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true
  }
});

// 自定义标题栏（Fluent Design）
if (process.platform === 'win32') {
  mainWindow.setTitleBarOverlay({
    color: '#00000000',
    symbolColor: '#ffffff',
    height: 32
  });
}
```

### 布局断点

```css
/* 小窗口 */
@media (max-width: 768px) {
  .instance-card {
    grid-template-columns: 1fr;
  }
}

/* 大窗口 */
@media (min-width: 1024px) {
  .instance-card {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

---

## 错误处理 UI

### Fluent Dialog & Message Bar

```vue
<script setup lang="ts">
import { ref } from 'vue';

// 轻量提示 - Message Bar
const showError = () => {
  const messageBar = document.createElement('fluent-message-bar');
  messageBar.setAttribute('type', 'error');
  messageBar.textContent = 'QQ 号不能为空';
  document.body.appendChild(messageBar);
  
  setTimeout(() => messageBar.remove(), 3000);
};

// 详细错误 - Dialog
const showDialog = ref(false);
const errorMessage = ref('');

const showDetailError = (error: Error) => {
  errorMessage.value = error.message;
  showDialog.value = true;
};

const retryDownload = () => {
  showDialog.value = false;
  // 重试逻辑
};
</script>

<template>
  <!-- Fluent Dialog -->
  <fluent-dialog :open="showDialog" modal>
    <h2>NapCat 下载失败</h2>
    <p>无法从 GitHub 下载 NapCat.Shell.zip</p>
    <p>错误信息: {{ errorMessage }}</p>
    <p>建议：检查网络连接或稍后重试</p>
    
    <div slot="footer">
      <fluent-button @click="showDialog = false">取消</fluent-button>
      <fluent-button appearance="accent" @click="retryDownload">重试</fluent-button>
    </div>
  </fluent-dialog>
  
  <!-- Message Bar -->
  <fluent-message-bar type="error" v-if="showError">
    QQ 号不能为空
  </fluent-message-bar>
</template>
```

### 空状态

```vue
<script setup lang="ts">
const createInstance = () => {
  // 创建新实例逻辑
};
</script>

<template>
  <div class="empty-state">
    <svg class="empty-icon" width="64" height="64" viewBox="0 0 64 64">
      <!-- Fluent 风格空状态图标 -->
      <circle cx="32" cy="32" r="28" fill="var(--neutral-fill-rest)" />
    </svg>
    <h3>暂无实例</h3>
    <p class="hint-text">点击下方按钮创建第一个 Bot 实例</p>
    <fluent-button appearance="accent" @click="createInstance">
      新建实例
    </fluent-button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.hint-text {
  color: var(--neutral-foreground-hint);
  margin-bottom: 24px;
}
</style>
```

---

## 可访问性 (A11y)

- **键盘导航**：所有交互元素支持 Tab 键切换
- **焦点指示**：保留 Fluent Design 默认的焦点环
- **语义化 HTML**：使用 `<header>`、`<main>`、`<section>` 等标签
- **ARIA 标签**：为图标按钮添加 `aria-label`
- **高对比度模式**：支持 Windows 高对比度主题

```vue
<fluent-button 
  appearance="accent"
  aria-label="删除实例"
>
  <svg slot="start" width="16" height="16"><!-- 图标 --></svg>
  删除
</fluent-button>
```

---

## 国际化准备

虽然初期仅支持中文，但结构预留国际化能力：

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref } from 'vue';

const { t } = useI18n();
const currentStep = ref(0);

const steps = [
  { label: t('wizard.welcome') },
  { label: t('wizard.configure') },
  { label: t('wizard.install') }
];
</script>

<template>
  <!-- Fluent 步骤指示器 -->
  <div class="wizard-steps">
    <fluent-progress-ring 
      v-for="(step, index) in steps"
      :key="index"
      :value="index < currentStep ? 100 : (index === currentStep ? 50 : 0)"
    >
      {{ step.label }}
    </fluent-progress-ring>
  </div>
</template>
```

---

## 示例代码

### 安装向导步骤组件 (Fluent UI)

```vue
<script setup lang="ts">
import { ref } from 'vue';
import '@fluentui/web-components';
import WelcomeStep from './WelcomeStep.vue';
import ConfigStep from './ConfigStep.vue';
import InstallStep from './InstallStep.vue';
import FinishStep from './FinishStep.vue';

const current = ref(0);
const formRef = ref();

const steps = [
  { title: '欢迎', component: WelcomeStep },
  { title: '配置', component: ConfigStep },
  { title: '安装', component: InstallStep },
  { title: '完成', component: FinishStep }
];

const next = async () => {
  if (formRef.value?.validate) {
    const isValid = await formRef.value.validate();
    if (isValid) current.value++;
  } else {
    current.value++;
  }
};

const prev = () => {
  current.value--;
};

const finish = () => {
  console.log('安装完成');
  // 启动应用
};
</script>

<template>
  <div class="wizard-container acrylic-background">
    <!-- Fluent 步骤指示器 -->
    <div class="wizard-header">
      <h1 class="wizard-title">Neo-MoFox Launcher 安装向导</h1>
      <div class="step-indicators">
        <div 
          v-for="(step, index) in steps" 
          :key="step.title"
          class="step-indicator"
          :class="{ active: index === current, completed: index < current }"
        >
          <div class="step-number">{{ index + 1 }}</div>
          <div class="step-label">{{ step.title }}</div>
        </div>
      </div>
    </div>
    
    <!-- 步骤内容 -->
    <fluent-card class="step-content">
      <component :is="steps[current].component" ref="formRef" />
    </fluent-card>
    
    <!-- 操作按钮 -->
    <div class="step-actions">
      <fluent-button 
        v-if="current > 0" 
        appearance="neutral"
        @click="prev"
      >
        上一步
      </fluent-button>
      <fluent-button 
        v-if="current < steps.length - 1" 
        appearance="accent"
        @click="next"
      >
        下一步
      </fluent-button>
      <fluent-button 
        v-if="current === steps.length - 1" 
        appearance="accent"
        @click="finish"
      >
        完成
      </fluent-button>
    </div>
  </div>
</template>

<style scoped>
.wizard-container {
  min-height: 100vh;
  padding: 48px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.wizard-header {
  text-align: center;
}

.wizard-title {
  font-size: var(--type-ramp-plus-5);
  font-weight: 600;
  margin-bottom: 32px;
  color: var(--neutral-foreground-rest);
}

.step-indicators {
  display: flex;
  justify-content: center;
  gap: 48px;
}

.step-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  opacity: 0.5;
  transition: opacity var(--duration-normal);
}

.step-indicator.active {
  opacity: 1;
}

.step-indicator.completed {
  opacity: 0.8;
}

.step-number {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--neutral-fill-rest);
  border: 2px solid var(--neutral-stroke-rest);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.step-indicator.active .step-number {
  background: var(--accent-fill-rest);
  border-color: var(--accent-fill-rest);
  color: white;
}

.step-indicator.completed .step-number {
  background: var(--success-fill);
  border-color: var(--success-fill);
  color: white;
}

.step-content {
  flex: 1;
  padding: 48px;
  min-height: 400px;
}

.step-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
}
</style>
```

### 主控制面板组件 (Fluent UI)

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import '@fluentui/web-components';

interface Quote {
  text: string;
  author: string;
}

interface Instance {
  id: string;
  running: boolean;
  branch: 'main' | 'dev';
  lastUpdate: string;
  version: string;
  napcatVersion: string;
}

const quote = ref<Quote>({ text: '', author: '' });
const instances = ref<Instance[]>([]);

// 加载随机名言
onMounted(() => {
  const quotes: Quote[] = [
    { text: '代码是写给人看的，只是顺便让计算机执行而已。', author: 'SICP' },
    { text: '过早优化是万恶之源。', author: 'Donald Knuth' },
    { text: '简单是可靠的前提。', author: 'Edsger W. Dijkstra' },
  ];
  quote.value = quotes[Math.floor(Math.random() * quotes.length)];
  
  loadInstances();
});

// 快捷跳转
const quickActions = [
  { icon: '📚', label: '文档', onClick: () => openExternal('https://docs.example.com') },
  { icon: '📊', label: '日志中心', onClick: () => openLogCenter() },
  { icon: '⚙️', label: '全局设置', onClick: () => openSettings() },
  { icon: '🔧', label: '故障排查', onClick: () => runDiagnostics() },
];

const loadInstances = async () => {
  // TODO: 从后端加载
  instances.value = [];
};

const createInstance = () => {
  console.log('创建实例');
};

const restartInstance = (id: string) => {
  console.log('重启实例:', id);
};

const openExternal = (url: string) => {
  (window as any).electron?.shell.openExternal(url);
};
</script>

<template>
  <div class="dashboard-container acrylic-dark">
    <!-- 每日一言 -->
    <fluent-card class="quote-card reveal-highlight">
      <div class="quote-content">
        <div class="quote-icon">💡</div>
        <div>
          <p class="quote-text">"{{ quote.text }}"</p>
          <p class="quote-author">— {{ quote.author }}</p>
        </div>
      </div>
    </fluent-card>

    <!-- 快捷跳转 -->
    <fluent-card>
      <h3>快捷跳转</h3>
      <div class="quick-actions">
        <fluent-button 
          v-for="action in quickActions" 
          :key="action.label"
          appearance="neutral"
          class="reveal-highlight"
          @click="action.onClick"
        >
          <span class="action-icon">{{ action.icon }}</span>
          {{ action.label }}
        </fluent-button>
      </div>
    </fluent-card>

    <!-- 实例列表 -->
    <fluent-card>
      <div class="card-header">
        <h3>实例列表</h3>
        <fluent-button appearance="accent" @click="createInstance">
          <span class="action-icon">➕</span>
          新建实例
        </fluent-button>
      </div>

      <!-- 实例卡片 -->
      <fluent-card
        v-for="instance in instances"
        :key="instance.id"
        class="instance-card reveal-highlight"
      >
        <div class="instance-header">
          <fluent-badge 
            :appearance="instance.running ? 'success' : 'neutral'"
            :fill="instance.running ? 'var(--success-fill)' : 'var(--neutral-fill-rest)'"
          >
            {{ instance.running ? '运行中' : '已停止' }}
          </fluent-badge>
          <strong>{{ instance.id }}</strong>
          <fluent-badge 
            :appearance="instance.branch === 'main' ? 'informative' : 'warning'"
          >
            {{ instance.branch === 'main' ? '主分支' : '开发分支' }}
          </fluent-badge>
          <span class="hint-text">上次更新: {{ instance.lastUpdate }}</span>
        </div>
        
        <div class="instance-info">
          <span>Neo-MoFox: {{ instance.version }}</span>
          <fluent-divider role="separator"></fluent-divider>
          <span>NapCat: {{ instance.napcatVersion }}</span>
        </div>
        
        <div class="instance-actions">
          <fluent-button 
            appearance="neutral" 
            size="small"
            @click="restartInstance(instance.id)"
          >
            🔄 重启
          </fluent-button>
          <fluent-button appearance="neutral" size="small">
            ⏹️ 停止
          </fluent-button>
          <fluent-button appearance="neutral" size="small">
            📄 日志
          </fluent-button>
          <fluent-button appearance="neutral" size="small">
            ↻ 更新
          </fluent-button>
        </div>
      </fluent-card>
    </fluent-card>
  </div>
</template>

<style scoped>
.dashboard-container {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100vh;
}

/* 每日一言卡片 */
.quote-card {
  padding: 24px;
}

.quote-content {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.quote-icon {
  font-size: 32px;
  line-height: 1;
}

.quote-text {
  font-size: 16px;
  line-height: 1.6;
  margin: 0 0 8px 0;
  color: var(--neutral-foreground-rest);
}

.quote-author {
  font-size: 12px;
  color: var(--neutral-foreground-hint);
  margin: 0;
}

/* 快捷跳转 */
.quick-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.action-icon {
  margin-right: 8px;
  font-size: 16px;
}

/* 卡片头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-header h3 {
  margin: 0;
  font-size: var(--type-ramp-plus-2);
  font-weight: 600;
}

/* 实例卡片 */
.instance-card {
  padding: 20px;
  margin-bottom: 12px;
  border: 1px solid var(--neutral-stroke-rest);
  transition: all var(--duration-fast) var(--curve-easy-ease);
}

.instance-card:hover {
  border-color: var(--accent-fill-rest);
  box-shadow: var(--elevation-shadow-card);
}

.instance-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.instance-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  color: var(--neutral-foreground-hint);
  font-size: 13px;
}

.instance-actions {
  display: flex;
  gap: 8px;
}

.hint-text {
  color: var(--neutral-foreground-hint);
  font-size: 12px;
  margin-left: auto;
}
</style>
```

---

## 参考资源

- [Fluent Design System](https://fluent2.microsoft.design/)
- [Fluent UI Web Components](https://learn.microsoft.com/en-us/fluent-ui/web-components/)
- [Windows 11 Design Principles](https://learn.microsoft.com/en-us/windows/apps/design/)
- [Vue 3 官方文档](https://cn.vuejs.org/)
- [Electron UI 最佳实践](https://www.electronjs.org/docs/latest/tutorial/accessibility)
- [Pinia 状态管理](https://pinia.vuejs.org/zh/)
- [Fluent UI Icons](https://aka.ms/fluentui-system-icons)
