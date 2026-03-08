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

// 🦊 版本号连点彩蛋状态
let versionClickCount = 0;
let versionClickTimer = null;

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
  autoOpenNapcatWebUI:$('auto-open-napcat-webui'),

  // 关于
  aboutVersion:       $('about-version'),
  btnOpenGithub:      $('btn-open-github'),
  btnOpenLogs:        $('btn-open-logs'),
  btnOpenYishan:      $('btn-open-yishan'),
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
  el.autoOpenNapcatWebUI.checked = settings.autoOpenNapcatWebUI ?? true;
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

  // 侧边导航已移至悬浮底栏组件 (floating-nav.js)，无需在此绑定

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

  // 自动打开 Napcat WebUI
  el.autoOpenNapcatWebUI.addEventListener('change', () => {
    savePartial({ autoOpenNapcatWebUI: el.autoOpenNapcatWebUI.checked });
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
    window.mofoxAPI.openExternal('https://github.com/MoFox-Studio/Neo-MoFox-Launcher');
  });

  el.btnOpenLogs?.addEventListener('click', () => {
    window.mofoxAPI.openLogsDir();
  });

  el.btnOpenYishan?.addEventListener('click', () => {
    window.mofoxAPI.openExternal('https://www.bilibili.com/video/BV1uT4y1P7CX/');
  });

  // 🦊 版本号连点彩蛋
  el.aboutVersion?.addEventListener('click', handleVersionClick);
}

// ─── 🦊 版本号连点彩蛋 ──────────────────────────────────────────────────
const foxMessages = [
  '你发现了我！我是 MoFox 🦊',
  '嘿！别戳了，好痒！',
  '再戳就要咬你了！汪…啊不，是嗷呜～',
  '写代码不如撸狐狸。',
  'Mo~ Mo~ MoFox!',
  '你已经是一个成熟的开发者了，该学会自己 Debug 了。',
];

function handleVersionClick() {
  versionClickCount++;
  clearTimeout(versionClickTimer);

  // 2秒内未继续点击则重置
  versionClickTimer = setTimeout(() => { versionClickCount = 0; }, 2000);

  if (versionClickCount >= 7) {
    versionClickCount = 0;
    triggerFoxEasterEgg();
  }
}

function triggerFoxEasterEgg() {
  const container = document.getElementById('fox-easter-egg');
  const emoji = document.getElementById('fox-emoji');
  const msgEl = document.getElementById('fox-message');
  if (!container || !emoji || !msgEl) return;

  // 随机选一条消息
  const msg = foxMessages[Math.floor(Math.random() * foxMessages.length)];
  msgEl.textContent = msg;

  // 显示
  container.classList.remove('hidden');
  emoji.classList.add('fox-bounce');

  // 🎉 同时触发全屏纸屑特效
  launchConfetti();

  // 5秒后隐藏
  setTimeout(() => {
    container.classList.add('hidden');
    emoji.classList.remove('fox-bounce');
  }, 5000);
}

// ─── 🎉 全屏纸屑/粒子特效 ──────────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';

  const colors = [
    '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff',
    '#5f27cd', '#01a3a4', '#f368e0', '#ff9f43', '#00d2d3',
    '#6c5ce7', '#a29bfe', '#fd79a8', '#e17055', '#00cec9',
  ];

  const particles = [];
  const PARTICLE_COUNT = 120;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 1) * 16 - 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      gravity: 0.25 + Math.random() * 0.15,
      drag: 0.98 + Math.random() * 0.015,
      opacity: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    });
  }

  let animId;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    for (const p of particles) {
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.008;

      if (p.opacity <= 0) continue;
      alive = true;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (alive) {
      animId = requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = 'none';
      cancelAnimationFrame(animId);
    }
  }

  animate();
}

// ─── 启动 ────────────────────────────────────────────────────────────────
init();
