// ─── 通用参数检测（必须在 require('electron') 之前） ─────────────────
// 使用通用参数解析模块检测启动模式（如 --cli、--daemon 等），
// 如果匹配到 skipGui=true 的模式，则执行对应处理器并退出，不启动 Electron GUI。
require('./commands/modes'); // 加载所有模式注册
const { detectMode, startupContext } = require('./commands/args-parser');

// ─── 执行参数检测与分发 ───────────────────────────────────────────────
const _modeResult = detectMode();
if (_modeResult) {
  const { mode, explicit } = _modeResult;
  // 执行 argv 预处理
  if (mode.prepareArgv) {
    mode.prepareArgv({ explicit });
  }
  // 执行模式处理器
  mode.handler().then(() => {
    if (mode.skipGui) {
      process.exit(0);
    }
    // skipGui=false 的模式执行完后继续启动 GUI
  }).catch(err => {
    console.error(`[${mode.flag}] 错误: ${err.message}`);
    process.exit(1);
  });
  // 如果 skipGui=true，阻止后续 Electron GUI 代码执行
  if (mode.skipGui) {
    return;
  }
}

// ─── 以下为 Electron GUI 模式 ────────────────────────────────────────
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, globalShortcut } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty');

// strip-ansi v7+ 是纯 ESM 模块，无法通过 require() 加载。
// 使用内联正则实现等效功能，避免 ESM/CJS 兼容性问题。
// 参考: https://github.com/chalk/ansi-regex/blob/main/index.js
const ansiRegex = /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
const stripAnsi = (str) => typeof str === 'string' ? str.replace(ansiRegex, '') : str;

// ─── 设置应用名称和 WM_CLASS ────────────────────────────────────────
// 这对于系统 electron 正确显示应用图标和名称至关重要
app.setName('Neo-MoFox-Launcher');
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('class', 'Neo-MoFox-Launcher');
}

// ─── Windows 终端 UTF-8 修复 ────────────────────────────────────────
// 在任何 console.log 之前，将 Windows 控制台代码页切换为 UTF-8 (65001)
// 否则中文字符会因 GBK/CP936 默认编码而显示为乱码
// wtttttttttttfffffffffffffff
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (_) { /* ignore - non-critical */ }
}

if (process.stdout && typeof process.stdout.setEncoding === 'function') {
  process.stdout.setEncoding('utf-8');
}
if (process.stderr && typeof process.stderr.setEncoding === 'function') {
  process.stderr.setEncoding('utf-8');
}

const { platformHelper } = require('./services/utils/PlatformHelper');
const { platformRegistry } = require('./services/platforms/PlatformRegistry');
const { LauncherLogger, InstanceLogger, LogReader } = require('./services/utils/LoggerService');
const { storageService } = require('./services/install/StorageService');
const { generateInstanceId } = require('./services/install/InstanceIdService');
const { updateChecker } = require('./services/update/UpdateChecker');
const { getOobeService } = require('./services/oobe/OobeService');
const { mirrorService } = require('./services/utils/MirrorService');

// 初始化 OobeService（传入 app 和 dialog）
const oobeService = getOobeService(app, dialog);

let mainWindow;
let launcherLogger = null; // 启动器日志管理器
let mofoxProcess = null;
let mofoxStatus = 'stopped'; // stopped | starting | running | stopping | error
let projectPath = '';
let logBuffer = [];
const MAX_LOG_LINES = 2000;

// ─── 多实例进程管理 ───────────────────────────────────
const instanceProcesses = new Map(); // instanceId -> { process, status, logs, stats, startTime, generation, ptyBuffers, ptyProcesses }

// PTY Ring Buffer 配置
const PTY_BUFFER_MAX_SIZE = 100000; // 保留最近 100KB 原始字节用于历史回放

// ─── 配置编辑器窗口管理 ─────────────────────────────────
const editorWindows = new Map(); // filePath -> BrowserWindow

// ─── 系统托盘 ─────────────────────────────────────────
let tray = null;
let isQuitting = false; // 标记是否真正退出（区分关闭到托盘和真正退出）

// ─── 窗口创建 ───────────────────────────────────────
function createWindow(isOobe = false) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hidden', // 隐藏默认标题栏，保留窗口边框以支持 Snap
    icon: path.join(__dirname, '..', 'assets', 'images','icon', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false); // 确保菜单栏也不显示
  
console.log(app.getName());

  // 根据 OOBE 状态加载不同的页面
  if (isOobe) {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'oobe-view', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }



  // ─── 禁用鼠标侧键导航（主进程层面拦截） ──────────────────────────────
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 仅允许 file:// 协议的本地页面导航
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  // ─── 所有 window.open 一律走系统浏览器，禁止 Electron 创建内置子窗口 ──
  // 这覆盖了 xterm WebLinksAddon 默认 handler 走 window.open 的兜底路径，
  // 确保终端里点链接绝对不会弹出内置 BrowserWindow。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  // 监听窗口最大化/还原状态变化
  const sendMaximizeState = () => {
    mainWindow.webContents.send('window-maximize-changed', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', sendMaximizeState);
  mainWindow.on('unmaximize', sendMaximizeState);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // 设置 OobeService 的主窗口引用（用于对话框）
  oobeService.setMainWindow(mainWindow);
}

// ─── 配置编辑器窗口创建 ──────────────────────────────────
/**
 * 创建配置编辑器窗口
 * @param {string} filePath - 要编辑的文件路径
 * @param {string} fileName - 文件名（用于窗口标题）
 */
function createEditorWindow(filePath, fileName) {
  // 检查同一文件是否已打开，如果是则聚焦
  if (editorWindows.has(filePath)) {
    const existingWindow = editorWindows.get(filePath);
    if (!existingWindow.isDestroyed()) {
      existingWindow.focus();
      return existingWindow;
    }
    editorWindows.delete(filePath);
  }

  const editorWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    title: `编辑配置 - ${fileName}`,
    titleBarStyle: 'hidden', // 隐藏默认标题栏
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
      additionalArguments: [`--file-path=${filePath}`] // 传递文件路径
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    parent: mainWindow, // 设置父窗口关联
    modal: false
  });

  Menu.setApplicationMenu(null);
  editorWindow.setMenuBarVisibility(false);
  
  editorWindow.loadFile(path.join(__dirname, 'windows', 'editor', 'editor.html'));

  // F12 快捷键切换开发者工具
  editorWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (editorWindow.webContents.isDevToolsOpened()) {
        editorWindow.webContents.closeDevTools();
      } else {
        editorWindow.webContents.openDevTools();
      }
    }
  });

  // 编辑器窗口里的外链一律走系统浏览器
  editorWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 监听窗口最大化/还原状态变化
  const sendMaximizeState = () => {
    editorWindow.webContents.send('window-maximize-changed', editorWindow.isMaximized());
  };
  editorWindow.on('maximize', sendMaximizeState);
  editorWindow.on('unmaximize', sendMaximizeState);

  editorWindow.on('closed', () => {
    editorWindows.delete(filePath);
  });

  editorWindows.set(filePath, editorWindow);
  return editorWindow;
}

// ─── 系统托盘创建 ─────────────────────────────────────
/**
 * 创建系统托盘图标及右键菜单
 */
function createTray() {
  if (tray) return; // 已存在则不重复创建

  const iconPath = path.join(__dirname, '..', 'assets', 'images', 'icon', 'icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Neo-MoFox-Launcher');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow(false);
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // 双击托盘图标显示主窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow(false);
    }
  });
}

/**
 * 销毁系统托盘
 */
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

// ─── 应用生命周期 ───────────────────────────────────
app.whenReady().then(async () => {
  // 初始化 StorageService（确保数据目录存在）
  storageService.init();
  
  // 初始化启动器日志系统（必须在最前面，在任何 console 输出之前）
  const logsDir = path.join(storageService.getDataDir(), 'logs');
  launcherLogger = new LauncherLogger(logsDir);
  launcherLogger.hijackConsole();
  
  // 设置全局环境变量，确保所有子进程都使用 UTF-8
  process.env.PYTHONIOENCODING = 'utf-8';
  process.env.PYTHONUNBUFFERED = '1';
  
  // 启动时检测系统环境
  const sysEnv = platformHelper.detectSystemEnv();

  console.log(`[Main] 系统平台: ${sysEnv.platformLabel} (${sysEnv.osType} ${sysEnv.osRelease})${sysEnv.distro ? ' - ' + sysEnv.distroName : ''}`);
  console.log(`[Main] 架构: ${sysEnv.arch}, Shell: ${sysEnv.shell}`);
  
  // 检查 OOBE 是否已完成
  const { settingsService } = require('./services/settings/SettingsService');
  const settings = settingsService.readSettings();
  
  if (!settings.oobeCompleted) {
    // 首次运行，在主窗口中显示 OOBE
    console.log('[Main] 检测到首次运行，启动 OOBE 向导');
    createWindow(true); // 传入 true 表示加载 OOBE 页面
  } else if (startupContext.navigateTo === 'instance-view' && startupContext.instanceName) {
    // --start 模式：直接跳转到指定实例并自动启动
    const targetName = startupContext.instanceName;
    const instances = storageService.getInstances();
    const instance = instances.find(i => i.id === targetName)
      || instances.find(i => i.name === targetName)
      || instances.find(i => i.extra?.displayName === targetName)
      || instances.find(i => i.qqNickname === targetName)
      || instances.find(i => i.id && i.id.startsWith(targetName))
      || null;

    if (!instance) {
      console.error(`[Main] --start 错误: 找不到实例 "${targetName}"`);
      console.error('[Main] 可用实例列表:');
      if (instances.length === 0) {
        console.error('  (无可用实例)');
      } else {
        instances.forEach(i => {
          const name = i.name || i.extra?.displayName || i.qqNickname || i.id;
          console.error(`  - ${name} (ID: ${i.id})`);
        });
      }
      process.exit(1);
    } else {
      const displayName = instance.name || instance.extra?.displayName || instance.qqNickname || instance.id;
      console.log(`[Main] --start 模式: 直接启动实例 "${displayName}" (${instance.id})`);
      createWindow(false);
      loadSettings();
      // 加载 instance-view 页面并带上 autoStart 参数
      const instanceViewUrl = path.join(__dirname, 'renderer', 'instance-view', 'index.html');
      const query = `?instanceId=${encodeURIComponent(instance.id)}&name=${encodeURIComponent(displayName)}&autoStart=true`;
      mainWindow.loadFile(instanceViewUrl, { search: query });
    }
  } else {
    // 已完成 OOBE，正常启动主窗口
    console.log('[Main] OOBE 已完成，启动主窗口');
    createWindow(false);
    loadSettings();
  }
  
  // 初始化主题（根据用户设置生成并保存主题）
  try {
    await themeService.updateThemeFromSettings(settings);
    console.log('[Main] 主题服务已初始化');
  } catch (error) {
    console.error('[Main] 主题服务初始化失败:', error);
  }
});

app.on('window-all-closed', () => {
  // 如果启用了关闭到托盘且不是真正退出，则不退出应用
  const { settingsService } = require('./services/settings/SettingsService');
  const closeToTray = settingsService.get('closeToTray');
  if (closeToTray && !isQuitting) {
    // 窗口已隐藏到托盘，不退出
    return;
  }
  killMofoxProcess();
  if (launcherLogger) {
    launcherLogger.close();
  }
  destroyTray();
  app.quit();
});

app.on('before-quit', () => {
  isQuitting = true; // 标记为真正退出
  killMofoxProcess();
  if (launcherLogger) {
    launcherLogger.close();
  }
  destroyTray();
});

// ─── 设置持久化 ─────────────────────────────────────
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'launcher-settings.json');
}

function loadSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      projectPath = data.projectPath || '';
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

