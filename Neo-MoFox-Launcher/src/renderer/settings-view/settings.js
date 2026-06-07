/**
 * settings.js - 设置页面逻辑
 */
import { applyTheme } from '../theme.js';

// ─── 致谢名单数据 ────────────────────────────────────────────────────────
/**
 * 分类别致谢名单字典。
 *
 * 第一层字典键表示分类，用于渲染分类标题和分割线；第二层 entries 字典
 * 用于稳定排序和定位；每一项的 GitHub 元数据由 GitHub API 预拉取后
 * 固化到代码中，避免设置页运行时请求 GitHub API 触发 403 限流。
 */
const CREDIT_CATEGORIES = {
  core: {
    title: '核心维护',
    description: '项目发起、维护、设计与长期开发支持。',
    entries: {
      yishan: {
        githubUrl: 'https://github.com/minecraft1024a',
        displayName: 'yishan',
        avatarUrl: 'https://avatars.githubusercontent.com/u/140055845?v=4',
        profileType: 'User',
        location: 'china',
        note: '项目发起、维护与核心功能设计。',
      },
      mofox_studio: {
        githubUrl: 'https://github.com/MoFox-Studio',
        displayName: 'MoFox-Studio',
        avatarUrl: 'https://avatars.githubusercontent.com/u/225730003?v=4',
        profileType: 'Organization',
        location: 'China  中国',
        bio: '一个基于魔改麦麦而诞生的组织仓库',
        note: 'MoFox 工作室 - 设计与开发支持，项目管理。',
      },
      ikun: {
        githubUrl: 'https://github.com/ikun-1145141',
        displayName: 'ikun两年半',
        avatarUrl: 'https://avatars.githubusercontent.com/u/265925499?v=4',
        profileType: 'User',
        blog: 'https://ikun114.top',
        bio: '喵喵喵喵',
        note: '设计与开发支持',
      },
      sunbiz1024: {
        githubUrl: 'https://github.com/sunbiz1024',
        displayName: 'Sunbiz',
        avatarUrl: 'https://avatars.githubusercontent.com/u/98442033?v=4',
        profileType: 'User',
        bio: '111',
        note: '计与开发支持，特别是 UI 设计与实现。',
      },
      uilyha56_wq: {
        githubUrl: 'https://github.com/fuilyha56-wq',
        displayName: 'Lycoris-flower',
        avatarUrl: 'https://avatars.githubusercontent.com/u/226964479?v=4',
        profileType: 'User',
        bio: 'Lycoris radiata\n一名纯废物的vibe coding享受者喵～',
        note: '请支持Lycoris radiata喵',
      },
    },
  },
  contributors: {
    title: '贡献与支持',
    description: '感谢对 Neo-MoFox Launcher 提供帮助、支持与灵感和测试 Neo-MoFox Launcher 开发版本的朋友们。',
    entries: {
      luciferring: {
        githubUrl: 'https://github.com/luciferring',
        displayName: 'luciferring',
        avatarUrl: 'https://avatars.githubusercontent.com/u/249419621?v=4',
        profileType: 'User',
        note: '感谢对 Neo-MoFox Launcher 的支持与贡献。',
      },
      diebaokeai: {
        githubUrl: 'https://github.com/diebaokeai',
        displayName: '蝶宝可爱捏',
        avatarUrl: 'https://avatars.githubusercontent.com/u/244420175?v=4',
        profileType: 'User',
        note: '感谢对 Neo-MoFox Launcher 的支持与贡献。',
      },
      mofox_elysia: {
        githubUrl: 'https://github.com/MoFox-Elysia',
        displayName: 'MoFox-Elysia',
        avatarUrl: 'https://avatars.githubusercontent.com/u/245707589?v=4',
        profileType: 'User',
        note: '感谢对 Neo-MoFox Launcher 的支持与贡献。',
      },
      jgfghuhgh: {
        githubUrl: 'https://github.com/jgfghuhgh',
        displayName: '夢',
        avatarUrl: 'https://avatars.githubusercontent.com/u/126490325?v=4',
        profileType: 'User',
        note: '感谢对 Neo-MoFox Launcher 的支持与贡献。',
      },
      coldleg: {
        githubUrl: 'https://github.com/ColdLeg',
        displayName: 'ColdLeg',
        avatarUrl: 'https://avatars.githubusercontent.com/u/251687745?v=4',
        profileType: 'User',
        note: '感谢对 Neo-MoFox Launcher 的支持与贡献。',
      },
      xiaoshi1234: {
        githubUrl: 'https://github.com/Xiaoshi1234',
        displayName: '小识',
        avatarUrl: 'https://avatars.githubusercontent.com/u/179480621?v=4',
        profileType: 'User',
        note: '感谢对 Neo-MoFox Launcher 的支持与贡献。',
      },
      liyi3068238601_oss: {
        githubUrl: 'https://github.com/liyi3068238601-oss',
        displayName: 'liyi3068238601-oss',
        avatarUrl: 'https://avatars.githubusercontent.com/u/289515629?v=4',
        profileType: 'User',
        note: '感谢对 Neo-MoFox Launcher 的支持与贡献。',
      },
      kistiatsuki: {
        githubUrl: 'https://github.com/Kistiatsuki',
        displayName: '满月月',
        avatarUrl: 'https://avatars.githubusercontent.com/u/253261805?v=4',
        profileType: 'User',
        bio: '绝对意义上的区，由此而生的孤独，教会你构思的是......',
        note: '感谢对 Neo-MoFox Launcher 的支持与贡献。',
      },
      yaoguai0701: {
        githubUrl: 'https://github.com/yaoguai0701',
        displayName: '一只无聊的妖怪',
        avatarUrl: 'https://avatars.githubusercontent.com/u/291200682?v=4',
        profileType: 'User',
        note: '感谢对 Neo-MoFox Launcher 的支持与贡献。',
      },
    },
  },
};

