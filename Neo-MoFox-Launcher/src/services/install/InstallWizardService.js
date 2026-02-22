/**
 * InstallWizardService - 安装向导服务
 * 首次运行时，弹出信息收集流程，将用户输入写入 Neo-MoFox 的 TOML 配置文件
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const https = require('https');
const http = require('http');
const { storageService } = require('./StorageService');
const { platformHelper } = require('../PlatformHelper');

// ─── 常量定义 ───────────────────────────────────────────────────────────

const REPO_URLS = {
  main: [
    'https://github.com/MoFox-Studio/Neo-MoFox.git',
    'https://ghproxy.com/https://github.com/MoFox-Studio/Neo-MoFox.git',
    'https://gitclone.com/github.com/MoFox-Studio/Neo-MoFox.git',
  ],
  dev: [
    'https://github.com/MoFox-Studio/Neo-MoFox.git',
    'https://ghproxy.com/https://github.com/MoFox-Studio/Neo-MoFox.git',
    'https://gitclone.com/github.com/MoFox-Studio/Neo-MoFox.git',
  ],
};

const MAX_RETRY = 3;
const CONFIG_DETECT_TIMEOUT = 60000; // 60 秒

// 所有可用的安装步骤
const AVAILABLE_STEPS = [
  'clone',         // 克隆 Neo-MoFox 仓库
  'venv',          // 创建 Python 虚拟环境
  'deps',          // 安装 Python 依赖
  'gen-config',    // 生成配置文件
  'write-core',    // 写入 core.toml
  'write-model',   // 写入 model.toml
  'napcat',        // 安装 NapCat
  'napcat-config', // 写入 NapCat 配置
  'register',      // 注册实例
];

// 默认安装步骤（全部）
const DEFAULT_INSTALL_STEPS = [...AVAILABLE_STEPS];

// ─── InstallWizardService 类 ──────────────────────────────────────────

class InstallWizardService {
  constructor() {
    this._progressCallback = null;
    this._outputCallback = null;
    this._currentInstance = null;

    // 启动时检测系统环境
    this._sysEnv = platformHelper.detectSystemEnv();
    console.log(`[InstallWizard] 当前系统: ${this._sysEnv.platformLabel}${this._sysEnv.distro ? ' (' + this._sysEnv.distroName + ')' : ''}`);
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback) {
    this._progressCallback = callback;
  }

  /**
   * 设置输出回调
   */
  setOutputCallback(callback) {
    this._outputCallback = callback;
  }

  /**
   * 发送进度事件
   */
  _emitProgress(step, percent, message = '', error = null) {
    const progress = { step, percent, message, error };
    console.log(`[InstallWizard] ${step}: ${percent}% - ${message}`);
    if (this._progressCallback) {
      this._progressCallback(progress);
    }
    return progress;
  }

  /**
   * 发送输出日志
   */
  _emitOutput(output) {
    console.log(`[InstallWizard Output] ${output}`);
    if (this._outputCallback) {
      this._outputCallback(output);
    }
  }

  // ─── Phase 1: 环境预检 ─────────────────────────────────────────────────

  /**
   * 检查命令是否可用
   */
  async _checkCommand(command, args = ['--version']) {
    return new Promise((resolve) => {
      const proc = spawn(command, args, { 
        shell: platformHelper.config.shell, 
        timeout: 10000,
        env: platformHelper.buildSpawnEnv()
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

  /**
   * 检查 Python 版本（扫描 PATH 下所有 python，找到第一个 >= 3.11 的）
   */
  async checkPython() {
    const MIN_MAJOR = 3;
    const MIN_MINOR = 11;

    // 收集 PATH 中所有 python 可执行文件
    const pythonPaths = [];
    const seen = new Set();
    const exeName = platformHelper.pythonExeName;
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of pathDirs) {
      try {
        const pyExe = path.join(dir, exeName);
        const resolved = fs.realpathSync ? pyExe : pyExe;
        if (!seen.has(resolved) && fs.existsSync(pyExe)) {
          seen.add(resolved);
          pythonPaths.push(pyExe);
        }
      } catch (e) { /* ignore */ }
    }

    // 逐个检查版本，找到第一个满足要求的
    let firstFound = null;
    for (const pyPath of pythonPaths) {
      const result = await this._checkCommand(`"${pyPath}"`, ['--version']);
      if (result.installed && result.version) {
        if (!firstFound) firstFound = { ...result, cmd: `"${pyPath}"` };
        const [major, minor] = result.version.split('.').map(Number);
        if (major >= MIN_MAJOR && minor >= MIN_MINOR) {
          result.valid = true;
          result.requirement = '>= 3.11';
          result.cmd = `"${pyPath}"`;
          return result;
        }
      }
    }

    // 没有找到 >= 3.11 的
    if (firstFound) {
      firstFound.valid = false;
      firstFound.requirement = '>= 3.11';
      return firstFound;
    }
    return { installed: false, valid: false, version: null, requirement: '>= 3.11', error: 'Python 未安装' };
  }

  /**
   * 检查 uv 是否安装
   */
  async checkUv() {
    const result = await this._checkCommand('uv', ['--version']);
    result.valid = result.installed;
    result.requirement = '已安装';
    result.installHint = 'pip install uv';
    return result;
  }

  /**
   * 检查 Git 是否安装
   */
  async checkGit() {
    const result = await this._checkCommand('git', ['--version']);
    result.valid = result.installed;
    result.requirement = '已安装';
    return result;
  }

  /**
   * 检查路径是否可写
   */
  async checkPathWritable(targetPath) {
    return new Promise((resolve) => {
      // 确保目录存在
      try {
        fs.mkdirSync(targetPath, { recursive: true });
      } catch (e) {
        resolve({ writable: false, error: `无法创建目录: ${e.message}` });
        return;
      }

      fs.access(targetPath, fs.constants.W_OK, (err) => {
        if (err) {
          resolve({ writable: false, error: '路径不可写' });
        } else {
          resolve({ writable: true });
        }
      });
    });
  }

  /**
   * 环境预检（Phase 1）
   * 同时检测所有环境，最后统一报告结果
   */
  async runEnvCheck() {
    this._emitProgress('env-check', 0, '开始环境检测...');

    // 并行检测所有环境
    const [python, uv, git] = await Promise.all([
      this.checkPython(),
      this.checkUv(),
      this.checkGit(),
    ]);

    this._emitProgress('env-check', 100, '环境检测完成');

    // 收集所有错误
    const errors = [];
    if (!python.valid) {
      errors.push(`Python ${python.requirement} 未满足，当前: ${python.version || '未安装'}`);
    }
    if (!uv.valid) {
      errors.push(`uv 未安装，请运行: ${uv.installHint}`);
    }
    if (!git.valid) {
      errors.push('Git 未安装');
    }

    const passed = errors.length === 0;
    
    return {
      passed,
      error: passed ? null : errors.join('\n'),
      errors: passed ? [] : errors,
      checks: { python, uv, git },
    };
  }

  // ─── Phase 2: 字段校验 ─────────────────────────────────────────────────

  /**
   * 校验实例名称
   */
  validateInstanceName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: '实例名称不能为空' };
    }
    if (name.length < 1 || name.length > 32) {
      return { valid: false, error: '实例名称长度应在 1-32 字符之间' };
    }
    return { valid: true };
  }

  /**
   * 校验 QQ 号
   */
  validateQQNumber(qq, fieldLabel = 'QQ 号') {
    if (!qq || !/^\d{5,12}$/.test(qq)) {
      return { valid: false, error: `${fieldLabel}应为 5-12 位纯数字` };
    }
    return { valid: true };
  }

  /**
   * 校验 API Key
   */
  validateApiKey(apiKey) {
    if (!apiKey || apiKey.trim().length === 0) {
      return { valid: false, error: 'API Key 不能为空' };
    }
    return { valid: true };
  }

  /**
   * 校验端口
   */
  validatePort(port) {
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
      return { valid: false, error: '端口应在 1024-65535 之间' };
    }
    return { valid: true };
  }

  /**
   * 检查端口是否可用
   */
  async checkPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve({ available: false, error: `端口 ${port} 已被占用` });
        } else {
          resolve({ available: false, error: err.message });
        }
      });
      server.once('listening', () => {
        server.close();
        resolve({ available: true });
      });
      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * 校验安装路径
   */
  validateInstallDir(installDir, instanceId = null, isResume = false) {
    if (!installDir || installDir.trim().length === 0) {
      return { valid: false, error: '安装路径不能为空' };
    }
    // 检查路径是否包含中文或空格
    if (/[\u4e00-\u9fa5\s]/.test(installDir)) {
      return { valid: false, error: '安装路径不应包含中文或空格' };
    }
    
    return { valid: true };
  }

  /**
   * 校验安装步骤配置
   */
  validateInstallSteps(installSteps) {
    // 如果未提供，使用默认步骤
    if (!installSteps) {
      return { valid: true, steps: DEFAULT_INSTALL_STEPS };
    }

    if (!Array.isArray(installSteps)) {
      return { valid: false, error: 'installSteps 必须是数组' };
    }

    if (installSteps.length === 0) {
      return { valid: false, error: '至少需要选择一个安装步骤' };
    }

    // 检查是否有无效步骤
    const invalidSteps = installSteps.filter(s => !AVAILABLE_STEPS.includes(s));
    if (invalidSteps.length > 0) {
      return {
        valid: false,
        error: `无效的安装步骤: ${invalidSteps.join(', ')}`,
        availableSteps: AVAILABLE_STEPS,
      };
    }

    // 检查步骤依赖关系
    const stepSet = new Set(installSteps);
    const errors = [];

    // write-core 和 write-model 依赖 gen-config
    if ((stepSet.has('write-core') || stepSet.has('write-model')) && !stepSet.has('gen-config')) {
      errors.push('write-core/write-model 依赖 gen-config 步骤');
    }

    // gen-config 依赖 deps
    if (stepSet.has('gen-config') && !stepSet.has('deps')) {
      errors.push('gen-config 依赖 deps 步骤');
    }

    // deps 依赖 venv
    if (stepSet.has('deps') && !stepSet.has('venv')) {
      errors.push('deps 依赖 venv 步骤');
    }

    // venv 依赖 clone
    if (stepSet.has('venv') && !stepSet.has('clone')) {
      errors.push('venv 依赖 clone 步骤');
    }

    // napcat-config 依赖 napcat
    if (stepSet.has('napcat-config') && !stepSet.has('napcat')) {
      errors.push('napcat-config 依赖 napcat 步骤');
    }

    if (errors.length > 0) {
      return {
        valid: false,
        error: '步骤依赖关系不满足:\n' + errors.join('\n'),
      };
    }

    return { valid: true, steps: installSteps };
  }

  /**
   * 校验所有必填字段
   */
  async validateInputs(inputs) {
    const errors = [];

    const nameResult = this.validateInstanceName(inputs.instanceName);
    if (!nameResult.valid) errors.push({ field: 'instanceName', error: nameResult.error });

    const qqResult = this.validateQQNumber(inputs.qqNumber, 'Bot QQ 号');
    if (!qqResult.valid) errors.push({ field: 'qqNumber', error: qqResult.error });

    const ownerResult = this.validateQQNumber(inputs.ownerQQNumber, '管理员 QQ 号');
    if (!ownerResult.valid) errors.push({ field: 'ownerQQNumber', error: ownerResult.error });

    const apiKeyResult = this.validateApiKey(inputs.apiKey);
    if (!apiKeyResult.valid) errors.push({ field: 'apiKey', error: apiKeyResult.error });

    const portResult = this.validatePort(inputs.wsPort);
    if (!portResult.valid) errors.push({ field: 'wsPort', error: portResult.error });

    // 检查是否为续装模式
    const instanceId = this._generateInstanceId(inputs.qqNumber);
    const existing = storageService.getInstance(instanceId);
    const isResume = existing && !existing.installCompleted;

    const dirResult = this.validateInstallDir(inputs.installDir, instanceId, isResume);
    if (!dirResult.valid) errors.push({ field: 'installDir', error: dirResult.error });

    // 校验安装步骤配置
    const stepsResult = this.validateInstallSteps(inputs.installSteps);
    if (!stepsResult.valid) {
      errors.push({ field: 'installSteps', error: stepsResult.error });
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // 检查端口可用性
    const portAvailable = await this.checkPortAvailable(parseInt(inputs.wsPort, 10));
    if (!portAvailable.available) {
      errors.push({ field: 'wsPort', error: portAvailable.error });
      return { valid: false, errors };
    }

    // 检查路径可写性
    const pathWritable = await this.checkPathWritable(inputs.installDir);
    if (!pathWritable.writable) {
      errors.push({ field: 'installDir', error: pathWritable.error });
      return { valid: false, errors };
    }

    this._emitProgress('collect-inputs', 100, '输入校验通过');
    return { valid: true };
  }

  // ─── Phase 3: 安装执行 ─────────────────────────────────────────────────

  /**
   * 生成实例 ID
   */
  _generateInstanceId(qqNumber) {
    return `bot-${qqNumber}`;
  }

  /**
   * 执行命令并返回 Promise
   */
  _execCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      // 强制使用 UTF-8 编码输出，避免中文乱码
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
   * 获取 NapCat 最新 Release 信息（支持 GitHub API 镜像回退）
   */
  async _fetchLatestNapCatRelease() {
    const apiUrls = [
      'https://api.github.com/repos/NapNeko/NapCatQQ/releases/latest',
      'https://ghproxy.com/https://api.github.com/repos/NapNeko/NapCatQQ/releases/latest',
    ];

    let lastError = null;
    for (const apiUrl of apiUrls) {
      try {
        const data = await this._httpsGet(apiUrl, {
          'User-Agent': 'Neo-MoFox-Launcher',
          'Accept': 'application/vnd.github.v3+json',
        });
        const release = JSON.parse(data);
        if (!release.assets) throw new Error('Release 数据无效');
        return release;
      } catch (e) {
        lastError = e;
        this._emitOutput(`[napcat] 尝试 ${apiUrl} 失败: ${e.message}`);
      }
    }
    throw new Error(`获取 NapCat Release 信息失败: ${lastError?.message}`);
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
   * @param {string} url
   * @param {string} destPath
   * @param {(downloaded: number, total: number) => void} [onProgress]
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
   * 从 napcatDir 内查找 NapCat Shell 子目录（NapCat.*.Shell 格式）
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
   * 获取 Git 仓库的当前 commit ID
   */
  async _getGitCommitId(repoDir) {
    try {
      const { stdout } = await this._execCommand('git', ['rev-parse', 'HEAD'], {
        cwd: repoDir,
      });
      return stdout.trim();
    } catch (e) {
      console.error('[InstallWizard] 获取 commit ID 失败:', e);
      return null;
    }
  }

  /**
   * 3.1 克隆 Neo-MoFox 仓库
   */
  async cloneRepository(installDir, instanceId, channel) {
    const targetDir = path.join(installDir, instanceId, 'neo-mofox');
    const urls = REPO_URLS[channel] || REPO_URLS.main;
    const branch = channel === 'dev' ? 'dev' : 'main';

    for (let retry = 0; retry < MAX_RETRY; retry++) {
      const url = urls[retry % urls.length];
      this._emitProgress('clone', Math.floor((retry / MAX_RETRY) * 100), `尝试克隆 (${retry + 1}/${MAX_RETRY}): ${url}`);

      try {
        const args = ['clone', url, targetDir];
        if (channel === 'dev') {
          args.push('--branch', branch);
        }

        await this._execCommand('git', args, {
          onStdout: (data) => this._emitOutput(data),
          onStderr: (data) => this._emitOutput(data),
        });

        this._emitProgress('clone', 100, '仓库克隆完成');
        return { success: true, path: targetDir };
      } catch (e) {
        console.error(`[InstallWizard] 克隆失败 (${retry + 1}/${MAX_RETRY}):`, e.message);
        if (retry === MAX_RETRY - 1) {
          throw new Error(`克隆仓库失败: ${e.message}`);
        }
      }
    }
  }

  /**
   * 3.2 创建 Python 虚拟环境
   */
  async createVenv(neoMofoxDir, pythonCmd = 'python') {
    this._emitProgress('venv', 0, '正在创建虚拟环境...');
    
    await this._execCommand('uv', ['venv', '--python', pythonCmd], {
      cwd: neoMofoxDir,
    });

    this._emitProgress('venv', 100, '虚拟环境创建完成');
    return { success: true };
  }

  /**
   * 3.3 安装 Python 依赖
   */
  async installDependencies(neoMofoxDir) {
    this._emitProgress('deps', 0, '正在安装依赖...');

    await this._execCommand('uv', ['sync'], {
      cwd: neoMofoxDir,
      onStdout: (data) => this._emitOutput(data),
      onStderr: (data) => this._emitOutput(data),
    });

    this._emitProgress('deps', 50, '正在安装 Pillow...');
    
    await this._execCommand('uv', ['pip', 'install', 'pillow'], {
      cwd: neoMofoxDir,
      onStdout: (data) => this._emitOutput(data),
      onStderr: (data) => this._emitOutput(data),
    });

    this._emitProgress('deps', 100, '依赖安装完成');
    return { success: true };
  }

  /**
   * 3.4 首次启动生成配置文件
   */
  async generateConfig(neoMofoxDir) {
    this._emitProgress('gen-config', 0, '正在生成配置文件...');

    return new Promise((resolve, reject) => {
      const configDir = path.join(neoMofoxDir, 'config');
      const coreToml = path.join(configDir, 'core.toml');
      const modelToml = path.join(configDir, 'model.toml');

      this._emitOutput(`[gen-config] 工作目录: ${neoMofoxDir}`);
      this._emitOutput(`[gen-config] 配置目录: ${configDir}`);
      this._emitOutput(`[gen-config] 启动命令: uv run python main.py`);

      const proc = spawn('uv', ['run', 'python', 'main.py'], {
        cwd: neoMofoxDir,
        shell: true,
        detached: false,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      this._emitOutput(`[gen-config] 进程 PID: ${proc.pid}`);

      let killed = false;
      let stdoutData = '';
      let stderrData = '';

      // 捕获进程输出
      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          const output = data.toString();
          stdoutData += output;
          this._emitOutput(output);
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          const output = data.toString();
          stderrData += output;
          this._emitOutput(output);
        });
      }
      const checkInterval = setInterval(() => {
        if (fs.existsSync(coreToml) && fs.existsSync(modelToml)) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          if (!killed) {
            killed = true;
            // 使用 PlatformHelper 杀死进程
            platformHelper.killProcessTree(proc, 'SIGTERM');
            this._emitProgress('gen-config', 100, '配置文件生成完成');
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
        
        this._emitOutput(`[gen-config] 进程退出，退出码: ${code}`);
        this._emitOutput(`[gen-config] 检查配置文件...`);
        this._emitOutput(`[gen-config] core.toml 路径: ${coreToml}`);
        this._emitOutput(`[gen-config] model.toml 路径: ${modelToml}`);
        this._emitOutput(`[gen-config] core.toml 存在: ${fs.existsSync(coreToml)}`);
        this._emitOutput(`[gen-config] model.toml 存在: ${fs.existsSync(modelToml)}`);
        
        // 检查配置目录是否存在
        if (fs.existsSync(configDir)) {
          try {
            const files = fs.readdirSync(configDir);
            this._emitOutput(`[gen-config] 配置目录内容: ${files.join(', ')}`);
          } catch (err) {
            this._emitOutput(`[gen-config] 无法读取配置目录: ${err.message}`);
          }
        } else {
          this._emitOutput(`[gen-config] 配置目录不存在: ${configDir}`);
        }
        
        // 再检查一次配置文件
        if (fs.existsSync(coreToml) && fs.existsSync(modelToml)) {
          this._emitProgress('gen-config', 100, '配置文件生成完成');
          resolve({ success: true, configDir });
        } else if (!killed) {
          // 构建详细的错误信息
          let errorMsg = `进程退出但配置文件未生成 (退出码: ${code})`;
          if (stderrData) {
            errorMsg += `\n错误输出: ${stderrData.substring(0, 500)}`;
          }
          if (stdoutData) {
            errorMsg += `\n标准输出: ${stdoutData.substring(0, 500)}`;
          }
          this._emitOutput(`[ERROR] ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      });
    });
  }

  /**
   * 3.5 写入 core.toml
   */
  async writeCoreToml(neoMofoxDir, ownerQQNumber) {
    this._emitProgress('write-core', 0, '正在写入 core.toml...');

    const coreTomlPath = path.join(neoMofoxDir, 'config', 'core.toml');
    
    try {
      const data = storageService.readToml(coreTomlPath);
      
      // 确保 permissions 对象存在
      if (!data.permissions) data.permissions = {};
      
      // 写入 owner_list
      data.permissions.owner_list = [`qq:${ownerQQNumber}`];
      
      storageService.writeToml(coreTomlPath, data);
      
      this._emitProgress('write-core', 100, 'core.toml 写入完成');
      return { success: true };
    } catch (e) {
      throw new Error(`写入 core.toml 失败: ${e.message}`);
    }
  }

  /**
   * 3.6 写入 model.toml
   */
  async writeModelToml(neoMofoxDir, apiKey) {
    this._emitProgress('write-model', 0, '正在写入 model.toml...');

    const modelTomlPath = path.join(neoMofoxDir, 'config', 'model.toml');
    
    try {
      const data = storageService.readToml(modelTomlPath);
      
      // 找到名为 SiliconFlow 的 api_provider 并写入 api_key
      if (data.api_providers && data.api_providers.length > 0) {
        const siliconFlowProvider = data.api_providers.find(p => p.name === 'SiliconFlow');
        if (siliconFlowProvider) {
          siliconFlowProvider.api_key = apiKey;
        } else {
          // 如果没有找到 SiliconFlow，写入第一个 provider
          data.api_providers[0].api_key = apiKey;
        }
      } else {
        // 如果不存在任何 provider，创建一个 SiliconFlow provider
        data.api_providers = [{ name: 'SiliconFlow', api_key: apiKey }];
      }
      
      storageService.writeToml(modelTomlPath, data);
      
      this._emitProgress('write-model', 100, 'model.toml 写入完成');
      return { success: true };
    } catch (e) {
      throw new Error(`写入 model.toml 失败: ${e.message}`);
    }
  }

  /**
   * 3.7 下载并安装 NapCat（Windows OneKey 无头绿色版）
   * 特殊说明：一键版仅适用 Windows AMD64，无需单独安装 QQ，NapCat 已内置
   */
  async installNapCat(installDir, instanceId) {
    const napcatDir = path.join(installDir, instanceId, 'napcat');
    fs.mkdirSync(napcatDir, { recursive: true });

    // 检查当前平台是否支持 NapCat 自动安装
    if (!platformHelper.supportsNapcatAutoInstall) {
      this._emitProgress('napcat', 100, `${platformHelper.label} 暂不支持 NapCat 自动安装，请手动安装`);
      return { success: true, path: napcatDir, shellPath: null };
    }

    // ── Step 1: 获取最新 Release ────────────────────────────────────────
    this._emitProgress('napcat', 5, '正在获取 NapCat 最新版本信息...');
    const release = await this._fetchLatestNapCatRelease();

    const ASSET_NAME = platformHelper.napcatAssetName;
    const asset = release.assets.find((a) => a.name === ASSET_NAME);
    if (!asset) {
      throw new Error(`在 ${release.tag_name} 中未找到 ${ASSET_NAME}，请前往 https://github.com/NapNeko/NapCatQQ/releases 手动下载`);
    }

    this._emitOutput(`[napcat] 版本: ${release.tag_name}`);
    this._emitOutput(`[napcat] 资源: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`);
    this._emitOutput(`[napcat] 下载地址: ${asset.browser_download_url}`);

    // ── Step 2: 下载 ZIP ────────────────────────────────────────────────
    const zipPath = path.join(napcatDir, ASSET_NAME);
    this._emitProgress('napcat', 10, `正在下载 NapCat ${release.tag_name}...`);

    await this._downloadFile(asset.browser_download_url, zipPath, (downloaded, total) => {
      const pct = total > 0 ? Math.floor(10 + (downloaded / total) * 55) : 10;
      const dlMB = (downloaded / 1024 / 1024).toFixed(1);
      const totalMB = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?';
      this._emitProgress('napcat', pct, `下载中... ${dlMB} MB / ${totalMB} MB`);
    });

    this._emitOutput(`[napcat] 下载完成: ${zipPath}`);

    // ── Step 3: 解压（跨平台） ────────────────────────────────────────────
    this._emitProgress('napcat', 68, '正在解压...');
    const unzipInfo = platformHelper.getUnzipCommand(zipPath, napcatDir);
    await this._execCommand(
      unzipInfo.cmd,
      unzipInfo.args,
      { onStderr: (d) => this._emitOutput(d) }
    );
    this._emitOutput('[napcat] 解压完成');

    // 删除 ZIP 释放空间
    try { fs.unlinkSync(zipPath); } catch (_) {}

    // ── Step 4: 运行安装器自动化配置（跨平台） ───────────────────
    if (platformHelper.isWindows) {
      const installerPath = path.join(napcatDir, 'NapCatInstaller.exe');
      if (fs.existsSync(installerPath)) {
        this._emitProgress('napcat', 75, '正在运行 NapCatInstaller.exe 自动化配置...');
        this._emitOutput('[napcat] 启动 NapCatInstaller.exe，等待配置完成...');
        await this._execCommand(
          'cmd',
          ['/c', `echo.|"${installerPath}"`],
          {
            cwd: napcatDir,
            onStdout: (d) => this._emitOutput(d),
            onStderr: (d) => this._emitOutput(d),
          }
        );
        this._emitOutput('[napcat] NapCatInstaller.exe 执行完毕');
      } else {
        this._emitOutput('[napcat] 未找到 NapCatInstaller.exe，跳过自动化配置步骤');
      }
    } else if (platformHelper.isLinux) {
      // Linux 下可能有 install.sh 之类的安装脚本
      const installerScript = path.join(napcatDir, 'install.sh');
      if (fs.existsSync(installerScript)) {
        this._emitProgress('napcat', 75, '正在运行 install.sh 自动化配置...');
        // 先赋予执行权限
        await this._execCommand('chmod', ['+x', installerScript], { cwd: napcatDir });
        await this._execCommand(
          'bash',
          [installerScript],
          {
            cwd: napcatDir,
            onStdout: (d) => this._emitOutput(d),
            onStderr: (d) => this._emitOutput(d),
          }
        );
        this._emitOutput('[napcat] install.sh 执行完毕');
      } else {
        this._emitOutput('[napcat] 未找到安装脚本，跳过自动化配置步骤');
      }
    }

    // ── Step 5: 定位 NapCat.*.Shell 目录 ───────────────────────────────
    const shellPath = this._getNapCatShellPath(napcatDir);
    if (shellPath) {
      this._emitOutput(`[napcat] Shell 目录: ${shellPath}`);
    } else {
      this._emitOutput('[napcat] 警告: 未找到 NapCat.*.Shell 子目录，将使用根目录');
    }

    this._emitProgress('napcat', 100, 'NapCat 安装完成');
    console.log(`[InstallWizard] NapCat 安装完成，路径: ${napcatDir}, 版本: ${release.tag_name}`);
    return { success: true, path: napcatDir, shellPath: shellPath || napcatDir, version: release.tag_name };
  }

  /**
   * 3.8 写入 NapCat 配置
   * @param {string} shellDir  NapCat Shell 工作目录（NapCat.*.Shell 或 napcat 根目录）
   * @param {string} qqNumber  Bot QQ 号
   * @param {number|string} wsPort  WebSocket 端口
   */
  async writeNapCatConfig(shellDir, qqNumber, wsPort) {
    this._emitProgress('napcat-config', 0, '正在写入 NapCat 配置...');

    const configDir = path.join(shellDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    // onebot11 配置 —— 配置 WebSocket 客户端连接到 Neo-MoFox
    const onebot11Config = {
      network: {
        httpServers: [],
        httpClients: [],
        websocketServers: [],
        websocketClients: [
          {
            name: 'neo-mofox-ws-client',
            enable: true,
            url: `ws://127.0.0.1:${wsPort}`,
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

    // napcat 日志配置
    const napcatConfig = {
      fileLog: true,
      consoleLog: true,
      fileLogLevel: 'info',
      consoleLogLevel: 'info',
    };

    const onebot11Path = path.join(configDir, `onebot11_${qqNumber}.json`);
    const napcatCfgPath = path.join(configDir, `napcat_${qqNumber}.json`);

    fs.writeFileSync(onebot11Path, JSON.stringify(onebot11Config, null, 2));
    fs.writeFileSync(napcatCfgPath, JSON.stringify(napcatConfig, null, 2));

    this._emitOutput(`[napcat-config] onebot11 配置: ${onebot11Path}`);
    this._emitOutput(`[napcat-config] napcat 配置: ${napcatCfgPath}`);

    // 生成快速启动脚本（跨平台）
    const launcherPath = platformHelper.writeNapcatLauncherScript(shellDir, qqNumber);
    if (launcherPath) {
      this._emitOutput(`[napcat-config] 启动脚本: ${launcherPath}`);
    }

    this._emitProgress('napcat-config', 100, 'NapCat 配置写入完成');
    return { success: true };
  }

  /**
   * 3.9 & 3.10 注册实例并标记完成
   */
  async registerInstance(inputs, neoMofoxDir, napcatDir, installSteps, napcatVersion = null) {
    this._emitProgress('register', 0, '正在注册实例...');

    const instanceId = this._generateInstanceId(inputs.qqNumber);

    // 获取 Neo-MoFox 的 commit ID
    const neomofoxVersion = await this._getGitCommitId(neoMofoxDir);
    this._emitOutput(`Neo-MoFox 版本: ${neomofoxVersion || '未知'}`);
    if (napcatVersion) {
      this._emitOutput(`NapCat 版本: ${napcatVersion}`);
    }

    // 检查是否安装了 NapCat
    const hasNapcat = installSteps.includes('napcat') || installSteps.includes('napcat-config');

    // 更新现有实例，标记为安装完成
    const updates = {
      displayName: inputs.instanceName,
      qqNumber: inputs.qqNumber,
      ownerQQNumber: inputs.ownerQQNumber,
      apiKey: inputs.apiKey,
      channel: inputs.channel || 'main',
      enabled: true,
      neomofoxDir: neoMofoxDir,
      napcatDir: hasNapcat ? napcatDir : null, // 只在安装了 NapCat 时设置路径
      wsPort: parseInt(inputs.wsPort, 10),
      napcatVersion: napcatVersion, // 保存 NapCat 版本号
      neomofoxVersion: neomofoxVersion,
      installCompleted: true,
      installProgress: null,
      installSteps: installSteps, // 保存安装步骤配置
    };

    const instance = storageService.updateInstance(instanceId, updates);

    this._emitProgress('register', 100, '实例注册完成');
    return { success: true, instance };
  }

  /**
  /**
   * 执行完整安装流程（支持断点续装）
   * @param {Object} inputs - 安装配置
   * @param {string[]} inputs.installSteps - 可选，要执行的安装步骤数组，默认执行全部步骤
   */
  async runInstall(inputs, outputCallback) {
    // 设置输出回调
    if (outputCallback) {
      this.setOutputCallback(outputCallback);
    }

    const instanceId = this._generateInstanceId(inputs.qqNumber);
    const neoMofoxDir = path.join(inputs.installDir, instanceId, 'neo-mofox');
    
    // 只在需要安装 NapCat 时定义相关路径
    let napcatDir = null;
    let napcatShellPath = null;
    let napcatVersion = null; // NapCat 版本号

    // 获取要执行的步骤（使用用户自定义或默认全部步骤）
    const stepsResult = this.validateInstallSteps(inputs.installSteps);
    if (!stepsResult.valid) {
      throw new Error(`安装步骤配置无效: ${stepsResult.error}`);
    }
    const configuredSteps = stepsResult.steps;
    const stepOrder = AVAILABLE_STEPS.filter(s => configuredSteps.includes(s));

    this._emitOutput(`[安装步骤] 将执行以下步骤: ${stepOrder.join(', ')}`);

    // 检查是否已存在相同 ID 的实例，确定续装起点
    const existing = storageService.getInstance(instanceId);
    let resumeStep = 'clone';
    if (existing) {
      if (existing.installCompleted) {
        throw new Error(`实例 ${instanceId} 已存在且安装完成`);
      }
      // 读取上次保存的进度（installProgress.step 为当时正在执行/失败的步骤）
      const savedStep = existing.installProgress?.step;
      if (savedStep && savedStep !== 'error' && stepOrder.includes(savedStep)) {
        resumeStep = savedStep;
      }
    }
    const startIndex = stepOrder.indexOf(resumeStep);
    // 检查步骤是否需要执行：1. 在配置的步骤中 2. 在续装起点之后
    const shouldRun = (step) => configuredSteps.includes(step) && stepOrder.indexOf(step) >= startIndex;

    // 创建/更新实例记录（保留 createdAt）
    const instanceData = {
      id: instanceId,
      displayName: inputs.instanceName,
      qqNumber: inputs.qqNumber,
      ownerQQNumber: inputs.ownerQQNumber,
      apiKey: inputs.apiKey,
      channel: inputs.channel || 'main',
      enabled: false,
      neomofoxDir: neoMofoxDir,
      napcatDir: napcatDir,
      wsPort: parseInt(inputs.wsPort, 10),
      installCompleted: false,
      installProgress: { step: resumeStep, substep: 0 },
      installSteps: configuredSteps, // 保存步骤配置
    };

    if (existing) {
      storageService.updateInstance(instanceId, instanceData);
    } else {
      storageService.addInstance({ ...instanceData, createdAt: new Date().toISOString() });
    }

    this._currentInstance = instanceData;

    try {
      // 3.1 克隆仓库
      if (shouldRun('clone')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'clone', substep: 0 } });
        await this.cloneRepository(inputs.installDir, instanceId, inputs.channel);
      }

      // 3.2 创建虚拟环境
      if (shouldRun('venv')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'venv', substep: 0 } });
        // 尝试获取之前检测到的 python 命令
        const pythonCmd = inputs.pythonCmd || 'python';
        await this.createVenv(neoMofoxDir, pythonCmd);
      }

      // 3.3 安装依赖
      if (shouldRun('deps')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'deps', substep: 0 } });
        await this.installDependencies(neoMofoxDir);
      }

      // 3.4 生成配置文件
      if (shouldRun('gen-config')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'gen-config', substep: 0 } });
        await this.generateConfig(neoMofoxDir);
      }

      // 3.5 写入 core.toml
      if (shouldRun('write-core')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'write-core', substep: 0 } });
        await this.writeCoreToml(neoMofoxDir, inputs.ownerQQNumber);
      }

      // 3.6 写入 model.toml
      if (shouldRun('write-model')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'write-model', substep: 0 } });
        await this.writeModelToml(neoMofoxDir, inputs.apiKey);
      }

      // 3.7 安装 NapCat
      if (shouldRun('napcat')) {
        // 首次定义 napcatDir（只在需要时）
        if (!napcatDir) {
          napcatDir = path.join(inputs.installDir, instanceId, 'napcat');
        }
        storageService.updateInstance(instanceId, { installProgress: { step: 'napcat', substep: 0 } });
        const napResult = await this.installNapCat(inputs.installDir, instanceId);
        napcatShellPath = napResult.shellPath || null;
        napcatVersion = napResult.version || null; // 保存版本号
      }

      // 3.8 写入 NapCat 配置
      if (shouldRun('napcat-config')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'napcat-config', substep: 0 } });
        // 确保 napcatDir 已定义（续装场景）
        if (!napcatDir) {
          napcatDir = path.join(inputs.installDir, instanceId, 'napcat');
        }
        // Resume 时 napcat 步骤已跳过，从磁盘重新查找 Shell 目录
        if (!napcatShellPath) {
          napcatShellPath = this._getNapCatShellPath(napcatDir);
        }
        const configTarget = napcatShellPath || napcatDir;
        await this.writeNapCatConfig(configTarget, inputs.qqNumber, inputs.wsPort);
      }

      // 3.9 & 3.10 注册实例
      storageService.updateInstance(instanceId, { installProgress: { step: 'register', substep: 0 } });
      const result = await this.registerInstance(inputs, neoMofoxDir, napcatDir, configuredSteps, napcatVersion);

      this._emitProgress('complete', 100, '安装完成！');
      return result;

    } catch (e) {
      this._emitProgress('error', 0, e.message, e);
      // 不覆盖 installProgress，保留正在执行的步骤名，以便下次精确续装
      throw e;
    }
  }

  /**
   * 检查是否需要显示安装向导
   */
  shouldShowWizard() {
    // 1. 没有任何实例
    if (!storageService.hasInstances()) {
      return { show: true, reason: 'no-instances' };
    }

    // 2. 存在未完成安装的实例
    const incomplete = storageService.getIncompleteInstances();
    if (incomplete.length > 0) {
      return { show: true, reason: 'incomplete', instances: incomplete };
    }

    return { show: false };
  }

  /**
   * 清理失败的安装
   * 只删除安装过程中创建的 neo-mofox 和 napcat 文件夹，保留父目录和其他文件
   */
  async cleanupFailedInstall(instanceId) {
    const instance = storageService.getInstance(instanceId);
    if (!instance) return { success: false, error: '实例不存在' };

    // 只删除安装的特定目录（neo-mofox 和 napcat），不删除父目录
    const dirsToRemove = [];
    
    if (instance.neomofoxDir && fs.existsSync(instance.neomofoxDir)) {
      dirsToRemove.push({ path: instance.neomofoxDir, name: 'neo-mofox' });
    }
    
    if (instance.napcatDir && fs.existsSync(instance.napcatDir)) {
      dirsToRemove.push({ path: instance.napcatDir, name: 'napcat' });
    }

    // 删除特定目录
    for (const dir of dirsToRemove) {
      try {
        fs.rmSync(dir.path, { recursive: true, force: true });
        console.log(`[Cleanup] 已删除: ${dir.name}`);
      } catch (err) {
        console.warn(`[Cleanup] 删除 ${dir.name} 失败:`, err.message);
      }
    }

    // 不删除父目录，即使为空（用户可能在该目录下有其他文件）
    // 这样可以避免误删用户的其他数据

    // 删除实例记录
    storageService.deleteInstance(instanceId);

    return { success: true };
  }
}

// ─── 导出单例 ────────────────────────────────────────────────────────────

const installWizardService = new InstallWizardService();

module.exports = { installWizardService, InstallWizardService };
