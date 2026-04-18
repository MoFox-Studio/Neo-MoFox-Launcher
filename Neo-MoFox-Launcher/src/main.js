const { app, BrowserWindow, ipcMain, dialog, shell, Menu, globalShortcut } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

// ─── Windows 终端 UTF-8 修复 ────────────────────────────────────────
// 在任何 console.log 之前，将 Windows 控制台代码页切换为 UTF-8 (65001)
// 否则中文字符会因 GBK/CP936 默认编码而显示为乱码
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

const { platformHelper } = require('./services/PlatformHelper');
const { LauncherLogger, InstanceLogger, LogReader } = require('./services/LoggerService');
const { storageService } = require('./services/install/StorageService');
const { getOobeService } = require('./services/oobe/OobeService');

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
const instanceProcesses = new Map(); // instanceId -> { process, status, logs, stats, startTime, generation }

// ─── 配置编辑器窗口管理 ─────────────────────────────────
const editorWindows = new Map(); // filePath -> BrowserWindow

// ─── 窗口创建 ───────────────────────────────────────
function createWindow(isOobe = false) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hidden', // 隐藏默认标题栏，保留窗口边框以支持 Snap
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false); // 确保菜单栏也不显示
  
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
  killMofoxProcess();
  if (launcherLogger) {
    launcherLogger.close();
  }
  app.quit();
});

app.on('before-quit', () => {
  killMofoxProcess();
  if (launcherLogger) {
    launcherLogger.close();
  }
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

// ─── Neo-MoFox 进程管理 ─────────────────────────────
function sendLog(type, message) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const logEntry = { type, message, timestamp };
  logBuffer.push(logEntry);
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer = logBuffer.slice(-MAX_LOG_LINES);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-output', logEntry);
  }
}

function updateStatus(status, detail = '') {
  mofoxStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-changed', { status, detail });
  }
}

function findPythonExecutable() {
  // 使用 PlatformHelper 查找虚拟环境 Python
  return platformHelper.findVenvPython(projectPath);
}

function startMofox() {
  if (mofoxProcess) {
    sendLog('warn', '⚠ Neo-MoFox 已在运行中');
    return;
  }

  if (!projectPath || !fs.existsSync(projectPath)) {
    sendLog('error', '✗ 请先设置有效的 Neo-MoFox 项目路径');
    updateStatus('error', '项目路径无效');
    return;
  }

  const mainPy = path.join(projectPath, 'main.py');
  if (!fs.existsSync(mainPy)) {
    sendLog('error', '✗ 未找到 main.py，请检查项目路径是否正确');
    updateStatus('error', '未找到 main.py');
    return;
  }

  updateStatus('starting');
  sendLog('info', '◉ 正在启动 Neo-MoFox...');

  const pythonExe = findPythonExecutable();
  let cmd, args;

  if (pythonExe) {
    cmd = pythonExe;
    args = [mainPy];
    sendLog('info', `  使用 Python: ${pythonExe}`);
  } else {
    // 使用 uv run
    cmd = platformHelper.uvBin;
    args = ['run', 'python', 'main.py'];
    sendLog('info', '  使用 uv run 启动');
  }

  try {
    // 强制使用 UTF-8 编码输出，避免中文乱码
    mofoxProcess = spawn(cmd, args, {
      cwd: projectPath,
      env: platformHelper.buildSpawnEnv(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB 缓冲区，防止日志过多导致阻塞
    });

    sendLog('info', `  PID: ${mofoxProcess.pid}`);

    mofoxProcess.stdout.on('data', (data) => {
      const lines = new TextDecoder('utf-8').decode(data).split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          sendLog('stdout', line);
        }
      });
      if (mofoxStatus === 'starting') {
        updateStatus('running');
        sendLog('success', '✓ Neo-MoFox 已成功启动');
      }
    });

    mofoxProcess.stderr.on('data', (data) => {
      const lines = new TextDecoder('utf-8').decode(data).split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          sendLog('stderr', line);
        }
      });
      if (mofoxStatus === 'starting') {
        updateStatus('running');
      }
    });

    mofoxProcess.on('close', (code) => {
      sendLog('info', `◉ Neo-MoFox 进程已退出 (code: ${code})`);
      mofoxProcess = null;
      if (mofoxStatus !== 'stopping') {
        updateStatus(code === 0 ? 'stopped' : 'error', `退出码: ${code}`);
      } else {
        updateStatus('stopped');
      }
    });

    mofoxProcess.on('error', (err) => {
      sendLog('error', `✗ 启动失败: ${err.message}`);
      mofoxProcess = null;
      updateStatus('error', err.message);
    });

    // 延迟检测，如果3秒后进程还在就认为启动成功
    setTimeout(() => {
      if (mofoxProcess && mofoxStatus === 'starting') {
        updateStatus('running');
        sendLog('success', '✓ Neo-MoFox 正在运行');
      }
    }, 3000);

  } catch (err) {
    sendLog('error', `✗ 启动失败: ${err.message}`);
    updateStatus('error', err.message);
  }
}