const GITHUB_USER_URL_PATTERN = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/?$/;

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
  autoOpenPlatformWebUI:$('auto-open-platform-webui'),
  autoCheckUpdates:   $('auto-check-updates'),
  autoCheckLauncherUpdates: $('auto-check-launcher-updates'),
  closeToTray:        $('close-to-tray'),
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
  // 关于
  aboutVersion:       $('about-version'),
  btnOpenGithub:      $('btn-open-github'),
  btnOpenYishan:      $('btn-open-yishan'),
  creditsList:        $('credits-list'),
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
  await renderCredits();
  bindEvents();
}

// ─── 致谢名单 ────────────────────────────────────────────────────────────

/**
 * 从 GitHub 个人主页链接中解析用户名。
 *
 * @param {string} githubUrl GitHub 个人主页链接。
 * @returns {string | null} GitHub 用户名，无法解析时返回 null。
 */
function parseGithubUsername(githubUrl) {
  const normalizedUrl = githubUrl.trim();
  const match = normalizedUrl.match(GITHUB_USER_URL_PATTERN);
  return match ? match[1] : null;
}

/**
 * 将致谢名单字典展开为分类列表。
 *
 * @returns {Array<{ key: string, title: string, description: string, entries: Array<{ key: string, username: string, displayName: string, avatarUrl: string, profileUrl: string, note: string, isLinked: boolean }> }>}
 *   可直接首屏渲染的分类致谢列表。
 */
function getCreditCategoryGroups() {
  return Object.entries(CREDIT_CATEGORIES).map(([categoryKey, category]) => ({
    key: categoryKey,
    title: category.title,
    description: category.description,
    entries: Object.entries(category.entries).map(([key, credit]) => normalizeCreditEntry(key, credit)),
  }));
}

/**
 * 将致谢对象配置标准化为可立即渲染的数据。
 *
 * @param {string} key 致谢对象键名。
 * @param {{ githubUrl: string, displayName?: string, avatarUrl?: string, profileType?: string, blog?: string, location?: string, bio?: string, note: string }} credit 致谢对象配置。
 * @returns {{ key: string, username: string, displayName: string, avatarUrl: string, profileUrl: string, profileType: string, blog: string, location: string, bio: string, note: string, isLinked: boolean }}
 *   不依赖运行时 API 请求的致谢展示数据。
 */
