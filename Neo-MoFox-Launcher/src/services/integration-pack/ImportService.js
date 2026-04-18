/**
 * ImportService - 整合包导入服务
 * 负责解压整合包、验证、配置生成、条件安装等
 * 
 * 依赖：需要安装 adm-zip 库
 * npm install adm-zip
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const TOML = require('@iarna/toml');
const { storageService } = require('../install/StorageService');
const { installStepExecutor } = require('../install/InstallStepExecutor');
const { PackValidator } = require('./PackValidator');
const { ManifestManager, MANIFEST_FILENAME } = require('./ManifestManager');

// ─── 常量定义 ───────────────────────────────────────────────────────────

const TEMP_EXTRACT_DIR = 'integration-pack-temp';

// ─── ImportService 类 ──────────────────────────────────────────────────

/**
 * 导入服务类
 */
class ImportService {
  constructor() {
    this._progressCallback = null;
    this._outputCallback = null;
    this._stepChangeCallback = null;
    this._tempDir = null;
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
   * 设置步骤变化回调
   */
  setStepChangeCallback(callback) {
    this._stepChangeCallback = callback;
  }

  /**
   * 导入整合包
   * @param {string} packPath - 整合包文件路径
   * @param {Object} userInputs - 用户输入参数
   * @param {string} userInputs.instanceName - 实例名称
   * @param {string} userInputs.qqNumber - Bot QQ 号
   * @param {string} userInputs.qqNickname - Bot 昵称
   * @param {string} userInputs.ownerQQNumber - 管理员 QQ 号
   * @param {string} userInputs.apiKey - SiliconFlow API Key
   * @param {string} [userInputs.webuiApiKey] - WebUI API 密钥（可选，留空自动生成）
   * @param {number} userInputs.wsPort - WebSocket 端口
   * @param {string} userInputs.installDir - 安装路径
   * @param {string} [userInputs.pythonCmd='python'] - Python 命令
   * @returns {Promise<Object>} { success: boolean, instanceId?: string, error?: string }
   */
  async importIntegrationPack(packPath, userInputs) {
    let instanceId = null;

    try {
      // 1. 验证整合包
      this._emitProgress(0, '验证整合包...');
      this._emitOutput('开始验证整合包');
      this._emitStepChange('validate', 'running');

      const validation = await PackValidator.validatePack(packPath);
      if (!validation.valid) {
        this._emitStepChange('validate', 'failed');
        throw new Error(`整合包验证失败:\n${validation.errors.join('\n')}`);
      }

      const manifest = validation.manifest;
      this._emitOutput(`整合包验证通过: ${manifest.packName} v${manifest.packVersion}`);
      this._emitStepChange('validate', 'completed');

      // 2. 解压整合包
      this._emitProgress(5, '解压整合包...');
      this._emitOutput('开始解压整合包');
      this._emitStepChange('extract-pack', 'running');

      const tempDir = await this._extractPack(packPath);
      this._tempDir = tempDir;
      this._emitOutput(`整合包已解压到: ${tempDir}`);
      this._emitStepChange('extract-pack', 'completed');

      // 3. 生成实例 ID
      instanceId = `instance_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const neoMofoxDir = path.join(userInputs.installDir, instanceId, 'neo-mofox');

      // 4. 处理配置文件（如果整合包包含配置）
      if (manifest.content.config.included) {
        this._emitProgress(10, '处理配置文件...');
        this._emitOutput('开始处理配置文件');
        this._emitStepChange('process-config', 'running');

        await this._processConfigFiles(tempDir, neoMofoxDir, userInputs);
        this._emitOutput('配置文件处理完成');
        this._emitStepChange('process-config', 'completed');
      }

      // 5. 复制已包含的文件（Neo-MoFox、NapCat、插件、数据）
      this._emitProgress(15, '复制文件...');
      this._emitOutput('开始复制整合包文件');
      await this._copyIncludedFiles(tempDir, userInputs.installDir, instanceId, manifest);
      this._emitOutput('文件复制完成');

      // 6. 确定需要执行的安装步骤
      const installSteps = this._determineInstallSteps(manifest, userInputs);
      this._emitOutput(`安装步骤: ${installSteps.join(', ')}`);

      // 7. 创建实例记录
      const instanceData = {
        id: instanceId,
        name: userInputs.instanceName,
        neomofoxDir: neoMofoxDir,
        napcatDir: path.join(userInputs.installDir, instanceId, 'napcat'),
        webuiDir: null,
        qqNumber: userInputs.qqNumber,
        wsPort: userInputs.wsPort,
        installCompleted: false,
        installProgress: { step: 'prepare', substep: 0 },
        installSteps: installSteps,
        fromIntegrationPack: true,
        integrationPackInfo: {
          packName: manifest.packName,
          packVersion: manifest.packVersion,
          author: manifest.author,
          importedAt: new Date().toISOString(),
        },
        extra: {
          displayName: userInputs.instanceName,
          description: manifest.description || '',
          isLike: false,
        },
      };

      storageService.addInstance({ ...instanceData, createdAt: new Date().toISOString() });
      this._emitOutput(`实例已注册: ${instanceId}`);

      // 8. 执行安装步骤
      await this._executeInstallSteps(installSteps, instanceId, instanceData, userInputs, manifest);

      // 9. 标记安装完成
      storageService.updateInstance(instanceId, { installCompleted: true });
      this._emitProgress(100, '导入完成');
      this._emitOutput('整合包导入成功！');

      // 10. 清理临时目录
      await this._cleanup();

      return { success: true, instanceId };
    } catch (error) {
      console.error('[ImportService] 导入失败:', error);
      this._emitOutput(`导入失败: ${error.message}`);

      // 清理临时目录
      await this._cleanup();

      // 如果实例已创建，标记为失败
      if (instanceId) {
        storageService.updateInstance(instanceId, { installCompleted: false });
      }

      return { success: false, error: error.message };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 私有方法
  // ───────────────────────────────────────────────────────────────────────

  /**
   * 解压整合包到临时目录
   */
  async _extractPack(packPath) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(packPath);

    const tempDirBase = path.join(os.tmpdir(), TEMP_EXTRACT_DIR);
    await fsPromises.mkdir(tempDirBase, { recursive: true });

    const tempDir = path.join(tempDirBase, `extract_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    await fsPromises.mkdir(tempDir, { recursive: true });

    // 解压所有文件
    zip.extractAllTo(tempDir, true);

    return tempDir;
  }

  /**
   * 处理配置文件（占位符替换）
   */
  async _processConfigFiles(tempDir, neoMofoxDir, userInputs) {
    const configSourcePath = path.join(tempDir, 'extra', 'config', 'core.toml');
    const configDestDir = path.join(neoMofoxDir, 'config');
    const configDestPath = path.join(configDestDir, 'core.toml');

    // 检查源配置文件是否存在
    try {
      await fsPromises.access(configSourcePath, fs.constants.F_OK);
    } catch (err) {
      throw new Error('整合包中未找到 config/core.toml 文件');
    }

    // 读取配置文件
    const configContent = await fsPromises.readFile(configSourcePath, 'utf8');
    let config;
    try {
      config = TOML.parse(configContent);
    } catch (parseErr) {
      throw new Error(`解析 core.toml 失败: ${parseErr.message}`);
    }

    // 替换占位符
    // 1. 替换管理员 QQ 号（permission.master_users）
    if (config.permission && config.permission.master_users) {
      const platformKey = Object.keys(config.permission.master_users).find(k => k === 'qq');
      if (platformKey) {
        config.permission.master_users[platformKey] = [userInputs.ownerQQNumber];
      } else {
        config.permission.master_users.qq = [userInputs.ownerQQNumber];
      }
    }

    // 2. 替换 WebUI API 密钥（http_router.api_keys）
    const webuiKey = userInputs.webuiApiKey || uuidv4();
    if (config.http_router && config.http_router.api_keys) {
      config.http_router.api_keys = [webuiKey];
    }

    // 写入处理后的配置文件
    await fsPromises.mkdir(configDestDir, { recursive: true });
    const modifiedConfigContent = TOML.stringify(config);
    await fsPromises.writeFile(configDestPath, modifiedConfigContent, 'utf8');

    this._emitOutput(`配置文件已处理并保存到: ${configDestPath}`);
  }

  /**
   * 复制已包含的文件（Neo-MoFox、NapCat、插件、数据）
   */
  async _copyIncludedFiles(tempDir, installDir, instanceId, manifest) {
    const instanceRoot = path.join(installDir, instanceId);

    // 1. 复制 Neo-MoFox 主程序
    if (manifest.content.neoMofox.included) {
      this._emitOutput('复制 Neo-MoFox 主程序...');
      const srcPath = path.join(tempDir, 'neo-mofox');
      const destPath = path.join(instanceRoot, 'neo-mofox');
      await this._copyDirRecursive(srcPath, destPath);
      this._emitOutput('Neo-MoFox 主程序复制完成');
    }

    // 2. 复制 NapCat
    if (manifest.content.napcat.included) {
      this._emitOutput('复制 NapCat...');
      const srcPath = path.join(tempDir, 'napcat');
      const destPath = path.join(instanceRoot, 'napcat');
      await this._copyDirRecursive(srcPath, destPath);
      this._emitOutput('NapCat 复制完成');
    }

    // 3. 复制插件
    if (manifest.content.plugins.included) {
      this._emitOutput('复制插件...');
      const srcPath = path.join(tempDir, 'extra', 'plugins');
      const destPath = path.join(instanceRoot, 'neo-mofox', 'plugins');
      await fsPromises.mkdir(destPath, { recursive: true });
      await this._copyDirRecursive(srcPath, destPath);
      this._emitOutput('插件复制完成');
    }

    // 4. 复制插件配置
    if (manifest.content.pluginConfigs && manifest.content.pluginConfigs.included) {
      this._emitOutput('复制插件配置...');
      const srcPath = path.join(tempDir, 'extra', 'plugin_configs');
      const destPath = path.join(instanceRoot, 'neo-mofox', 'config', 'plugins');
      await fsPromises.mkdir(destPath, { recursive: true });
      await this._copyDirRecursive(srcPath, destPath);
      this._emitOutput('插件配置复制完成');
    }

    // 5. 复制数据文件
    if (manifest.content.data.included) {
      this._emitOutput('复制数据文件...');
      const srcPath = path.join(tempDir, 'extra', 'data');
      const destPath = path.join(instanceRoot, 'neo-mofox', 'data');
      await fsPromises.mkdir(destPath, { recursive: true });
      await this._copyDirRecursive(srcPath, destPath);
      this._emitOutput('数据文件复制完成');
    }
  }

  /**
   * 递归复制目录（异步版本）
   */
  async _copyDirRecursive(src, dest) {
    try {
      await fsPromises.access(src, fs.constants.F_OK);
    } catch (err) {
      this._emitOutput(`警告: 源目录不存在，跳过 ${src}`);
      return;
    }

    await fsPromises.mkdir(dest, { recursive: true });

    const entries = await fsPromises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this._copyDirRecursive(srcPath, destPath);
      } else {
        await fsPromises.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * 确定需要执行的安装步骤
   */
  _determineInstallSteps(manifest, userInputs) {
    const steps = [];

    // 如果不包含 Neo-MoFox 主程序，需要克隆
    if (!manifest.content.neoMofox.included) {
      steps.push('clone');
    }

    // 虚拟环境和依赖（始终需要）
    steps.push('venv', 'deps');

    // 配置文件生成（首次启动，生成 model.toml）
    steps.push('gen-config');

    // 如果整合包未包含配置文件，需要写入 core.toml
    if (!manifest.content.config.included) {
      steps.push('write-core');
    }

    // 写入 model.toml（用户的 API Key）
    steps.push('write-model');

    // 如果整合包未包含配置文件，需要写入 WebUI 密钥
    if (!manifest.content.config.included) {
      steps.push('write-webui-key');
    }

    // 写入适配器配置
    steps.push('write-adapter');

    // NapCat 处理
    if (!manifest.content.napcat.included) {
      // 未包含 NapCat，检查是否需要导入时安装
      if (manifest.content.napcat.installOnImport) {
        steps.push('napcat');
      }
    }

    // NapCat 配置（如果包含 NapCat 或需要安装）
    if (manifest.content.napcat.included || manifest.content.napcat.installOnImport) {
      steps.push('napcat-config');
    }

    // WebUI（可选，暂不包含在整合包流程中）
    // steps.push('webui');

    // 注册实例（始终需要）
    steps.push('register');

    return steps;
  }

  /**
   * 执行安装步骤
   */
  async _executeInstallSteps(installSteps, instanceId, instanceData, userInputs, manifest) {
    const neoMofoxDir = instanceData.neomofoxDir;
    const napcatDir = instanceData.napcatDir;

    // 创建执行上下文
    const context = {
      emitProgress: this._emitProgress.bind(this),
      emitOutput: this._emitOutput.bind(this),
    };

    // 准备步骤输入参数
    const stepInputs = {
      ...userInputs,
      neoMofoxDir,
      napcatDir,
      qqNumber: userInputs.qqNumber,
      qqNickname: userInputs.qqNickname || '',
      ownerQQNumber: userInputs.ownerQQNumber,
      apiKey: userInputs.apiKey,
      webuiApiKey: userInputs.webuiApiKey || uuidv4(),
      wsPort: userInputs.wsPort,
      channel: 'main',
      instanceName: userInputs.instanceName,
    };

    let napcatShellPath = null;
    let napcatVersion = null;

    // 执行每个步骤
    for (const step of installSteps) {
      this._emitStepChange(step, 'running');
      storageService.updateInstance(instanceId, { installProgress: { step, substep: 0 } });

      try {
        switch (step) {
          case 'clone':
            await installStepExecutor.executeStep('clone', context, stepInputs);
            break;

          case 'venv':
            const pythonCmd = userInputs.pythonCmd || 'python';
            await installStepExecutor.executeStep('venv', context, stepInputs, { pythonCmd });
            break;

          case 'deps':
            await installStepExecutor.executeStep('deps', context, stepInputs);
            break;

          case 'gen-config':
            await installStepExecutor.executeStep('gen-config', context, stepInputs);
            break;

          case 'write-core':
            await installStepExecutor.executeStep('write-core', context, stepInputs);
            break;

          case 'write-model':
            await installStepExecutor.executeStep('write-model', context, stepInputs);
            break;

          case 'write-webui-key':
            await installStepExecutor.executeStep('write-webui-key', context, stepInputs);
            break;

          case 'write-adapter':
            await installStepExecutor.executeStep('write-adapter', context, stepInputs);
            break;

          case 'napcat':
            const napResult = await installStepExecutor.executeStep('napcat', context, stepInputs);
            napcatShellPath = napResult.shellPath || null;
            napcatVersion = napResult.version || null;
            break;

          case 'napcat-config':
            const configTarget = napcatShellPath ? path.dirname(napcatShellPath) : napcatDir;
            await installStepExecutor.executeStep('napcat-config', context, stepInputs, { shellDir: configTarget });
            break;

          case 'webui':
            await installStepExecutor.executeStep('webui', context, stepInputs);
            break;

          case 'register':
            const result = await installStepExecutor.executeStep('register', context, stepInputs, {
              instanceId,
              neoMofoxDir,
              napcatDir,
              napcatShellPath,
              napcatVersion,
            });
            break;

          default:
            this._emitOutput(`未知步骤: ${step}`);
        }

        this._emitStepChange(step, 'completed');
      } catch (error) {
        this._emitStepChange(step, 'failed');
        throw error;
      }
    }
  }

  /**
   * 清理临时目录
   */
  async _cleanup() {
    if (this._tempDir) {
      try {
        await this._removeDir(this._tempDir);
        this._emitOutput('临时目录已清理');
      } catch (cleanupErr) {
        console.error('[ImportService] 清理临时目录失败:', cleanupErr);
        this._emitOutput(`警告: 清理临时目录失败 - ${cleanupErr.message}`);
      }
    }
  }

  /**
   * 递归删除目录
   */
  async _removeDir(dir) {
    try {
      await fsPromises.access(dir, fs.constants.F_OK);
    } catch (err) {
      return; // 目录不存在，无需删除
    }

    // 使用 Node.js 14.14+ 的 fs.rm API
    if (fsPromises.rm) {
      await fsPromises.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    }

    // 手动递归删除
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this._removeDir(fullPath);
      } else {
        await fsPromises.unlink(fullPath);
      }
    }

    await fsPromises.rmdir(dir);
  }

  /**
   * 发送进度事件
   */
  _emitProgress(percent, message) {
    console.log(`[ImportService] ${percent}% - ${message}`);
    if (this._progressCallback) {
      this._progressCallback({ percent, message });
    }
  }

  /**
   * 发送输出日志
   */
  _emitOutput(message) {
    console.log(`[ImportService] ${message}`);
    if (this._outputCallback) {
      this._outputCallback(message);
    }
  }

  /**
   * 发送步骤变化事件
   */
  _emitStepChange(step, status) {
    console.log(`[ImportService] 步骤变化: ${step} -> ${status}`);
    if (this._stepChangeCallback) {
      this._stepChangeCallback({ step, status });
    }
  }
}

// ─── 导出单例 ─────────────────────────────────────────────────────────

const importService = new ImportService();

module.exports = { importService, ImportService };