function stopMofox() {
  if (!mofoxProcess) {
    sendLog('warn', '⚠ Neo-MoFox 未在运行');
    return;
  }

  updateStatus('stopping');
  sendLog('info', '◉ 正在停止 Neo-MoFox...');

  try {
    platformHelper.killProcessTree(mofoxProcess, 'SIGTERM');

    // 超时强杀
    setTimeout(() => {
      if (mofoxProcess) {
        try {
          mofoxProcess.kill('SIGKILL');
        } catch (e) { /* ignore */ }
        mofoxProcess = null;
        updateStatus('stopped');
        sendLog('info', '◉ Neo-MoFox 已被强制停止');
      }
    }, 5000);
  } catch (err) {
    sendLog('error', `✗ 停止失败: ${err.message}`);
    try { mofoxProcess.kill(); } catch (e) { /* ignore */ }
    mofoxProcess = null;
    updateStatus('stopped');
  }
}

function restartMofox() {
  sendLog('info', '◉ 正在重启 Neo-MoFox...');
  if (mofoxProcess) {
    updateStatus('stopping');
    platformHelper.killProcessTree(mofoxProcess, 'SIGTERM');
    // 等待进程退出后重启
    setTimeout(() => {
      mofoxProcess = null;
      startMofox();
    }, 1500);
    setTimeout(() => {
      if (mofoxProcess) {
        try { mofoxProcess.kill('SIGKILL'); } catch (e) { /* ignore */ }
        mofoxProcess = null;
        setTimeout(() => startMofox(), 500);
      }
    }, 5000);
  } else {
    startMofox();
  }
}

