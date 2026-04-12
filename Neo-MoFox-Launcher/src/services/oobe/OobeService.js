/**
 * OobeService - 首次运行环境检测与依赖自动安装服务
 *
 * 职责：
 *  - 检测 Python / uv / Git 是否满足运行要求
 *  - 缓存检测结果（有效期 7 天）
 *  - 自动下载安装包并静默安装依赖
 *  - 通过 IPC 事件通知渲染进程安装进度
 */

'use strict';

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const https = require('https');
const http  = require('http');
const { platformHelper } = require('../PlatformHelper');

// ─── 下载链接 & 静默安装参数 ──────────────────────────────────────────────

const DOWNLOAD_META = {
  python: {
    displayName: 'Python 3.11',
    // 按平台区分下载链接和安装方式
    win32: {
      downloadUrl: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe',
      fileName: 'python-3.11.9-amd64.exe',
      silentArgs: ['/quiet', 'InstallAllUsers=0', 'PrependPath=1', 'Include_test=0', 'Include_launcher=1'],
    },
    linux: {
      // Ubuntu/Debian: 使用 apt 安装
      useScript: true,
      scriptType: 'bash',
      scriptCmd: 'bash',
      scriptArgs: [
        '-c',
        'sudo apt-get update && sudo apt-get install -y python3.11 python3.11-venv python3.11-dev python3-pip',
      ],
    },
    darwin: {
      downloadUrl: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-macos11.pkg',
      fileName: 'python-3.11.9-macos11.pkg',
      silentArgs: [],
      useScript: true,
      scriptType: 'bash',
      scriptCmd: 'bash',
      scriptArgs: ['-c', 'brew install python@3.11 || echo "Please install Homebrew first"'],
    },
    requirement: '>= 3.11',
    postInstallNote: 'Python 安装完成后可能需要重启终端或应用才能识别。',
  },
  uv: {
    displayName: 'uv (Python 包管理器)',
    win32: {
      useScript: true,
      scriptType: 'powershell',
      scriptCmd: 'powershell',
      scriptArgs: [
        '-ExecutionPolicy', 'Bypass', '-NoProfile', '-NonInteractive',
        '-Command', 'irm https://astral.sh/uv/install.ps1 | iex',
      ],
    },
    linux: {
      useScript: true,
      scriptType: 'bash',
      scriptCmd: 'bash',
      scriptArgs: ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'],
    },
    darwin: {
      useScript: true,
      scriptType: 'bash',
      scriptCmd: 'bash',
      scriptArgs: ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'],
    },
    requirement: '已安装',
    postInstallNote: 'uv 已通过官方脚本安装。',
  },
  git: {
    displayName: 'Git',
    win32: {
      downloadUrl: 'https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe',
      fileName: 'Git-2.47.1.2-64-bit.exe',
      silentArgs: ['/VERYSILENT', '/NORESTART', '/SP-', '/SUPPRESSMSGBOXES'],
    },
    linux: {
      useScript: true,
      scriptType: 'bash',
      scriptCmd: 'bash',
      scriptArgs: ['-c', 'sudo apt-get update && sudo apt-get install -y git'],
    },
    darwin: {
      useScript: true,
      scriptType: 'bash',
      scriptCmd: 'bash',
      scriptArgs: ['-c', 'xcode-select --install 2>/dev/null || brew install git'],
    },
    requirement: '已安装',
    postInstallNote: 'Git 安装完成后可能需要重启终端或应用才能识别。',
  },
};

// ─── OobeService 类 ───────────────────────────────────────────────────

class OobeService {
  /**
   * @param {import('electron').App} electronApp
   * @param {import('electron').Dialog} electronDialog
   */
  constructor(electronApp, electronDialog = null) {
    this._app = electronApp;
    this._dialog = electronDialog;
    /** @type {import('electron').BrowserWindow | null} */
    this._mainWindow = null;
    /** @type {Map<string, AbortController>} 正在进行的下载任务 */
    this._downloads = new Map();

    // 启动时检测系统环境
    this._sysEnv = platformHelper.detectSystemEnv();
    console.log(`[OobeService] 系统环境: ${this._sysEnv.platformLabel}${this._sysEnv.distro ? ' (' + this._sysEnv.distroName + ')' : ''}`);
  }

