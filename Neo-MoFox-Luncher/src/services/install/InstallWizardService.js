/**
 * InstallWizardService - 安装向导服务
 * 首次运行时，弹出信息收集流程，将用户输入写入 Neo-MoFox 的 TOML 配置文件
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { storageService } = require('./StorageService');

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

// ─── InstallWizardService 类 ──────────────────────────────────────────

class InstallWizardService {
  constructor() {
    this._progressCallback = null;
    this._currentInstance = null;
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
    console.log(`[InstallWizard] ${step}: ${percent}% - ${message}`);
    if (this._progressCallback) {
      this._progressCallback(progress);
    }
    return progress;
  }

  // ─── Phase 1: 环境预检 ─────────────────────────────────────────────────

  /**
   * 检查命令是否可用
   */
  async _checkCommand(command, args = ['--version']) {
    return new Promise((resolve) => {
      const proc = spawn(command, args, { shell: true, timeout: 10000 });
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
   * 检查 Python 版本
   */
  async checkPython() {
    const result = await this._checkCommand('python', ['--version']);
    if (result.installed && result.version) {
      const [major, minor] = result.version.split('.').map(Number);
      result.valid = major >= 3 && minor >= 11;
      result.requirement = '>= 3.11';
    } else {
      result.valid = false;
      result.requirement = '>= 3.11';
    }
    return result;
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
  validateQQNumber(qq) {
    if (!qq || !/^\d{5,12}$/.test(qq)) {
      return { valid: false, error: 'QQ 号应为 5-12 位纯数字' };
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
  validateInstallDir(installDir) {
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
   * 校验所有必填字段
   */
  async validateInputs(inputs) {
    const errors = [];

    const nameResult = this.validateInstanceName(inputs.instanceName);
    if (!nameResult.valid) errors.push({ field: 'instanceName', error: nameResult.error });

    const qqResult = this.validateQQNumber(inputs.qqNumber);
    if (!qqResult.valid) errors.push({ field: 'qqNumber', error: qqResult.error });

    const ownerResult = this.validateQQNumber(inputs.ownerQQNumber);
    if (!ownerResult.valid) errors.push({ field: 'ownerQQNumber', error: ownerResult.error });

    const apiKeyResult = this.validateApiKey(inputs.apiKey);
    if (!apiKeyResult.valid) errors.push({ field: 'apiKey', error: apiKeyResult.error });

    const portResult = this.validatePort(inputs.wsPort);
    if (!portResult.valid) errors.push({ field: 'wsPort', error: portResult.error });

    const dirResult = this.validateInstallDir(inputs.installDir);
    if (!dirResult.valid) errors.push({ field: 'installDir', error: dirResult.error });

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
      const proc = spawn(command, args, {
        shell: true,
        ...options,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
        if (options.onStdout) options.onStdout(d.toString());
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
        if (options.onStderr) options.onStderr(d.toString());
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
   * 3.1 克隆 Neo-MoFox 仓库
   */
  async cloneRepository(installDir, instanceId, channel, onProgress) {
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
          onStdout: (data) => onProgress && onProgress(data),
          onStderr: (data) => onProgress && onProgress(data),
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
  async createVenv(neoMofoxDir) {
    this._emitProgress('venv', 0, '正在创建虚拟环境...');
    
    await this._execCommand('uv', ['venv'], {
      cwd: neoMofoxDir,
    });

    this._emitProgress('venv', 100, '虚拟环境创建完成');
    return { success: true };
  }

  /**
   * 3.3 安装 Python 依赖
   */
  async installDependencies(neoMofoxDir, onProgress) {
    this._emitProgress('deps', 0, '正在安装依赖...');

    await this._execCommand('uv', ['sync'], {
      cwd: neoMofoxDir,
      onStdout: (data) => onProgress && onProgress(data),
      onStderr: (data) => onProgress && onProgress(data),
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

      const proc = spawn('uv', ['run', 'python', 'main.py'], {
        cwd: neoMofoxDir,
        shell: true,
        detached: false,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      let killed = false;
      const checkInterval = setInterval(() => {
        if (fs.existsSync(coreToml) && fs.existsSync(modelToml)) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          if (!killed) {
            killed = true;
            // Windows 下使用 taskkill
            if (process.platform === 'win32') {
              spawn('taskkill', ['/pid', proc.pid, '/f', '/t'], { shell: true });
            } else {
              proc.kill('SIGINT');
            }
            this._emitProgress('gen-config', 100, '配置文件生成完成');
            resolve({ success: true, configDir });
          }
        }
      }, 500);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        if (!killed) {
          killed = true;
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', proc.pid, '/f', '/t'], { shell: true });
          } else {
            proc.kill('SIGINT');
          }
          reject(new Error('生成配置文件超时（60秒）'));
        }
      }, CONFIG_DETECT_TIMEOUT);

      proc.on('error', (err) => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        reject(err);
      });

      proc.on('close', () => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        // 再检查一次配置文件
        if (fs.existsSync(coreToml) && fs.existsSync(modelToml)) {
          this._emitProgress('gen-config', 100, '配置文件生成完成');
          resolve({ success: true, configDir });
        } else if (!killed) {
          reject(new Error('进程退出但配置文件未生成'));
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
      
      // 找到第一个 api_providers 条目并写入 api_key
      if (data.api_providers && data.api_providers.length > 0) {
        data.api_providers[0].api_key = apiKey;
      } else {
        // 如果不存在，创建一个
        data.api_providers = [{ api_key: apiKey }];
      }
      
      storageService.writeToml(modelTomlPath, data);
      
      this._emitProgress('write-model', 100, 'model.toml 写入完成');
      return { success: true };
    } catch (e) {
      throw new Error(`写入 model.toml 失败: ${e.message}`);
    }
  }

  /**
   * 3.7 下载并安装 NapCat（暂时跳过，由用户手动安装）
   */
  async installNapCat(installDir, instanceId, onProgress) {
    this._emitProgress('napcat', 0, 'NapCat 安装暂时跳过，请手动安装...');
    
    const napcatDir = path.join(installDir, instanceId, 'napcat');
    fs.mkdirSync(napcatDir, { recursive: true });
    
    // TODO: 实现 NapCat 自动下载安装
    // 目前仅创建目录，由用户手动安装
    
    this._emitProgress('napcat', 100, 'NapCat 目录已创建');
    return { success: true, path: napcatDir };
  }

  /**
   * 3.8 写入 NapCat 配置
   */
  async writeNapCatConfig(napcatDir, qqNumber, wsPort) {
    this._emitProgress('napcat-config', 0, '正在写入 NapCat 配置...');

    const configDir = path.join(napcatDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    // onebot11 配置
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

    // napcat 配置
    const napcatConfig = {
      fileLog: true,
      consoleLog: true,
      fileLogLevel: 'info',
      consoleLogLevel: 'info',
    };

    fs.writeFileSync(
      path.join(configDir, `onebot11_${qqNumber}.json`),
      JSON.stringify(onebot11Config, null, 2)
    );

    fs.writeFileSync(
      path.join(configDir, `napcat_${qqNumber}.json`),
      JSON.stringify(napcatConfig, null, 2)
    );

    this._emitProgress('napcat-config', 100, 'NapCat 配置写入完成');
    return { success: true };
  }

  /**
   * 3.9 & 3.10 注册实例并标记完成
   */
  async registerInstance(inputs, neoMofoxDir, napcatDir) {
    this._emitProgress('register', 0, '正在注册实例...');

    const instanceId = this._generateInstanceId(inputs.qqNumber);
    const now = new Date().toISOString();

    const instance = {
      id: instanceId,
      displayName: inputs.instanceName,
      qqNumber: inputs.qqNumber,
      channel: inputs.channel || 'main',
      enabled: true,
      neomofoxDir: neoMofoxDir,
      napcatDir: napcatDir,
      wsPort: parseInt(inputs.wsPort, 10),
      createdAt: now,
      lastStartedAt: null,
      napcatVersion: null,
      neomofoxVersion: null,
      installCompleted: true,
      installProgress: null,
    };

    storageService.addInstance(instance);

    this._emitProgress('register', 100, '实例注册完成');
    return { success: true, instance };
  }

  /**
   * 执行完整安装流程
   */
  async runInstall(inputs, onProgress) {
    const instanceId = this._generateInstanceId(inputs.qqNumber);
    const neoMofoxDir = path.join(inputs.installDir, instanceId, 'neo-mofox');
    const napcatDir = path.join(inputs.installDir, instanceId, 'napcat');

    // 创建临时实例记录（用于断点续装）
    const incompleteInstance = {
      id: instanceId,
      displayName: inputs.instanceName,
      qqNumber: inputs.qqNumber,
      channel: inputs.channel || 'main',
      enabled: false,
      neomofoxDir: neoMofoxDir,
      napcatDir: napcatDir,
      wsPort: parseInt(inputs.wsPort, 10),
      createdAt: new Date().toISOString(),
      installCompleted: false,
      installProgress: { step: 'clone', substep: 0 },
    };

    // 检查是否已存在相同 ID 的实例
    const existing = storageService.getInstance(instanceId);
    if (existing) {
      if (existing.installCompleted) {
        throw new Error(`实例 ${instanceId} 已存在且安装完成`);
      }
      // 断点续装
      storageService.updateInstance(instanceId, incompleteInstance);
    } else {
      storageService.addInstance(incompleteInstance);
    }

    this._currentInstance = incompleteInstance;

    try {
      // 3.1 克隆仓库
      await this.cloneRepository(inputs.installDir, instanceId, inputs.channel, onProgress);
      storageService.updateInstance(instanceId, { installProgress: { step: 'venv', substep: 0 } });

      // 3.2 创建虚拟环境
      await this.createVenv(neoMofoxDir);
      storageService.updateInstance(instanceId, { installProgress: { step: 'deps', substep: 0 } });

      // 3.3 安装依赖
      await this.installDependencies(neoMofoxDir, onProgress);
      storageService.updateInstance(instanceId, { installProgress: { step: 'gen-config', substep: 0 } });

      // 3.4 生成配置文件
      await this.generateConfig(neoMofoxDir);
      storageService.updateInstance(instanceId, { installProgress: { step: 'write-core', substep: 0 } });

      // 3.5 写入 core.toml
      await this.writeCoreToml(neoMofoxDir, inputs.ownerQQNumber);
      storageService.updateInstance(instanceId, { installProgress: { step: 'write-model', substep: 0 } });

      // 3.6 写入 model.toml
      await this.writeModelToml(neoMofoxDir, inputs.apiKey);
      storageService.updateInstance(instanceId, { installProgress: { step: 'napcat', substep: 0 } });

      // 3.7 安装 NapCat
      await this.installNapCat(inputs.installDir, instanceId, onProgress);
      storageService.updateInstance(instanceId, { installProgress: { step: 'napcat-config', substep: 0 } });

      // 3.8 写入 NapCat 配置
      await this.writeNapCatConfig(napcatDir, inputs.qqNumber, inputs.wsPort);
      storageService.updateInstance(instanceId, { installProgress: { step: 'register', substep: 0 } });

      // 3.9 & 3.10 注册实例
      const result = await this.registerInstance(inputs, neoMofoxDir, napcatDir);

      this._emitProgress('complete', 100, '安装完成！');
      return result;

    } catch (e) {
      this._emitProgress('error', 0, e.message, e);
      storageService.updateInstance(instanceId, {
        installProgress: { step: 'error', error: e.message },
      });
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
   */
  async cleanupFailedInstall(instanceId) {
    const instance = storageService.getInstance(instanceId);
    if (!instance) return { success: false, error: '实例不存在' };

    // 删除目录
    const dirs = [instance.neomofoxDir, instance.napcatDir];
    for (const dir of dirs) {
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    // 删除父目录（如果为空）
    const parentDir = path.dirname(instance.neomofoxDir);
    if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
      fs.rmdirSync(parentDir);
    }

    // 删除实例记录
    storageService.deleteInstance(instanceId);

    return { success: true };
  }
}

// ─── 导出单例 ────────────────────────────────────────────────────────────

const installWizardService = new InstallWizardService();

module.exports = { installWizardService, InstallWizardService };