function killMofoxProcess() {
  // 杀死旧的单实例进程
  if (mofoxProcess) {
    platformHelper.killProcessTree(mofoxProcess, 'SIGKILL');
    mofoxProcess = null;
  }
  
  // 杀死所有实例进程
  for (const [instanceId, data] of instanceProcesses.entries()) {
    if (data.mofoxProcess) {
      platformHelper.killProcessTree(data.mofoxProcess, 'SIGKILL');
    }
    if (data.napcatProcess) {
      platformHelper.killProcessTree(data.napcatProcess, 'SIGKILL');
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

ipcMain.handle('start-mofox', () => {
  startMofox();
});

ipcMain.handle('stop-mofox', () => {
  stopMofox();
});

ipcMain.handle('restart-mofox', () => {
  restartMofox();
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

// OOBE 相关 handlers 已移除（未被使用）
// 实际使用 settingsWrite 来保存 OOBE 完成状态

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
  // 仅主窗口关闭时杀死 MoFox 进程
  if (window === mainWindow) {
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
    const { instanceService } = require('./services/instance/InstanceService');
    const { spawn } = require('child_process');
    
    // 生成唯一 ID
    const instanceId = `bot-${instanceConfig.qqNumber}`;
    
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
    
    // 验证 NapCat 路径（如果提供）
    if (instanceConfig.napcatDir && !fs.existsSync(instanceConfig.napcatDir)) {
      return { success: false, error: 'NapCat 目录不存在' };
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
      napcatDir: instanceConfig.napcatDir || null,
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
      napcatVersion: instanceConfig.napcatVersion || null,
      neomofoxVersion: neomofoxVersion,
      extra: {
        displayName: instanceConfig.displayName || instanceConfig.qqNumber,
        description: instanceConfig.description || '',
        isLike: false,
      },
      isManuallyAdded: true, // 标记为手动添加
    };
    
    // 保存实例
    await instanceService.addInstance(instance);
    
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

function sendInstanceLog(instanceId, type, message, level = 'info') {
  const timestamp = new Date().toISOString();
  const log = { timestamp, level, message, type };
  
  const instanceData = instanceProcesses.get(instanceId);
  if (instanceData) {
    // 写入文件（如果 logger 已初始化）
    if (instanceData.loggers && instanceData.loggers[type]) {
      instanceData.loggers[type].log(message);
    }
    
    // 保存到内存缓冲（限制为 200 条，避免内存溢出）
    instanceData.logs.push(log);
    if (instanceData.logs.length > 200) {
      instanceData.logs = instanceData.logs.slice(-200);
    }
  }
  
  // 发送 IPC 事件到前端
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('instance-log', { instanceId, log });
  }
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
      process: null,
      mofoxStatus: 'stopped',
      napcatStatus: 'stopped',
      logs: [],
      loggers: {}, // 日志管理器
      stats: {},
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
  
  sendInstanceLog(instanceId, 'mofox', '正在启动 MoFox 核心...', 'info');
  
  // 查找 Python 可执行文件
  const pythonExe = platformHelper.findVenvPython(mofoxPath);
  
  let cmd, args;
  if (pythonExe) {
    cmd = pythonExe;
    args = [mainPy];
    sendInstanceLog(instanceId, 'mofox', `使用 Python: ${pythonExe}`, 'info');
  } else {
    cmd = platformHelper.uvBin;
    args = ['run', 'python', 'main.py'];
    sendInstanceLog(instanceId, 'mofox', '使用 uv run 启动', 'info');
  }
  
  // 强制使用 UTF-8 编码输出，避免中文乱码
  const mofoxProc = spawn(cmd, args, {
    cwd: mofoxPath,
    env: platformHelper.buildSpawnEnv(),
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024, // 10MB 缓冲区，防止日志过多导致阻塞
  });
  
  instanceData.mofoxProcess = mofoxProc;
  instanceData.process = mofoxProc; // 保持向后兼容
  sendInstanceLog(instanceId, 'mofox', `MoFox PID: ${mofoxProc.pid}`, 'info');
  
  mofoxProc.stdout.on('data', (data) => {
    const lines = new TextDecoder('utf-8').decode(data).split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        sendInstanceLog(instanceId, 'mofox', line, 'info');
      }
    });
  });
  
  mofoxProc.stderr.on('data', (data) => {
    const lines = new TextDecoder('utf-8').decode(data).split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        sendInstanceLog(instanceId, 'mofox', line, 'warning');
      }
    });
  });
  
  mofoxProc.on('close', (code) => {
    sendInstanceLog(instanceId, 'mofox', `MoFox 进程已退出 (code: ${code})`, 'info');
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
      instanceData.mofoxStatus = code === 0 ? 'stopped' : 'error';
    }
    // 如果两个进程都停止了，清空 process 引用
    if (!instanceData.napcatProcess) {
      instanceData.process = null;
    }
    updateInstanceStatus(instanceId);
  });
  
  mofoxProc.on('error', (err) => {
    sendInstanceLog(instanceId, 'mofox', `MoFox 启动失败: ${err.message}`, 'error');
    if (instanceData.mofoxGeneration !== currentGeneration) return;
    instanceData.mofoxProcess = null;
    instanceData.mofoxStatus = 'error';
    updateInstanceStatus(instanceId);
  });
  
  // 延迟检测启动状态
  setTimeout(() => {
    const mofoxRunning = instanceData.mofoxProcess && !instanceData.mofoxProcess.killed;
    if (mofoxRunning && instanceData.mofoxStatus === 'starting') {
      instanceData.mofoxStatus = 'running';
      updateInstanceStatus(instanceId);
      sendInstanceLog(instanceId, 'mofox', 'MoFox 正在运行', 'info');
    }
  }, 3000);
}
// ── NapCat 独立启动函数 ──────────────────────────────────────────────────────
async function startNapcatProcess(instanceId, instance) {
  const napcatPath = instance.napcatDir;
  
  if (!napcatPath) {
    throw new Error('未安装 NapCat');
  }
  
  if (!fs.existsSync(napcatPath)) {
    throw new Error('NapCat 路径无效: ' + napcatPath);
  }
  
  // 初始化实例数据
  if (!instanceProcesses.has(instanceId)) {
    instanceProcesses.set(instanceId, {
      process: null,
      mofoxStatus: 'stopped',
      napcatStatus: 'stopped',
      logs: [],
      loggers: {}, // 日志管理器
      stats: {},
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
  
  sendInstanceLog(instanceId, 'napcat', '正在启动 NapCat...', 'info');
  
  // 在 napcatDir 下查找 NapCat.*.Shell 子目录
  const napcatShellDirs = fs.readdirSync(napcatPath).filter(name => name.startsWith('NapCat') && name.includes('Shell'));
  const napcatShellPath = napcatShellDirs.length > 0 
    ? path.join(napcatPath, napcatShellDirs[0]) 
    : napcatPath;

  // 使用 PlatformHelper 获取 NapCat 启动命令
  const napcatStartInfo = platformHelper.getNapcatStartCommand(napcatShellPath, instance.qqNumber);
  
  if (!napcatStartInfo) {
    sendInstanceLog(instanceId, 'napcat', '错误: 未找到 NapCat 启动文件', 'error');
    instanceData.napcatStatus = 'error';
    updateInstanceStatus(instanceId);
    throw new Error('未找到 NapCat 启动文件');
  }
  
  const napcatCmd = napcatStartInfo.cmd;
  const napcatArgs = napcatStartInfo.args;
  sendInstanceLog(instanceId, 'napcat', `使用启动命令: ${napcatCmd} ${napcatArgs.join(' ')}`, 'info');
  
  const napcatProc = spawn(napcatCmd, napcatArgs, {
    cwd: napcatShellPath,
    env: process.env,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024, // 10MB 缓冲区，防止日志过多导致阻塞
  });
  
  instanceData.napcatProcess = napcatProc;
  if (!instanceData.mofoxProcess) {
    instanceData.process = napcatProc; // 如果 MoFox 未运行，设置 process 引用
  }
  sendInstanceLog(instanceId, 'napcat', `NapCat PID: ${napcatProc.pid}`, 'info');
  
  napcatProc.stdout.on('data', (data) => {
    const lines = data.toString('utf-8').split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        sendInstanceLog(instanceId, 'napcat', line, 'info');
        
        // 检测 WebUI URL 并自动打开（仅首次）
        const webuiMatch = line.match(/WebUI User Panel Url:\s*(https?:\/\/[^\s]+)/i);
        if (webuiMatch && !instanceData.webuiOpened) {
          const url = webuiMatch[1];
          const settings = settingsService.readSettings();
          if (settings.autoOpenNapcatWebUI) {
            instanceData.webuiOpened = true;
            sendInstanceLog(instanceId, 'napcat', `自动打开 WebUI: ${url}`, 'info');
            shell.openExternal(url).catch(err => {
              sendInstanceLog(instanceId, 'napcat', `打开 WebUI 失败: ${err.message}`, 'error');
            });
          }
        }
      }
    });
  });
  
  napcatProc.stderr.on('data', (data) => {
    const lines = data.toString('utf-8').split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        sendInstanceLog(instanceId, 'napcat', line, 'warning');
      }
    });
  });
  
  napcatProc.on('close', (code) => {
    sendInstanceLog(instanceId, 'napcat', `NapCat 进程已退出 (code: ${code})`, 'info');
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
      instanceData.napcatStatus = code === 0 ? 'stopped' : 'error';
    }
    // 如果两个进程都停止了，清空 process 引用
    if (!instanceData.mofoxProcess) {
      instanceData.process = null;
    }
    updateInstanceStatus(instanceId);
  });
  
  napcatProc.on('error', (err) => {
    sendInstanceLog(instanceId, 'napcat', `NapCat 启动失败: ${err.message}`, 'error');
    if (instanceData.napcatGeneration !== currentGeneration) return;
    instanceData.napcatProcess = null;
    instanceData.napcatStatus = 'error';
    updateInstanceStatus(instanceId);
  });
  
  // 延迟检测启动状态
  setTimeout(() => {
    const napcatRunning = instanceData.napcatProcess && !instanceData.napcatProcess.killed;
    if (napcatRunning && instanceData.napcatStatus === 'starting') {
      instanceData.napcatStatus = 'running';
      updateInstanceStatus(instanceId);
      sendInstanceLog(instanceId, 'napcat', 'NapCat 正在运行', 'info');
    }
  }, 3000);
}

