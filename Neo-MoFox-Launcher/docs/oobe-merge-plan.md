## OOBE 窗口合并方案

### 当前问题
- OOBE 和主窗口是两个独立的 BrowserWindow
- 用户体验割裂，需要窗口切换
- 代码维护成本高

### 改进方案：单窗口 + 路由

#### 1. 修改启动逻辑（main.js）

```javascript
app.whenReady().then(async () => {
  // ... 其他初始化 ...
  
  // 总是启动主窗口
  createWindow();
  
  // 检查 OOBE 状态
  const { settingsService } = require('./services/settings/SettingsService');
  const settings = settingsService.readSettings();
  
  if (!settings.oobeCompleted) {
    // 通知主窗口跳转到 OOBE
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('navigate-to-oobe');
    });
  } else {
    loadSettings();
  }
  
  // ... 主题初始化 ...
});
```

#### 2. 在主窗口中添加 OOBE 路由

**方式 A：使用 iframe（简单快速）**

在 `main-view/index.html` 中添加：

```html
<!-- OOBE 全屏覆盖层 -->
<div id="oobe-fullscreen" class="hidden" style="
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: var(--md-sys-color-surface);
">
  <iframe 
    id="oobe-iframe" 
    src="oobe-view/index.html" 
    style="width: 100%; height: 100%; border: none;">
  </iframe>
</div>
```

**方式 B：完全集成（推荐，体验更好）**

1. 将 `oobe-view` 的步骤组件移动到 `main-view/modules/oobe-wizard/`
2. 创建 `main-view/modules/oobe-wizard.js` 管理完整 OOBE 流程
3. 在主窗口中显示/隐藏 OOBE 容器

#### 3. 添加导航监听器（main.js）

```javascript
// 在主窗口的 main.js 中
window.mofoxAPI.onNavigateToOobe(() => {
  // 方式 A：显示 iframe
  document.getElementById('oobe-fullscreen').classList.remove('hidden');
  
  // 或方式 B：显示集成的 OOBE 模块
  // showOobeWizard();
});
```

#### 4. OOBE 完成后的处理

修改 OOBE 的 `completeOOBE` 方法：

```javascript
async completeOOBE() {
  // 保存配置
  this.config.oobeCompleted = true;
  await window.mofoxAPI.settingsWrite(this.config);
  
  // 不关闭窗口，而是隐藏 OOBE 并显示主界面
  if (window.parent !== window) {
    // iframe 模式：通知父窗口
    window.parent.postMessage({ type: 'oobe-completed' }, '*');
  } else {
    // 集成模式：直接切换
    hideOobeWizard();
  }
}
```

在主窗口监听完成事件：

```javascript
window.addEventListener('message', (e) => {
  if (e.data.type === 'oobe-completed') {
    document.getElementById('oobe-fullscreen').classList.add('hidden');
    loadSettings(); // 加载用户设置
  }
});
```

#### 5. 删除独立 OOBE 窗口

删除 `main.js` 中的：
- `createOobeWindow()` 函数
- `oobeWindow` 变量及其相关逻辑

### 优势
✅ 单一窗口，用户体验流畅  
✅ 无需窗口切换，减少闪烁  
✅ 代码维护更简单  
✅ OOBE 完成后可以平滑过渡到主界面  

### 实施步骤
1. ✅ 删除无用的 IPC handlers（已完成）
2. 选择集成方式（推荐方式 A 先快速实现）
3. 修改启动逻辑
4. 测试 OOBE 流程
5. 删除独立窗口代码

### 需要确认
- 您希望使用 iframe 方式（快速）还是完全集成方式（体验更好）？
- OOBE 完成后是否需要刷新主界面或重新加载实例列表？