function saveSettings() {
  try {
    const settingsPath = getSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify({ projectPath }, null, 2));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function killMofoxProcess() {
  // 多实例进程都是 node-pty 的 IPty 对象，直接 kill 即可，附带平台命令兜底
  for (const [instanceId, data] of instanceProcesses.entries()) {
    for (const proc of [data.mofoxProcess, data.napcatProcess]) {
      if (!proc) continue;
      try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { shell: true });
        } else {
          require('tree-kill')(proc.pid, 'SIGKILL', () => { /* ignore */ });
        }
      } catch (_) { /* ignore */ }
    }
  }
  instanceProcesses.clear();
}

// ─── 系统资源实时监控 ─────────────────────────────────
let _prevCpuInfo = null;

function _getCpuTimes() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  return { idle: totalIdle / cpus.length, total: totalTick / cpus.length };
}

function getResourceUsage() {
  // ── Memory ──
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = Math.round((usedMem / totalMem) * 100);

  // ── CPU（两次采样差值法）──
  const cur = _getCpuTimes();
  let cpuPercent = 0;
  if (_prevCpuInfo) {
    const idleDiff = cur.idle - _prevCpuInfo.idle;
    const totalDiff = cur.total - _prevCpuInfo.total;
    cpuPercent = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
  }
  _prevCpuInfo = cur;

  return {
    cpuPercent,
    memPercent,
    memUsedGB: +(usedMem / 1073741824).toFixed(1),
    memTotalGB: +(totalMem / 1073741824).toFixed(1),
  };
}

// ─── 系统信息 ───────────────────────────────────────
function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  const usedMem = (totalMem - freeMem).toFixed(1);
  const sysEnv = platformHelper.detectSystemEnv();
  return {
    platform: `${os.type()} ${os.release()}`,
    platformId: sysEnv.platform,
    platformLabel: sysEnv.platformLabel,
    distro: sysEnv.distro || null,
    distroName: sysEnv.distroName || null,
    arch: os.arch(),
    cpu: cpus[0] ? cpus[0].model : 'Unknown',
    cpuCores: cpus.length,
    totalMem: `${totalMem} GB`,
    usedMem: `${usedMem} GB`,
    freeMem: `${freeMem} GB`,
    memUsage: Math.round((usedMem / totalMem) * 100),
    uptime: formatUptime(os.uptime()),
    hostname: os.hostname(),
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
  };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}天 ${h}小时`;
  if (h > 0) return `${h}小时 ${m}分钟`;
  return `${m}分钟`;
}

// ─── IPC 处理 ───────────────────────────────────────
ipcMain.handle('get-status', () => {
  return { status: mofoxStatus, projectPath };
});

ipcMain.handle('get-logs', () => {
  return logBuffer;
});

ipcMain.handle('get-system-info', () => {
  return getSystemInfo();
});

ipcMain.handle('get-resource-usage', () => {
  return getResourceUsage();
});

ipcMain.handle('get-platform-info', () => {
  return platformHelper.detectSystemEnv();
});

// ─── 更新检查 IPC ─────────────────────────────────────────────────────
ipcMain.handle('check-for-updates', async () => {
  return await updateChecker.check();
});

ipcMain.handle('get-build-version', () => {
  return updateChecker.getLocalVersion();
});

// ─── 镜像服务 IPC ─────────────────────────────────────────────────────
ipcMain.handle('mirror-check-connectivity', async () => {
  return await mirrorService.checkConnectivity();
});

ipcMain.handle('mirror-get-license-urls', async () => {
  const [eulaUrls, privacyUrls] = await Promise.all([
    mirrorService.getEulaUrls(),
    mirrorService.getPrivacyUrls(),
  ]);
  return { eulaUrls, privacyUrls };
});

ipcMain.handle('select-project-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Neo-MoFox 项目目录',
    properties: ['openDirectory'],
    defaultPath: projectPath || app.getPath('home'),
  });

  if (!result.canceled && result.filePaths.length > 0) {
    projectPath = result.filePaths[0];
    saveSettings();
    sendLog('info', `◉ 项目路径已设置: ${projectPath}`);
    return projectPath;
  }
  return null;
});

ipcMain.handle('select-file', async (event, options = {}) => {
  const dialogOptions = {
    title: options.title || '选择文件',
    properties: ['openFile'],
    defaultPath: options.defaultPath || app.getPath('home'),
  };
  
  if (options.filters) {
    dialogOptions.filters = options.filters;
  }
  
  const result = await dialog.showOpenDialog(mainWindow, dialogOptions);
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('select-directory', async (event, options = {}) => {
  const dialogOptions = {
    title: options.title || '选择目录',
    properties: ['openDirectory'],
    defaultPath: options.defaultPath || app.getPath('home'),
  };

  const result = await dialog.showOpenDialog(mainWindow, dialogOptions);

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('clear-logs', () => {
  logBuffer = [];
});

ipcMain.handle('open-project-folder', () => {
  if (projectPath && fs.existsSync(projectPath)) {
    shell.openPath(projectPath);
  }
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('get-project-info', () => {
  if (!projectPath) return null;

  try {
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    let version = '0.1.0';
    let name = 'Neo-MoFox';

    if (fs.existsSync(pyprojectPath)) {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      if (versionMatch) version = versionMatch[1];
      if (nameMatch) name = nameMatch[1];
    }

    // 检查 Python 版本文件
    const pyVersionPath = path.join(projectPath, '.python-version');
    let pythonVersion = '>=3.11';
    if (fs.existsSync(pyVersionPath)) {
      pythonVersion = fs.readFileSync(pyVersionPath, 'utf-8').trim();
    }

    // 检查 git 信息
    let gitBranch = '';
    const headPath = path.join(projectPath, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const headContent = fs.readFileSync(headPath, 'utf-8').trim();
      if (headContent.startsWith('ref:')) {
        gitBranch = headContent.replace('ref: refs/heads/', '');
      }
    }

    // 检查插件目录
    let pluginCount = 0;
    const pluginsDir = path.join(projectPath, 'plugins');
    const builtinDir = path.join(projectPath, 'src', 'app', 'built_in');
    if (fs.existsSync(pluginsDir)) {
      pluginCount += fs.readdirSync(pluginsDir).filter(f => {
        return fs.statSync(path.join(pluginsDir, f)).isDirectory();
      }).length;
    }
    if (fs.existsSync(builtinDir)) {
      pluginCount += fs.readdirSync(builtinDir).filter(f => {
        return fs.statSync(path.join(builtinDir, f)).isDirectory();
      }).length;
    }

    return { name, version, pythonVersion, gitBranch, pluginCount, projectPath };
  } catch (e) {
    return null;
  }
});


// ─── 环境检测 & 自动安装 IPC（委托 OobeService）──────────────────────
// OobeService 已在文件顶部初始化

ipcMain.handle('env-check-python', () => oobeService.checkPython());
ipcMain.handle('env-check-uv',     () => oobeService.checkUv());
ipcMain.handle('env-check-git',    () => oobeService.checkGit());
ipcMain.handle('env-check-all',    () => oobeService.checkAll());

ipcMain.handle('env-check-get-cached', () => oobeService.loadCache());

ipcMain.handle('env-check-clear-cache', () => oobeService.clearCache());

// 安装单个依赖（下载安装包 + 静默安装），通过事件推送进度
ipcMain.handle('env-install-dep', async (_event, depName) => {
  return oobeService.installDep(depName, (evt) => {
    mainWindow?.webContents.send('env-install-progress', { depName, ...evt });
  });
});

// 一键安装所有缺失依赖
ipcMain.handle('env-install-all-missing', async (_event, checks) => {
  return oobeService.installAllMissing(checks, (evt) => {
    mainWindow?.webContents.send('env-install-progress', evt);
  });
});

// ─── OOBE 向导 IPC ────────────────────────────────────────────────────────

// 选择安装路径（委托给 OobeService）
ipcMain.handle('oobe-select-path', () => oobeService.selectPath());

// 验证路径（委托给 OobeService）
ipcMain.handle('oobe-validate-path', (_event, targetPath) => oobeService.validatePath(targetPath));

// 创建安装目录（用户确认后调用，在父目录下创建 Neo-MoFox 子文件夹）
ipcMain.handle('oobe-create-install-dir', (_event, targetPath) => oobeService.createInstallDir(targetPath));

// ─── sudo 密码管理 IPC（Linux 平台）────────────────────────────────────

// 验证 sudo 密码（前端调用，返回验证结果）
ipcMain.handle('sudo-validate-password', async (_event, password) => {
  return oobeService.validateSudoPassword(password);
});

// 设置已验证的 sudo 密码（前端验证成功后调用）
ipcMain.handle('sudo-set-password', (_event, password) => {
  oobeService.setSudoPassword(password);
  return { success: true };
});

// 清除 sudo 密码（安装完成后前端调用）
ipcMain.handle('sudo-clear-password', () => {
  oobeService.clearSudoPassword();
  return { success: true };
});

// 检查是否已设置 sudo 密码
ipcMain.handle('sudo-has-password', () => {
  return { hasPassword: oobeService.hasSudoPassword() };
});

// OOBE 相关 handlers 已移除（未被使用）
// 实际使用 settingsWrite 来保存 OOBE 完成状态

// ─── 应用重启 ────────────────────────────────────────────────────────────
ipcMain.handle('app-restart', () => {
  console.log('[Main] 重启电脑');
  
  // 根据平台执行不同的重启命令
  const platform = process.platform;
  let rebootCmd, rebootArgs;
  
  if (platform === 'win32') {
    // Windows: shutdown /r /t 10
    rebootCmd = 'shutdown';
    rebootArgs = ['/r', '/t', '10'];
  } else if (platform === 'darwin') {
    // macOS: sudo shutdown -r +0 (需要管理员权限，使用 AppleScript 弹出授权)
    rebootCmd = 'osascript';
    rebootArgs = ['-e', 'tell app "System Events" to restart'];
  } else {
    // Linux: systemctl reboot (需要 sudo，但某些发行版允许普通用户重启)
    rebootCmd = 'systemctl';
    rebootArgs = ['reboot'];
  }
  
  try {
    // 异步执行重启命令
    const { spawn } = require('child_process');
    const proc = spawn(rebootCmd, rebootArgs, {
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    proc.unref();
    
    // 延迟退出应用，给用户一点时间看到提示
    setTimeout(() => {
      app.exit(0);
    }, 2000);
  } catch (err) {
    console.error('[Main] 重启命令执行失败:', err);
    throw err;
  }
});

// 窗口控制 - 使用 event.sender 获取当前窗口
ipcMain.handle('window-minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) window.minimize();
});
ipcMain.handle('window-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }
});
ipcMain.handle('window-close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  // 主窗口关闭时检查是否需要最小化到托盘
  if (window === mainWindow) {
    const { settingsService } = require('./services/settings/SettingsService');
    const closeToTray = settingsService.get('closeToTray');
    if (closeToTray && !isQuitting) {
      // 最小化到托盘：隐藏窗口并创建托盘图标
      mainWindow.hide();
      createTray();
      return;
    }
    killMofoxProcess();
  }
  if (window) window.close();
});

// ─── 实例管理 & 安装向导 IPC ──────────────────────────────────────────────
const { installWizardService } = require('./services/install/InstallWizardService');
const { versionService } = require('./services/version/VersionService');
const { themeService } = require('./services/theme/ThemeService');

// 初始化存储服务
storageService.init();

// 实例管理
ipcMain.handle('instances-get-all', () => {
  return storageService.getInstances();
});

ipcMain.handle('instances-get', (event, instanceId) => {
  return storageService.getInstance(instanceId);
});

ipcMain.handle('instances-add', (event, instance) => {
  return storageService.addInstance(instance);
});

ipcMain.handle('instances-update', (event, instanceId, updates) => {
  return storageService.updateInstance(instanceId, updates);
});

ipcMain.handle('instances-delete', (event, instanceId) => {
  return storageService.deleteInstance(instanceId);
});

ipcMain.handle('instances-has-any', () => {
  return storageService.hasInstances();
});

// 实例图标管理
ipcMain.handle('instance-save-icon', async (event, instanceId, imageDataURL) => {
  try {
    // 将 Data URL 转换为 Buffer
    const base64Data = imageDataURL.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // 保存图标并更新实例（StorageService 会自动处理）
    const updatedInstance = storageService.saveInstanceIcon(instanceId, imageBuffer);
    
    return { success: true, iconPath: updatedInstance.extra?.iconPath };
  } catch (error) {
    console.error('[Main] 保存图标失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-delete-icon', async (event, instanceId) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (instance?.extra?.iconPath) {
      storageService.deleteInstanceIcon(instanceId);
      
      // 更新实例记录，清除 iconPath
      const newExtra = { ...instance.extra };
      delete newExtra.iconPath;
      storageService.updateInstance(instanceId, { extra: newExtra });
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Main] 删除图标失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-get-icon-path', (event, relativePath) => {
  try {
    return storageService.getIconFullPath(relativePath);
  } catch (error) {
    console.error('[Main] 获取图标路径失败:', error);
    return null;
  }
});

// 安装向导
ipcMain.handle('install-should-show', () => {
  return installWizardService.shouldShowWizard();
});

ipcMain.handle('install-env-check', async () => {
  return await installWizardService.runEnvCheck();
});

ipcMain.handle('install-get-platforms', () => {
  return platformRegistry.listPlatforms(platformHelper.detectSystemEnv());
});

ipcMain.handle('install-validate-inputs', async (event, inputs) => {
  return await installWizardService.validateInputs(inputs);
});

ipcMain.handle('install-check-port', async (event, port) => {
  return await installWizardService.checkPortAvailable(port);
});

ipcMain.handle('install-run', async (event, inputs) => {
  // 设置进度回调
  installWizardService.setProgressCallback((progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('install-progress', progress);
    }
  });
  
  return await installWizardService.runInstall(inputs, (output) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('install-output', output);
    }
  });
});

ipcMain.handle('install-cleanup', async (event, instanceId) => {
  return await installWizardService.cleanupFailedInstall(instanceId);
});

ipcMain.handle('install-abort', async () => {
  installWizardService.abortInstall();
  return { success: true };
});

// ─── 用户设置 IPC ──────────────────────────────────────────────────────────
const { settingsService } = require('./services/settings/SettingsService');

ipcMain.handle('settings-read', () => {
  return settingsService.readSettings();
});

ipcMain.handle('settings-write', (event, patch) => {
  return settingsService.set(patch);
});

ipcMain.handle('settings-reset', (event, key) => {
  return settingsService.reset(key ?? null);
});


// ─── OOBE 完成处理 ───────────────────────────────────────────────────────

/**
 * OOBE 完成后重新加载主窗口
 */
ipcMain.handle('oobe-complete', async () => {
  console.log('[Main] OOBE 已完成，重新加载主窗口');
  
  if (mainWindow) {
    // 重新读取设置并更新主题
    const { settingsService } = require('./services/settings/SettingsService');
    const settings = settingsService.readSettings();

    // 直接加载主视图，避免通过 index.html 的重定向导致导航冲突
    await mainWindow.loadFile(path.join(__dirname, 'renderer', 'main-view', 'index.html'));
    
    // 加载设置
    loadSettings();
  }
  
  return { success: true };
});

// ─── 主题系统 IPC ──────────────────────────────────────────────────────────

/**
 * 根据用户设置更新主题
 * 前端更改主题设置时调用，自动计算并保存主题
 */
ipcMain.handle('theme-update', async (event, settings) => {
  try {
    const theme = await themeService.updateThemeFromSettings(settings);
    return { success: true, theme };
  } catch (error) {
    console.error('[IPC] 主题更新失败:', error);
    return { success: false, error: error.message };
  }
});

/**
 * 获取当前主题
 */
ipcMain.handle('theme-get', () => {
  try {
    const theme = themeService.getCurrentTheme();
    return theme;  // 直接返回主题对象，与 sync 版本一致
  } catch (error) {
    console.error('[IPC] 获取主题失败:', error);
    return null;
  }
});

/**
 * 同步获取主题（用于页面加载时）
 */
ipcMain.on('theme-get-sync', (event) => {
  try {
    const theme = themeService.getCurrentTheme();
    event.returnValue = theme;
  } catch (error) {
    console.error('[IPC] 同步获取主题失败:', error);
    event.returnValue = null;
  }
});

/**
 * 重新生成主题（清除缓存并强制重新计算）
 */
ipcMain.handle('theme-regenerate', async (event, accentColor, themeMode, options) => {
  try {
    themeService.clearCache();
    const theme = await themeService.generateTheme(accentColor, themeMode, options);
    themeService.saveTheme(theme);
    return { success: true, theme };
  } catch (error) {
    console.error('[IPC] 重新生成主题失败:', error);
    return { success: false, error: error.message };
  }
});


// 打开日志文件夹
ipcMain.handle('open-logs-dir', () => {
  const logsDir = path.join(storageService.getDataDir(), 'logs');
  // 确保目录存在
  fs.mkdirSync(logsDir, { recursive: true });
  shell.openPath(logsDir);
});

// ─── 数据管理 IPC ────────────────────────────────────────────────────────

// 编辑实例配置文件
ipcMain.handle('open-instance-data-dir', () => {
  const dataDir = storageService.getDataDir();
  const instancesFile = path.join(dataDir, 'instances.json');
  
  // 确保文件存在
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(instancesFile)) {
    fs.writeFileSync(instancesFile, JSON.stringify({ version: 2, instances: [] }, null, 2), 'utf8');
  }
  
  // 用系统默认编辑器打开
  shell.openPath(instancesFile);
});

// 编辑全局设置文件
ipcMain.handle('open-settings-data-dir', () => {
  const dataDir = storageService.getDataDir();
  const settingsFile = path.join(dataDir, 'settings.json');
  
  // 确保文件存在
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({}, null, 2), 'utf8');
  }
  
  // 用系统默认编辑器打开
  shell.openPath(settingsFile);
});

// 导出配置备份（仅配置文件，不包含实例数据）
ipcMain.handle('export-backup', async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const defaultFileName = `mofox-config-backup-${timestamp}.zip`;
    
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出配置备份',
      defaultPath: path.join(app.getPath('documents'), defaultFileName),
      filters: [
        { name: 'ZIP 压缩包', extensions: ['zip'] }
      ]
    });
    
    if (result.canceled || !result.filePath) {
      return { success: false, cancelled: true };
    }
    
    const destPath = result.filePath;
    
    // 使用 archiver 创建 ZIP 文件
    const archiver = require('archiver');
    const output = fs.createWriteStream(destPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve) => {
      output.on('close', () => {
        console.log(`[Backup] 配置备份文件已创建: ${destPath} (${archive.pointer()} 字节)`);
        resolve({ success: true, path: destPath, size: archive.pointer() });
      });
      
      archive.on('error', (err) => {
        console.error('[Backup] 创建备份失败:', err);
        resolve({ success: false, error: err.message });
      });
      
      archive.pipe(output);
      
      const dataDir = storageService.getDataDir();
      
      // 只添加配置文件
      const instancesFile = path.join(dataDir, 'instances.json');
      if (fs.existsSync(instancesFile)) {
        archive.file(instancesFile, { name: 'instances.json' });
      }
      
      const settingsFile = path.join(dataDir, 'settings.json');
      if (fs.existsSync(settingsFile)) {
        archive.file(settingsFile, { name: 'settings.json' });
      }
      
      // 添加说明文件
      const readmeContent = `# Neo-MoFox Launcher 配置备份

