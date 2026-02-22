/**
 * settings.js - 设置页面逻辑
 */
import { applyTheme } from '../theme.js';

// ─── 预设强调色 ──────────────────────────────────────────────────────────
const ACCENT_PRESETS = [
  { name: '薰衣草紫', color: '#7c6bbd' },
  { name: '玫瑰红',   color: '#e040fb' },
  { name: '珊瑚橙',   color: '#ff7043' },
  { name: '天空蓝',   color: '#039be5' },
  { name: '翡翠绿',   color: '#00897b' },
  { name: '松石青',   color: '#00acc1' },
  { name: '柠檬黄',   color: '#fdd835' },
  { name: '粉红',     color: '#e91e63' },
];

// ─── 状态 ────────────────────────────────────────────────────────────────
let currentSettings = null;
let saveHintTimer = null;

// ─── DOM 引用 ────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const el = {
  btnBack:            $('btn-back'),
  saveHint:           $('save-hint'),
  navItems:           document.querySelectorAll('.nav-item'),
  sections:           document.querySelectorAll('.settings-section'),

  // 外观
  themeDark:          $('theme-dark'),
  themeLight:         $('theme-light'),
  themeAuto:          $('theme-auto'),
  accentPresets:      $('accent-presets'),
  accentPicker:       $('accent-color-picker'),
  accentHexDisplay:   $('accent-hex-display'),

  // 通用
  defaultInstallDir:  $('default-install-dir'),
  btnBrowseInstallDir:$('btn-browse-install-dir'),
  btnResetAll:        $('btn-reset-all'),

  // 关于
  aboutVersion:       $('about-version'),
  btnOpenGithub:      $('btn-open-github'),
  btnOpenLogs:        $('btn-open-logs'),
};

// ─── 初始化 ──────────────────────────────────────────────────────────────
async function init() {
  if (!window.mofoxAPI) {
    console.error('[settings] mofoxAPI 不可用');
    return;
  }

  // 加载当前设置
  currentSettings = await window.mofoxAPI.settingsRead();

  // 应用主题（立即生效）
  applyTheme(currentSettings);

  // 渲染 UI
  renderAccentPresets();
  populateUI(currentSettings);
  bindEvents();
}

// ─── 填充 UI ─────────────────────────────────────────────────────────────
function populateUI(settings) {
  // 主题
  selectThemeOption(settings.theme || 'dark');

  // 强调色
  setAccentColor(settings.accentColor || '#7c6bbd', false);

  // 通用
  el.defaultInstallDir.value = settings.defaultInstallDir || '';
}

// ─── 主题选项 ────────────────────────────────────────────────────────────
function selectThemeOption(theme) {
  [el.themeDark, el.themeLight, el.themeAuto].forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.theme === theme);
  });
}

// ─── 强调色 ──────────────────────────────────────────────────────────────
function renderAccentPresets() {
  el.accentPresets.innerHTML = '';
  ACCENT_PRESETS.forEach(({ name, color }) => {
    const btn = document.createElement('button');
    btn.className = 'accent-swatch';
    btn.style.background = color;
    btn.title = name;
    btn.dataset.color = color;
    btn.setAttribute('aria-label', name);
    btn.addEventListener('click', () => setAccentColor(color));
    el.accentPresets.appendChild(btn);
  });
}

function setAccentColor(hex, save = true) {
  // 更新 picker 和文本
  el.accentPicker.value = hex;
  el.accentHexDisplay.textContent = hex;

  // 更新预设选中状态
  document.querySelectorAll('.accent-swatch').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color.toLowerCase() === hex.toLowerCase());
  });

  if (save && currentSettings) {
    savePartial({ accentColor: hex });
  }
}

// ─── 保存逻辑 ────────────────────────────────────────────────────────────
async function savePartial(patch) {
  Object.assign(currentSettings, patch);
  // 立即同步应用（无需等待 IPC 回调）
  applyTheme(currentSettings);

  try {
    await window.mofoxAPI.settingsWrite(patch);
    showSaveHint();
  } catch (e) {
    console.error('[settings] 保存失败', e);
  }
}

function showSaveHint() {
  el.saveHint.classList.remove('hidden');
  // 重设动画
  el.saveHint.style.animation = 'none';
  void el.saveHint.offsetWidth; // reflow
  el.saveHint.style.animation = '';

  clearTimeout(saveHintTimer);
  saveHintTimer = setTimeout(() => {
    el.saveHint.classList.add('hidden');
  }, 2500);
}

// ─── 事件绑定 ────────────────────────────────────────────────────────────
function bindEvents() {
  // 返回
  el.btnBack.addEventListener('click', () => {
    window.location.href = '../main-view/index.html';
  });

  // 侧边导航
  el.navItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.section;
      el.navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      el.sections.forEach(s => {
        s.classList.toggle('active', s.id === `section-${target}`);
      });
    });
  });

  // 主题切换
  [el.themeDark, el.themeLight, el.themeAuto].forEach(btn => {
    btn.addEventListener('click', () => {
      selectThemeOption(btn.dataset.theme);
      savePartial({ theme: btn.dataset.theme });
    });
  });

  // 强调色 Picker
  el.accentPicker.addEventListener('input', (e) => {
    setAccentColor(e.target.value);
  });
  el.accentPicker.addEventListener('change', (e) => {
    setAccentColor(e.target.value);
  });

  // 默认安装目录
  el.defaultInstallDir.addEventListener('change', () => {
    savePartial({ defaultInstallDir: el.defaultInstallDir.value });
  });

  // 浏览安装目录
  el.btnBrowseInstallDir.addEventListener('click', async () => {
    const selected = await window.mofoxAPI.selectProjectPath();
    if (selected) {
      el.defaultInstallDir.value = selected;
      savePartial({ defaultInstallDir: selected });
    }
  });

  // 重置全部
  el.btnResetAll.addEventListener('click', async () => {
    const confirmed = await window.customConfirm(
      '确定要将所有设置恢复为默认值吗？',
      '重置设置'
    );
    console.log('[settings] 用户重置设置 - 确认:', confirmed);

    if (!confirmed) return;

    currentSettings = await window.mofoxAPI.settingsReset(null);
    applyTheme(currentSettings);
    populateUI(currentSettings);
    showSaveHint();
  });

  // 关于页按钮
  el.btnOpenGithub?.addEventListener('click', () => {
    window.mofoxAPI.openGithub();
  });

  el.btnOpenLogs?.addEventListener('click', () => {
    window.mofoxAPI.openLogsDir();
  });
}

// ─── 启动 ────────────────────────────────────────────────────────────────
init();
