/**
 * InstallStepExecutor - 安装步骤执行器
 * 提供独立的步骤执行逻辑，支持灵活的步骤组合和条件执行
 * 供 InstallWizardService 和 IntegrationPackImportService 复用
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { storageService } = require('./StorageService');
const { platformHelper } = require('../PlatformHelper');

// ─── 常量定义 ───────────────────────────────────────────────────────────

const REPO_URLS = {
  main: [
    'https://github.com/MoFox-Studio/Neo-MoFox.git',
    'https://github.ikun114.top/https://github.com/MoFox-Studio/Neo-MoFox.git',
  ],
  dev: [
    'https://github.com/MoFox-Studio/Neo-MoFox.git',
    'https://github.ikun114.top/https://github.com/MoFox-Studio/Neo-MoFox.git',
  ],
};

const WEBUI_REPOS = [
  'https://github.com/MoFox-Studio/MoFox-Core-Webui.git',
  'https://github.ikun114.top/https://github.com/MoFox-Studio/MoFox-Core-Webui.git',
];

const MAX_RETRY = 3;
const CONFIG_DETECT_TIMEOUT = 60000; // 60 秒

// ─── InstallStepExecutor 类 ──────────────────────────────────────────────

/**
 * 步骤执行器类
 * 所有步骤方法接收标准化参数：
 * - context: 执行上下文（包含路径、配置、回调等）
 * - inputs: 用户输入参数
 * - options: 步骤特定选项
 */