// ── 实例启动核心逻辑（启动全部）──────────────────────────────────────────────
async function startInstanceInternal(instanceId, instance) {
  const hasNapcat = !!(instance.napcatDir);
  
  sendInstanceLog(instanceId, 'mofox', '正在启动 MoFox 核心...', 'info');
  if (hasNapcat) {
    sendInstanceLog(instanceId, 'napcat', '正在启动 NapCat...', 'info');
  } else {
    sendInstanceLog(instanceId, 'mofox', '未安装 NapCat，仅启动 MoFox 核心', 'info');
  }
  
  // 调用独立函数启动 MoFox
  await startMoFoxProcess(instanceId, instance);
  
  // 调用独立函数启动 NapCat（如果安装了）
  if (hasNapcat) {
    await startNapcatProcess(instanceId, instance);
  }
}

// ── MoFox 独立停止函数 ───────────────────────────────────────────────────────
async function stopMoFoxProcess(instanceId) {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData || !instanceData.mofoxProcess) {
    throw new Error('MoFox 未在运行');
  }
  
  instanceData.mofoxStatus = 'stopping';
  updateInstanceStatus(instanceId);
  sendInstanceLog(instanceId, 'mofox', '正在停止 MoFox...', 'info');
  
  const mofoxProc = instanceData.mofoxProcess;
  
  // 发送 SIGTERM 优雅关闭
  platformHelper.killProcessTree(mofoxProc, 'SIGTERM');
  
  // 等待进程退出（最多 5 秒）
  await new Promise((resolve) => {
    let resolved = false;
    const checkDone = () => {
      if (resolved) return;
      if (mofoxProc.killed || mofoxProc.exitCode !== null) {
        resolved = true;
        resolve();
      }
    };
    
    mofoxProc.on('close', checkDone);
    checkDone(); // 检查是否已经退出
    
    // 超时强杀
    setTimeout(() => {
      if (!resolved) {
        try { mofoxProc.kill('SIGKILL'); } catch (e) { /* ignore */ }
        setTimeout(() => {
          resolved = true;
          resolve();
        }, 500);
      }
    }, 4000);
  });
  
  instanceData.mofoxProcess = null;
  instanceData.mofoxStatus = 'stopped';
  if (!instanceData.napcatProcess) {
    instanceData.process = null;
  }
  updateInstanceStatus(instanceId);
  sendInstanceLog(instanceId, 'mofox', 'MoFox 已停止', 'info');
}

