/**
 * InstallStepExecutor - 安装步骤执行器
 * 提供独立的步骤执行逻辑，支持灵活的步骤组合和条件执行
 * 供 InstallWizardService 和 IntegrationPackImportService 复用
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { storageService } = require('./StorageService');
const { platformHelper } = require('../utils/PlatformHelper');
const { mirrorService } = require('../utils/MirrorService');
const { platformRegistry } = require('../platforms/PlatformRegistry');
const { removePathSafe } = require('../utils/NativeFileRemover');
const { downloadFile } = require('../utils/RangeDownloader');

// ─── 常量定义 ───────────────────────────────────────────────────────────

const MAX_RETRY = 3;
const CONFIG_DETECT_TIMEOUT = 60000; // 60 秒
const WEBUI_MARKET_PLUGIN_ID = 'neo-mofox-webui';
const WEBUI_MARKET_INSTALL_URL = 'https://39.96.71.162/api/v1/plugins/neo-mofox-webui/install';

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
   * 发起 HTTP(S) GET 请求并解析 JSON 响应。
   * @param {string} requestUrl - 请求地址
   * @returns {Promise<Object>} JSON 响应对象
   */
  _requestJson(requestUrl) {
    return new Promise((resolve, reject) => {
      const url = new URL(requestUrl);
      const client = url.protocol === 'https:' ? https : http;
      const options = {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Neo-MoFox-Launcher',
        },
      };

      if (url.protocol === 'https:') {
        options.agent = new https.Agent({ rejectUnauthorized: false });
      }

      const req = client.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          res.resume();
          this._requestJson(redirectUrl).then(resolve, reject);
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`请求失败，HTTP 状态码: ${res.statusCode}\n${body.substring(0, 500)}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`解析 JSON 响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(120000, () => {
        req.destroy(new Error('请求超时'));
      });
    });
  }

  /**
   * 根据市场版本信息计算 WebUI 插件包保存文件名。
   * @param {Object} installInfo - 插件市场安装信息
   * @returns {string} 插件包文件名
   */
  _resolveWebuiPackageName(installInfo) {
    const assetName = installInfo?.version?.asset_name;
    if (assetName && typeof assetName === 'string') {
      return assetName;
    }

    const version = installInfo?.version?.version || 'latest';
    return `${WEBUI_MARKET_PLUGIN_ID}-${version}.mfp`;
  }

  /**
   * 删除安装目标目录中已存在的组件文件夹。
   * @param {string} dirPath - 需要删除的目录路径
   * @param {string} label - 用于日志输出的组件名称
   * @param {Object} context - 执行上下文
   */
  async _removeExistingInstallDirectory(dirPath, label, context) {
    if (!fs.existsSync(dirPath)) {
      return;
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`${label} 安装目标已存在但不是文件夹: ${dirPath}`);
    }

    context.emitOutput(`[${label}] 检测到已存在的安装目录，正在删除: ${dirPath}`);
    await removePathSafe(dirPath, {
      label: `${label} 安装目录`,
      onOutput: (message) => context.emitOutput(message),
    });
    context.emitOutput(`[${label}] 已删除旧目录`);
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
   * 获取 NapCat Windows Node 包根目录。
   */
  _getNapCatNodeRootPath(napcatDir) {
    try {
      if (!napcatDir || !fs.existsSync(napcatDir)) return null;
      const requiredFiles = ['node.exe', 'index.js', 'napcat.bat'];
      const hasNodeRoot = requiredFiles.every((fileName) => fs.existsSync(path.join(napcatDir, fileName)))
        && fs.existsSync(path.join(napcatDir, 'napcat'));
      return hasNodeRoot ? napcatDir : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * 获取 NapCat Windows Node 包配置目录。
   */
  _getNapCatConfigPath(napcatRoot) {
    return path.join(napcatRoot, 'napcat', 'config');
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
    const instanceId = inputs.instanceId;
    if (!instanceId) {
      throw new Error('克隆仓库失败: 缺少实例 ID');
    }
    const targetDir = path.join(inputs.installDir, instanceId, 'neo-mofox');
    await this._removeExistingInstallDirectory(targetDir, 'clone', context);

    const urls = await mirrorService.getRepoUrls();
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
        shell: platformHelper.config.shell,
        detached: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: platformHelper.buildSpawnEnv({ PYTHONUNBUFFERED: '1' }),
      });

      context.emitOutput(`[gen-config] 进程 PID: ${proc.pid}`);

      let killed = false;
      let stdoutData = '';
      let stderrData = '';
      let timeout;
      let checkInterval;

      // 超时控制：协议确认会延长进程时间，每次自动同意后重置计时器
      const timeoutHandler = () => {
        if (checkInterval) clearInterval(checkInterval);
        if (!killed) {
          killed = true;
          platformHelper.killProcessTree(proc, 'SIGKILL');
          reject(new Error(`生成配置文件超时（${Math.floor(CONFIG_DETECT_TIMEOUT / 1000)}秒）`));
        }
      };

      const resetTimeout = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(timeoutHandler, CONFIG_DETECT_TIMEOUT);
      };

      timeout = setTimeout(timeoutHandler, CONFIG_DETECT_TIMEOUT);

      // 协议确认提示的匹配模式（兼容空格差异）
      // 来源：Neo-MoFox/src/app/runtime/user_agreements.py
      //   提示形如："[EULA] 请输入 view / agree / decline: "
      //   或     ："[云端遥测] 请输入 view / agree / decline: "
      const AGREEMENT_PROMPT_PATTERN = /请输入\s*view\s*\/\s*agree\s*\/\s*decline/g;
      let combinedOutput = '';
      let agreedCount = 0;

      const tryAutoAgree = () => {
        const matches = combinedOutput.match(AGREEMENT_PROMPT_PATTERN);
        const totalMatches = matches ? matches.length : 0;
        while (agreedCount < totalMatches) {
          agreedCount += 1;
          if (proc.stdin && !proc.stdin.destroyed && proc.stdin.writable) {
            try {
              proc.stdin.write('agree\n');
              context.emitOutput(`[gen-config] 检测到协议确认提示，已自动同意 (#${agreedCount})\n`);
              // 协议确认期间进程仍在工作，重置超时计时器
              resetTimeout();
            } catch (err) {
              context.emitOutput(`[gen-config] 写入协议确认失败: ${err.message}\n`);
            }
          }
        }
      };

      // 捕获进程输出
      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          const output = data.toString();
          stdoutData += output;
          combinedOutput += output;
          context.emitOutput(output);
          tryAutoAgree();
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          const output = data.toString();
          stderrData += output;
          combinedOutput += output;
          context.emitOutput(output);
          tryAutoAgree();
        });
      }

      checkInterval = setInterval(() => {
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
    if (!inputs.platform) {
      throw new Error('写入适配器配置失败: 缺少平台 ID');
    }

    const platform = platformRegistry.getPlatform(inputs.platform);
    if (!platform.config || typeof platform.config.writeAdapterConfig !== 'function') {
      throw new Error(`平台 ${inputs.platform} 未提供适配器配置写入器`);
    }

    return await platform.config.writeAdapterConfig({
      context,
      inputs,
      options,
      storageService,
    });
  }

  /**
   * 步骤9：安装选定平台。
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.platform - 平台 ID
   * @param {string} inputs.installDir - 安装根目录
   */
  async executePlatformInstall(context, inputs, options = {}) {
    const instanceId = inputs.instanceId;
    if (!instanceId) {
      throw new Error('安装平台失败: 缺少实例 ID');
    }
    if (!inputs.platform) {
      throw new Error('安装平台失败: 缺少平台 ID');
    }

    const platform = platformRegistry.assertInstallable(inputs.platform, this._sysEnv);
    const platformDir = path.join(inputs.installDir, instanceId, platform.directoryName);

    context.emitOutput(`[platform-install] 安装平台: ${platform.displayName || platform.name}`);
    context.emitOutput(`[platform-install] 支持系统: ${platform.systemRequirement?.label || '未声明'}`);
    context.emitOutput(`[platform-install] 当前系统: ${this._sysEnv.platformLabel} ${this._sysEnv.arch}`);

    await this._removeExistingInstallDirectory(platformDir, platform.id, context);
    fs.mkdirSync(platformDir, { recursive: true });

    const result = await platformRegistry.installPlatform(platform.id, {
      context,
      inputs,
      options,
      platformDir,
    });

    return {
      ...result,
      platform: platform.id,
      platformDir: result.path || platformDir,
      platformRoot: result.rootPath || result.platformRoot || platformDir,
      platformVersion: result.version || null,
    };
  }

  /**
   * 步骤10：写入平台自身配置。
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {Object} options - 可选参数
   */
  async executePlatformConfig(context, inputs, options = {}) {
    if (!inputs.platform) {
      throw new Error('写入平台配置失败: 缺少平台 ID');
    }
    const platform = platformRegistry.getPlatform(inputs.platform);
    const platformRoot = options.platformRoot || options.shellDir || inputs.platformDir;

    return await platform.config.configure({
      context,
      inputs,
      options,
      platformRoot,
    });
  }

  /**
   * 步骤11：从插件市场下载 WebUI 插件包。
   * @param {Object} context - 执行上下文
   * @param {Object} inputs - 用户输入
   * @param {string} inputs.neoMofoxDir - Neo-MoFox 目录
   * @returns {Promise<Object>} 安装结果
   */
  async executeWebui(context, inputs, options = {}) {
    context.emitProgress('webui', 0, '正在从插件市场安装 Neo-MoFox-WebUI...');

    const pluginsDir = path.join(inputs.neoMofoxDir, 'plugins');
    const oldWebuiDir = path.join(pluginsDir, 'webui_backend');

    fs.mkdirSync(pluginsDir, { recursive: true });
    await this._removeExistingInstallDirectory(oldWebuiDir, 'webui', context);

    for (let retry = 0; retry < MAX_RETRY; retry++) {
      try {
        context.emitProgress('webui', Math.floor((retry / MAX_RETRY) * 15), `正在获取 WebUI 市场安装信息 (${retry + 1}/${MAX_RETRY})`);
        context.emitOutput(`[webui] 插件市场页面: https://39.96.71.162/plugin/${WEBUI_MARKET_PLUGIN_ID}`);
        context.emitOutput(`[webui] 安装信息接口: ${WEBUI_MARKET_INSTALL_URL}`);

        const installInfo = await this._requestJson(WEBUI_MARKET_INSTALL_URL);
        const downloadUrl = installInfo?.version?.asset_download_url;
        if (!downloadUrl) {
          throw new Error('插件市场响应缺少 version.asset_download_url');
        }

        const packageName = this._resolveWebuiPackageName(installInfo);
        const packagePath = path.join(pluginsDir, packageName);

        if (fs.existsSync(packagePath)) {
          context.emitOutput(`[webui] 检测到已存在的插件包，正在删除: ${packagePath}`);
          fs.rmSync(packagePath, { force: true });
        }

        context.emitOutput(`[webui] 插件 ID: ${installInfo?.plugin?.plugin_id || WEBUI_MARKET_PLUGIN_ID}`);
        context.emitOutput(`[webui] 推荐版本: ${installInfo?.version?.version || '未知'}`);
        context.emitOutput(`[webui] 下载地址: ${downloadUrl}`);
        context.emitOutput(`[webui] 保存为插件包: ${packagePath}`);
        context.emitOutput('[webui] 将保留下载包原样，不执行解压');

        context.emitProgress('webui', 20, '正在下载 WebUI 插件包...');
        await downloadFile(
          downloadUrl,
          packagePath,
          (downloaded, total) => {
            if (total > 0) {
              const percent = Math.floor(20 + (downloaded / total) * 70);
              context.emitProgress('webui', Math.min(percent, 90), `正在下载 WebUI 插件包 ${Math.min(percent, 90)}%`);
              return;
            }

            context.emitOutput(`[webui] 已下载 ${downloaded} bytes`);
          },
          { userAgent: 'Neo-MoFox-Launcher' }
        );

        context.emitProgress('webui', 100, 'Neo-MoFox-WebUI 插件包下载完成');
        return {
          success: true,
          path: packagePath,
          pluginId: installInfo?.plugin?.plugin_id || WEBUI_MARKET_PLUGIN_ID,
          version: installInfo?.version?.version || null,
          extracted: false,
        };
      } catch (error) {
        context.emitOutput(`[webui] 从插件市场下载失败: ${error.message}`);

        if (retry === MAX_RETRY - 1) {
          throw new Error(`Neo-MoFox-WebUI 插件市场安装失败: ${error.message}`);
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

    const instanceId = options.instanceId || inputs.instanceId;
    if (!instanceId) {
      throw new Error('注册实例失败: 缺少实例 ID');
    }
    const {
      neoMofoxDir,
      platformDir,
      platformRoot,
      platformVersion,
      installSteps,
    } = options;

    const neomofoxVersion = await this._getGitCommitId(neoMofoxDir);
    context.emitOutput(`Neo-MoFox 版本: ${neomofoxVersion || '未知'}`);
    if (platformVersion) {
      context.emitOutput(`平台版本: ${platformVersion}`);
    }

    const hasPlatform = installSteps ? (installSteps.includes('platform-install') || installSteps.includes('platform-config')) : false;
    const webuiInstalled = installSteps ? installSteps.includes('webui') : false;

    const updates = {
      qqNumber: inputs.qqNumber,
      qqNickname: inputs.qqNickname || '',
      ownerQQNumber: inputs.ownerQQNumber,
      apiKey: inputs.apiKey,
      webuiApiKey: inputs.webuiApiKey,
      channel: inputs.channel || 'main',
      enabled: true,
      neomofoxDir: neoMofoxDir,
      platform: inputs.platform,
      platformDir: hasPlatform ? platformDir : null,
      platformRoot: hasPlatform ? platformRoot : null,
      platformVersion: platformVersion,
      wsPort: parseInt(inputs.wsPort, 10),
      extra: {
        displayName: inputs.instanceName,
        description: '',
        isLike: false,
      },
      neomofoxVersion: neomofoxVersion,
      installCompleted: true,
      installProgress: null,
      installSteps: installSteps,
      components: {
        webuiInstalled,
      },
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
      'platform-install': 'executePlatformInstall',
      'platform-config': 'executePlatformConfig',
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
