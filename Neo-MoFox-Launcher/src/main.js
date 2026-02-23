const { app, BrowserWindow, ipcMain, dialog, shell, Menu, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { platformHelper } = require('./services/PlatformHelper');

// 强制 stdout/stderr 使用 UTF-8 输出，解决 Windows 终端中文乱码
if (process.stdout && typeof process.stdout.setEncoding === 'function') {
  process.stdout.setEncoding('utf-8');
}
if (process.stderr && typeof process.stderr.setEncoding === 'function') {
  process.stderr.setEncoding('utf-8');
}

let mainWindow;
let mofoxProcess = null;
let mofoxStatus = 'stopped'; // stopped | starting | running | stopping | error
let projectPath = '';
let logBuffer = [];
const MAX_LOG_LINES = 2000;

// ─── 多实例进程管理 ───────────────────────────────────
const instanceProcesses = new Map(); // instanceId -> { process, status, logs, stats, startTime, generation }
const { storageService: instanceStorage } = require('./services/install/StorageService');

// ─── 窗口创建 ───────────────────────────────────────
function createWindow() {
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
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── 应用生命周期 ───────────────────────────────────
app.whenReady().then(() => {
  // 设置全局环境变量，确保所有子进程都使用 UTF-8
  process.env.PYTHONIOENCODING = 'utf-8';
  process.env.PYTHONUNBUFFERED = '1';
  
  // 启动时检测系统环境
  const sysEnv = platformHelper.detectSystemEnv();
  console.log(`[Main] 系统平台: ${sysEnv.platformLabel} (${sysEnv.osType} ${sysEnv.osRelease})${sysEnv.distro ? ' - ' + sysEnv.distroName : ''}`);
  console.log(`[Main] 架构: ${sysEnv.arch}, Shell: ${sysEnv.shell}`);
  
  createWindow();
  loadSettings();
});

app.on('window-all-closed', () => {
  killMofoxProcess();
  app.quit();
});

app.on('before-quit', () => {
  killMofoxProcess();
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
const { getOobeService } = require('./services/oobe/OobeService');
const oobeService = getOobeService(app);

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

// 窗口控制
ipcMain.handle('window-minimize', () => mainWindow.minimize());
ipcMain.handle('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.handle('window-close', () => {
  killMofoxProcess();
  mainWindow.close();
});

// ─── 实例管理 & 安装向导 IPC ──────────────────────────────────────────────
const { storageService } = require('./services/install/StorageService');
const { installWizardService } = require('./services/install/InstallWizardService');
const { versionService } = require('./services/version/VersionService');

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

// 全局状态（stub，StorageService 暂不实现全局状态持久化）
ipcMain.handle('state-read', () => {
  return {};
});

ipcMain.handle('state-write', (event, patch) => {
  return {};
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

// 打开日志文件夹
ipcMain.handle('open-logs-dir', () => {
  const logsDir = path.join(storageService.getDataDir(), 'logs');
  // 确保目录存在
  fs.mkdirSync(logsDir, { recursive: true });
  shell.openPath(logsDir);
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
    instanceData.logs.push(log);
    if (instanceData.logs.length > 1000) {
      instanceData.logs = instanceData.logs.slice(-1000);
    }
  }
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('instance-log', { instanceId, log });
  }
}

function updateInstanceStatus(instanceId, status) {
  const instanceData = instanceProcesses.get(instanceId);
  if (instanceData) {
    instanceData.status = status;
  }
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('instance-status-change', { instanceId, status });
  }
}

function updateInstanceStats(instanceId) {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData || !instanceData.process) return;
  
  const stats = {
    mofox: {
      uptime: Math.floor((Date.now() - instanceData.startTime) / 1000),
      memory: 0,
      cpu: 0
    },
    napcat: {
      uptime: Math.floor((Date.now() - instanceData.startTime) / 1000),
      memory: 0,
      cpu: 0
    }
  };
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('instance-stats-update', { instanceId, stats });
  }
}

// ── 实例启动核心逻辑 ─────────────────────────────────────────────────────────────
async function startInstanceInternal(instanceId, instance) {
  const mofoxPath = instance.neomofoxDir;
  const napcatPath = instance.napcatDir;
  const hasNapcat = !!(napcatPath); // 检查是否安装了 NapCat
  
  if (!mofoxPath || !fs.existsSync(mofoxPath)) {
    throw new Error('MoFox 路径无效: ' + mofoxPath);
  }
  
  // 只在安装了 NapCat 时才检查路径
  if (hasNapcat && !fs.existsSync(napcatPath)) {
    throw new Error('Napcat 路径无效: ' + napcatPath);
  }
  
  const mainPy = path.join(mofoxPath, 'main.py');
  if (!fs.existsSync(mainPy)) {
    throw new Error('未找到 main.py');
  }
  
  // 初始化实例数据
  if (!instanceProcesses.has(instanceId)) {
    instanceProcesses.set(instanceId, {
      process: null,
      status: 'stopped',
      logs: [],
      stats: {},
      startTime: 0,
      webuiOpened: false,
      generation: 0
    });
  }
  
  const instanceData = instanceProcesses.get(instanceId);
  instanceData.generation = (instanceData.generation || 0) + 1;
  const currentGeneration = instanceData.generation;
  instanceData.status = 'starting';
  instanceData.startTime = Date.now();
  instanceData.mofoxProcess = null;
  instanceData.napcatProcess = null;
  instanceData.webuiOpened = false;
  updateInstanceStatus(instanceId, 'starting');
  
  sendInstanceLog(instanceId, 'mofox', '正在启动 MoFox 核心...', 'info');
  if (hasNapcat) {
    sendInstanceLog(instanceId, 'napcat', '正在启动 Napcat...', 'info');
  } else {
    sendInstanceLog(instanceId, 'mofox', '未安装 NapCat，仅启动 MoFox 核心', 'info');
  }
  
  // ── 启动 MoFox ──────────────────────────────────────────────────────
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
  });
  
  instanceData.process = mofoxProc;
  instanceData.mofoxProcess = mofoxProc;
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
    // 使用 generation 检查：如果 generation 已经变了，说明这是旧进程的事件，忽略
    if (instanceData.generation !== currentGeneration) {
      console.log(`[Instance ${instanceId}] 忽略旧 MoFox 进程 close 事件 (gen ${currentGeneration} vs ${instanceData.generation})`);
      return;
    }
    instanceData.mofoxProcess = null;
    // 检查是否需要等待 NapCat 进程（只在安装了 NapCat 时）
    const shouldWaitForNapcat = hasNapcat && instanceData.napcatProcess;
    if (!shouldWaitForNapcat) {
      instanceData.process = null;
      if (instanceData.status === 'stopping') {
        updateInstanceStatus(instanceId, 'stopped');
      } else if (instanceData.status === 'restarting') {
        // 重启中，不更新状态，等待 restart handler 自行处理
        console.log(`[Instance ${instanceId}] MoFox 进程在重启期间退出，等待重启流程`);
      } else {
        updateInstanceStatus(instanceId, code === 0 ? 'stopped' : 'error');
      }
    }
  });
  
  mofoxProc.on('error', (err) => {
    sendInstanceLog(instanceId, 'mofox', `MoFox 启动失败: ${err.message}`, 'error');
    if (instanceData.generation !== currentGeneration) return;
    instanceData.mofoxProcess = null;
    updateInstanceStatus(instanceId, 'error');
  });
  
  // ── 启动 Napcat ────────────────────────────────────────────────────
  // 只在安装了 NapCat 时才启动
  if (hasNapcat) {
    // 查找 Napcat Shell 目录
    let napcatShellPath;
    // 在 napcatDir 下查找 NapCat.*.Shell 子目录
    const napcatShellDirs = fs.readdirSync(napcatPath).filter(name => name.startsWith('NapCat') && name.includes('Shell'));
    napcatShellPath = napcatShellDirs.length > 0 
      ? path.join(napcatPath, napcatShellDirs[0]) 
      : napcatPath;
  
  // 使用 PlatformHelper 获取 NapCat 启动命令
  const napcatStartInfo = platformHelper.getNapcatStartCommand(napcatShellPath, instance.qqNumber);
  
  let napcatCmd, napcatArgs;
  if (napcatStartInfo) {
    napcatCmd = napcatStartInfo.cmd;
    napcatArgs = napcatStartInfo.args;
    sendInstanceLog(instanceId, 'napcat', `使用启动命令: ${napcatCmd} ${napcatArgs.join(' ')}`, 'info');
  } else {
    sendInstanceLog(instanceId, 'napcat', '警告: 未找到 Napcat 启动文件', 'warning');
  }
  
  if (napcatCmd) {
    const napcatProc = spawn(napcatCmd, napcatArgs, {
      cwd: napcatShellPath,
      env: process.env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    instanceData.napcatProcess = napcatProc;
    sendInstanceLog(instanceId, 'napcat', `Napcat PID: ${napcatProc.pid}`, 'info');
    
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
      sendInstanceLog(instanceId, 'napcat', `Napcat 进程已退出 (code: ${code})`, 'info');
      // 使用 generation 检查：如果 generation 已经变了，说明这是旧进程的事件，忽略
      if (instanceData.generation !== currentGeneration) {
        console.log(`[Instance ${instanceId}] 忽略旧 Napcat 进程 close 事件 (gen ${currentGeneration} vs ${instanceData.generation})`);
        return;
      }
      instanceData.napcatProcess = null;
      // 检查两个进程是否都停止了
      if (!instanceData.mofoxProcess) {
        instanceData.process = null;
        if (instanceData.status === 'stopping') {
          updateInstanceStatus(instanceId, 'stopped');
        } else if (instanceData.status === 'restarting') {
          console.log(`[Instance ${instanceId}] Napcat 进程在重启期间退出，等待重启流程`);
        } else {
          updateInstanceStatus(instanceId, code === 0 ? 'stopped' : 'error');
        }
      }
    });
    
    napcatProc.on('error', (err) => {
      sendInstanceLog(instanceId, 'napcat', `Napcat 启动失败: ${err.message}`, 'error');
      if (instanceData.generation !== currentGeneration) return;
      instanceData.napcatProcess = null;
    });
  }
  } // hasNapcat 条件结束
  // ── Napcat 启动结束 ───────────────────────────────────
  
  // 延迟检测启动状态
  setTimeout(() => {
    const mofoxRunning = instanceData.mofoxProcess && !instanceData.mofoxProcess.killed;
    const napcatRunning = hasNapcat && instanceData.napcatProcess && !instanceData.napcatProcess.killed;
    
    if ((mofoxRunning || napcatRunning) && instanceData.status === 'starting') {
      updateInstanceStatus(instanceId, 'running');
      sendInstanceLog(instanceId, 'mofox', 'MoFox 正在运行', 'info');
      if (napcatRunning) {
        sendInstanceLog(instanceId, 'napcat', 'Napcat 正在运行', 'info');
      }
    }
  }, 3000);
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
      if (instanceData && instanceData.status !== 'stopped') {
        updateInstanceStatus(instanceId, 'stopped');
      }
      throw new Error('实例未在运行');
    }
    
    updateInstanceStatus(instanceId, 'stopping');
    sendInstanceLog(instanceId, 'mofox', '正在停止 MoFox...', 'info');
    if (instanceData.napcatProcess) {
      sendInstanceLog(instanceId, 'napcat', '正在停止 Napcat...', 'info');
    }
    
    // 停止 MoFox
    if (instanceData.mofoxProcess) {
      platformHelper.killProcessTree(instanceData.mofoxProcess, 'SIGTERM');
    }
    
    // 停止 Napcat
    if (instanceData.napcatProcess) {
      platformHelper.killProcessTree(instanceData.napcatProcess, 'SIGTERM');
    }
    
    // 超时强杀
    setTimeout(() => {
      if (instanceData.mofoxProcess) {
        try { instanceData.mofoxProcess.kill('SIGKILL'); } catch (e) { /* ignore */ }
        instanceData.mofoxProcess = null;
        sendInstanceLog(instanceId, 'mofox', 'MoFox 已停止', 'info');
      }
      if (instanceData.napcatProcess) {
        try { instanceData.napcatProcess.kill('SIGKILL'); } catch (e) { /* ignore */ }
        instanceData.napcatProcess = null;
        sendInstanceLog(instanceId, 'napcat', 'Napcat 已停止', 'info');
      }
      instanceData.process = null;
      updateInstanceStatus(instanceId, 'stopped');
    }, 5000);
    
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