// ── NapCat 独立停止函数 ──────────────────────────────────────────────────────
async function stopNapcatProcess(instanceId) {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData || !instanceData.napcatProcess) {
    throw new Error('NapCat 未在运行');
  }
  
  instanceData.napcatStatus = 'stopping';
  updateInstanceStatus(instanceId);
  sendInstanceLog(instanceId, 'napcat', '正在停止 NapCat...', 'info');
  
  const napcatProc = instanceData.napcatProcess;
  
  // 发送 SIGTERM 优雅关闭
  platformHelper.killProcessTree(napcatProc, 'SIGTERM');
  
  // 等待进程退出（最多 5 秒）
  await new Promise((resolve) => {
    let resolved = false;
    const checkDone = () => {
      if (resolved) return;
      if (napcatProc.killed || napcatProc.exitCode !== null) {
        resolved = true;
        resolve();
      }
    };
    
    napcatProc.on('close', checkDone);
    checkDone(); // 检查是否已经退出
    
    // 超时强杀
    setTimeout(() => {
      if (!resolved) {
        try { napcatProc.kill('SIGKILL'); } catch (e) { /* ignore */ }
        setTimeout(() => {
          resolved = true;
          resolve();
        }, 500);
      }
    }, 4000);
  });
  
  instanceData.napcatProcess = null;
  instanceData.napcatStatus = 'stopped';
  if (!instanceData.mofoxProcess) {
    instanceData.process = null;
  }
  updateInstanceStatus(instanceId);
  sendInstanceLog(instanceId, 'napcat', 'NapCat 已停止', 'info');
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
    sendInstanceLog(instanceId, 'mofox', '正在重启 MoFox...', 'info');
    
    await stopMoFoxProcess(instanceId);
    await new Promise(resolve => setTimeout(resolve, 500)); // 等待清理
  }
  
  await startMoFoxProcess(instanceId, instance);
}

