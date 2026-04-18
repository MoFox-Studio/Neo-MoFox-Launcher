/**
 * InstallWizardService - 安装向导服务
 * 重构后负责流程控制和校验，具体步骤执行由 InstallStepExecutor 完成
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { storageService } = require('./StorageService');
const { platformHelper } = require('../PlatformHelper');
const { installStepExecutor } = require('./InstallStepExecutor');

// ─── 常量定义 ───────────────────────────────────────────────────────────

// 所有可用的安装步骤
const AVAILABLE_STEPS = [
  'clone',         // 克隆 Neo-MoFox 仓库
  'venv',          // 创建 Python 虚拟环境
  'deps',          // 安装 Python 依赖
  'gen-config',    // 生成配置文件
  'write-core',    // 写入 core.toml
  'write-model',   // 写入 model.toml
  'write-webui-key', // 写入 WebUI API 密钥
  'write-adapter', // 写入 napcat_adapter 配置
  'napcat',        // 安装 NapCat
  'napcat-config', // 写入 NapCat 配置
  'webui',         // 安装 WebUI
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
   * 检查端口是否可用（同时检查已有实例配置和系统占用）
   * @param {number} port
   * @param {string|null} [excludeInstanceId] - 续装时排除自己的实例 ID
   */
  async checkPortAvailable(port, excludeInstanceId = null) {
    // 1. 检查是否与已有实例的端口冲突
    const instances = storageService.getInstances();
    const conflicting = instances.find(inst => {
      if (excludeInstanceId && inst.id === excludeInstanceId) return false;
      return inst.wsPort === port;
    });
    if (conflicting) {
      const displayName = conflicting.extra?.displayName || conflicting.qqNumber || 'Unknown';
      return {
        available: false,
        error: `端口 ${port} 已被实例「${displayName}」(${conflicting.id}) 占用，请更换端口`,
      };
    }

    // 2. 检查系统级端口占用
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve({ available: false, error: `端口 ${port} 已被系统中其他程序占用` });
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

    // 校验 QQ 昵称
    if (!inputs.qqNickname || inputs.qqNickname.trim().length === 0) {
      errors.push({ field: 'qqNickname', error: 'Bot QQ 昵称不能为空' });
    }

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

    // 检查端口可用性（同时检查实例配置冲突和系统占用）
    const portAvailable = await this.checkPortAvailable(
      parseInt(inputs.wsPort, 10),
      isResume ? instanceId : null  // 续装时排除自己
    );
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
   * 执行完整安装流程（支持断点续装）
   * 重构后使用 InstallStepExecutor 执行步骤
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
      qqNumber: inputs.qqNumber,
      qqNickname: inputs.qqNickname || '',
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
      extra: {
        displayName: inputs.instanceName,
        description: '',
        isLike: false,
      },
    };

    if (existing) {
      storageService.updateInstance(instanceId, instanceData);
    } else {
      storageService.addInstance({ ...instanceData, createdAt: new Date().toISOString() });
    }

    this._currentInstance = instanceData;

    // 创建执行上下文（提供给步骤执行器）
    const context = {
      emitProgress: this._emitProgress.bind(this),
      emitOutput: this._emitOutput.bind(this),
    };

    // 准备步骤执行的输入参数
    const stepInputs = {
      ...inputs,
      neoMofoxDir,
      installDir: inputs.installDir,
      qqNumber: inputs.qqNumber,
      qqNickname: inputs.qqNickname || '',
      ownerQQNumber: inputs.ownerQQNumber,
      apiKey: inputs.apiKey,
      webuiApiKey: inputs.webuiApiKey,
      wsPort: inputs.wsPort,
      channel: inputs.channel || 'main',
      instanceName: inputs.instanceName,
    };

    try {
      // 使用 InstallStepExecutor 执行步骤
      
      // 3.1 克隆仓库
      if (shouldRun('clone')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'clone', substep: 0 } });
        await installStepExecutor.executeStep('clone', context, stepInputs);
      }

      // 3.2 创建虚拟环境
      if (shouldRun('venv')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'venv', substep: 0 } });
        const pythonCmd = inputs.pythonCmd || 'python';
        await installStepExecutor.executeStep('venv', context, stepInputs, { pythonCmd });
      }

      // 3.3 安装依赖
      if (shouldRun('deps')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'deps', substep: 0 } });
        await installStepExecutor.executeStep('deps', context, stepInputs);
      }

      // 3.4 生成配置文件
      if (shouldRun('gen-config')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'gen-config', substep: 0 } });
        await installStepExecutor.executeStep('gen-config', context, stepInputs);
      }

      // 3.5 写入 core.toml
      if (shouldRun('write-core')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'write-core', substep: 0 } });
        await installStepExecutor.executeStep('write-core', context, stepInputs);
      }

      // 3.6 写入 model.toml
      if (shouldRun('write-model')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'write-model', substep: 0 } });
        await installStepExecutor.executeStep('write-model', context, stepInputs);
      }

      // 3.6.1 写入 WebUI API 密钥
      if (shouldRun('write-webui-key')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'write-webui-key', substep: 0 } });
        await installStepExecutor.executeStep('write-webui-key', context, stepInputs);
      }

      // 3.6.2 写入适配器配置 (napcat_adapter/config.toml)
      if (shouldRun('write-adapter')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'write-adapter', substep: 0 } });
        await installStepExecutor.executeStep('write-adapter', context, stepInputs);
      }

      // 3.7 安装 NapCat
      if (shouldRun('napcat')) {
        if (!napcatDir) {
          napcatDir = path.join(inputs.installDir, instanceId, 'napcat');
        }
        storageService.updateInstance(instanceId, { installProgress: { step: 'napcat', substep: 0 } });
        const napResult = await installStepExecutor.executeStep('napcat', context, stepInputs);
        napcatShellPath = napResult.shellPath || null;
        napcatVersion = napResult.version || null;
        if (napResult.path) napcatDir = napResult.path;
      }

      // 3.8 写入 NapCat 配置
      if (shouldRun('napcat-config')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'napcat-config', substep: 0 } });
        if (!napcatDir) {
          napcatDir = path.join(inputs.installDir, instanceId, 'napcat');
        }
        // Resume 时从磁盘重新查找 Shell 目录
        if (!napcatShellPath) {
          napcatShellPath = installStepExecutor._getNapCatShellPath(napcatDir);
        }
        const configTarget = napcatShellPath || napcatDir;
        await installStepExecutor.executeStep('napcat-config', context, stepInputs, { shellDir: configTarget });
      }

      // 3.9 安装 WebUI
      if (shouldRun('webui')) {
        storageService.updateInstance(instanceId, { installProgress: { step: 'webui', substep: 0 } });
        await installStepExecutor.executeStep('webui', context, stepInputs);
      }

      // 3.10 注册实例
      storageService.updateInstance(instanceId, { installProgress: { step: 'register', substep: 0 } });
      const result = await installStepExecutor.executeStep('register', context, stepInputs, {
        neoMofoxDir,
        napcatDir,
        installSteps: configuredSteps,
        napcatVersion,
      });

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
