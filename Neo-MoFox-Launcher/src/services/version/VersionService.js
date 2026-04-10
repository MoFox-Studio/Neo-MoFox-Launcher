/**
 * VersionService - 版本管理服务
 * 管理实例的 Neo-MoFox 分支切换、更新，以及 NapCat 版本管理
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { storageService } = require('../install/StorageService');
const { platformHelper } = require('../PlatformHelper');

// ─── 常量定义 ───────────────────────────────────────────────────────────

const GITHUB_API_URLS = {
  napcat: [
    'https://api.github.com/repos/NapNeko/NapCatQQ/releases',
    'https://github.ikun114.top/https://api.github.com/repos/NapNeko/NapCatQQ/releases',
    'https://ghproxy.com/https://api.github.com/repos/NapNeko/NapCatQQ/releases',
  ],
  mofox: [
    'https://api.github.com/repos/MoFox-Studio/Neo-MoFox/branches',
    'https://github.ikun114.top/https://api.github.com/repos/MoFox-Studio/Neo-MoFox/branches',
    'https://ghproxy.com/https://api.github.com/repos/MoFox-Studio/Neo-MoFox/branches',
  ],
};

// ─── VersionService 类 ──────────────────────────────────────────────────

class VersionService {
  constructor() {
    this._progressCallback = null;
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback) {
    this._progressCallback = callback;
  }

  /**
   * 发送进度事件
   */
  _emitProgress(step, percent, message = '', error = null) {
    const progress = { step, percent, message, error };
    console.log(`[VersionService] ${step}: ${percent}% - ${message}`);
    if (this._progressCallback) {
      this._progressCallback(progress);
    }
    return progress;
  }

  // ─── HTTP 工具方法 ──────────────────────────────────────────────────────

  /**
   * HTTPS GET 请求（支持重定向）
   */
  _httpsGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const doGet = (reqUrl, redirectCount = 0) => {
        if (redirectCount > 5) return reject(new Error('重定向次数过多'));
        const client = reqUrl.startsWith('https') ? https : http;
        const opts = new URL(reqUrl);
        client.get(
          { hostname: opts.hostname, path: opts.pathname + opts.search, headers },
          (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              return doGet(res.headers.location, redirectCount + 1);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode}: ${reqUrl}`));
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
          }
        ).on('error', reject);
      };
      doGet(url);
    });
  }

  /**
   * 下载文件到本地路径，支持重定向和进度回调
   */
  _downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const doDownload = (reqUrl, redirectCount = 0) => {
        if (redirectCount > 5) return reject(new Error('重定向次数过多'));
        const client = reqUrl.startsWith('https') ? https : http;
        client.get(reqUrl, { headers: { 'User-Agent': 'Neo-MoFox-Launcher' } }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return doDownload(res.headers.location, redirectCount + 1);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`下载失败 HTTP ${res.statusCode}`));
          }
          const total = parseInt(res.headers['content-length'] || '0', 10);
          let downloaded = 0;
          const file = fs.createWriteStream(destPath);
          res.on('data', (chunk) => {
            downloaded += chunk.length;
            if (onProgress) onProgress(downloaded, total);
          });
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
          file.on('error', (err) => { try { fs.unlinkSync(destPath); } catch (_) {} reject(err); });
        }).on('error', reject);
      };
      doDownload(url);
    });
  }

  /**
   * 执行命令（Promise 封装）
   */
  _execCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      // Windows 下先设置 UTF-8 代码页
      const isWindows = platformHelper.isWindows;
      const fullCommand = isWindows 
        ? `chcp 65001 >nul && ${command} ${args.map(a => `"${a}"`).join(' ')}`
        : `${command} ${args.join(' ')}`;
      
      const proc = spawn(fullCommand, [], {
        shell: platformHelper.config.shell,
        cwd: options.cwd || process.cwd(),
        env: platformHelper.buildSpawnEnv(options.env || {}),
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        if (options.onStdout) options.onStdout(str);
      });

      proc.stderr.on('data', (data) => {
        const str = data.toString();
        stderr += str;
        if (options.onStderr) options.onStderr(str);
      });

      proc.on('close', (code) => {
        if (code === 0) {
            console.log(`[VersionService] 命令执行成功: ${command} ${args.join(' ')}\n输出: ${stdout}`);
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`命令退出码: ${code}\n${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  // ─── Neo-MoFox Git 操作 ──────────────────────────────────────────────────

  /**
   * 获取实例的 Neo-MoFox 目录
   */
  _getNeoMofoxDir(instanceId) {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }
    return instance.neomofoxDir;
  }

  /**
   * 获取 Git 仓库的当前分支
   */
  async getCurrentBranch(instanceId) {
    const neoMofoxDir = this._getNeoMofoxDir(instanceId);
    
    try {
      const { stdout } = await this._execCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: neoMofoxDir,
      });
      return stdout.trim();
    } catch (e) {
      console.error('[VersionService] 获取当前分支失败:', e);
      return null;
    }
  }

  /**
   * 获取 Git 仓库的本地分支列表
   */
  async getLocalBranches(instanceId) {
    const neoMofoxDir = this._getNeoMofoxDir(instanceId);
    
    try {
      const { stdout } = await this._execCommand('git', ['branch'], {
        cwd: neoMofoxDir,
      });
      const branches = stdout.split('\n')
        .map(b => b.trim().replace(/^\*\s*/, ''))
        .filter(b => b.length > 0);
      return branches;
    } catch (e) {
      console.error('[VersionService] 获取本地分支失败:', e);
      return [];
    }
  }

  /**
   * 获取远程分支列表（从 GitHub API）
   */
  async getRemoteBranches() {
    const apiUrls = GITHUB_API_URLS.mofox;
    let lastError = null;

    for (const apiUrl of apiUrls) {
      try {
        const data = await this._httpsGet(apiUrl, {
          'User-Agent': 'Neo-MoFox-Launcher',
          'Accept': 'application/vnd.github.v3+json',
        });
        const branches = JSON.parse(data);
        return branches.map(b => ({
          name: b.name,
          commit: b.commit?.sha?.substring(0, 7) || '',
        }));
      } catch (e) {
        lastError = e;
        console.error(`[VersionService] 获取远程分支失败 (${apiUrl}):`, e.message);
      }
    }
    throw new Error(`获取远程分支列表失败: ${lastError?.message}`);
  }

  /**
   * 获取当前 commit 信息
   */
  async getCurrentCommit(instanceId) {
    const neoMofoxDir = this._getNeoMofoxDir(instanceId);
    
    try {
      const { stdout: hash } = await this._execCommand('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: neoMofoxDir,
      });
      
      const { stdout: message } = await this._execCommand('git', ['log', '-1', '--format=%s'], {
        cwd: neoMofoxDir,
      });
      
      const { stdout: date } = await this._execCommand('git', ['log', '-1', '--format=%ci'], {
        cwd: neoMofoxDir,
      });

      return {
        hash: hash.trim(),
        message: message.trim(),
        date: date.trim(),
      };
    } catch (e) {
      console.error('[VersionService] 获取 commit 信息失败:', e);
      return null;
    }
  }

  /**
   * 检查是否有可用更新
   */
  async checkMofoxUpdate(instanceId) {
    const neoMofoxDir = this._getNeoMofoxDir(instanceId);
    
    try {
      // 先 fetch 远程
      await this._execCommand('git', ['fetch', 'origin'], {
        cwd: neoMofoxDir,
      });

      // 获取当前分支名
      const { stdout: branchOutput } = await this._execCommand(
        'git', ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: neoMofoxDir }
      );
      const currentBranch = branchOutput.trim();

      // 比较本地分支和其远程跟踪分支
      const { stdout } = await this._execCommand(
        'git', ['rev-list', `HEAD...origin/${currentBranch}`, '--count'],
        { cwd: neoMofoxDir }
      );

      const behindCount = parseInt(stdout.trim(), 10) || 0;
      return {
        hasUpdate: behindCount > 0,
        behindCount,
      };
    } catch (e) {
      console.error('[VersionService] 检查更新失败:', e);
      return { hasUpdate: false, behindCount: 0, error: e.message };
    }
  }

  /**
   * 获取 MoFox 提交历史列表
   * @param {string} instanceId 实例ID
   * @param {number} limit 返回条数，默认20
   */
  async getMofoxCommitHistory(instanceId, limit = 20) {
    const neoMofoxDir = this._getNeoMofoxDir(instanceId);
    
    // 检查目录是否存在
    if (!fs.existsSync(neoMofoxDir)) {
      console.error('[VersionService] Neo-MoFox 目录不存在:', neoMofoxDir);
      return [];
    }
    
    try {
      // 获取当前 HEAD 的 commit hash
      const { stdout: currentHash } = await this._execCommand(
        'git', ['rev-parse', 'HEAD'],
        { cwd: neoMofoxDir }
      );
      const currentCommit = currentHash.trim().substring(0, 7);
      
      // 获取 commit 历史 - 分别获取 hash, subject, date
      const { stdout: logOutput } = await this._execCommand(
        'git', ['log', '--format=%H|||%s|||%ci', '-n', `${limit}`],
        { cwd: neoMofoxDir }
      );
      
      if (!logOutput.trim()) {
        return [];
      }
      
      const commits = logOutput.trim().split('\n').map(line => {
        const parts = line.split('|||');
        const hash = parts[0] || '';
        const message = parts[1] || '';
        const date = parts[2] || '';
        return {
          hash: hash.substring(0, 7),
          fullHash: hash,
          message: message.trim(),
          date,
          isCurrent: hash.substring(0, 7) === currentCommit,
        };
      });
      
      return commits;
    } catch (e) {
      console.error('[VersionService] 获取提交历史失败:', e);
      return [];
    }
  }

  /**
   * 回退到指定 commit
   * @param {string} instanceId 实例ID
   * @param {string} commitHash commit hash（可以是短 hash）
   */
  async checkoutCommit(instanceId, commitHash) {
    const neoMofoxDir = this._getNeoMofoxDir(instanceId);
    
    this._emitProgress('checkout-commit', 0, `回退到 ${commitHash}`);

    try {
      // 检查是否有未提交的更改
      const { stdout: statusOutput } = await this._execCommand('git', ['status', '--porcelain'], {
        cwd: neoMofoxDir,
      });

      if (statusOutput.trim()) {
        // 有未提交的更改，暂存它们
        this._emitProgress('checkout-commit', 20, '暂存本地更改...');
        await this._execCommand('git', ['stash'], { cwd: neoMofoxDir });
      }

      // checkout 到指定 commit
      this._emitProgress('checkout-commit', 50, `切换到 ${commitHash}...`);
      await this._execCommand('git', ['checkout', commitHash], { cwd: neoMofoxDir });

      // 同步依赖
      this._emitProgress('checkout-commit', 70, '检查并同步依赖...');
      try {
        await this._execCommand('uv', ['sync'], { cwd: neoMofoxDir });
      } catch (e) {
        console.warn('[VersionService] 依赖同步跳过:', e.message);
      }

      this._emitProgress('checkout-commit', 100, '回退完成');
      return { success: true };
    } catch (e) {
      console.error('[VersionService] 回退失败:', e);
      this._emitProgress('checkout-commit', 0, '回退失败', e.message);
      throw e;
    }
  }

  /**
   * 切换分支
   */
  async switchBranch(instanceId, branchName) {
    const neoMofoxDir = this._getNeoMofoxDir(instanceId);
    
    this._emitProgress('switch-branch', 0, `切换到分支: ${branchName}`);

    try {
      // 先 fetch 远程分支
      this._emitProgress('switch-branch', 20, '正在获取远程分支...');
      await this._execCommand('git', ['fetch', 'origin', branchName], {
        cwd: neoMofoxDir,
      });

      // 检查是否有未提交的更改
      const { stdout: statusOutput } = await this._execCommand('git', ['status', '--porcelain'], {
        cwd: neoMofoxDir,
      });

      if (statusOutput.trim()) {
        // 有未提交的更改，暂存它们
        this._emitProgress('switch-branch', 30, '暂存本地更改...');
        await this._execCommand('git', ['stash'], { cwd: neoMofoxDir });
      }

      // 切换分支
      this._emitProgress('switch-branch', 50, '切换分支中...');
      await this._execCommand('git', ['checkout', branchName], {
        cwd: neoMofoxDir,
      });

      // 拉取最新代码
      this._emitProgress('switch-branch', 70, '拉取最新代码...');
      await this._execCommand('git', ['pull', 'origin', branchName], {
        cwd: neoMofoxDir,
      });

      // 更新实例的 channel 字段
      storageService.updateInstance(instanceId, { channel: branchName });

      this._emitProgress('switch-branch', 100, '分支切换完成');
      return { success: true, branch: branchName };
    } catch (e) {
      this._emitProgress('switch-branch', 0, '', e.message);
      throw new Error(`切换分支失败: ${e.message}`);
    }
  }

  /**
   * 更新 Neo-MoFox（git pull）
   */
  async updateMofox(instanceId) {
    const neoMofoxDir = this._getNeoMofoxDir(instanceId);
    
    this._emitProgress('update-mofox', 0, '开始更新 Neo-MoFox...');

    try {
      // 获取当前分支
      const currentBranch = await this.getCurrentBranch(instanceId);
      
      // 检查是否有未提交的更改
      const { stdout: statusOutput } = await this._execCommand('git', ['status', '--porcelain'], {
        cwd: neoMofoxDir,
      });

      if (statusOutput.trim()) {
        this._emitProgress('update-mofox', 10, '暂存本地更改...');
        await this._execCommand('git', ['stash'], { cwd: neoMofoxDir });
      }

      // 拉取更新
      this._emitProgress('update-mofox', 30, '正在拉取最新代码...');
      await this._execCommand('git', ['pull', 'origin', currentBranch], {
        cwd: neoMofoxDir,
      });

      // 更新依赖（如果有变化）
      this._emitProgress('update-mofox', 70, '正在同步依赖包...');
      try {
        await this._execCommand('uv', ['sync'], {
          cwd: neoMofoxDir,
        });
      } catch (e) {
        console.warn('[VersionService] 依赖同步跳过:', e.message);
      }

      // 获取新的 commit 信息
      const newCommit = await this.getCurrentCommit(instanceId);

      this._emitProgress('update-mofox', 100, '更新完成');
      return { success: true, commit: newCommit };
    } catch (e) {
      this._emitProgress('update-mofox', 0, '', e.message);
      throw new Error(`更新失败: ${e.message}`);
    }
  }

  // ─── NapCat 版本管理 ────────────────────────────────────────────────────

  /**
   * 获取 NapCat 所有 Release 列表
   */
  async getNapCatReleases(limit = 10) {
    const apiUrls = GITHUB_API_URLS.napcat;
    let lastError = null;

    for (const apiUrl of apiUrls) {
      try {
        const data = await this._httpsGet(`${apiUrl}?per_page=${limit}`, {
          'User-Agent': 'Neo-MoFox-Launcher',
          'Accept': 'application/vnd.github.v3+json',
        });
        const releases = JSON.parse(data);
        return releases.map(r => ({
          version: r.tag_name,
          name: r.name,
          publishedAt: r.published_at,
          prerelease: r.prerelease,
          assets: r.assets.map(a => ({
            name: a.name,
            size: a.size,
            downloadUrl: a.browser_download_url,
          })),
        }));
      } catch (e) {
        lastError = e;
        console.error(`[VersionService] 获取 NapCat Releases 失败 (${apiUrl}):`, e.message);
      }
    }
    throw new Error(`获取 NapCat 版本列表失败: ${lastError?.message}`);
  }

  /**
   * 获取实例当前安装的 NapCat 版本
   */
  getCurrentNapCatVersion(instanceId) {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }
    
    // 从实例记录获取版本
    if (instance.napcatVersion) {
      return instance.napcatVersion;
    }

    // 尝试从目录名解析版本
    const napcatDir = instance.napcatDir;
    if (napcatDir && fs.existsSync(napcatDir)) {
      const entries = fs.readdirSync(napcatDir);
      const shellDir = entries.find(e => /^NapCat\..+\.Shell$/i.test(e));
      if (shellDir) {
        const match = shellDir.match(/NapCat\.(.+)\.Shell/i);
        if (match) {
          return match[1];
        }
      }
    }

    return null;
  }

  /**
   * 更新 NapCat 到指定版本
   */
  async updateNapCat(instanceId, targetVersion = 'latest') {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    const napcatDir = instance.napcatDir;
    if (!napcatDir) {
      throw new Error('实例未配置 NapCat 目录');
    }

    this._emitProgress('update-napcat', 0, '获取 NapCat 版本信息...');

    try {
      // 获取版本列表
      const releases = await this.getNapCatReleases();
      let targetRelease;

      if (targetVersion === 'latest') {
        targetRelease = releases.find(r => !r.prerelease) || releases[0];
      } else {
        targetRelease = releases.find(r => r.version === targetVersion);
      }

      if (!targetRelease) {
        throw new Error(`找不到版本: ${targetVersion}`);
      }

      // 查找 Windows Shell 版本的下载链接
      const asset = targetRelease.assets.find(a => 
        a.name.includes('Shell') && a.name.endsWith('.zip')
      );

      if (!asset) {
        throw new Error('找不到适合 Windows 的 NapCat Shell 版本');
      }

      this._emitProgress('update-napcat', 10, `准备下载 ${targetRelease.version}...`);

      // 下载到临时目录
      const tempDir = path.join(require('os').tmpdir(), 'napcat-update');
      fs.mkdirSync(tempDir, { recursive: true });
      const zipPath = path.join(tempDir, asset.name);

      this._emitProgress('update-napcat', 20, '下载中...');
      await this._downloadFile(asset.downloadUrl, zipPath, (downloaded, total) => {
        const percent = Math.floor(20 + (downloaded / total) * 40);
        this._emitProgress('update-napcat', percent, `下载中: ${Math.floor(downloaded / 1024 / 1024)}MB / ${Math.floor(total / 1024 / 1024)}MB`);
      });

      // 备份旧的 NapCat 配置
      this._emitProgress('update-napcat', 60, '备份配置...');
      const oldShellPath = this._getNapCatShellPath(napcatDir);
      let configBackup = null;
      if (oldShellPath) {
        const configPath = path.join(oldShellPath, 'config', 'napcat.json');
        if (fs.existsSync(configPath)) {
          configBackup = fs.readFileSync(configPath, 'utf8');
        }
      }

      // 直接解压覆盖（不删除旧版本）
      this._emitProgress('update-napcat', 70, '安装新版本...');
      fs.mkdirSync(napcatDir, { recursive: true });
      await this._extractZip(zipPath, napcatDir);

      // 恢复配置
      const newShellPath = this._getNapCatShellPath(napcatDir);
      if (configBackup && newShellPath) {
        this._emitProgress('update-napcat', 90, '恢复配置...');
        const newConfigDir = path.join(newShellPath, 'config');
        fs.mkdirSync(newConfigDir, { recursive: true });
        fs.writeFileSync(path.join(newConfigDir, 'napcat.json'), configBackup);
      }

      // 清理临时文件
      try {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (error) {
        console.warn(`[VersionService] 清理临时文件失败: ${error.message}`);
      }

      // 更新实例记录
      storageService.updateInstance(instanceId, { 
        napcatVersion: targetRelease.version 
      });

      this._emitProgress('update-napcat', 100, `更新到 ${targetRelease.version} 完成`);
      return { success: true, version: targetRelease.version };
    } catch (e) {
      this._emitProgress('update-napcat', 0, '', e.message);
      throw new Error(`NapCat 更新失败: ${e.message}`);
    }
  }

  /**
   * 解压 ZIP 文件
   */
  async _extractZip(zipPath, destDir) {
    // 使用 PlatformHelper 获取跨平台解压命令
    const unzipInfo = platformHelper.getUnzipCommand(zipPath, destDir);
    await this._execCommand(unzipInfo.cmd, unzipInfo.args);
  }

  /**
   * 从 napcatDir 内查找 NapCat Shell 子目录
   */
  _getNapCatShellPath(napcatDir) {
    try {
      if (!fs.existsSync(napcatDir)) return null;
      const entries = fs.readdirSync(napcatDir);
      const shellDir = entries.find(e => /^NapCat\..+\.Shell$/i.test(e));
      return shellDir ? path.join(napcatDir, shellDir) : null;
    } catch (_) {
      return null;
    }
  }

  // ─── 综合版本信息 ────────────────────────────────────────────────────────

  /**
   * 获取实例的完整版本信息
   */
  async getInstanceVersionInfo(instanceId) {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    const [currentBranch, currentCommit, napcatVersion] = await Promise.all([
      this.getCurrentBranch(instanceId).catch(() => null),
      this.getCurrentCommit(instanceId).catch(() => null),
      Promise.resolve(this.getCurrentNapCatVersion(instanceId)),
    ]);

    return {
      instanceId,
      mofox: {
        branch: currentBranch,
        commit: currentCommit,
        version: instance.neomofoxVersion || null,
      },
      napcat: {
        version: napcatVersion,
        dir: instance.napcatDir,
      },
    };
  }
}

// ─── 导出单例 ────────────────────────────────────────────────────────────

const versionService = new VersionService();

module.exports = { versionService, VersionService };