function normalizeCreditEntry(key, credit) {
  const username = parseGithubUsername(credit.githubUrl || '');

  return {
    key,
    username: username || key,
    displayName: credit.displayName || username || key,
    avatarUrl: credit.avatarUrl || (username ? `https://github.com/${encodeURIComponent(username)}.png` : ''),
    profileUrl: credit.githubUrl || '',
    profileType: credit.profileType || '',
    blog: credit.blog || '',
    location: credit.location || '',
    bio: credit.bio || '',
    note: credit.note,
    isLinked: Boolean(username),
  };
}

/**
 * 渲染致谢头像占位符。
 *
 * @param {string} displayName 显示名称。
 * @returns {string} 头像占位符文本。
 */
function getCreditAvatarFallback(displayName) {
  return (displayName || '?').trim().slice(0, 1).toUpperCase();
}

/**
 * 为单个致谢对象创建名单条目节点。
 *
 * @param {{ key: string, username: string, displayName: string, avatarUrl: string, profileUrl: string, note: string, isLinked: boolean }} credit
 *   致谢对象展示数据。
 * @returns {HTMLButtonElement} 致谢名单条目按钮。
 */
function createCreditItem(credit) {
  const item = document.createElement('button');
  item.className = 'credit-item';
  item.type = 'button';
  item.disabled = !credit.profileUrl;
  item.dataset.creditKey = credit.key;
  item.dataset.profileUrl = credit.profileUrl;

  const avatar = document.createElement('div');
  avatar.className = 'credit-avatar credit-avatar-pending';
  avatar.textContent = getCreditAvatarFallback(credit.displayName);

  const body = document.createElement('div');
  body.className = 'credit-body';

  const name = document.createElement('div');
  name.className = 'credit-name';
  name.textContent = credit.displayName;

  const username = document.createElement('div');
  username.className = 'credit-username';
  username.textContent = credit.isLinked ? `@${credit.username}` : '等待补充 GitHub 链接';

  const note = document.createElement('div');
  note.className = 'credit-note';
  note.textContent = credit.note;

  body.append(name, username, note);
  item.append(avatar, body);

  item.addEventListener('click', () => {
    const profileUrl = item.dataset.profileUrl;
    if (profileUrl) {
      window.mofoxAPI.openExternal(profileUrl);
    }
  });

  return item;
}

/**
 * 用异步获取到的 GitHub 资料更新名单条目。
 *
 * @param {HTMLButtonElement} item 已渲染的名单条目按钮。
 * @param {{ key: string, username: string, displayName: string, avatarUrl: string, profileUrl: string, note: string, isLinked: boolean }} credit
 *   带 GitHub 资料和头像链接的致谢展示数据。
 * @returns {void}
 */
function updateCreditItemProfile(item, credit) {
  item.disabled = !credit.profileUrl;
  item.dataset.profileUrl = credit.profileUrl;

  const avatar = item.querySelector('.credit-avatar');
  if (avatar) {
    avatar.classList.remove('credit-avatar-pending');
    avatar.textContent = '';

    if (credit.avatarUrl) {
      const image = document.createElement('img');
      image.src = credit.avatarUrl;
      image.alt = `${credit.displayName} 的 GitHub 头像`;
      image.loading = 'lazy';
      image.decoding = 'async';
      avatar.appendChild(image);
    } else {
      avatar.textContent = getCreditAvatarFallback(credit.displayName);
    }
  }

  const name = item.querySelector('.credit-name');
  if (name) {
    name.textContent = credit.displayName;
  }

  const username = item.querySelector('.credit-username');
  if (username) {
    username.textContent = credit.isLinked ? `@${credit.username}` : '等待补充 GitHub 链接';
  }
}

/**
 * 使用硬编码资料更新名单条目的头像和名称。
 *
 * @param {Array<{ item: HTMLButtonElement, credit: { key: string, username: string, displayName: string, avatarUrl: string, profileUrl: string, note: string, isLinked: boolean } }>} renderedCredits
 *   已进入页面的名单条目和对应基础数据。
 * @returns {void}
 */