ipcMain.handle('instance-status', (event, instanceId) => {
  const instanceData = instanceProcesses.get(instanceId);
  return instanceData ? instanceData.status : 'stopped';
});

ipcMain.handle('instance-stats', (event, instanceId) => {
  const instanceData = instanceProcesses.get(instanceId);
  if (!instanceData || (!instanceData.mofoxProcess && !instanceData.napcatProcess)) {
    return {
      mofox: { uptime: 0, memory: 0, cpu: 0 },
      napcat: { uptime: 0, memory: 0, cpu: 0 }
    };
  }
  
  const uptime = Math.floor((Date.now() - instanceData.startTime) / 1000);
  return {
    mofox: { uptime, memory: 0, cpu: 0 },
    napcat: { uptime, memory: 0, cpu: 0 }
  };
});

ipcMain.handle('instance-clear-logs', (event, instanceId, type) => {
  const instanceData = instanceProcesses.get(instanceId);
  if (instanceData) {
    instanceData.logs = instanceData.logs.filter(log => log.type !== type);
  }
  return { success: true };
});

ipcMain.handle('instance-export-logs', async (event, instanceId, type, logs) => {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${instanceId}_${type}_${timestamp}.log`;
    const filepath = path.join(logsDir, filename);
    
    const content = logs.map(log => `[${log.timestamp}] [${log.level}] ${log.message}`).join('\n');
    fs.writeFileSync(filepath, content, 'utf-8');
    
    return filepath;
  } catch (error) {
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
