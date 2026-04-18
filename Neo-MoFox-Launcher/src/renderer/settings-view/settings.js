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
  { name: 'MoFox蓝',     color: '#367BF0' },
];

// ─── 状态 ────────────────────────────────────────────────────────────────
let currentSettings = null;
let saveHintTimer = null;
let sidebarCollapsed = false;

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
  autoCheckUpdates:   $('auto-check-updates'),
  editorBuiltin:      $('editor-builtin'),
  editorSystem:       $('editor-system'),

  // 日志
  logArchiveDays:     $('log-archive-days'),
  logCompressArchive: $('log-compress-archive'),
  logMaxFileSize:     $('log-max-file-size'),
  btnOpenLogs:        $('btn-open-logs'),

  // 数据
  btnOpenInstanceData: $('btn-open-instance-data'),
  btnOpenSettingsData: $('btn-open-settings-data'),
  btnExportBackup:     $('btn-export-backup'),
  btnImportBackup:     $('btn-import-backup'),
  btnManualAddInstance: $('btn-manual-add-instance'),

  // 关于
  aboutVersion:       $('about-version'),
  btnOpenGithub:      $('btn-open-github'),
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
  el.autoCheckUpdates.checked = settings.autoCheckUpdates ?? true;
  selectEditorOption(settings.configEditor?.useBuiltIn !== false ? 'builtin' : 'system');

  // 日志
  const logging = settings.logging || {};
  el.logArchiveDays.value = logging.maxArchiveDays || 30;
  el.logCompressArchive.checked = logging.compressArchive !== false;
  el.logMaxFileSize.value = Math.round((logging.maxFileSize || 52428800) / (1024 * 1024)); // 转换字节到 MB
}

// ─── 主题选项 ────────────────────────────────────────────────────────────
function selectThemeOption(theme) {
  [el.themeDark, el.themeLight, el.themeAuto].forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.theme === theme);
  });
}