// ── NapCat 独立重启函数 ──────────────────────────────────────────────────────
async function restartNapcatProcess(instanceId) {
  const instance = storageService.getInstance(instanceId);
  if (!instance) {
    throw new Error('实例不存在');
  }
  
  const hasNapcat = !!(instance.napcatDir);
  if (!hasNapcat) {
    throw new Error('未安装 NapCat');
  }
  
  const instanceData = instanceProcesses.get(instanceId);
  if (instanceData && instanceData.napcatProcess) {
    instanceData.napcatStatus = 'restarting';
    updateInstanceStatus(instanceId);
    sendInstanceLog(instanceId, 'napcat', '正在重启 NapCat...', 'info');
    
    await stopNapcatProcess(instanceId);
    await new Promise(resolve => setTimeout(resolve, 500)); // 等待清理
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
          try { platformHelper.killProcessTree(data.mofoxProcess, 'SIGKILL'); } catch (e) { /* ignore */ }
          data.mofoxProcess = null;
        }
        if (data.napcatProcess) {
          try { platformHelper.killProcessTree(data.napcatProcess, 'SIGKILL'); } catch (e) { /* ignore */ }
          data.napcatProcess = null;
        }
        data.process = null;
        // 等待短暂时间让进程完全退出
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
        instanceData.mofoxStatus = 'stopped';
        instanceData.napcatStatus = 'stopped';
        updateInstanceStatus(instanceId);
      }
      throw new Error('实例未在运行');
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
      sendInstanceLog(instanceId, 'mofox', '正在重启 MoFox...', 'info');
      sendInstanceLog(instanceId, 'napcat', '正在重启 Napcat...', 'info');
      
      // 保存旧进程引用用于等待退出
      const oldMofox = instanceData.mofoxProcess;
      const oldNapcat = instanceData.napcatProcess;
      
      // 发送 SIGTERM 优雅关闭
      if (oldMofox) {
        platformHelper.killProcessTree(oldMofox, 'SIGTERM');
      }
      if (oldNapcat) {
        platformHelper.killProcessTree(oldNapcat, 'SIGTERM');
      }
      
      // 等待旧进程真正退出（最多 5 秒），而不是立即清空引用
      await new Promise((resolve) => {
        let resolved = false;
        const checkDone = () => {
          if (resolved) return;
          const mofoxDone = !oldMofox || oldMofox.killed || oldMofox.exitCode !== null;
          const napcatDone = !oldNapcat || oldNapcat.killed || oldNapcat.exitCode !== null;
          if (mofoxDone && napcatDone) {
            resolved = true;
            resolve();
          }
        };
        
        if (oldMofox) oldMofox.on('close', checkDone);
        if (oldNapcat) oldNapcat.on('close', checkDone);
        checkDone(); // 检查是否已经退出
        
        // 超时强杀
        setTimeout(() => {
          if (!resolved) {
            if (oldMofox && !oldMofox.killed) {
              try { oldMofox.kill('SIGKILL'); } catch (e) { /* ignore */ }
            }
            if (oldNapcat && !oldNapcat.killed) {
              try { oldNapcat.kill('SIGKILL'); } catch (e) { /* ignore */ }
            }
            // 再等 500ms 让 SIGKILL 生效
            setTimeout(() => {
              resolved = true;
              resolve();
            }, 500);
          }
        }, 4000);
      });
      
      // 清理旧进程引用
      instanceData.mofoxProcess = null;
      instanceData.napcatProcess = null;
      instanceData.process = null;
      
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
    
    if (!instance.napcatDir) {
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
      throw new Error('MoFox 未在运行');
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
      throw new Error('NapCat 未在运行');
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
    
    if (!instance.napcatDir) {
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

ipcMain.handle('instance-clear-logs', (event, instanceId, type) => {
  const instanceData = instanceProcesses.get(instanceId);
  if (instanceData) {
    instanceData.logs = instanceData.logs.filter(log => log.type !== type);
  }
  return { success: true };
});

ipcMain.handle('instance-export-logs', async (event, instanceId, type) => {
  try {
    // 获取实例日志目录
    const instanceLogDir = storageService.getInstanceLogDir(instanceId);
    if (!fs.existsSync(instanceLogDir)) {
      throw new Error('实例日志目录不存在');
    }

    // 获取所有历史日志文件（包括归档）
    const logFiles = LogReader.listLogFiles(instanceLogDir, type);
    if (logFiles.length === 0) {
      throw new Error('没有找到任何日志文件');
    }

    console.log(`[instance-export-logs] 找到 ${logFiles.length} 个日志文件:`, logFiles.map(f => f.name));

    // 读取所有日志文件内容
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

    // 解析并按时间排序
    const parsedLogs = allLines
      .map(line => {
        const parsed = LogReader.parseLogLine(line);
        return parsed ? { ...parsed, raw: line } : null;
      })
      .filter(log => log !== null)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log(`[instance-export-logs] 解析并排序了 ${parsedLogs.length} 行日志`);

    // 生成导出文件
    const exportsDir = path.join(app.getPath('userData'), 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `${instanceId}_${type}_${timestamp}.log`;
    const filepath = path.join(exportsDir, filename);

    // 写入合并后的日志内容（使用原始格式行）
    const content = parsedLogs.map(log => log.raw).join('\n');
    fs.writeFileSync(filepath, content, 'utf-8');

    console.log(`[instance-export-logs] 导出成功: ${filepath}`);
    return filepath;
  } catch (error) {
    console.error(`[instance-export-logs] 导出失败:`, error);
    throw new Error('导出失败: ' + error.message);
  }
});

ipcMain.handle('instance-get-logs', (event, instanceId) => {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData || !instanceData.logs) {
    return {
      mofox: [],
      napcat: []
    };
  }
  
  // 按类型分组返回日志
  const mofoxLogs = instanceData.logs.filter(log => log.type === 'mofox');
  const napcatLogs = instanceData.logs.filter(log => log.type === 'napcat');
  
  return {
    mofox: mofoxLogs,
    napcat: napcatLogs
  };
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
        if (instance.napcatDir) {
          folderPath = instance.napcatDir;
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

    if (instance.napcatDir) {
      paths.napcat = instance.napcatDir;
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

// 获取 NapCat 版本列表
ipcMain.handle('version-get-napcat-releases', async (event, limit) => {
  return versionService.getNapCatReleases(limit || 10);
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

// 更新 NapCat
ipcMain.handle('version-update-napcat', async (event, instanceId, version) => {
  return versionService.updateNapCat(instanceId, version);
});

// 获取 MoFox 提交历史
ipcMain.handle('version-get-mofox-commit-history', async (event, instanceId, limit) => {
  return versionService.getMofoxCommitHistory(instanceId, limit || 20);
});

// 回退到指定 commit
ipcMain.handle('version-checkout-commit', async (event, instanceId, commitHash) => {
  return versionService.checkoutCommit(instanceId, commitHash);
});