function hydrateCreditsFromStaticData(renderedCredits) {
  renderedCredits.forEach(({ item, credit }) => {
    updateCreditItemProfile(item, credit);
  });
}

/**
 * 渲染设置页中的致谢名单。
 *
 * @returns {Promise<void>} 渲染完成后返回。
 */
async function renderCredits() {
  if (!el.creditsList) return;

  try {
    const categories = getCreditCategoryGroups();
    const renderedCredits = [];
    el.creditsList.innerHTML = '';

    categories.forEach((category) => {
      const group = document.createElement('section');
      group.className = 'credit-category';
      group.setAttribute('aria-labelledby', `credit-category-${category.key}`);

      const header = document.createElement('div');
      header.className = 'credit-category-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'credit-category-title-group';

      const title = document.createElement('h3');
      title.className = 'credit-category-title';
      title.id = `credit-category-${category.key}`;
      title.textContent = category.title;

      const description = document.createElement('p');
      description.className = 'credit-category-description';
      description.textContent = category.description;

      const count = document.createElement('span');
      count.className = 'credit-category-count';
      count.textContent = `${category.entries.length} 位`;

      const grid = document.createElement('div');
      grid.className = 'credit-category-grid';

      category.entries.forEach((credit) => {
        const item = createCreditItem(credit);
        renderedCredits.push({ item, credit });
        grid.appendChild(item);
      });

      titleGroup.append(title, description);
      header.append(titleGroup, count);
      group.append(header, grid);
      el.creditsList.appendChild(group);
    });

    hydrateCreditsFromStaticData(renderedCredits);
  } catch (error) {
    console.error('[settings] 致谢名单渲染失败', error);
    el.creditsList.innerHTML = '<div class="credits-loading">致谢名单加载失败</div>';
  }
}

//─────────────────────────────────────────────────────────────

// ─── 填充 UI ─────────────────────────────────────────────────────────────
function populateUI(settings) {
  // 主题
  selectThemeOption(settings.theme || 'dark');

  // 强调色
  setAccentColor(settings.accentColor || '#7c6bbd', false);

  // 通用
  el.defaultInstallDir.value = settings.defaultInstallDir || '';
  el.autoOpenPlatformWebUI.checked = settings.autoOpenPlatformWebUI ?? true;
  el.autoCheckUpdates.checked = settings.autoCheckUpdates ?? true;
  el.autoCheckLauncherUpdates.checked = settings.autoCheckLauncherUpdates ?? true;
  el.closeToTray.checked = settings.closeToTray ?? false;
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

  // 自动打开平台 WebUI
  el.autoOpenPlatformWebUI.addEventListener('change', () => {
    savePartial({ autoOpenPlatformWebUI: el.autoOpenPlatformWebUI.checked });
  });

  // 自动检查更新
  el.autoCheckUpdates.addEventListener('change', () => {
    savePartial({ autoCheckUpdates: el.autoCheckUpdates.checked });
  });

  // 自动检查启动器更新
  el.autoCheckLauncherUpdates.addEventListener('change', () => {
    savePartial({ autoCheckLauncherUpdates: el.autoCheckLauncherUpdates.checked });
  });

  // 关闭到系统托盘
  el.closeToTray.addEventListener('change', () => {
    savePartial({ closeToTray: el.closeToTray.checked });
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

  // 浏览安装目录
  el.btnBrowseInstallDir.addEventListener('click', async () => {
    const currentPath = el.defaultInstallDir.value.trim();
    const selected = await window.mofoxAPI.selectDirectory({
      title: '选择默认安装目录',
      defaultPath: currentPath || undefined,
    });
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
function handleVersionClick() {
  versionClickCount++;
  clearTimeout(versionClickTimer);

  // 2秒内未继续点击则重置
  versionClickTimer = setTimeout(() => { versionClickCount = 0; }, 2000);

  if (versionClickCount >= 7) {
    versionClickCount = 0;
    window.location.href = 'flappy-fox.html';
  }
}

// ─── 启动 ────────────────────────────────────────────────────────────────
init();
