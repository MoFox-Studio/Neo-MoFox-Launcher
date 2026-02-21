const { app, BrowserWindow, ipcMain, dialog, shell, Menu, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;
let mofoxProcess = null;
let mofoxStatus = 'stopped'; // stopped | starting | running | stopping | error
let projectPath = '';
let logBuffer = [];
const MAX_LOG_LINES = 2000;

// ─── 窗口创建 ───────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    transparent: false,
    backgroundColor: '#0f0f17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  Menu.setApplicationMenu(null);
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
  // 优先找项目目录下的 .venv
  const venvPaths = [
    path.join(projectPath, '.venv', 'Scripts', 'python.exe'),
    path.join(projectPath, '.venv', 'bin', 'python'),
    path.join(projectPath, 'venv', 'Scripts', 'python.exe'),
    path.join(projectPath, 'venv', 'bin', 'python'),
  ];

  for (const p of venvPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 尝试 uv run
  return null;
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
    cmd = process.platform === 'win32' ? 'uv.exe' : 'uv';
    args = ['run', 'python', 'main.py'];
    sendLog('info', '  使用 uv run 启动');
  }

  try {
    mofoxProcess = spawn(cmd, args, {
      cwd: projectPath,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    sendLog('info', `  PID: ${mofoxProcess.pid}`);

    mofoxProcess.stdout.on('data', (data) => {
      const lines = data.toString('utf-8').split('\n');
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
      const lines = data.toString('utf-8').split('\n');
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
    const treeKill = require('tree-kill');
    treeKill(mofoxProcess.pid, 'SIGTERM', (err) => {
      if (err) {
        sendLog('warn', `  强制终止进程...`);
        try { mofoxProcess.kill('SIGKILL'); } catch (e) { /* ignore */ }
      }
    });

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
    const treeKill = require('tree-kill');
    treeKill(mofoxProcess.pid, 'SIGTERM', () => {
      mofoxProcess = null;
      setTimeout(() => startMofox(), 1500);
    });
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
  if (mofoxProcess) {
    try {
      const treeKill = require('tree-kill');
      treeKill(mofoxProcess.pid, 'SIGKILL');
    } catch (e) {
      try { mofoxProcess.kill('SIGKILL'); } catch (e2) { /* ignore */ }
    }
    mofoxProcess = null;
  }
}

// ─── 系统信息 ───────────────────────────────────────
function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  const usedMem = (totalMem - freeMem).toFixed(1);
  return {
    platform: `${os.type()} ${os.release()}`,
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

ipcMain.handle('open-github', () => {
  shell.openExternal('https://github.com/MoFox-Studio/Neo-MoFox-Launcher');
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


// ─── 环境检测 IPC ──────────────────────────────────
function checkCommandVersion(command, args = ['--version']) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { shell: true, timeout: 10000 });
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    
    proc.on('close', (code) => {
      if (code === 0) {
        // 提取版本号
        const output = stdout.trim() || stderr.trim();
        const versionMatch = output.match(/(\d+\.\d+(\.\d+)?)/);
        resolve({
          installed: true,
          version: versionMatch ? versionMatch[1] : output.split('\n')[0],
          output: output,
        });
      } else {
        resolve({ installed: false, version: null, error: stderr.trim() || '命令执行失败' });
      }
    });
    
    proc.on('error', (err) => {
      resolve({ installed: false, version: null, error: err.message });
    });
  });
}

ipcMain.handle('env-check-python', async () => {
  const result = await checkCommandVersion('python', ['--version']);
  if (result.installed && result.version) {
    const [major, minor] = result.version.split('.').map(Number);
    result.valid = major >= 3 && minor >= 11;
    result.requirement = '>= 3.11';
  } else {
    result.valid = false;
    result.requirement = '>= 3.11';
  }
  return result;
});

ipcMain.handle('env-check-uv', async () => {
  const result = await checkCommandVersion('uv', ['--version']);
  result.requirement = '已安装';
  result.valid = result.installed;
  result.installHint = 'pip install uv';
  return result;
});

ipcMain.handle('env-check-git', async () => {
  const result = await checkCommandVersion('git', ['--version']);
  result.requirement = '已安装';
  result.valid = result.installed;
  return result;
});

ipcMain.handle('env-check-all', async () => {
  const [python, uv, git] = await Promise.all([
    checkCommandVersion('python', ['--version']),
    checkCommandVersion('uv', ['--version']),
    checkCommandVersion('git', ['--version']),
  ]);
  
  // 验证 Python 版本
  if (python.installed && python.version) {
    const [major, minor] = python.version.split('.').map(Number);
    python.valid = major >= 3 && minor >= 11;
  } else {
    python.valid = false;
  }
  python.requirement = '>= 3.11';
  
  uv.valid = uv.installed;
  uv.requirement = '已安装';
  uv.installHint = 'pip install uv';
  
  git.valid = git.installed;
  git.requirement = '已安装';
  
  const allPassed = python.valid && uv.valid && git.valid;
  
  const result = {
    passed: allPassed,
    checks: { python, uv, git },
  };
  
  // 如果检测通过，自动保存结果
  if (allPassed) {
    saveEnvCheckResult(result);
  }
  
  return result;
});

// ─── 环境检测结果缓存 ──────────────────────────────────
function getEnvCheckCachePath() {
  return path.join(app.getPath('userData'), 'env-check-cache.json');
}

function saveEnvCheckResult(result) {
  try {
    const cachePath = getEnvCheckCachePath();
    const cacheData = {
      timestamp: Date.now(),
      result: result,
    };
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
    console.log('环境检测结果已缓存');
  } catch (e) {
    console.error('保存环境检测结果失败:', e);
  }
}

function loadEnvCheckResult() {
  try {
    const cachePath = getEnvCheckCachePath();
    if (fs.existsSync(cachePath)) {
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      // 缓存有效期：7 天
      const maxAge = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - cacheData.timestamp < maxAge) {
        console.log('使用缓存的环境检测结果');
        return cacheData.result;
      } else {
        console.log('缓存已过期');
      }
    }
  } catch (e) {
    console.error('读取环境检测缓存失败:', e);
  }
  return null;
}

ipcMain.handle('env-check-get-cached', () => {
  return loadEnvCheckResult();
});

ipcMain.handle('env-check-clear-cache', () => {
  try {
    const cachePath = getEnvCheckCachePath();
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      return { success: true };
    }
    return { success: true, message: '无缓存需要清除' };
  } catch (e) {
    return { success: false, error: e.message };
  }
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
