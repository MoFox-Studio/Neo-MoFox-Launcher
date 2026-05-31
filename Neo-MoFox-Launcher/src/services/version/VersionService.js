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
const { platformHelper } = require('../utils/PlatformHelper');
const { mirrorService } = require('../utils/MirrorService');
const { platformRegistry } = require('../platforms/PlatformRegistry');

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
   * 执行命令（Promise 封装）
   *
   * 注意：因为需要在 Windows 下先执行 `chcp 65001 >nul && ...` 来切换 UTF-8 代码页，
   * 这里通过 shell 字符串方式调用，所以必须自行对参数做 shell 引用，
   * 否则像 `--format=%H|||%s|||%ci` 中的 `|` 会被 shell 解析为管道符。
   */
  _execCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const isWindows = platformHelper.isWindows;

      // Windows cmd.exe：用双引号包裹，并把参数中的 `"` 转义为 `""`。
      // POSIX shell：用单引号包裹，并把参数中的 `'` 转义为 `'\''`。
      const quoteArg = (a) => {
        const s = String(a);
        if (isWindows) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return `'${s.replace(/'/g, `'\\''`)}'`;
      };

      const quotedArgs = args.map(quoteArg).join(' ');
      const fullCommand = isWindows
        ? `chcp 65001 >nul && ${command} ${quotedArgs}`
        : `${command} ${quotedArgs}`;

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
    const apiUrls = await mirrorService.getMofoxBranchesUrls();
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

      // 比较本地分支和其远程跟踪分支，只把远程领先数量视为可更新。
      const { stdout } = await this._execCommand(
        'git', ['rev-list', '--left-right', '--count', `HEAD...origin/${currentBranch}`],
        { cwd: neoMofoxDir }
      );

      const [aheadText = '0', behindText = '0'] = stdout.trim().split(/\s+/);
      const aheadCount = parseInt(aheadText, 10) || 0;
      const behindCount = parseInt(behindText, 10) || 0;
      return {
        hasUpdate: behindCount > 0,
        behindCount,
        aheadCount,
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

  // ─── 平台版本管理 ────────────────────────────────────────────────────────

  /**
   * 获取指定平台的所有 Release 列表。
   * @param {string} platformId 平台 ID
   * @param {number} limit 返回数量
   * @returns {Promise<Array<Object>>} Release 列表
   */
  async getPlatformReleases(platformId, limit = 10) {
    if (!platformId) {
      throw new Error('获取平台版本列表失败: 缺少平台 ID');
    }
    return await platformRegistry.getPlatformReleases(platformId, limit);
  }

  /**
   * 获取实例当前安装的平台版本。
   * @param {string} instanceId 实例 ID
   * @returns {string|null} 平台版本
   */
  getCurrentPlatformVersion(instanceId) {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    return instance.platformVersion || null;
  }

  /**
   * 更新实例平台到指定版本。
   * @param {string} instanceId 实例 ID
   * @param {string} targetVersion 目标版本
   * @returns {Promise<Object>} 更新结果
   */
  async updatePlatform(instanceId, targetVersion = 'latest') {
    const instance = storageService.getInstance(instanceId);
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    if (!instance.platform) {
      throw new Error('实例未配置平台 ID');
    }

    const platform = platformRegistry.getPlatform(instance.platform);

    try {
      const result = await platformRegistry.updatePlatform(
        instance,
        targetVersion,
        this._emitProgress.bind(this)
      );

      storageService.updateInstance(instanceId, {
        platformVersion: result.version || null,
      });

      return result;
    } catch (error) {
      this._emitProgress('update-platform', 0, '', error.message);
      throw new Error(`${platform.displayName || platform.name} 更新失败: ${error.message}`);
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

    const platform = instance.platform
      ? platformRegistry.getPlatformOrNull(instance.platform)
      : null;
    const [currentBranch, currentCommit, platformVersion] = await Promise.all([
      this.getCurrentBranch(instanceId).catch(() => null),
      this.getCurrentCommit(instanceId).catch(() => null),
      Promise.resolve(this.getCurrentPlatformVersion(instanceId)),
    ]);

    return {
      instanceId,
      mofox: {
        branch: currentBranch,
        commit: currentCommit,
        version: instance.neomofoxVersion || null,
      },
      platform: {
        id: instance.platform || null,
        name: platform?.name || instance.platform || null,
        displayName: platform?.displayName || platform?.name || instance.platform || '平台',
        description: platform?.description || null,
        dir: instance.platformDir,
        version: platformVersion,
      },
    };
  }
}

// ─── 导出单例 ────────────────────────────────────────────────────────────

const versionService = new VersionService();

module.exports = { versionService, VersionService };
