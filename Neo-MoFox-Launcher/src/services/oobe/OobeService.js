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

// ─── 下载链接 & 静默安装参数 ──────────────────────────────────────────────

const DOWNLOAD_META = {
  python: {
    displayName: 'Python 3.11',
    // Python 官方 Windows 安装包
    downloadUrl: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe',
    fileName: 'python-3.11.9-amd64.exe',
    // 静默安装参数：/quiet = 无 UI, InstallAllUsers=0 当前用户, PrependPath=1 加入PATH
    silentArgs: ['/quiet', 'InstallAllUsers=0', 'PrependPath=1', 'Include_test=0', 'Include_launcher=1'],
    requirement: '>= 3.11',
    postInstallNote: 'Python 安装完成后可能需要重启终端或应用才能识别。',
  },
  uv: {
    displayName: 'uv (Python 包管理器)',
    // uv Windows 安装脚本 (PowerShell one-liner from astral-sh)
    useScript: true,
    scriptType: 'powershell',
    scriptCmd: 'powershell',
    scriptArgs: [
      '-ExecutionPolicy', 'Bypass', '-NoProfile', '-NonInteractive',
      '-Command', 'irm https://astral.sh/uv/install.ps1 | iex',
    ],
    requirement: '已安装',
    postInstallNote: 'uv 已通过官方脚本安装。',
  },
  git: {
    displayName: 'Git',
    // Git for Windows 便携 / 安装包
    downloadUrl: 'https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe',
    fileName: 'Git-2.47.1.2-64-bit.exe',
    // Inno Setup 静默参数
    silentArgs: ['/VERYSILENT', '/NORESTART', '/SP-', '/SUPPRESSMSGBOXES'],
    requirement: '已安装',
    postInstallNote: 'Git 安装完成后可能需要重启终端或应用才能识别。',
  },
};

// ─── OobeService 类 ───────────────────────────────────────────────────

class OobeService {
  /**
   * @param {import('electron').App} electronApp
   */
  constructor(electronApp) {
    this._app = electronApp;
    /** @type {Map<string, AbortController>} 正在进行的下载任务 */
    this._downloads = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 环境检测
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 运行命令，返回 { installed, version, output, error }
   */
  checkCommandVersion(command, args = ['--version']) {
    return new Promise((resolve) => {
      const proc = spawn(command, args, { shell: true, timeout: 15000 });
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
    const result = await this.checkCommandVersion('python', ['--version']);
    if (result.installed && result.version) {
      const [major, minor] = result.version.split('.').map(Number);
      result.valid = major >= 3 && minor >= 11;
    } else {
      result.valid = false;
    }
    result.requirement    = DOWNLOAD_META.python.requirement;
    result.canAutoInstall = true;
    result.downloadUrl    = DOWNLOAD_META.python.downloadUrl;
    return result;
  }

  async checkUv() {
    const result = await this.checkCommandVersion('uv', ['--version']);
    result.valid          = result.installed;
    result.requirement    = DOWNLOAD_META.uv.requirement;
    result.canAutoInstall = true;
    result.downloadUrl    = 'https://astral.sh/uv';
    return result;
  }

  async checkGit() {
    const result = await this.checkCommandVersion('git', ['--version']);
    result.valid          = result.installed;
    result.requirement    = DOWNLOAD_META.git.requirement;
    result.canAutoInstall = true;
    result.downloadUrl    = DOWNLOAD_META.git.downloadUrl;
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
    const result = { passed, checks: { python, uv, git } };

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
        env: { ...process.env },
        windowsHide: true,
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

    try {
      // ─ 脚本安装方式 (如 uv) ─
      if (meta.useScript) {
        onProgress({ type: 'status', message: `正在安装 ${meta.displayName}...` });
        onProgress({ type: 'log', message: `[信息] 使用官方安装脚本安装 ${meta.displayName}\n` });

        const result = await this._runScript(meta.scriptCmd, meta.scriptArgs, (line) => {
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

      // ─ 下载安装包方式 (Python / Git) ─
      const tempDir = this._getTempDir();
      const destPath = path.join(tempDir, meta.fileName);

      // 1. 下载
      onProgress({ type: 'status', message: `正在下载 ${meta.displayName}...` });
      onProgress({ type: 'log', message: `[下载] 开始下载 ${meta.displayName}\n` });
      onProgress({ type: 'log', message: `[下载] URL: ${meta.downloadUrl}\n` });

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
        await this._downloadFile(meta.downloadUrl, destPath, (prog) => {
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

      const installResult = await this._runInstaller(destPath, meta.silentArgs, (line) => {
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
 */
function getOobeService(electronApp) {
  if (!_instance) {
    if (!electronApp) throw new Error('首次调用 getOobeService() 必须传入 electronApp');
    _instance = new OobeService(electronApp);
  }
  return _instance;
}

module.exports = { OobeService, getOobeService };