class InstallStepExecutor {
  constructor() {
    // 系统环境检测
    this._sysEnv = platformHelper.detectSystemEnv();
    console.log(`[StepExecutor] 当前系统: ${this._sysEnv.platformLabel}${this._sysEnv.distro ? ' (' + this._sysEnv.distroName + ')' : ''}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // 工具方法
  // ───────────────────────────────────────────────────────────────────────

  /**
   * 执行命令并返回 Promise
   * @param {string} command - 命令名
   * @param {string[]} args - 参数列表
   * @param {Object} options - 执行选项
   * @param {string} [options.cwd] - 工作目录
   * @param {Function} [options.onStdout] - stdout 回调
   * @param {Function} [options.onStderr] - stderr 回调
   */
  _execCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        shell: platformHelper.config.shell,
        env: platformHelper.buildSpawnEnv(),
        ...options,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        const text = d.toString();
        stdout += text;
        if (options.onStdout) options.onStdout(text);
      });

      proc.stderr.on('data', (d) => {
        const text = d.toString();
        stderr += text;
        if (options.onStderr) options.onStderr(text);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`命令退出码: ${code}\n${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

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
   * 获取 Git 仓库的当前 commit ID
   */
  async _getGitCommitId(repoDir) {
    try {
      const { stdout } = await this._execCommand('git', ['rev-parse', 'HEAD'], {
        cwd: repoDir,
      });
      return stdout.trim();
    } catch (e) {
      console.error('[StepExecutor] 获取 commit ID 失败:', e);
      return null;
    }
  }

  /**
   * 从 napcatDir 内查找 NapCat Shell 子目录
   */
  _getNapCatShellPath(napcatDir) {
    try {
      if (!fs.existsSync(napcatDir)) return null;
      const entries = fs.readdirSync(napcatDir);
      const shellDir = entries.find((e) => /^NapCat\..+\.Shell$/i.test(e));
      return shellDir ? path.join(napcatDir, shellDir) : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * 获取 NapCat 最新 Release 信息
   */
  async _fetchLatestNapCatRelease(context) {
    const apiUrls = [
      'https://api.github.com/repos/NapNeko/NapCatQQ/releases/latest',
      'https://github.ikun114.top/https://api.github.com/repos/NapNeko/NapCatQQ/releases/latest',
    ];

    let lastError = null;
    for (const apiUrl of apiUrls) {
      try {
        if (context.emitOutput) {
          context.emitOutput(`[napcat] 正在尝试访问: ${apiUrl}`);
        }
        const data = await this._httpsGet(apiUrl, {
          'User-Agent': 'Neo-MoFox-Launcher',
          'Accept': 'application/vnd.github.v3+json',
        });
        const release = JSON.parse(data);
        if (!release.assets) throw new Error('Release 数据无效');
        if (context.emitOutput) {
          context.emitOutput(`[napcat] 成功获取 Release 信息`);
        }
        return release;
      } catch (e) {
        lastError = e;
        if (context.emitOutput) {
          context.emitOutput(`[napcat] 访问失败: ${e.message}`);
        }
      }
    }
    throw new Error(`获取 NapCat Release 信息失败: ${lastError?.message}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // 步骤执行方法 - 统一签名：(context, inputs, options)
  // ───────────────────────────────────────────────────────────────────────

  /**
   * 步骤1：克隆 Neo-MoFox 仓库
   * @param {Object} context - 执行上下文
   * @param {Function} context.emitProgress - 进度回调
   * @param {Function} context.emitOutput - 输出回调
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.installDir - 安装根目录
   * @param {string} inputs.qqNumber - QQ 号
   * @param {string} inputs.channel - 渠道（main/dev）
   */
  async executeClone(context, inputs, options = {}) {
    const instanceId = `bot-${inputs.qqNumber}`;
    const targetDir = path.join(inputs.installDir, instanceId, 'neo-mofox');
    const urls = REPO_URLS[inputs.channel] || REPO_URLS.main;
    const branch = inputs.channel === 'dev' ? 'dev' : 'main';

    for (let retry = 0; retry < MAX_RETRY; retry++) {
      const url = urls[retry % urls.length];
      context.emitProgress('clone', Math.floor((retry / MAX_RETRY) * 100), `尝试克隆 (${retry + 1}/${MAX_RETRY}): ${url}`);
      context.emitOutput(`[clone] 正在尝试克隆仓库: ${url}`);
      context.emitOutput(`[clone] 分支: ${branch}`);
      context.emitOutput(`[clone] 目标目录: ${targetDir}`);

      try {
        const args = ['clone', url, targetDir];
        if (inputs.channel === 'dev') {
          args.push('--branch', branch);
        }

        await this._execCommand('git', args, {
          onStdout: (data) => context.emitOutput(data),
          onStderr: (data) => context.emitOutput(data),
        });

        context.emitOutput(`[clone] 克隆成功`);
        context.emitProgress('clone', 100, '仓库克隆完成');
        return { success: true, path: targetDir };
      } catch (e) {
        context.emitOutput(`[clone] 克隆失败: ${e.message}`);
        console.error(`[StepExecutor] 克隆失败 (${retry + 1}/${MAX_RETRY}):`, e.message);
        if (retry === MAX_RETRY - 1) {
          throw new Error(`克隆仓库失败: ${e.message}`);
        }
      }
    }
  }

  /**
   * 步骤2：创建 Python 虚拟环境
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.neoMofoxDir - Neo-MoFox 目录
   * @param {Object} options - 可选参数
   * @param {string} [options.pythonCmd='python'] - Python 命令
   */
  async executeVenv(context, inputs, options = {}) {
    context.emitProgress('venv', 0, '正在创建虚拟环境...');
    
    const pythonCmd = options.pythonCmd || 'python';
    await this._execCommand('uv', ['venv', '--python', pythonCmd], {
      cwd: inputs.neoMofoxDir,
    });

    context.emitProgress('venv', 100, '虚拟环境创建完成');
    return { success: true };
  }

  /**
   * 步骤3：安装 Python 依赖
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.neoMofoxDir - Neo-MoFox 目录
   */
  async executeDeps(context, inputs, options = {}) {
    context.emitProgress('deps', 0, '正在安装依赖...');

    await this._execCommand('uv', ['sync'], {
      cwd: inputs.neoMofoxDir,
      onStdout: (data) => context.emitOutput(data),
      onStderr: (data) => context.emitOutput(data),
    });

    context.emitProgress('deps', 50, '正在安装 Pillow...');
    
    await this._execCommand('uv', ['pip', 'install', 'pillow'], {
      cwd: inputs.neoMofoxDir,
      onStdout: (data) => context.emitOutput(data),
      onStderr: (data) => context.emitOutput(data),
    });

    context.emitProgress('deps', 100, '依赖安装完成');
    return { success: true };
  }

  /**
   * 步骤4：首次启动生成配置文件
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.neoMofoxDir - Neo-MoFox 目录
   */
  async executeGenConfig(context, inputs, options = {}) {
    context.emitProgress('gen-config', 0, '正在生成配置文件...');

    return new Promise((resolve, reject) => {
      const configDir = path.join(inputs.neoMofoxDir, 'config');
      const coreToml = path.join(configDir, 'core.toml');
      const modelToml = path.join(configDir, 'model.toml');

      context.emitOutput(`[gen-config] 工作目录: ${inputs.neoMofoxDir}`);
      context.emitOutput(`[gen-config] 配置目录: ${configDir}`);
      context.emitOutput(`[gen-config] 启动命令: uv run python main.py`);

      const proc = spawn('uv', ['run', 'python', 'main.py'], {
        cwd: inputs.neoMofoxDir,
        shell: true,
        detached: false,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      context.emitOutput(`[gen-config] 进程 PID: ${proc.pid}`);

      let killed = false;
      let stdoutData = '';
      let stderrData = '';

      // 捕获进程输出
      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          const output = data.toString();
          stdoutData += output;
          context.emitOutput(output);
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          const output = data.toString();
          stderrData += output;
          context.emitOutput(output);
        });
      }

      const checkInterval = setInterval(() => {
        if (fs.existsSync(coreToml) && fs.existsSync(modelToml)) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          if (!killed) {
            killed = true;
            platformHelper.killProcessTree(proc, 'SIGTERM');
            context.emitProgress('gen-config', 100, '配置文件生成完成');
            resolve({ success: true, configDir });
          }
        }
      }, 500);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        if (!killed) {
          killed = true;
          platformHelper.killProcessTree(proc, 'SIGKILL');
          reject(new Error('生成配置文件超时（60秒）'));
        }
      }, CONFIG_DETECT_TIMEOUT);

      proc.on('error', (err) => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        let errorMsg = `启动进程失败: ${err.message}`;
        if (stderrData) {
          errorMsg += `\n错误输出: ${stderrData}`;
        }
        reject(new Error(errorMsg));
      });

      proc.on('close', (code) => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        
        context.emitOutput(`[gen-config] 进程退出，退出码: ${code}`);
        context.emitOutput(`[gen-config] 检查配置文件...`);
        
        if (fs.existsSync(coreToml) && fs.existsSync(modelToml)) {
          context.emitProgress('gen-config', 100, '配置文件生成完成');
          resolve({ success: true, configDir });
        } else if (!killed) {
          let errorMsg = `进程退出但配置文件未生成 (退出码: ${code})`;
          if (stderrData) {
            errorMsg += `\n错误输出: ${stderrData.substring(0, 500)}`;
          }
          context.emitOutput(`[ERROR] ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      });
    });
  }

  /**
   * 步骤5：写入 core.toml
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.neoMofoxDir - Neo-MoFox 目录
   * @param {string} inputs.ownerQQNumber - 管理员 QQ 号
   */
  async executeWriteCore(context, inputs, options = {}) {
    context.emitProgress('write-core', 0, '正在写入 core.toml...');

    const coreTomlPath = path.join(inputs.neoMofoxDir, 'config', 'core.toml');
    
    try {
      const data = storageService.readToml(coreTomlPath);
      
      if (!data.permissions) data.permissions = {};
      data.permissions.owner_list = [`qq:${inputs.ownerQQNumber}`];
      
      storageService.writeToml(coreTomlPath, data);
      
      context.emitProgress('write-core', 100, 'core.toml 写入完成');
      return { success: true };
    } catch (e) {
      throw new Error(`写入 core.toml 失败: ${e.message}`);
    }
  }

  /**
   * 步骤6：写入 model.toml
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.neoMofoxDir - Neo-MoFox 目录
   * @param {string} inputs.apiKey - API 密钥
   */
  async executeWriteModel(context, inputs, options = {}) {
    context.emitProgress('write-model', 0, '正在写入 model.toml...');

    const modelTomlPath = path.join(inputs.neoMofoxDir, 'config', 'model.toml');
    
    try {
      const data = storageService.readToml(modelTomlPath);
      
      if (data.api_providers && data.api_providers.length > 0) {
        const siliconFlowProvider = data.api_providers.find(p => p.name === 'SiliconFlow');
        if (siliconFlowProvider) {
          siliconFlowProvider.api_key = inputs.apiKey;
        } else {
          data.api_providers[0].api_key = inputs.apiKey;
        }
      } else {
        data.api_providers = [{ name: 'SiliconFlow', api_key: inputs.apiKey }];
      }
      
      storageService.writeToml(modelTomlPath, data);
      
      context.emitProgress('write-model', 100, 'model.toml 写入完成');
      return { success: true };
    } catch (e) {
      throw new Error(`写入 model.toml 失败: ${e.message}`);
    }
  }

  /**
   * 步骤7：写入 WebUI API 密钥
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.neoMofoxDir - Neo-MoFox 目录
   * @param {string} inputs.webuiApiKey - WebUI API 密钥
   */
  async executeWriteWebuiKey(context, inputs, options = {}) {
    context.emitProgress('write-webui-key', 0, '正在写入 WebUI API 密钥...');

    const coreTomlPath = path.join(inputs.neoMofoxDir, 'config', 'core.toml');

    try {
      const data = storageService.readToml(coreTomlPath);

      if (!data.http_router) {
        data.http_router = {};
      }

      data.http_router.api_keys = [inputs.webuiApiKey];

      storageService.writeToml(coreTomlPath, data);
      
      context.emitProgress('write-webui-key', 100, 'WebUI API 密钥写入完成');
      return { success: true };
    } catch (e) {
      throw new Error(`写入 WebUI API 密钥失败: ${e.message}`);
    }
  }

  /**
   * 步骤8：写入 napcat_adapter 配置
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.neoMofoxDir - Neo-MoFox 目录
   * @param {string} inputs.qqNumber - QQ 号
   * @param {string} inputs.qqNickname - QQ 昵称
   * @param {string} inputs.wsPort - WebSocket 端口
   */
  async executeWriteAdapter(context, inputs, options = {}) {
    context.emitProgress('write-adapter', 0, '正在写入适配器配置...');

    const adapterDir = path.join(inputs.neoMofoxDir, 'config', 'plugins', 'napcat_adapter');
    const adapterTomlPath = path.join(adapterDir, 'config.toml');

    try {
      fs.mkdirSync(adapterDir, { recursive: true });

      let data = {};
      if (fs.existsSync(adapterTomlPath)) {
        data = storageService.readToml(adapterTomlPath);
      }

      if (!data.plugin) data.plugin = {};
      data.plugin.enabled = true;
      if (!data.plugin.config_version) data.plugin.config_version = '2.0.0';

      if (!data.bot) data.bot = {};
      data.bot.qq_id = String(inputs.qqNumber);
      data.bot.qq_nickname = String(inputs.qqNickname || '');

      if (!data.napcat_server) data.napcat_server = {};
      if (!data.napcat_server.mode) data.napcat_server.mode = 'reverse';
      if (!data.napcat_server.host) data.napcat_server.host = 'localhost';
      data.napcat_server.port = parseInt(inputs.wsPort, 10) || 8095;

      storageService.writeToml(adapterTomlPath, data);

      context.emitOutput(`[write-adapter] 配置路径: ${adapterTomlPath}`);
      context.emitOutput(`[write-adapter] qq_id: ${inputs.qqNumber}`);
      context.emitOutput(`[write-adapter] qq_nickname: ${inputs.qqNickname}`);
      context.emitOutput(`[write-adapter] ws port: ${inputs.wsPort}`);

      context.emitProgress('write-adapter', 100, '适配器配置写入完成');
      return { success: true };
    } catch (e) {
      throw new Error(`写入适配器配置失败: ${e.message}`);
    }
  }

  /**
   * 步骤9：安装 NapCat
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.installDir - 安装根目录
   * @param {string} inputs.qqNumber - QQ 号
   */
  async executeNapcat(context, inputs, options = {}) {
    const instanceId = `bot-${inputs.qqNumber}`;
    const napcatDir = path.join(inputs.installDir, instanceId, 'napcat');
    fs.mkdirSync(napcatDir, { recursive: true });

    if (!platformHelper.supportsNapcatAutoInstall) {
      context.emitProgress('napcat', 100, `${platformHelper.label} 暂不支持 NapCat 自动安装，请手动安装`);
      return { success: true, path: napcatDir, shellPath: null };
    }

    return await this._installNapCatWindows(context, napcatDir);
  }

  /**
   * Windows 下安装 NapCat（内部方法）
   */
  async _installNapCatWindows(context, napcatDir) {
    context.emitProgress('napcat', 5, '正在获取 NapCat 最新版本信息...');
    const release = await this._fetchLatestNapCatRelease(context);

    const ASSET_NAME = platformHelper.napcatAssetName;
    const asset = release.assets.find((a) => a.name === ASSET_NAME);
    if (!asset) {
      throw new Error(`在 ${release.tag_name} 中未找到 ${ASSET_NAME}`);
    }

    context.emitOutput(`[napcat] 版本: ${release.tag_name}`);
    context.emitOutput(`[napcat] 资源: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`);

    const zipPath = path.join(napcatDir, ASSET_NAME);
    context.emitProgress('napcat', 10, `正在下载 NapCat ${release.tag_name}...`);

    await this._downloadFile(asset.browser_download_url, zipPath, (downloaded, total) => {
      const pct = total > 0 ? Math.floor(10 + (downloaded / total) * 55) : 10;
      const dlMB = (downloaded / 1024 / 1024).toFixed(1);
      const totalMB = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?';
      context.emitProgress('napcat', pct, `下载中... ${dlMB} MB / ${totalMB} MB`);
    });

    context.emitOutput(`[napcat] 下载完成: ${zipPath}`);

    context.emitProgress('napcat', 68, '正在解压...');
    const unzipInfo = platformHelper.getUnzipCommand(zipPath, napcatDir);
    await this._execCommand(
      unzipInfo.cmd,
      unzipInfo.args,
      { onStderr: (d) => context.emitOutput(d) }
    );
    context.emitOutput('[napcat] 解压完成');

    try { fs.unlinkSync(zipPath); } catch (_) {}

    const installerPath = path.join(napcatDir, 'NapCatInstaller.exe');
    if (fs.existsSync(installerPath)) {
      context.emitProgress('napcat', 75, '正在运行 NapCatInstaller.exe 自动化配置...');
      context.emitOutput('[napcat] 启动 NapCatInstaller.exe...');
      await this._execCommand(
        'cmd',
        ['/c', `echo.|"${installerPath}"`],
        {
          cwd: napcatDir,
          onStdout: (d) => context.emitOutput(d),
          onStderr: (d) => context.emitOutput(d),
        }
      );
      context.emitOutput('[napcat] NapCatInstaller.exe 执行完毕');
    }

    const shellPath = this._getNapCatShellPath(napcatDir);
    if (shellPath) {
      context.emitOutput(`[napcat] Shell 目录: ${shellPath}`);
    }

    context.emitProgress('napcat', 100, 'NapCat 安装完成');
    return { success: true, path: napcatDir, shellPath: shellPath || napcatDir, version: release.tag_name };
  }

  /**
   * 步骤10：写入 NapCat 配置
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {Object} options - 可选参数
   * @param {string} options.shellDir - NapCat Shell 目录
   */
  async executeNapcatConfig(context, inputs, options = {}) {
    context.emitProgress('napcat-config', 0, '正在写入 NapCat 配置...');

    const shellDir = options.shellDir;
    const configDir = path.join(shellDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    const onebot11Config = {
      network: {
        httpServers: [],
        httpClients: [],
        websocketServers: [],
        websocketClients: [
          {
            name: 'neo-mofox-ws-client',
            enable: true,
            url: `ws://127.0.0.1:${inputs.wsPort}`,
            messagePostFormat: 'array',
            reportSelfMessage: false,
            reconnectInterval: 3000,
            token: '',
          },
        ],
      },
      musicSignUrl: '',
      enableLocalFile2Url: false,
      parseMultMsg: false,
    };

    const napcatConfig = {
      fileLog: true,
      consoleLog: true,
      fileLogLevel: 'info',
      consoleLogLevel: 'info',
    };

    const onebot11Path = path.join(configDir, `onebot11_${inputs.qqNumber}.json`);
    const napcatCfgPath = path.join(configDir, `napcat_${inputs.qqNumber}.json`);

    fs.writeFileSync(onebot11Path, JSON.stringify(onebot11Config, null, 2));
    fs.writeFileSync(napcatCfgPath, JSON.stringify(napcatConfig, null, 2));

    context.emitOutput(`[napcat-config] onebot11 配置: ${onebot11Path}`);
    context.emitOutput(`[napcat-config] napcat 配置: ${napcatCfgPath}`);

    const launcherPath = platformHelper.writeNapcatLauncherScript(shellDir, inputs.qqNumber);
    if (launcherPath) {
      context.emitOutput(`[napcat-config] 启动脚本: ${launcherPath}`);
    }

    context.emitProgress('napcat-config', 100, 'NapCat 配置写入完成');
    return { success: true };
  }

  /**
   * 步骤11：安装 WebUI
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.neoMofoxDir - Neo-MoFox 目录
   */
  async executeWebui(context, inputs, options = {}) {
    context.emitProgress('webui', 0, '正在安装 WebUI...');

    const pluginsDir = path.join(inputs.neoMofoxDir, 'plugins');
    const webuiDir = path.join(pluginsDir, 'webui_backend');

    fs.mkdirSync(pluginsDir, { recursive: true });

    if (fs.existsSync(webuiDir)) {
      context.emitOutput('[webui] 检测到已存在的 webui_backend 目录，跳过安装');
      context.emitProgress('webui', 100, 'WebUI 已存在，跳过安装');
      return { success: true, path: webuiDir, skipped: true };
    }

    const WEBUI_BRANCH = 'webui-dist';

    for (let retry = 0; retry < MAX_RETRY; retry++) {
      const url = WEBUI_REPOS[retry % WEBUI_REPOS.length];
      context.emitProgress('webui', Math.floor(10 + (retry / MAX_RETRY) * 80), `尝试克隆 WebUI (${retry + 1}/${MAX_RETRY})`);
      context.emitOutput(`[webui] 正在尝试克隆仓库: ${url}`);

      try {
        await this._execCommand(
          'git',
          ['clone', '-b', WEBUI_BRANCH, '--depth', '1', url, webuiDir],
          {
            onStdout: (d) => context.emitOutput(d),
            onStderr: (d) => context.emitOutput(d),
          }
        );

        context.emitOutput('[webui] WebUI 克隆成功');
        context.emitProgress('webui', 100, 'WebUI 安装完成');
        return { success: true, path: webuiDir };
      } catch (error) {
        context.emitOutput(`[webui] 克隆失败: ${error.message}`);
        
        if (fs.existsSync(webuiDir)) {
          try {
            fs.rmSync(webuiDir, { recursive: true, force: true });
          } catch (_) {}
        }
        
        if (retry === MAX_RETRY - 1) {
          throw new Error(`WebUI 安装失败: ${error.message}`);
        }
      }
    }
  }

  /**
   * 步骤12：注册实例
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {Object} options - 可选参数
   * @param {string} options.neoMofoxDir - Neo-MoFox 目录
   * @param {string} options.napcatDir - NapCat 目录
   * @param {string[]} options.installSteps - 已执行的步骤列表
   * @param {string} [options.napcatVersion] - NapCat 版本
   */
  async executeRegister(context, inputs, options = {}) {
    context.emitProgress('register', 0, '正在注册实例...');

    const instanceId = `bot-${inputs.qqNumber}`;
    const { neoMofoxDir, napcatDir, installSteps, napcatVersion } = options;

    const neomofoxVersion = await this._getGitCommitId(neoMofoxDir);
    context.emitOutput(`Neo-MoFox 版本: ${neomofoxVersion || '未知'}`);
    if (napcatVersion) {
      context.emitOutput(`NapCat 版本: ${napcatVersion}`);
    }

    const hasNapcat = installSteps.includes('napcat') || installSteps.includes('napcat-config');

    const updates = {
      qqNumber: inputs.qqNumber,
      qqNickname: inputs.qqNickname || '',
      ownerQQNumber: inputs.ownerQQNumber,
      apiKey: inputs.apiKey,
      webuiApiKey: inputs.webuiApiKey,
      channel: inputs.channel || 'main',
      enabled: true,
      neomofoxDir: neoMofoxDir,
      napcatDir: hasNapcat ? napcatDir : null,
      wsPort: parseInt(inputs.wsPort, 10),
      napcatVersion: napcatVersion,
      extra: {
        displayName: inputs.instanceName,
        description: '',
        isLike: false,
      },
      neomofoxVersion: neomofoxVersion,
      installCompleted: true,
      installProgress: null,
      installSteps: installSteps,
    };

    const instance = storageService.updateInstance(instanceId, updates);

    context.emitProgress('register', 100, '实例注册完成');
    return { success: true, instance };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 步骤调度方法
  // ───────────────────────────────────────────────────────────────────────

  /**
   * 根据步骤名称执行对应的步骤方法
   * @param {string} stepName - 步骤名称
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {Object} options - 步骤特定选项
   * @returns {Promise<Object>} 步骤执行结果
   */
  async executeStep(stepName, context, inputs, options = {}) {
    const methodMap = {
      'clone': 'executeClone',
      'venv': 'executeVenv',
      'deps': 'executeDeps',
      'gen-config': 'executeGenConfig',
      'write-core': 'executeWriteCore',
      'write-model': 'executeWriteModel',
      'write-webui-key': 'executeWriteWebuiKey',
      'write-adapter': 'executeWriteAdapter',
      'napcat': 'executeNapcat',
      'napcat-config': 'executeNapcatConfig',
      'webui': 'executeWebui',
      'register': 'executeRegister',
    };

    const methodName = methodMap[stepName];
    if (!methodName || typeof this[methodName] !== 'function') {
      throw new Error(`未知的步骤: ${stepName}`);
    }

    return await this[methodName](context, inputs, options);
  }
}

// ─── 导出单例 ────────────────────────────────────────────────────────────

const installStepExecutor = new InstallStepExecutor();

module.exports = { installStepExecutor, InstallStepExecutor };