  /**
   * 设置主窗口引用（用于对话框）
   * @param {import('electron').BrowserWindow} mainWindow
   */
  setMainWindow(mainWindow) {
    this._mainWindow = mainWindow;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 环境检测
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 运行命令，返回 { installed, version, output, error }
   */
  checkCommandVersion(command, args = ['--version']) {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        shell: platformHelper.config.shell,
        timeout: 15000,
        env: platformHelper.buildSpawnEnv(),
      });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          const output = stdout.trim() || stderr.trim();
          const versionMatch = output.match(/(\d+\.\d+(\.\d+)?)/);
          resolve({
            installed: true,
            version: versionMatch ? versionMatch[1] : output.split('\n')[0],
            output,
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

  // ─── 单项检测 ──────────────────────────────────────────────────────

  async checkPython() {
    // 根据平台使用不同的 Python 命令
    const pythonCmd = platformHelper.pythonExeName.replace(/\.exe$/, '');
    const result = await this.checkCommandVersion(pythonCmd, ['--version']);
    if (result.installed && result.version) {
      const [major, minor] = result.version.split('.').map(Number);
      result.valid = major >= 3 && minor >= 11;
    } else {
      result.valid = false;
    }
    result.requirement    = DOWNLOAD_META.python.requirement;
    result.canAutoInstall = true;
    result.platform       = platformHelper.platform;
    return result;
  }

  async checkUv() {
    const result = await this.checkCommandVersion(platformHelper.uvBin.replace(/\.exe$/, ''), ['--version']);
    result.valid          = result.installed;
    result.requirement    = DOWNLOAD_META.uv.requirement;
    result.canAutoInstall = true;
    result.platform       = platformHelper.platform;
    return result;
  }

  async checkGit() {
    const result = await this.checkCommandVersion('git', ['--version']);
    result.valid          = result.installed;
    result.requirement    = DOWNLOAD_META.git.requirement;
    result.canAutoInstall = true;
    result.platform       = platformHelper.platform;
    return result;
  }

  /** 同时检测所有依赖，返回汇总结果 */
  async checkAll() {
    const [python, uv, git] = await Promise.all([
      this.checkPython(),
      this.checkUv(),
      this.checkGit(),
    ]);

    const passed = python.valid && uv.valid && git.valid;
    const result = { passed, checks: { python, uv, git }, platform: platformHelper.platform, platformLabel: platformHelper.label };

    if (passed) {
      this.saveCache(result);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 缓存管理
  // ═══════════════════════════════════════════════════════════════════════

  _cachePath() {
    return path.join(this._app.getPath('userData'), 'env-check-cache.json');
  }

  saveCache(result) {
    try {
      fs.writeFileSync(this._cachePath(), JSON.stringify({
        timestamp: Date.now(),
        result,
      }, null, 2));
      console.log('[OobeService] 环境检测结果已缓存');
    } catch (e) {
      console.error('[OobeService] 保存缓存失败:', e);
    }
  }

  loadCache() {
    try {
      const p = this._cachePath();
      if (!fs.existsSync(p)) return null;
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天
      if (Date.now() - data.timestamp < MAX_AGE) {
        console.log('[OobeService] 使用缓存的环境检测结果');
        return data.result;
      }
      console.log('[OobeService] 缓存已过期');
    } catch (e) {
      console.error('[OobeService] 读取缓存失败:', e);
    }
    return null;
  }

  clearCache() {
    try {
      const p = this._cachePath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OOBE 路径选择与验证
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 打开文件夹选择对话框
   * @returns {Promise<string | null>} 选中的路径，如果取消则返回 null
   */
  async selectPath() {
    if (!this._dialog || !this._mainWindow) {
      console.error('[OobeService] dialog 或 mainWindow 未初始化');
      return null;
    }

    const result = await this._dialog.showOpenDialog(this._mainWindow, {
      title: '选择安装目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: this._app.getPath('home'),
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  }

  /**
   * 验证安装路径是否有效
   * @param {string} targetPath - 要验证的路径
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validatePath(targetPath) {
    if (!targetPath || targetPath.trim() === '') {
      return { valid: false, error: '路径不能为空' };
    }

    try {
      // Windows 平台检查盘符和路径格式
      if (process.platform === 'win32') {
        if (!/^[a-zA-Z]:\\/.test(targetPath)) {
          return { valid: false, error: '路径格式无效' };
        }
      }

      // 检查路径长度（Windows 限制）
      if (process.platform === 'win32' && targetPath.length > 240) {
        return { valid: false, error: '路径过长（Windows 限制为 240 字符）' };
      }

      // 检查路径是否存在
      let pathExists = false;
      try {
        await fs.promises.access(targetPath, fs.constants.F_OK);
        pathExists = true;
      } catch {
        pathExists = false;
      }

      if (!pathExists) {
        return { valid: false, error: '路径不存在，请选择已存在的目录' };
      }

      // 路径存在，检查是否可写
      try {
        await fs.promises.access(targetPath, fs.constants.W_OK);
      } catch {
        return { valid: false, error: '路径不可写' };
      }

      // 检查目录是否为空
      const files = await fs.promises.readdir(targetPath);
      if (files.length > 0) {
        return { valid: false, error: '目录不为空，请选择空目录' };
      }

      return { valid: true };
    } catch (error) {
      console.error('[OobeService] 验证路径失败:', error);
      return { valid: false, error: error.message || '验证失败' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 下载 & 静默安装
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 获取下载临时目录
   */
  _getTempDir() {
    const dir = path.join(this._app.getPath('temp'), 'neo-mofox-installers');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * 下载文件，支持重定向跟随 & 进度回调
   * @param {string} url
   * @param {string} destPath
   * @param {(progress: {percent: number, downloaded: number, total: number}) => void} onProgress
   * @returns {Promise<string>} 下载后的文件路径
   */
  _downloadFile(url, destPath, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      const doRequest = (reqUrl, redirectCount = 0) => {
        if (redirectCount > 10) {
          return reject(new Error('重定向次数过多'));
        }

        const client = reqUrl.startsWith('https') ? https : http;

        const req = client.get(reqUrl, { headers: { 'User-Agent': 'Neo-MoFox-Launcher' } }, (res) => {
          // 跟随重定向
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, reqUrl).href;
            console.log(`[OobeService] 重定向到: ${redirectUrl}`);
            return doRequest(redirectUrl, redirectCount + 1);
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}: ${reqUrl}`));
          }

          const totalSize = parseInt(res.headers['content-length'] || '0', 10);
          let downloaded = 0;

          const writer = fs.createWriteStream(destPath);

          res.on('data', (chunk) => {
            downloaded += chunk.length;
            if (totalSize > 0) {
              onProgress({
                percent: Math.round((downloaded / totalSize) * 100),
                downloaded,
                total: totalSize,
              });
            }
          });

          res.pipe(writer);

          writer.on('finish', () => {
            writer.close();
            resolve(destPath);
          });

          writer.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.setTimeout(60000, () => {
          req.destroy();
          reject(new Error('下载超时'));
        });
      };

      doRequest(url);
    });
  }

  /**
   * 运行安装程序（静默模式）
   * @param {string} installerPath
   * @param {string[]} args
   * @param {(line: string) => void} onOutput
   * @returns {Promise<{success: boolean, exitCode?: number, error?: string}>}
   */
  _runInstaller(installerPath, args, onOutput = () => {}) {
    return new Promise((resolve) => {
      onOutput(`[安装] 正在运行: ${path.basename(installerPath)} ${args.join(' ')}\n`);

      const proc = spawn(installerPath, args, {
        shell: false,
        detached: false,
        windowsHide: true,
      });

      proc.stdout?.on('data', (d) => {
        onOutput(d.toString());
      });

      proc.stderr?.on('data', (d) => {
        onOutput(d.toString());
      });

      proc.on('close', (code) => {
        if (code === 0) {
          onOutput(`[完成] 安装程序退出，代码: ${code}\n`);
          resolve({ success: true, exitCode: code });
        } else {
          onOutput(`[警告] 安装程序退出码: ${code}\n`);
          // 有些安装程序用非0退出码但实际成功了（如需要重启），仍然尝试
          resolve({ success: code === 3010 || code === 1641, exitCode: code, error: `退出码: ${code}` });
        }
      });

      proc.on('error', (err) => {
        onOutput(`[错误] 启动安装程序失败: ${err.message}\n`);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 运行脚本命令（如 PowerShell）
   * @param {string} cmd
   * @param {string[]} args
   * @param {(line: string) => void} onOutput
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  _runScript(cmd, args, onOutput = () => {}) {
    return new Promise((resolve) => {
      onOutput(`[安装] 运行脚本: ${cmd} ${args.join(' ')}\n`);

      const proc = spawn(cmd, args, {
        shell: true,
        env: { 
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          LANG: 'en_US.UTF-8',
          LC_ALL: 'en_US.UTF-8'
        },
        windowsHide: true,
        encoding: 'utf-8',
      });

      proc.stdout?.on('data', (d) => {
        const text = d.toString();
        onOutput(text);
        console.log(`[OobeService][script] ${text.trim()}`);
      });

      proc.stderr?.on('data', (d) => {
        const text = d.toString();
        onOutput(text);
        console.error(`[OobeService][script] stderr: ${text.trim()}`);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          onOutput(`[完成] 脚本执行成功\n`);
          resolve({ success: true });
        } else {
          const msg = `脚本退出码: ${code}`;
          onOutput(`[错误] ${msg}\n`);
          resolve({ success: false, error: msg });
        }
      });

      proc.on('error', (err) => {
        const msg = `启动脚本失败: ${err.message}`;
        onOutput(`[错误] ${msg}\n`);
        resolve({ success: false, error: msg });
      });
    });
  }

  /**
   * 安装指定依赖 — 下载安装包并静默运行
   * @param {string} depName - 'python' | 'uv' | 'git'
   * @param {(event: {type: string, message?: string, percent?: number}) => void} onProgress
   * @returns {Promise<{success: boolean, error?: string, needRestart?: boolean}>}
   */
  async installDep(depName, onProgress = () => {}) {
    const meta = DOWNLOAD_META[depName];
    if (!meta) {
      return { success: false, error: `未知依赖: ${depName}` };
    }

    // 获取当前平台的安装配置
    const platMeta = meta[platformHelper.platform] || meta.linux;
    if (!platMeta) {
      return { success: false, error: `${meta.displayName} 不支持当前平台 (${platformHelper.label})` };
    }

    try {
      // ─ 脚本安装方式 (uv / Linux apt 等) ─
      if (platMeta.useScript) {
        onProgress({ type: 'status', message: `正在安装 ${meta.displayName} (${platformHelper.label})...` });
        onProgress({ type: 'log', message: `[信息] 使用${platformHelper.isLinux ? '系统包管理器' : '官方安装脚本'}安装 ${meta.displayName}\n` });

        const result = await this._runScript(platMeta.scriptCmd, platMeta.scriptArgs, (line) => {
          onProgress({ type: 'log', message: line });
        });

        if (result.success) {
          onProgress({ type: 'status', message: `${meta.displayName} 安装成功！` });
          onProgress({ type: 'log', message: `\n${meta.postInstallNote || ''}\n` });
          return { success: true };
        } else {
          return { success: false, error: result.error || '安装脚本执行失败' };
        }
      }

      // ─ 下载安装包方式 (Windows Python / Git) ─
      const tempDir = this._getTempDir();
      const destPath = path.join(tempDir, platMeta.fileName);

      // 1. 下载
      onProgress({ type: 'status', message: `正在下载 ${meta.displayName}...` });
      onProgress({ type: 'log', message: `[下载] 开始下载 ${meta.displayName}\n` });
      onProgress({ type: 'log', message: `[下载] URL: ${platMeta.downloadUrl}\n` });

      // 如果文件已存在且大小 > 1MB，跳过下载
      if (fs.existsSync(destPath)) {
        const stat = fs.statSync(destPath);
        if (stat.size > 1024 * 1024) {
          onProgress({ type: 'log', message: `[下载] 已存在安装包，跳过下载 (${(stat.size / 1024 / 1024).toFixed(1)} MB)\n` });
          onProgress({ type: 'download', percent: 100 });
        } else {
          // 文件太小可能损坏，删除重新下载
          fs.unlinkSync(destPath);
        }
      }

      if (!fs.existsSync(destPath)) {
        await this._downloadFile(platMeta.downloadUrl, destPath, (prog) => {
          onProgress({
            type: 'download',
            percent: prog.percent,
            message: `下载中... ${prog.percent}% (${(prog.downloaded / 1024 / 1024).toFixed(1)} / ${(prog.total / 1024 / 1024).toFixed(1)} MB)`,
          });
        });
        onProgress({ type: 'log', message: `[下载] 下载完成: ${destPath}\n` });
      }

      // 2. 静默安装
      onProgress({ type: 'status', message: `正在静默安装 ${meta.displayName}...` });
      onProgress({ type: 'log', message: `[安装] 开始静默安装 ${meta.displayName}\n` });

      const installResult = await this._runInstaller(destPath, platMeta.silentArgs, (line) => {
        onProgress({ type: 'log', message: line });
      });

      if (installResult.success) {
        onProgress({ type: 'status', message: `${meta.displayName} 安装成功！` });
        onProgress({ type: 'log', message: `\n[完成] ${meta.displayName} 安装成功！\n` });
        if (meta.postInstallNote) {
          onProgress({ type: 'log', message: `[提示] ${meta.postInstallNote}\n` });
        }

        // 清理安装包
        try { fs.unlinkSync(destPath); } catch (_) {}

        return { success: true, needRestart: true };
      } else {
        return {
          success: false,
          error: `${meta.displayName} 安装失败: ${installResult.error || '未知错误'}`,
        };
      }
    } catch (err) {
      onProgress({ type: 'log', message: `\n[错误] ${err.message}\n` });
      return { success: false, error: err.message };
    }
  }

  /**
   * 一键安装所有缺失的依赖
   * @param {object} checks - checkAll() 返回的 checks 对象
   * @param {(event: {type: string, depName?: string, message?: string, percent?: number}) => void} onProgress
   * @returns {Promise<{success: boolean, results: object, needRecheck: boolean}>}
   */
  async installAllMissing(checks, onProgress = () => {}) {
    const missing = [];
    if (!checks.python.valid) missing.push('python');
    if (!checks.uv.valid)     missing.push('uv');
    if (!checks.git.valid)    missing.push('git');

    if (missing.length === 0) {
      return { success: true, results: {}, needRecheck: false };
    }

    const results = {};
    let allSuccess = true;

    for (const depName of missing) {
      onProgress({
        type: 'installing',
        depName,
        message: `正在安装 ${DOWNLOAD_META[depName].displayName}...`,
      });

      const result = await this.installDep(depName, (evt) => {
        onProgress({ ...evt, depName });
      });

      results[depName] = result;
      if (!result.success) {
        allSuccess = false;
      }
    }

    return {
      success: allSuccess,
      results,
      needRecheck: true,
    };
  }

  /**
   * 获取依赖元数据
   */
  getDepMeta(depName) {
    const meta = DOWNLOAD_META[depName];
    if (!meta) return null;
    return {
      depName,
      displayName: meta.displayName,
      canAutoInstall: true,
      downloadUrl: meta.downloadUrl || meta.url,
    };
  }
}

// ─── 单例 ─────────────────────────────────────────────────────────────────

let _instance = null;

/**
 * 获取 OobeService 单例
 * @param {import('electron').App} [electronApp]
 * @param {import('electron').Dialog} [electronDialog]
 */
function getOobeService(electronApp, electronDialog = null) {
  if (!_instance) {
    if (!electronApp) throw new Error('首次调用 getOobeService() 必须传入 electronApp');
    _instance = new OobeService(electronApp, electronDialog);
  }
  return _instance;
}

module.exports = { OobeService, getOobeService };