导出时间: ${new Date().toLocaleString('zh-CN')}

## 备份内容

- instances.json: 实例配置列表
- settings.json: 全局设置

## 不包含内容

此备份不包含以下内容：
- 实例安装目录及文件
- 实例运行数据（数据库、聊天记录等）
- 日志文件
- 缓存文件

请确保您的实例安装目录已单独备份，如有需要。

## 恢复方法

在 Launcher 设置 > 数据 > 导入备份 中选择此文件进行恢复。
`;
      archive.append(readmeContent, { name: 'README.txt' });
      
      archive.finalize();
    });
  } catch (error) {
    console.error('[Backup] 导出备份失败:', error);
    return { success: false, error: error.message };
  }
});

// 导入备份
ipcMain.handle('import-backup', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择备份文件',
      properties: ['openFile'],
      filters: [
        { name: 'ZIP 压缩包', extensions: ['zip'] }
      ]
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }
    
    const backupPath = result.filePaths[0];
    
    // 使用 extract-zip 解压
    const extract = require('extract-zip');
    const tempDir = path.join(app.getPath('temp'), `mofox-restore-${Date.now()}`);
    
    await extract(backupPath, { dir: tempDir });
    
    let importedCount = 0;
    
    // 恢复实例配置
    const instancesDir = path.join(tempDir, 'instances');
    if (fs.existsSync(instancesDir)) {
      const targetInstancesDir = path.join(storageService.getDataDir(), 'instances');
      fs.mkdirSync(targetInstancesDir, { recursive: true });
      
      const files = fs.readdirSync(instancesDir);
      for (const file of files) {
        const srcPath = path.join(instancesDir, file);
        const destPath = path.join(targetInstancesDir, file);
        fs.copyFileSync(srcPath, destPath);
        importedCount++;
      }
    }
    
    // 恢复全局设置（可选）
    const settingsFile = path.join(tempDir, 'settings.json');
    if (fs.existsSync(settingsFile)) {
      const targetSettingsFile = path.join(storageService.getDataDir(), 'settings.json');
      fs.copyFileSync(settingsFile, targetSettingsFile);
    }
    
    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    console.log(`[Backup] 成功导入 ${importedCount} 个实例配置`);
    return { success: true, count: importedCount };
  } catch (error) {
    console.error('[Backup] 导入备份失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取 Git 仓库信息（版本和分支）
ipcMain.handle('get-git-info', async (event, repoPath) => {
  try {
    const { spawn } = require('child_process');
    
    if (!fs.existsSync(repoPath)) {
      return { success: false, error: '目录不存在' };
    }
    
    // 检查是否是 git 仓库
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return { success: false, error: '该目录不是 Git 仓库' };
    }
    
    // 获取当前提交哈希
    const getCommitHash = () => {
      return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
        let output = '';
        let errorOutput = '';
        
        gitProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        gitProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        gitProcess.on('close', (code) => {
          if (code === 0) {
            resolve(output.trim());
          } else {
            reject(new Error(errorOutput || '获取提交哈希失败'));
          }
        });
        
        gitProcess.on('error', (err) => {
          reject(err);
        });
      });
    };
    
    // 获取当前分支名
    const getBranchName = () => {
      return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath });
        let output = '';
        let errorOutput = '';
        
        gitProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        gitProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        gitProcess.on('close', (code) => {
          if (code === 0) {
            resolve(output.trim());
          } else {
            reject(new Error(errorOutput || '获取分支名失败'));
          }
        });
        
        gitProcess.on('error', (err) => {
          reject(err);
        });
      });
    };
    
    const [commitHash, branch] = await Promise.all([
      getCommitHash(),
      getBranchName()
    ]);
    
    console.log(`[Git Info] 仓库: ${repoPath}, 提交: ${commitHash.substring(0, 8)}, 分支: ${branch}`);
    
    return {
      success: true,
      commitHash,
      branch,
    };
  } catch (error) {
    console.error('[Git Info] 获取 Git 信息失败:', error);
    return { success: false, error: error.message };
  }
});

// 手动添加实例
ipcMain.handle('manual-add-instance', async (event, instanceConfig) => {
  try {
    const { spawn } = require('child_process');
    
    // 生成经过冲突检查的实例 ID
    const instanceId = generateInstanceId(instanceConfig.qqNumber);
    
    // 验证必填字段
    if (!instanceConfig.qqNumber || !instanceConfig.ownerQQNumber || !instanceConfig.apiKey) {
      return { success: false, error: '缺少必填字段（QQ号、主人QQ号、API密钥）' };
    }
    
    if (!instanceConfig.neomofoxDir) {
      return { success: false, error: '缺少 Neo-MoFox 目录路径' };
    }
    
    // 验证路径是否存在
    if (!fs.existsSync(instanceConfig.neomofoxDir)) {
      return { success: false, error: 'Neo-MoFox 目录不存在' };
    }
    
    const selectedPlatform = instanceConfig.platform || (instanceConfig.platformDir ? 'napcat' : null);
    const selectedPlatformDir = instanceConfig.platformDir || instanceConfig.napcatDir || null;

    // 验证平台路径（如果提供）
    if (selectedPlatformDir && !fs.existsSync(selectedPlatformDir)) {
      return { success: false, error: '平台目录不存在' };
    }
    
    // 获取 Git 信息
    let neomofoxVersion = 'unknown';
    let branch = instanceConfig.branch || 'unknown';
    
    try {
      // 检查是否是 git 仓库
      const gitDir = path.join(instanceConfig.neomofoxDir, '.git');
      if (fs.existsSync(gitDir)) {
        // 获取提交哈希
        const commitHash = await new Promise((resolve, reject) => {
          const gitProcess = spawn('git', ['rev-parse', 'HEAD'], { cwd: instanceConfig.neomofoxDir });
          let output = '';
          
          gitProcess.stdout.on('data', (data) => {
            output += data.toString();
          });
          
          gitProcess.on('close', (code) => {
            if (code === 0) {
              resolve(output.trim());
            } else {
              resolve('unknown');
            }
          });
          
          gitProcess.on('error', () => {
            resolve('unknown');
          });
        });
        
        // 获取分支名
        const branchName = await new Promise((resolve, reject) => {
          const gitProcess = spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: instanceConfig.neomofoxDir });
          let output = '';
          
          gitProcess.stdout.on('data', (data) => {
            output += data.toString();
          });
          
          gitProcess.on('close', (code) => {
            if (code === 0) {
              resolve(output.trim());
            } else {
              resolve('unknown');
            }
          });
          
          gitProcess.on('error', () => {
            resolve('unknown');
          });
        });
        
        neomofoxVersion = commitHash;
        branch = branchName;
      }
    } catch (error) {
      console.warn('[Manual Add] 获取 Git 信息失败，使用默认值:', error);
    }
    
    // 构建实例对象（匹配 InstallWizardService 的数据结构）
    const instance = {
      id: instanceId,
      qqNumber: instanceConfig.qqNumber,
      ownerQQNumber: instanceConfig.ownerQQNumber,
      apiKey: instanceConfig.apiKey,
      channel: branch !== 'unknown' ? branch : (instanceConfig.channel || 'dev'),
      enabled: true,
      neomofoxDir: instanceConfig.neomofoxDir,
      platform: selectedPlatform,
      platformDir: selectedPlatformDir,
      platformRoot: selectedPlatformDir,
      wsPort: instanceConfig.wsPort || 8080,
      installCompleted: true, // 手动添加的实例默认安装已完成
      installProgress: null,
      installSteps: [
        'clone',
        'venv',
        'deps',
        'gen-config',
        'write-core',
        'write-model',
        'register'
      ],
      createdAt: new Date().toISOString(),
      lastStartedAt: null,
      platformVersion: instanceConfig.platformVersion || instanceConfig.napcatVersion || null,
      neomofoxVersion: neomofoxVersion,
      extra: {
        displayName: instanceConfig.displayName || instanceConfig.qqNumber,
        description: instanceConfig.description || '',
        isLike: false,
      },
      isManuallyAdded: true, // 标记为手动添加
    };
    
    // 保存实例
    storageService.addInstance(instance);
    
    console.log(`[Manual Add] 成功手动添加实例: ${instance.extra.displayName} (${instanceId})`);
    console.log(`[Manual Add] Neo-MoFox 版本: ${neomofoxVersion}, 分支/频道: ${branch}`);
    return { success: true, instanceId, channel: instance.channel };
  } catch (error) {
    console.error('[Manual Add] 手动添加实例失败:', error);
    return { success: false, error: error.message };
  }
});

// ─── 日志系统 IPC ────────────────────────────────────────────────────────

// 列出日志文件
ipcMain.handle('logs-get-files', async (event, logType, instanceId) => {
  try {
    let logDir;
    let baseFilename;
    
    if (logType === 'launcher') {
      logDir = storageService.getLauncherLogDir();
      baseFilename = 'launcher';
    } else if (logType === 'mofox' || logType === 'napcat') {
      logDir = storageService.getInstanceLogDir(instanceId);
      baseFilename = logType;
    } else {
      throw new Error('无效的日志类型: ' + logType);
    }
    
    return LogReader.listLogFiles(logDir, baseFilename);
  } catch (error) {
    console.error('[IPC] 列出日志文件失败:', error);
    return [];
  }
});

// 读取日志文件内容
ipcMain.handle('logs-get-file-content', async (event, filePath) => {
  try {
    return await LogReader.readLogFile(filePath);
  } catch (error) {
    console.error('[IPC] 读取日志文件失败:', error);
    throw new Error('读取日志失败: ' + error.message);
  }
});

// 获取日志统计信息
ipcMain.handle('logs-get-stats', async (event) => {
  try {
    const launcherDir = storageService.getLauncherLogDir();
    const launcherFiles = LogReader.listLogFiles(launcherDir, 'launcher');
    
    const instancesDir = path.join(storageService.getDataDir(), 'logs', 'instances');
    let instanceFiles = [];
    
    if (fs.existsSync(instancesDir)) {
      const instanceIds = fs.readdirSync(instancesDir);
      for (const instanceId of instanceIds) {
        const instanceLogDir = path.join(instancesDir, instanceId);
        const mofoxFiles = LogReader.listLogFiles(instanceLogDir, 'mofox');
        const napcatFiles = LogReader.listLogFiles(instanceLogDir, 'napcat');
        instanceFiles = instanceFiles.concat(mofoxFiles, napcatFiles);
      }
    }
    
    const allFiles = [...launcherFiles, ...instanceFiles];
    const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);
    const totalCount = allFiles.length;
    
    // 找出最早和最新的日志
    let earliestDate = null;
    let latestDate = null;
    if (allFiles.length > 0) {
      earliestDate = new Date(Math.min(...allFiles.map(f => f.mtime)));
      latestDate = new Date(Math.max(...allFiles.map(f => f.mtime)));
    }
    
    return {
      totalSize,
      totalCount,
      launcherCount: launcherFiles.length,
      instanceCount: instanceFiles.length,
      earliestDate: earliestDate ? earliestDate.toISOString() : null,
      latestDate: latestDate ? latestDate.toISOString() : null
    };
  } catch (error) {
    console.error('[IPC] 获取日志统计失败:', error);
    return {
      totalSize: 0,
      totalCount: 0,
      launcherCount: 0,
      instanceCount: 0,
      earliestDate: null,
      latestDate: null
    };
  }
});

// 获取启动器历史日志
ipcMain.handle('launcher-get-logs-history', async (event, options = {}) => {
  try {
    const logDir = storageService.getLauncherLogDir();
    const files = LogReader.listLogFiles(logDir, 'launcher');
    
    const { limit = 1000, offset = 0 } = options;
    
    // 读取所有可用的日志文件（按时间倒序）
    const allLogs = [];
    for (const file of files) {
      try {
        const content = await LogReader.readLogFile(file.path);
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const parsed = LogReader.parseLogLine(line);
          if (parsed) {
            allLogs.push(parsed);
          }
        }
      } catch (err) {
        console.error(`[IPC] 读取日志文件失败 ${file.name}:`, err);
      }
    }
    
    // 按时间戳倒序排序
    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 分页
    const paginatedLogs = allLogs.slice(offset, offset + limit);
    
    return {
      logs: paginatedLogs,
      total: allLogs.length,
      hasMore: allLogs.length > offset + limit
    };
  } catch (error) {
    console.error('[IPC] 获取启动器历史日志失败:', error);
    return { logs: [], total: 0, hasMore: false };
  }
});

// 获取实例历史日志
ipcMain.handle('instance-get-logs-history', async (event, instanceId, logType, options = {}) => {
  try {
    const logDir = storageService.getInstanceLogDir(instanceId);
    const files = LogReader.listLogFiles(logDir, logType);
    
    const { limit = 1000, offset = 0 } = options;
    
    // 读取所有可用的日志文件（按时间倒序）
    const allLogs = [];
    for (const file of files) {
      try {
        const content = await LogReader.readLogFile(file.path);
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const parsed = LogReader.parseLogLine(line);
          if (parsed) {
            allLogs.push(parsed);
          }
        }
      } catch (err) {
        console.error(`[IPC] 读取日志文件失败 ${file.name}:`, err);
      }
    }
    
    // 按时间戳倒序排序
    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 分页
    const paginatedLogs = allLogs.slice(offset, offset + limit);
    
    return {
      logs: paginatedLogs,
      total: allLogs.length,
      hasMore: allLogs.length > offset + limit
    };
  } catch (error) {
    console.error('[IPC] 获取实例历史日志失败:', error);
    return { logs: [], total: 0, hasMore: false };
  }
});

// 同步读取（用于页面加载时立即应用主题，避免 FOUC）
ipcMain.on('settings-read-sync', (event) => {
  event.returnValue = settingsService.readSettings();
});

// ─── 实例进程控制 ───────────────────────────────────────────────────────────

// ─── PTY 数据流核心：原始字节进 ring buffer + 广播到渲染层 ──────────────
//
// 所有面向用户的输出都走这一条路：子进程 PTY 输出、启动器自己的提示，
// 全部以 UTF-8 字符串形态写入。带 ANSI 颜色码也会被 xterm 正确渲染。
//
// 渲染层进入页面时通过 instance-pty-buffer 一次性拿回历史数据回放。
function appendPtyData(instanceId, type, chunk) {
  if (!chunk) return;
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData) return;

  if (!instanceData.ptyBuffers) {
    instanceData.ptyBuffers = { mofox: '', napcat: '' };
  }

  // Ring buffer：超过上限时从前面截断
  const next = instanceData.ptyBuffers[type] + chunk;
  instanceData.ptyBuffers[type] = next.length > PTY_BUFFER_MAX_SIZE
    ? next.slice(next.length - PTY_BUFFER_MAX_SIZE)
    : next;

  // 同步写入持久化日志文件（去掉 ANSI 控制码后写入，方便人类阅读）
  if (instanceData.loggers && instanceData.loggers[type]) {
    try {
      const plain = stripAnsi(chunk).replace(/\r(?!\n)/g, '\n');
      if (plain.trim()) {
        instanceData.loggers[type].log(plain);
      }
    } catch (e) { /* 忽略日志写入失败，不影响主流程 */ }
  }

  // 广播给所有打开了实例视图的窗口
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('instance-pty-data', { instanceId, type, data: chunk });
    }
  }
}

// 启动器自己输出的状态消息（不来自子进程）。
// 用 ANSI 着色后送入 PTY 流，渲染端会按真终端样式呈现，与子进程日志混排。
function emitLauncherMessage(instanceId, type, message, level = 'info') {
  const palette = {
    info:    '\x1b[36m',  // 青
    success: '\x1b[32m',  // 绿
    warn:    '\x1b[33m',  // 黄
    warning: '\x1b[33m',
    error:   '\x1b[31m',  // 红
  };
  const color = palette[level] || '\x1b[36m';
  const tag = (level || 'info').toUpperCase().padEnd(7, ' ');
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `\x1b[90m${ts}\x1b[0m \x1b[1m${color}[Launcher ${tag}]\x1b[0m ${message}\r\n`;
  appendPtyData(instanceId, type, line);
}

function updateInstanceStatus(instanceId) {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData) return;
  
  // 计算整体状态：如果任一组件在运行，则整体为运行中
  let overallStatus = 'stopped';
  const mofoxStatus = instanceData.mofoxStatus || 'stopped';
  const napcatStatus = instanceData.napcatStatus || 'stopped';
  
  // 转换状态优先级：starting > restarting > running > stopping > error > stopped
  const statusPriority = {
    'starting': 6,
    'restarting': 5,
    'running': 4,
    'stopping': 3,
    'error': 2,
    'stopped': 1
  };
  
  const mofoxPriority = statusPriority[mofoxStatus] || 0;
  const napcatPriority = statusPriority[napcatStatus] || 0;
  
  if (mofoxPriority >= napcatPriority) {
    overallStatus = mofoxStatus;
  } else {
    overallStatus = napcatStatus;
  }
  
  // 向后兼容：设置旧的 status 字段
  instanceData.status = overallStatus;
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('instance-status-change', { 
      instanceId, 
      status: overallStatus,
      mofoxStatus,
      napcatStatus
    });
  }
}

function updateInstanceStats(instanceId) {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData) return;
  
  const now = Date.now();
  const stats = {
    mofox: {
      uptime: instanceData.mofoxStartTime ? Math.floor((now - instanceData.mofoxStartTime) / 1000) : 0,
      memory: 0,
      cpu: 0
    },
    napcat: {
      uptime: instanceData.napcatStartTime ? Math.floor((now - instanceData.napcatStartTime) / 1000) : 0,
      memory: 0,
      cpu: 0
    }
  };
  
  // 向后兼容：使用 mofox 的启动时间作为整体启动时间
  instanceData.startTime = instanceData.mofoxStartTime || instanceData.napcatStartTime || 0;
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('instance-stats-update', { instanceId, stats });
  }
}

// ── MoFox 独立启动函数 ───────────────────────────────────────────────────────
async function startMoFoxProcess(instanceId, instance) {
  const mofoxPath = instance.neomofoxDir;
  
  if (!mofoxPath || !fs.existsSync(mofoxPath)) {
    throw new Error('MoFox 路径无效: ' + mofoxPath);
  }
  
  const mainPy = path.join(mofoxPath, 'main.py');
  if (!fs.existsSync(mainPy)) {
    throw new Error('未找到 main.py');
  }
  
  // 初始化实例数据
  if (!instanceProcesses.has(instanceId)) {
    instanceProcesses.set(instanceId, {
      mofoxProcess: null,
      napcatProcess: null,
      mofoxStatus: 'stopped',
      napcatStatus: 'stopped',
      loggers: {},
      ptyBuffers: { mofox: '', napcat: '' },
      ptySize: { mofox: { cols: 120, rows: 40 }, napcat: { cols: 120, rows: 40 } },
      mofoxStartTime: 0,
      napcatStartTime: 0,
      webuiOpened: false,
      mofoxGeneration: 0,
      napcatGeneration: 0
    });
  }
  
  const instanceData = instanceProcesses.get(instanceId);
  instanceData.mofoxGeneration = (instanceData.mofoxGeneration || 0) + 1;
  const currentGeneration = instanceData.mofoxGeneration;
  
  // 初始化 MoFox 日志管理器
  if (!instanceData.loggers.mofox) {
    const logsDir = path.join(storageService.getDataDir(), 'logs');
    instanceData.loggers.mofox = new InstanceLogger(
      logsDir,
      instanceId,
      'mofox'
    );
  }
  
  instanceData.mofoxStatus = 'starting';
  instanceData.mofoxStartTime = Date.now();
  updateInstanceStatus(instanceId);
  
  emitLauncherMessage(instanceId, 'mofox', '正在启动 MoFox 核心...', 'info');
  
  // 查找 Python 可执行文件
  const pythonExe = platformHelper.findVenvPython(mofoxPath);
  
  let cmd, args;
  if (pythonExe) {
    cmd = pythonExe;
    args = [mainPy];
    emitLauncherMessage(instanceId, 'mofox', `使用 Python: ${pythonExe}`, 'info');
  } else {
    cmd = platformHelper.uvBin;
    args = ['run', 'python', 'main.py'];
    emitLauncherMessage(instanceId, 'mofox', '使用 uv run 启动', 'info');
  }
  
  // 用 PTY 启动子进程，让 Rich/Loguru/Textual 等库认为自己接了真终端，
  // 输出完整 ANSI 序列（包括真彩色、光标移动、清行、Live、进度条）。
  const ptyEnv = {
    ...platformHelper.buildSpawnEnv(),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '1',
    PYTHONUNBUFFERED: '1',
  };

  const ptySize = instanceData.ptySize.mofox;
  let mofoxProc;
  try {
    mofoxProc = pty.spawn(cmd, args, {
      name: 'xterm-256color',
      cols: ptySize.cols,
      rows: ptySize.rows,
      cwd: mofoxPath,
      env: ptyEnv,
      encoding: 'utf8',
    });
  } catch (err) {
    emitLauncherMessage(instanceId, 'mofox', `MoFox 启动失败: ${err.message}`, 'error');
    instanceData.mofoxStatus = 'error';
    updateInstanceStatus(instanceId);
    throw err;
  }

  instanceData.mofoxProcess = mofoxProc;
  emitLauncherMessage(instanceId, 'mofox', `MoFox PID: ${mofoxProc.pid}`, 'info');
  
  mofoxProc.onData((data) => {
    appendPtyData(instanceId, 'mofox', data);
  });
  
  mofoxProc.onExit(({ exitCode, signal }) => {
    const code = exitCode != null ? exitCode : signal;
    const killedBySignal = exitCode == null && signal != null;
    emitLauncherMessage(instanceId, 'mofox', `MoFox 进程已退出 (code: ${code}, signal: ${signal})`, 'info');
    if (instanceData.mofoxGeneration !== currentGeneration) {
      console.log(`[Instance ${instanceId}] 忽略旧 MoFox 进程 close 事件`);
      return;
    }
    instanceData.mofoxProcess = null;
    
    // 关闭 MoFox 日志管理器
    if (instanceData.loggers && instanceData.loggers.mofox) {
      instanceData.loggers.mofox.close();
      delete instanceData.loggers.mofox;
    }
    
    if (instanceData.mofoxStatus === 'stopping') {
      instanceData.mofoxStatus = 'stopped';
    } else if (instanceData.mofoxStatus === 'restarting') {
      console.log(`[Instance ${instanceId}] MoFox 进程在重启期间退出，等待重启流程`);
    } else {
      // 被信号杀死（SIGINT/SIGTERM/SIGKILL）视为正常停止，不标记为 error
      if (killedBySignal) {
        instanceData.mofoxStatus = 'stopped';
      } else {
        instanceData.mofoxStatus = code === 0 ? 'stopped' : 'error';
      }
    }
    updateInstanceStatus(instanceId);
  });

  // 延迟检测启动状态：PTY 进程没有 'error' 事件，3 秒后还活着就视为启动成功
  setTimeout(() => {
    if (instanceData.mofoxGeneration !== currentGeneration) return;
    if (instanceData.mofoxProcess && instanceData.mofoxStatus === 'starting') {
      instanceData.mofoxStatus = 'running';
      updateInstanceStatus(instanceId);
      emitLauncherMessage(instanceId, 'mofox', 'MoFox 正在运行', 'success');
    }
  }, 3000);
}
// ── NapCat 独立启动函数 ──────────────────────────────────────────────────────
async function startNapcatProcess(instanceId, instance) {
  const napcatPath = instance.platformDir;
  
  if (!napcatPath) {
    throw new Error('未安装 NapCat');
  }
  
  if (!fs.existsSync(napcatPath)) {
    throw new Error('NapCat 路径无效: ' + napcatPath);
  }
  
  // 初始化实例数据
  if (!instanceProcesses.has(instanceId)) {
    instanceProcesses.set(instanceId, {
      mofoxProcess: null,
      napcatProcess: null,
      mofoxStatus: 'stopped',
      napcatStatus: 'stopped',
      loggers: {},
      ptyBuffers: { mofox: '', napcat: '' },
      ptySize: { mofox: { cols: 120, rows: 40 }, napcat: { cols: 120, rows: 40 } },
      mofoxStartTime: 0,
      napcatStartTime: 0,
      webuiOpened: false,
      mofoxGeneration: 0,
      napcatGeneration: 0
    });
  }
  
  const instanceData = instanceProcesses.get(instanceId);
  instanceData.napcatGeneration = (instanceData.napcatGeneration || 0) + 1;
  const currentGeneration = instanceData.napcatGeneration;
  
  // 初始化 NapCat 日志管理器
  if (!instanceData.loggers.napcat) {
    const logsDir = path.join(storageService.getDataDir(), 'logs');
    instanceData.loggers.napcat = new InstanceLogger(
      logsDir,
      instanceId,
      'napcat'
    );
  }
  
  instanceData.napcatStatus = 'starting';
  instanceData.napcatStartTime = Date.now();
  updateInstanceStatus(instanceId);
  
  emitLauncherMessage(instanceId, 'napcat', '正在启动 NapCat...', 'info');
  
  // Windows Node 包以 napcatDir 作为根目录，统一使用包内现有 napcat.bat 启动。
  const napcatRootPath = napcatPath;

  // 使用 PlatformHelper 获取 NapCat 启动命令
  const napcatStartInfo = platformHelper.getNapcatStartCommand(napcatRootPath, instance.qqNumber);
  
  if (!napcatStartInfo) {
    emitLauncherMessage(instanceId, 'napcat', '错误: 未找到 NapCat 启动文件', 'error');
    instanceData.napcatStatus = 'error';
    updateInstanceStatus(instanceId);
    throw new Error('未找到 NapCat 启动文件');
  }
  
  const napcatCmd = napcatStartInfo.cmd;
  const napcatArgs = napcatStartInfo.args;
  emitLauncherMessage(instanceId, 'napcat', `使用启动命令: ${napcatCmd} ${napcatArgs.join(' ')}`, 'info');
  
  // PTY 启动 NapCat。NapCat 启动脚本本身可能用 cmd/bash，所以走 shell 包一层。
  const ptySize = instanceData.ptySize.napcat;
  const ptyEnv = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '1',
  };

  let napcatProc;
  try {
    if (process.platform === 'win32') {
      // Windows 下走 ConPTY，直接用 cmd /c 启动批处理
      napcatProc = pty.spawn(process.env.ComSpec || 'cmd.exe', ['/c', napcatCmd, ...napcatArgs], {
        name: 'xterm-256color',
        cols: ptySize.cols,
        rows: ptySize.rows,
        cwd: napcatStartInfo.cwd || napcatRootPath,
        env: ptyEnv,
        encoding: 'utf8',
      });
    } else {
      napcatProc = pty.spawn(napcatCmd, napcatArgs, {
        name: 'xterm-256color',
        cols: ptySize.cols,
        rows: ptySize.rows,
        cwd: napcatStartInfo.cwd || napcatRootPath,
        env: ptyEnv,
        encoding: 'utf8',
      });
    }
  } catch (err) {
    emitLauncherMessage(instanceId, 'napcat', `NapCat 启动失败: ${err.message}`, 'error');
    instanceData.napcatStatus = 'error';
    updateInstanceStatus(instanceId);
    throw err;
  }

  instanceData.napcatProcess = napcatProc;
  emitLauncherMessage(instanceId, 'napcat', `NapCat PID: ${napcatProc.pid}`, 'info');
  
  // PTY 是单一数据流，按 chunk 接收。WebUI URL 检测在累积的纯文本上做。
  let webuiScanBuffer = '';
  napcatProc.onData((data) => {
    appendPtyData(instanceId, 'napcat', data);

    if (!instanceData.webuiOpened) {
      webuiScanBuffer += stripAnsi(data);
      if (webuiScanBuffer.length > 8192) {
        webuiScanBuffer = webuiScanBuffer.slice(-4096);
      }
      const webuiMatch = webuiScanBuffer.match(/WebUI User Panel Url:\s*(https?:\/\/\S+)/i);
      if (webuiMatch) {
        const url = webuiMatch[1];
        const settings = settingsService.readSettings();
        if (settings.autoOpenNapcatWebUI) {
          instanceData.webuiOpened = true;
          emitLauncherMessage(instanceId, 'napcat', `自动打开 WebUI: ${url}`, 'info');
          shell.openExternal(url).catch(err => {
            emitLauncherMessage(instanceId, 'napcat', `打开 WebUI 失败: ${err.message}`, 'error');
          });
        }
      }
    }
  });
  
  napcatProc.onExit(({ exitCode, signal }) => {
    const code = exitCode != null ? exitCode : signal;
    const killedBySignal = exitCode == null && signal != null;
    emitLauncherMessage(instanceId, 'napcat', `NapCat 进程已退出 (code: ${code}, signal: ${signal})`, 'info');
    if (instanceData.napcatGeneration !== currentGeneration) {
      console.log(`[Instance ${instanceId}] 忽略旧 NapCat 进程 close 事件`);
      return;
    }
    instanceData.napcatProcess = null;

    // 关闭 NapCat 日志管理器
    if (instanceData.loggers && instanceData.loggers.napcat) {
      instanceData.loggers.napcat.close();
      delete instanceData.loggers.napcat;
    }

    if (instanceData.napcatStatus === 'stopping') {
      instanceData.napcatStatus = 'stopped';
    } else if (instanceData.napcatStatus === 'restarting') {
      console.log(`[Instance ${instanceId}] NapCat 进程在重启期间退出，等待重启流程`);
    } else {
      // 被信号杀死（SIGINT/SIGTERM/SIGKILL）视为正常停止，不标记为 error
      if (killedBySignal) {
        instanceData.napcatStatus = 'stopped';
      } else {
        instanceData.napcatStatus = code === 0 ? 'stopped' : 'error';
      }
    }
    updateInstanceStatus(instanceId);
  });

  // 延迟检测启动状态：PTY 进程没有 'error' 事件，3 秒后还活着就视为启动成功
  setTimeout(() => {
    if (instanceData.napcatGeneration !== currentGeneration) return;
    if (instanceData.napcatProcess && instanceData.napcatStatus === 'starting') {
      instanceData.napcatStatus = 'running';
      updateInstanceStatus(instanceId);
      emitLauncherMessage(instanceId, 'napcat', 'NapCat 正在运行', 'success');
    }
  }, 3000);
}

// ── 实例启动核心逻辑（启动全部）──────────────────────────────────────────────
async function startInstanceInternal(instanceId, instance) {
  const hasNapcat = !!(instance.platformDir);
  
  emitLauncherMessage(instanceId, 'mofox', '正在启动 MoFox 核心...', 'info');
  if (hasNapcat) {
    emitLauncherMessage(instanceId, 'napcat', '正在启动 NapCat...', 'info');
  } else {
    emitLauncherMessage(instanceId, 'mofox', '未安装 NapCat，仅启动 MoFox 核心', 'info');
  }
  
  // 调用独立函数启动 MoFox
  await startMoFoxProcess(instanceId, instance);
  
  // 调用独立函数启动 NapCat（如果安装了）
  if (hasNapcat) {
    await startNapcatProcess(instanceId, instance);
  }
}

// ── PTY 进程友好关闭：先 Ctrl+C，再 SIGTERM，超时再 SIGKILL，最后兜底用系统命令杀掉进程树
async function stopPtyProcess(ptyProc, label = '') {
  if (!ptyProc) return;
  const pid = ptyProc.pid;

  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try { ptyProc.onExit(finish); } catch (_) { /* node-pty 已退出时会抛 */ }

    // 第一波：写入 Ctrl+C（\x03）触发 SIGINT，让进程正常退出
    try { ptyProc.write('\x03'); } catch (_) { /* ignore */ }

    // 4 秒后如果进程还没退出，升级为 SIGTERM
    setTimeout(() => {
      if (done) return;
      try { ptyProc.kill('SIGTERM'); } catch (_) { /* ignore */ }

      // 再等 3 秒，如果还没退出，升级为 SIGKILL + 平台命令兜底
      setTimeout(() => {
        if (done) return;
        try { ptyProc.kill('SIGKILL'); } catch (_) { /* ignore */ }
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { shell: true });
          } else {
            require('tree-kill')(pid, 'SIGKILL', () => { /* ignore */ });
          }
        } catch (_) { /* ignore */ }
        setTimeout(finish, 500);
      }, 3000);
    }, 4000);
  });
}

// ── MoFox 独立停止函数 ───────────────────────────────────────────────────────
async function stopMoFoxProcess(instanceId) {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData || !instanceData.mofoxProcess) {
    throw new Error('MoFox 未在运行');
  }

  instanceData.mofoxStatus = 'stopping';
  updateInstanceStatus(instanceId);
  emitLauncherMessage(instanceId, 'mofox', '正在停止 MoFox...', 'info');

  await stopPtyProcess(instanceData.mofoxProcess, 'MoFox');

  instanceData.mofoxProcess = null;
  instanceData.mofoxStatus = 'stopped';
  updateInstanceStatus(instanceId);
  emitLauncherMessage(instanceId, 'mofox', 'MoFox 已停止', 'info');
}

// ── NapCat 独立停止函数 ──────────────────────────────────────────────────────
async function stopNapcatProcess(instanceId) {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData || !instanceData.napcatProcess) {
    throw new Error('NapCat 未在运行');
  }

  instanceData.napcatStatus = 'stopping';
  updateInstanceStatus(instanceId);
  emitLauncherMessage(instanceId, 'napcat', '正在停止 NapCat...', 'info');

  await stopPtyProcess(instanceData.napcatProcess, 'NapCat');

  instanceData.napcatProcess = null;
  instanceData.napcatStatus = 'stopped';
  updateInstanceStatus(instanceId);
  emitLauncherMessage(instanceId, 'napcat', 'NapCat 已停止', 'info');
}

// ── MoFox 独立重启函数 ───────────────────────────────────────────────────────
async function restartMoFoxProcess(instanceId) {
  const instance = storageService.getInstance(instanceId);
  if (!instance) {
    throw new Error('实例不存在');
  }

  const instanceData = instanceProcesses.get(instanceId);
  if (instanceData && instanceData.mofoxProcess) {
    instanceData.mofoxStatus = 'restarting';
    updateInstanceStatus(instanceId);
    emitLauncherMessage(instanceId, 'mofox', '正在重启 MoFox...', 'info');

    await stopMoFoxProcess(instanceId);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await startMoFoxProcess(instanceId, instance);
}

// ── NapCat 独立重启函数 ──────────────────────────────────────────────────────
async function restartNapcatProcess(instanceId) {
  const instance = storageService.getInstance(instanceId);
  if (!instance) {
    throw new Error('实例不存在');
  }

  const hasNapcat = !!(instance.platformDir);
  if (!hasNapcat) {
    throw new Error('未安装 NapCat');
  }

  const instanceData = instanceProcesses.get(instanceId);
  if (instanceData && instanceData.napcatProcess) {
    instanceData.napcatStatus = 'restarting';
    updateInstanceStatus(instanceId);
    emitLauncherMessage(instanceId, 'napcat', '正在重启 NapCat...', 'info');
    
    await stopNapcatProcess(instanceId);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await startNapcatProcess(instanceId, instance);
}

ipcMain.handle('instance-start', async (event, instanceId) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error('实例不存在');
    }

    if (instanceProcesses.has(instanceId)) {
      const data = instanceProcesses.get(instanceId);
      // 检查状态和实际进程引用，防止状态不同步时重复启动
      if (data.status === 'running' || data.status === 'starting' || data.status === 'restarting') {
        throw new Error('实例已在运行中');
      }
      // 即使状态为 stopped，也检查是否有残留进程
      if (data.mofoxProcess || data.napcatProcess) {
        console.warn(`[Instance ${instanceId}] 状态为 ${data.status} 但仍有残留进程，先清理`);
        if (data.mofoxProcess) {
          await stopPtyProcess(data.mofoxProcess, 'MoFox');
          data.mofoxProcess = null;
        }
        if (data.napcatProcess) {
          await stopPtyProcess(data.napcatProcess, 'NapCat');
          data.napcatProcess = null;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    await startInstanceInternal(instanceId, instance);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-stop', async (event, instanceId) => {
  try {
    const instanceData = instanceProcesses.get(instanceId);
    if (!instanceData || (!instanceData.mofoxProcess && !instanceData.napcatProcess)) {
      // 即使没有进程引用，也确保状态重置为 stopped
      if (instanceData) {
        instanceData.status = 'stopped';
        instanceData.mofoxStatus = 'stopped';
        instanceData.napcatStatus = 'stopped';
        updateInstanceStatus(instanceId);
      } else {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('instance-status-change', { 
            instanceId, 
            status: 'stopped',
            mofoxStatus: 'stopped',
            napcatStatus: 'stopped'
          });
        }
      }
      return { success: true, message: '进程未在运行' };
    }
    
    // 停止所有运行中的进程
    const promises = [];
    if (instanceData.mofoxProcess) {
      promises.push(stopMoFoxProcess(instanceId).catch(e => console.error('停止 MoFox 失败:', e)));
    }
    if (instanceData.napcatProcess) {
      promises.push(stopNapcatProcess(instanceId).catch(e => console.error('停止 NapCat 失败:', e)));
    }
    
    await Promise.all(promises);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-restart', async (event, instanceId) => {
  try {
    const instanceData = instanceProcesses.get(instanceId);
    if (instanceData && (instanceData.mofoxProcess || instanceData.napcatProcess)) {
      updateInstanceStatus(instanceId, 'restarting');
      emitLauncherMessage(instanceId, 'mofox', '正在重启 MoFox...', 'info');
      if (instanceData.napcatProcess) {
        emitLauncherMessage(instanceId, 'napcat', '正在重启 Napcat...', 'info');
      }

      // 并行停止两个 PTY 进程
      const stopTasks = [];
      if (instanceData.mofoxProcess) stopTasks.push(stopPtyProcess(instanceData.mofoxProcess, 'MoFox'));
      if (instanceData.napcatProcess) stopTasks.push(stopPtyProcess(instanceData.napcatProcess, 'NapCat'));
      await Promise.all(stopTasks);

      // 清理旧进程引用
      instanceData.mofoxProcess = null;
      instanceData.napcatProcess = null;
      
      // 开始启动新进程
      const instance = storageService.getInstance(instanceId);
      if (!instance) {
        updateInstanceStatus(instanceId, 'error');
        return { success: false, error: '实例不存在' };
      }
      
      try {
        await startInstanceInternal(instanceId, instance);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    } else {
      // 直接启动
      const instance = storageService.getInstance(instanceId);
      if (!instance) {
        return { success: false, error: '实例不存在' };
      }
      
      try {
        await startInstanceInternal(instanceId, instance);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── 分离启动控制（单独启动 MoFox 或 NapCat） ──────────────────────

ipcMain.handle('instance-start-mofox-only', async (event, instanceId) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error('实例不存在');
    }
    
    const instanceData = instanceProcesses.get(instanceId);
    if (instanceData && instanceData.mofoxProcess && instanceData.mofoxStatus === 'running') {
      throw new Error('MoFox 已在运行中');
    }
    
    await startMoFoxProcess(instanceId, instance);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-start-napcat-only', async (event, instanceId) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error('实例不存在');
    }
    
    if (!instance.platformDir) {
      throw new Error('此实例未安装 NapCat');
    }
    
    const instanceData = instanceProcesses.get(instanceId);
    if (instanceData && instanceData.napcatProcess && instanceData.napcatStatus === 'running') {
      throw new Error('NapCat 已在运行中');
    }
    
    await startNapcatProcess(instanceId, instance);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-stop-mofox-only', async (event, instanceId) => {
  try {
    const instanceData = instanceProcesses.get(instanceId);
    if (!instanceData || !instanceData.mofoxProcess) {
      if (instanceData) {
        instanceData.mofoxStatus = 'stopped';
        updateInstanceStatus(instanceId);
      }
      return { success: true, message: 'MoFox 未在运行' };
    }
    
    await stopMoFoxProcess(instanceId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-stop-napcat-only', async (event, instanceId) => {
  try {
    const instanceData = instanceProcesses.get(instanceId);
    if (!instanceData || !instanceData.napcatProcess) {
      if (instanceData) {
        instanceData.napcatStatus = 'stopped';
        updateInstanceStatus(instanceId);
      }
      return { success: true, message: 'NapCat 未在运行' };
    }
    
    await stopNapcatProcess(instanceId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-restart-mofox-only', async (event, instanceId) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error('实例不存在');
    }
    
    const instanceData = instanceProcesses.get(instanceId);
    if (instanceData && instanceData.mofoxProcess) {
      // 停止 MoFox
      await stopMoFoxProcess(instanceId);
      // 等待进程完全退出
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 重新启动 MoFox
    await startMoFoxProcess(instanceId, instance);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-restart-napcat-only', async (event, instanceId) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error('实例不存在');
    }
    
    if (!instance.platformDir) {
      throw new Error('此实例未安装 NapCat');
    }
    
    const instanceData = instanceProcesses.get(instanceId);
    if (instanceData && instanceData.napcatProcess) {
      // 停止 NapCat
      await stopNapcatProcess(instanceId);
      // 等待进程完全退出
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 重新启动 NapCat
    await startNapcatProcess(instanceId, instance);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── 获取分离状态 ─────────────────────────────────────────────────────

ipcMain.handle('instance-status-separated', (event, instanceId) => {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData) {
    return {
      mofox: 'stopped',
      napcat: 'stopped'
    };
  }
  
  return {
    mofox: instanceData.mofoxStatus || 'stopped',
    napcat: instanceData.napcatStatus || 'stopped'
  };
});

ipcMain.handle('instance-status', (event, instanceId) => {
  const instanceData = instanceProcesses.get(instanceId);
  return instanceData ? instanceData.status : 'stopped';
});

ipcMain.handle('instance-status-all', () => {
  const result = {};
  for (const [instanceId, data] of instanceProcesses.entries()) {
    result[instanceId] = data.status || 'stopped';
  }
  return result;
});

ipcMain.handle('instance-stats', (event, instanceId) => {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData || (!instanceData.mofoxProcess && !instanceData.napcatProcess)) {
    return {
      mofox: { uptime: 0, memory: 0, cpu: 0 },
      napcat: { uptime: 0, memory: 0, cpu: 0 }
    };
  }
  
  const now = Date.now();
  return {
    mofox: {
      uptime: instanceData.mofoxStartTime ? Math.floor((now - instanceData.mofoxStartTime) / 1000) : 0,
      memory: 0,
      cpu: 0
    },
    napcat: {
      uptime: instanceData.napcatStartTime ? Math.floor((now - instanceData.napcatStartTime) / 1000) : 0,
      memory: 0,
      cpu: 0
    }
  };
});

// ── PTY 尺寸调整 ─────────────────────────────────────────────────────────────
ipcMain.handle('instance-pty-resize', (event, instanceId, source, cols, rows) => {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData) {
    // 实例进程尚未启动或已停止，静默忽略 resize 请求
    return;
  }

  // 更新存储的尺寸
  instanceData.ptySize[source] = { cols, rows };

  // 调整对应 PTY 进程的尺寸
  const proc = source === 'mofox' ? instanceData.mofoxProcess : instanceData.napcatProcess;
  if (proc && typeof proc.resize === 'function') {
    try {
      proc.resize(cols, rows);
    } catch (err) {
      console.error(`[PTY Resize] ${source} 调整失败:`, err);
    }
  }

  return { success: true };
});

// ── PTY 历史 buffer 回放 ─────────────────────────────────────────────────────
// 渲染端打开页面时拉一次完整 ring buffer 直接 term.write 即可还原最近的终端画面
ipcMain.handle('instance-pty-buffer', (event, instanceId) => {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData || !instanceData.ptyBuffers) {
    return { mofox: '', napcat: '' };
  }
  return {
    mofox: instanceData.ptyBuffers.mofox || '',
    napcat: instanceData.ptyBuffers.napcat || '',
  };
});

// ── PTY 输入（用户在终端里敲键）─────────────────────────────────────────────
ipcMain.handle('instance-pty-input', (event, instanceId, source, data) => {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData) return { success: false };
  const proc = source === 'mofox' ? instanceData.mofoxProcess : instanceData.napcatProcess;
  if (proc && typeof proc.write === 'function') {
    try {
      proc.write(data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false };
});

// ── 清屏：发 ANSI clear，清空 ring buffer ────────────────────────────────────
ipcMain.handle('instance-pty-clear', (event, instanceId, source) => {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData) return { success: false };
  if (instanceData.ptyBuffers) {
    instanceData.ptyBuffers[source] = '';
  }
  return { success: true };
});

// ── 日志导出（基于文件）──────────────────────────────────────────────────────
ipcMain.handle('instance-export-logs', async (event, instanceId, type) => {
  try {
    const instanceLogDir = storageService.getInstanceLogDir(instanceId);
    if (!fs.existsSync(instanceLogDir)) {
      throw new Error('实例日志目录不存在');
    }

    const logFiles = LogReader.listLogFiles(instanceLogDir, type);
    if (logFiles.length === 0) {
      throw new Error('没有找到任何日志文件');
    }

    console.log(`[instance-export-logs] 找到 ${logFiles.length} 个日志文件:`, logFiles.map(f => f.name));

    const allLines = [];
    for (const file of logFiles) {
      try {
        const content = await LogReader.readLogFile(file.path);
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        allLines.push(...lines);
        console.log(`[instance-export-logs] 读取 ${file.name}: ${lines.length} 行`);
      } catch (err) {
        console.error(`[instance-export-logs] 读取文件失败 ${file.name}: ${err.message}`);
      }
    }

    if (allLines.length === 0) {
      throw new Error('日志文件为空');
    }

    const parsedLogs = allLines
      .map(line => {
        const parsed = LogReader.parseLogLine(line);
        return parsed ? { ...parsed, raw: line } : null;
      })
      .filter(log => log !== null)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log(`[instance-export-logs] 解析并排序了 ${parsedLogs.length} 行日志`);

    const exportsDir = path.join(app.getPath('userData'), 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `${instanceId}_${type}_${timestamp}.log`;
    const filepath = path.join(exportsDir, filename);

    const content = parsedLogs.map(log => log.raw).join('\n');
    fs.writeFileSync(filepath, content, 'utf-8');

    console.log(`[instance-export-logs] 导出成功: ${filepath}`);
    return filepath;
  } catch (error) {
    console.error(`[instance-export-logs] 导出失败:`, error);
    throw new Error('导出失败: ' + error.message);
  }
});

// ─── 实例文件管理 ───────────────────────────────────────────────────────────

ipcMain.handle('instance-open-folder', async (event, instanceId, folderType) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    let folderPath = null;
    const mofoxDir = instance.neomofoxDir;
    
    switch (folderType) {
      case 'project':
        folderPath = mofoxDir;
        break;
      case 'config':
        folderPath = path.join(mofoxDir, 'config');
        break;
      case 'data':
        folderPath = path.join(mofoxDir, 'data');
        break;
      case 'logs':
        folderPath = path.join(mofoxDir, 'logs');
        break;
      case 'plugins':
        folderPath = path.join(mofoxDir, 'plugins');
        break;
      case 'napcat':
        if (instance.platformDir) {
          folderPath = instance.platformDir;
        } else {
          throw new Error('该实例未安装 NapCat');
        }
        break;
      default:
        throw new Error(`未知的文件夹类型: ${folderType}`);
    }

    if (!fs.existsSync(folderPath)) {
      throw new Error(`文件夹不存在: ${folderPath}`);
    }

    await shell.openPath(folderPath);
    return { success: true, path: folderPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-open-file', async (event, instanceId, fileType) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    let filePath = null;
    const mofoxDir = instance.neomofoxDir;
    
    switch (fileType) {
      case 'core-config':
        filePath = path.join(mofoxDir, 'config', 'core.toml');
        break;
      case 'model-config':
        filePath = path.join(mofoxDir, 'config', 'model.toml');
        break;
      default:
        throw new Error(`未知的文件类型: ${fileType}`);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    await shell.openPath(filePath);
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── 配置编辑器 IPC Handlers ─────────────────────────────────

ipcMain.handle('config-editor:open', async (event, instanceId, fileType) => {
  try {
    const { settingsService } = require('./services/settings/SettingsService');
    const settings = settingsService.readSettings();
    const useBuiltIn = settings.configEditor?.useBuiltIn ?? true;

    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    let filePath = null;
    let fileName = '';
    const mofoxDir = instance.neomofoxDir;
    
    switch (fileType) {
      case 'core-config':
        filePath = path.join(mofoxDir, 'config', 'core.toml');
        fileName = 'core.toml';
        break;
      case 'model-config':
        filePath = path.join(mofoxDir, 'config', 'model.toml');
        fileName = 'model.toml';
        break;
      default:
        throw new Error(`未知的文件类型: ${fileType}`);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    if (useBuiltIn) {
      // 使用内置编辑器
      createEditorWindow(filePath, fileName);
      return { success: true, path: filePath, mode: 'builtin' };
    } else {
      // 使用系统默认编辑器
      await shell.openPath(filePath);
      return { success: true, path: filePath, mode: 'external' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('config-editor:read', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('config-editor:write', async (event, filePath, content) => {
  try {
    // 创建备份
    if (fs.existsSync(filePath)) {
      const backupPath = `${filePath}.backup`;
      fs.copyFileSync(filePath, backupPath);
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('config-editor:get-theme', () => {
  try {
    const { settingsService } = require('./services/settings/SettingsService');
    const settings = settingsService.readSettings();
    
    return {
      success: true,
      theme: settings.theme || 'dark',
      accentColor: settings.accentColor || '#367BF0'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Dialog API - 显示保存对话框
 */
ipcMain.handle('dialog-show-save', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result.filePath; // 返回路径或 undefined（取消）
});

// ─── 整合包导出相关 IPC Handlers ──────────────────────────────────────

// check-napcat-exists: 检查实例是否包含 NapCat
ipcMain.handle('check-napcat-exists', async (event, instanceId) => {
  try {
    const { ExportService } = require('./services/integration-pack/ExportService');
    const napcatExists = await ExportService.checkNapcatExists(instanceId);
    return napcatExists;
  } catch (error) {
    console.error('[IPC] checkNapcatExists 失败:', error);
    return false;
  }
});

// scan-instance-plugins: 扫描实例插件
ipcMain.handle('scan-instance-plugins', async (event, instanceId) => {
  try {
    const { ExportService } = require('./services/integration-pack/ExportService');
    const plugins = await ExportService.scanInstancePlugins(instanceId);
    return plugins;
  } catch (error) {
    console.error('[IPC] scanInstancePlugins 失败:', error);
    throw error;
  }
});

// scan-instance-plugin-configs: 扫描实例插件配置文件
ipcMain.handle('scan-instance-plugin-configs', async (event, instanceId) => {
  try {
    const { ExportService } = require('./services/integration-pack/ExportService');
    const pluginConfigs = await ExportService.scanInstancePluginConfigs(instanceId);
    return pluginConfigs;
  } catch (error) {
    console.error('[IPC] scanInstancePluginConfigs 失败:', error);
    throw error;
  }
});

// export-integration-pack: 导出整合包
ipcMain.handle('export-integration-pack', async (event, instanceId, options, destPath) => {
  try {
    const { ExportService } = require('./services/integration-pack/ExportService');
    
    // 进度回调
    const onProgress = (percent, message) => {
      console.log(`[IPC] 发送进度事件: ${percent}%, ${message}`);
      event.sender.send('export-progress', { percent, message });
    };
    
    // 输出回调
    const onOutput = (message) => {
      event.sender.send('export-output', message);
    };
    
    // 执行导出
    const filePath = await ExportService.exportIntegrationPack(
      instanceId,
      options,
      destPath,
      onProgress,
      onOutput
    );
    
    // 发送完成事件
    event.sender.send('export-complete', { success: true, filePath });
    return { success: true, filePath };
  } catch (error) {
    console.error('[IPC] exportIntegrationPack 失败:', error);
    event.sender.send('export-complete', { success: false, error: error.message });
    throw error;
  }
});

// ─── 整合包导入相关 IPC Handlers ──────────────────────────────────────

// select-integration-pack: 选择整合包文件
ipcMain.handle('select-integration-pack', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: '选择整合包文件',
      filters: [
        { name: 'MoFox 整合包', extensions: ['mfpack'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, filePath: null, fileName: null };
    }

    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);

    return { success: true, filePath, fileName };
  } catch (error) {
    console.error('[IPC] selectIntegrationPack 失败:', error);
    return { success: false, error: error.message };
  }
});

// parse-integration-pack: 解析整合包
ipcMain.handle('parse-integration-pack', async (event, packPath) => {
  try {
    const { PackValidator } = require('./services/integration-pack/PackValidator');
    
    // 快速验证并解析 manifest
    const result = await PackValidator.quickValidate(packPath);
    
    if (!result.valid) {
      return { success: false, manifest: null, error: result.error };
    }

    return { success: true, manifest: result.manifest };
  } catch (error) {
    console.error('[IPC] parseIntegrationPack 失败:', error);
    return { success: false, manifest: null, error: error.message };
  }
});

// import-integration-pack: 导入整合包
ipcMain.handle('import-integration-pack', async (event, options) => {
  try {
    const { importService } = require('./services/integration-pack/ImportService');
    
    // 设置回调
    importService.setProgressCallback((progress) => {
      event.sender.send('import-progress', progress);
    });
    
    importService.setOutputCallback((message) => {
      event.sender.send('import-output', message);
    });
    
    importService.setStepChangeCallback((stepChange) => {
      event.sender.send('import-step-change', stepChange);
    });
    
    // 执行导入
    const result = await importService.importIntegrationPack(options.packPath, {
      instanceName: options.instanceName,
      qqNumber: options.qqNumber,
      qqNickname: options.qqNickname,
      ownerQQNumber: options.ownerQQNumber,
      apiKey: options.apiKey,
      webuiApiKey: options.webuiApiKey,
      wsPort: options.wsPort,
      installDir: options.installDir,
      pythonCmd: options.pythonCmd,
      installNapcat: options.installNapcat,
      installWebui: options.installWebui,
    });
    
    // 发送完成事件
    event.sender.send('import-complete', result);
    return result;
  } catch (error) {
    console.error('[IPC] importIntegrationPack 失败:', error);
    const errorResult = { success: false, error: error.message };
    event.sender.send('import-complete', errorResult);
    return errorResult;
  }
});

// import-abort: 中止整合包导入（仅安装步骤执行阶段生效）
ipcMain.handle('import-abort', async () => {
  try {
    const { importService } = require('./services/integration-pack/ImportService');
    return importService.abortImport();
  } catch (error) {
    console.error('[IPC] importAbort 失败:', error);
    return { success: false, error: error.message };
  }
});

// ─── TOML 验证（使用 @iarna/toml 完整解析）─────────────────────────────
ipcMain.handle('validate-toml', async (event, content) => {
  try {
    const TOML = require('@iarna/toml');
    
    // 尝试解析 TOML
    TOML.parse(content);
    
    // 解析成功
    return { 
      valid: true 
    };
  } catch (error) {
    // 解析失败，提取错误信息
    const errorMessage = error.message || '未知错误';
    
    // 提取行号和列号
    // @iarna/toml 的错误格式: "Unexpected character, expected only whitespace or comments till end of line at row 7, col 21, pos 124:"
    let line = undefined;
    let column = undefined;
    let position = undefined;
    
    // 尝试匹配 "row X, col Y, pos Z" 格式
    const detailedMatch = errorMessage.match(/row\s+(\d+)(?:,\s*col\s+(\d+))?(?:,\s*pos\s+(\d+))?/i);
    if (detailedMatch) {
      line = parseInt(detailedMatch[1], 10);
      if (detailedMatch[2]) {
        column = parseInt(detailedMatch[2], 10);
      }
      if (detailedMatch[3]) {
        position = parseInt(detailedMatch[3], 10);
      }
    } else {
      // 尝试简单的行号匹配
      const lineMatch = errorMessage.match(/(?:at\s+)?line\s+(\d+)/i);
      if (lineMatch) {
        line = parseInt(lineMatch[1], 10);
      }
    }
    
    return { 
      valid: false, 
      error: errorMessage,
      line: line,
      column: column,
      position: position
    };
  }
});

ipcMain.handle('instance-get-paths', (event, instanceId) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    const mofoxDir = instance.neomofoxDir;
    const paths = {
      project: mofoxDir,
      config: path.join(mofoxDir, 'config'),
      data: path.join(mofoxDir, 'data'),
      logs: path.join(mofoxDir, 'logs'),
      plugins: path.join(mofoxDir, 'plugins'),
      coreConfig: path.join(mofoxDir, 'config', 'core.toml'),
      modelConfig: path.join(mofoxDir, 'config', 'model.toml'),
    };

    if (instance.platformDir) {
      paths.napcat = instance.platformDir;
      paths.platform = instance.platformDir;
    }

    // 检查路径存在性
    const exists = {};
    Object.keys(paths).forEach(key => {
      exists[key] = fs.existsSync(paths[key]);
    });

    return { success: true, paths, exists };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-delete-database', async (event, instanceId) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    // 检查实例是否在运行
    const instanceData = instanceProcesses.get(instanceId);
    if (instanceData && instanceData.status === 'running') {
      throw new Error('请先停止实例再删除数据库');
    }

    const dataDir = path.join(instance.neomofoxDir, 'data');
    if (!fs.existsSync(dataDir)) {
      return { success: true, message: '数据目录不存在，无需删除' };
    }

    // 查找所有 .db 文件
    const dbFiles = fs.readdirSync(dataDir).filter(file => file.endsWith('.db'));
    
    if (dbFiles.length === 0) {
      return { success: true, message: '未找到数据库文件' };
    }

    // 删除所有数据库文件
    let deletedCount = 0;
    for (const dbFile of dbFiles) {
      const dbPath = path.join(dataDir, dbFile);
      fs.unlinkSync(dbPath);
      deletedCount++;
      
      // 同时删除可能的 .db-shm 和 .db-wal 文件
      const shmPath = dbPath + '-shm';
      const walPath = dbPath + '-wal';
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    }

    return { 
      success: true, 
      message: `已删除 ${deletedCount} 个数据库文件`,
      deletedFiles: dbFiles 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('instance-delete-logs', async (event, instanceId) => {
  try {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    const logsDir = path.join(instance.neomofoxDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      return { success: true, message: '日志目录不存在，无需删除' };
    }

    // 删除日志目录中的所有文件
    const files = fs.readdirSync(logsDir);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile()) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    return { 
      success: true, 
      message: `已删除 ${deletedCount} 个日志文件` 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── 环境管理 IPC ────────────────────────────────────────────────────────────
const { getEnvironmentService } = require('./services/environment/EnvironmentService');
const {
  RECOMMENDED_TOOLS,
  RECOMMENDED_VSCODE_EXTENSIONS,
  EXTENSION_CATEGORIES,
  TOOL_CATEGORIES
} = require('./services/environment/RecommendedTools');

const environmentService = getEnvironmentService();

// 获取推荐工具列表
ipcMain.handle('env-get-recommended-tools', () => {
  return RECOMMENDED_TOOLS;
});

// 获取推荐扩展列表
ipcMain.handle('env-get-recommended-extensions', () => {
  return RECOMMENDED_VSCODE_EXTENSIONS;
});

// 获取扩展分类
ipcMain.handle('env-get-extension-categories', () => {
  return EXTENSION_CATEGORIES;
});

// 获取工具分类
ipcMain.handle('env-get-tool-categories', () => {
  return TOOL_CATEGORIES;
});

// 执行完整环境检测
ipcMain.handle('env-perform-full-check', async () => {
  return await environmentService.performFullCheck();
});

// 获取详细硬件信息
ipcMain.handle('env-get-detailed-system-info', async () => {
  return await environmentService.getDetailedSystemInfo();
});

// 检测 VS Code
ipcMain.handle('env-detect-vscode', async () => {
  return await environmentService.detectVSCode();
});

// 获取已安装的 VS Code 扩展
ipcMain.handle('env-get-installed-extensions', async () => {
  return await environmentService.getInstalledExtensions();
});

// 检测单个工具
ipcMain.handle('env-detect-tool', async (event, toolName, command) => {
  return await environmentService.detectTool(toolName, command);
});

// ─── 版本管理 IPC ────────────────────────────────────────────────────────────

// 设置版本服务的进度回调
versionService.setProgressCallback((progress) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('version-progress', progress);
  }
});

// 获取实例版本信息
ipcMain.handle('version-get-info', async (event, instanceId) => {
  return versionService.getInstanceVersionInfo(instanceId);
});

// 获取远程分支列表
ipcMain.handle('version-get-branches', async () => {
  return versionService.getRemoteBranches();
});

// 获取平台版本列表
ipcMain.handle('version-get-platform-releases', async (event, platformId, limit) => {
  return versionService.getPlatformReleases(platformId || platformRegistry.getDefaultPlatformId(), limit || 10);
});

// 获取 NapCat 版本列表
ipcMain.handle('version-get-napcat-releases', async (event, limit) => {
  return versionService.getPlatformReleases('napcat', limit || 10);
});

// 检查 MoFox 更新
ipcMain.handle('version-check-mofox-update', async (event, instanceId) => {
  return versionService.checkMofoxUpdate(instanceId);
});

// 切换分支
ipcMain.handle('version-switch-branch', async (event, instanceId, branch) => {
  return versionService.switchBranch(instanceId, branch);
});

// 更新 MoFox
ipcMain.handle('version-update-mofox', async (event, instanceId) => {
  return versionService.updateMofox(instanceId);
});

// 更新平台
ipcMain.handle('version-update-platform', async (event, instanceId, version) => {
  return versionService.updatePlatform(instanceId, version);
});

// 更新 NapCat
ipcMain.handle('version-update-napcat', async (event, instanceId, version) => {
  return versionService.updatePlatform(instanceId, version);
});

// 获取 MoFox 提交历史
ipcMain.handle('version-get-mofox-commit-history', async (event, instanceId, limit) => {
  return versionService.getMofoxCommitHistory(instanceId, limit || 20);
});

// 回退到指定 commit
ipcMain.handle('version-checkout-commit', async (event, instanceId, commitHash) => {
  return versionService.checkoutCommit(instanceId, commitHash);
});