// ─── 编辑器选项 ────────────────────────────────────────────────────────────
function selectEditorOption(editor) {
  [el.editorBuiltin, el.editorSystem].forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.editor === editor);
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

  try {
    await window.mofoxAPI.settingsWrite(patch);
    // 如果保存的是主题相关设置，通知后端更新主题
    if ('theme' in patch || 'accentColor' in patch) {
      await window.mofoxAPI.themeUpdate(currentSettings);
        // 只在主题相关设置修改时才立即应用主题
        applyTheme(currentSettings);
    }
    
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

  // 侧边栏折叠
  const toggleBtn = $('toggleSidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebarCollapsed = !sidebarCollapsed;
      const sidebar = document.querySelector('.settings-sidebar');
      
      if (sidebar) {
        sidebar.classList.toggle('collapsed', sidebarCollapsed);
      }
      
      toggleBtn.setAttribute(
        'aria-label',
        sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'
      );
      toggleBtn.setAttribute(
        'title',
        sidebarCollapsed ? '展开' : '折叠'
      );
    });
  }

  // 侧边栏导航切换
  document.querySelectorAll('.sidebar-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const sectionId = btn.dataset.section;
      
      // 更新侧边栏激活状态
      document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 切换内容区域
      document.querySelectorAll('.settings-section').forEach(section => {
        section.classList.toggle('active', section.id === sectionId);
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

  // 自动打开 Napcat WebUI
  el.autoOpenNapcatWebUI.addEventListener('change', () => {
    savePartial({ autoOpenNapcatWebUI: el.autoOpenNapcatWebUI.checked });
  });

  // 自动检查更新
  el.autoCheckUpdates.addEventListener('change', () => {
    savePartial({ autoCheckUpdates: el.autoCheckUpdates.checked });
  });

  // 配置编辑器
  [el.editorBuiltin, el.editorSystem].forEach(btn => {
    btn.addEventListener('click', () => {
      selectEditorOption(btn.dataset.editor);
      savePartial({ configEditor: { useBuiltIn: btn.dataset.editor === 'builtin' } });
    });
  });

  // 日志 - 归档保留天数
  el.logArchiveDays.addEventListener('change', () => {
    const days = parseInt(el.logArchiveDays.value, 10);
    if (!isNaN(days) && days >= 1 && days <= 365) {
      savePartial({ 
        logging: { 
          ...currentSettings.logging,
          maxArchiveDays: days 
        } 
      });
    }
  });

  // 日志 - 压缩归档
  el.logCompressArchive.addEventListener('change', () => {
    savePartial({ 
      logging: { 
        ...currentSettings.logging,
        compressArchive: el.logCompressArchive.checked 
      } 
    });
  });

  // 日志 - 单文件最大大小
  el.logMaxFileSize.addEventListener('change', () => {
    const sizeMB = parseInt(el.logMaxFileSize.value, 10);
    if (!isNaN(sizeMB) && sizeMB >= 1 && sizeMB <= 500) {
      savePartial({ 
        logging: { 
          ...currentSettings.logging,
          maxFileSize: sizeMB * 1024 * 1024 // 转换 MB 到字节
        } 
      });
    }
  });

  // 打开日志文件夹
  el.btnOpenLogs?.addEventListener('click', () => {
    window.mofoxAPI.openLogsDir();
  });

  // 数据 - 打开实例数据文件夹
  el.btnOpenInstanceData?.addEventListener('click', async () => {
    try {
      await window.mofoxAPI.openInstanceDataDir();
    } catch (e) {
      console.error('[settings] 打开实例数据文件夹失败', e);
    }
  });

  // 数据 - 打开设置数据文件夹
  el.btnOpenSettingsData?.addEventListener('click', async () => {
    try {
      await window.mofoxAPI.openSettingsDataDir();
    } catch (e) {
      console.error('[settings] 打开设置数据文件夹失败', e);
    }
  });

  // 数据 - 导出配置备份
  el.btnExportBackup?.addEventListener('click', async () => {
    try {
      const result = await window.mofoxAPI.exportBackup();
      if (result.success) {
        const sizeKB = (result.size / 1024).toFixed(2);
        await window.customAlert(
          `配置备份已成功导出！\n\n文件路径: ${result.path}\n文件大小: ${sizeKB} KB\n\n备份内容包括:\n• 实例配置列表 (instances.json)\n• 全局设置 (settings.json)\n\n⚠️ 此备份不包含实例安装目录、运行数据及日志文件`,
          '导出成功'
        );
      } else if (!result.cancelled) {
        await window.customAlert(result.error || '导出失败', '导出失败');
      }
    } catch (e) {
      console.error('[settings] 导出配置备份失败', e);
      await window.customAlert('导出备份时发生错误', '错误');
    }
  });

  // 数据 - 导入备份
  el.btnImportBackup?.addEventListener('click', async () => {
    const confirmed = await window.customConfirm(
      '导入备份将覆盖现有的同名实例配置，此操作不可撤销。\n确定要继续吗？',
      '确认导入'
    );
    
    if (!confirmed) return;
    
    try {
      const result = await window.mofoxAPI.importBackup();
      if (result.success) {
        await window.customAlert(
          `成功导入 ${result.count || 0} 个实例配置`,
          '导入成功'
        );
      } else if (result.cancelled) {
        // 用户取消了文件选择
      } else {
        await window.customAlert(result.error || '导入失败', '导入失败');
      }
    } catch (e) {
      console.error('[settings] 导入备份失败', e);
      await window.customAlert('导入备份时发生错误', '错误');
    }
  });

  // 数据 - 手动添加实例（实验性功能）
  el.btnManualAddInstance?.addEventListener('click', () => {
    openManualAddInstanceDialog();
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

// ─── 🧪 手动添加实例对话框 ────────────────────────────────────────────
function openManualAddInstanceDialog() {
  // 创建对话框容器
  const dialogOverlay = document.createElement('div');
  dialogOverlay.className = 'dialog-overlay';
  dialogOverlay.innerHTML = `
    <div class="dialog-backdrop" id="manual-instance-backdrop"></div>
    <div class="dialog-card manual-instance-dialog">
      <div class="dialog-header">
        <h3 class="dialog-title">
          <span class="material-symbols-rounded">science</span>
          手动添加实例 (实验性)
        </h3>
        <button class="dialog-close-btn" id="manual-instance-close">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="dialog-content manual-instance-content">
        <div class="form-warning">
          <span class="material-symbols-rounded">warning</span>
          <span>此功能适合高级用户。请确保所有信息准确无误，错误的配置可能导致实例无法启动。</span>
        </div>
        
        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">label</span>
            显示名称
          </label>
          <input type="text" class="form-input" id="instance-display-name" placeholder="例如: 我的机器人">
          <span class="form-hint">实例的显示名称（可选，默认使用 QQ 号）</span>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">
              <span class="material-symbols-rounded">numbers</span>
              QQ 号 *
            </label>
            <input type="text" class="form-input" id="instance-qq" placeholder="例如: 123456789" required>
            <span class="form-hint">机器人的 QQ 号</span>
          </div>

          <div class="form-group">
            <label class="form-label">
              <span class="material-symbols-rounded">person</span>
              主人 QQ 号 *
            </label>
            <input type="text" class="form-input" id="instance-owner-qq" placeholder="例如: 987654321" required>
            <span class="form-hint">机器人主人的 QQ 号</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">key</span>
            API 密钥 *
          </label>
          <input type="text" class="form-input" id="instance-api-key" placeholder="例如: your-api-key-here" required>
          <span class="form-hint">用于 API 访问的密钥</span>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">api</span>
            WebSocket 端口
          </label>
          <input type="number" class="form-input" id="instance-ws-port" placeholder="8080" value="8080" min="1024" max="65535">
          <span class="form-hint">WebSocket 服务端口</span>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">folder</span>
            Neo-MoFox 目录 *
          </label>
          <div class="path-input-group">
            <input type="text" class="form-input" id="instance-neomofox-dir" placeholder="例如: D:\\Bots\\MyBot\\neo-mofox" required>
            <button class="md3-btn md3-btn-tonal" id="browse-neomofox-dir">
              <span class="material-symbols-rounded">folder_open</span>
            </button>
          </div>
          <span class="form-hint">Neo-MoFox 项目的根目录（将自动检测 Git 分支作为频道）</span>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">folder</span>
            NapCat 目录
          </label>
          <div class="path-input-group">
            <input type="text" class="form-input" id="instance-napcat-dir" placeholder="例如: D:\\Bots\\MyBot\\napcat">
            <button class="md3-btn md3-btn-tonal" id="browse-napcat-dir">
              <span class="material-symbols-rounded">folder_open</span>
            </button>
          </div>
          <span class="form-hint">NapCat 目录（可选）</span>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">tag</span>
            NapCat 版本
          </label>
          <input type="text" class="form-input" id="instance-napcat-version" placeholder="例如: 1.0.0">
          <span class="form-hint">NapCat 版本号（可选）</span>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">description</span>
            备注
          </label>
          <textarea class="form-input" id="instance-description" rows="2" placeholder="关于此实例的补充说明..."></textarea>
        </div>

      </div>
      <div class="dialog-actions">
        <button class="md3-btn md3-btn-text" id="manual-instance-cancel">
          <span>取消</span>
        </button>
        <button class="md3-btn md3-btn-filled" id="manual-instance-confirm">
          <span class="material-symbols-rounded">add_circle</span>
          <span>添加实例</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialogOverlay);

  // 获取元素
  const backdrop = dialogOverlay.querySelector('#manual-instance-backdrop');
  const closeBtn = dialogOverlay.querySelector('#manual-instance-close');
  const cancelBtn = dialogOverlay.querySelector('#manual-instance-cancel');
  const confirmBtn = dialogOverlay.querySelector('#manual-instance-confirm');
  
  const displayNameInput = dialogOverlay.querySelector('#instance-display-name');
  const qqInput = dialogOverlay.querySelector('#instance-qq');
  const ownerQQInput = dialogOverlay.querySelector('#instance-owner-qq');
  const apiKeyInput = dialogOverlay.querySelector('#instance-api-key');
  const wsPortInput = dialogOverlay.querySelector('#instance-ws-port');
  const neomofoxDirInput = dialogOverlay.querySelector('#instance-neomofox-dir');
  const napcatDirInput = dialogOverlay.querySelector('#instance-napcat-dir');
  const napcatVersionInput = dialogOverlay.querySelector('#instance-napcat-version');
  const descInput = dialogOverlay.querySelector('#instance-description');

  const browseNeomofoxDirBtn = dialogOverlay.querySelector('#browse-neomofox-dir');
  const browseNapcatDirBtn = dialogOverlay.querySelector('#browse-napcat-dir');

  // 关闭对话框
  const closeDialog = () => {
    dialogOverlay.remove();
  };

  backdrop.addEventListener('click', closeDialog);
  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);

  // 浏览 Neo-MoFox 目录
  browseNeomofoxDirBtn.addEventListener('click', async () => {
    const selected = await window.mofoxAPI.selectProjectPath();
    if (selected) {
      neomofoxDirInput.value = selected;
    }
  });

  // 浏览 NapCat 目录
  browseNapcatDirBtn.addEventListener('click', async () => {
    const selected = await window.mofoxAPI.selectProjectPath();
    if (selected) napcatDirInput.value = selected;
  });

  // 确认添加
  confirmBtn.addEventListener('click', async () => {
    const qqNumber = qqInput.value.trim();
    const ownerQQNumber = ownerQQInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const neomofoxDir = neomofoxDirInput.value.trim();

    // 验证必填字段
    if (!qqNumber || !ownerQQNumber || !apiKey || !neomofoxDir) {
      await window.customAlert('请填写所有必填字段（标记有 * 的字段）', '信息不完整');
      return;
    }

    // 在保存前检测 Git 信息
    const gitInfo = await window.mofoxAPI.getGitInfo(neomofoxDir);
    if (!gitInfo.success) {
      const confirmed = await window.customConfirm(
        `无法获取 Git 信息：${gitInfo.error || '未知错误'}\n\n这可能导致实例频道设置为默认值 'dev'。\n\n是否继续添加？`,
        'Git 信息获取失败'
      );
      if (!confirmed) return;
    }

    // 构建实例配置
    const instanceConfig = {
      qqNumber,
      ownerQQNumber,
      apiKey,
      wsPort: wsPortInput.value ? parseInt(wsPortInput.value, 10) : 8080,
      neomofoxDir,
      napcatDir: napcatDirInput.value.trim() || null,
      napcatVersion: napcatVersionInput.value.trim() || null,
      displayName: displayNameInput.value.trim() || null,
      description: descInput.value.trim() || null,
    };

    try {
      const result = await window.mofoxAPI.manualAddInstance(instanceConfig);
      
      if (result.success) {
        const channelInfo = result.channel ? `\n频道: ${result.channel}` : '';
        await window.customAlert(
          `实例已成功添加！\n\nQQ 号: ${qqNumber}\n实例 ID: ${result.instanceId}${channelInfo}\n\n请在主界面刷新实例列表以查看新添加的实例。`,
          '添加成功'
        );
        closeDialog();
      } else {
        await window.customAlert(
          result.error || '添加实例失败，请检查配置信息',
          '添加失败'
        );
      }
    } catch (e) {
      console.error('[settings] 手动添加实例失败', e);
      await window.customAlert('添加实例时发生错误，请查看日志', '错误');
    }
  });

  // 聚焦到第一个输入框
  setTimeout(() => displayNameInput.focus(), 100);
}

// ─── 启动 ────────────────────────────────────────────────────────────────
init();
