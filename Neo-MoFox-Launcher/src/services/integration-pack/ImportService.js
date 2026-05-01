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
const crypto = require('crypto');
const TOML = require('@iarna/toml');
const { platformHelper } = require('../PlatformHelper');
const { storageService } = require('../install/StorageService');
const { installStepExecutor } = require('../install/InstallStepExecutor');
const { PackValidator } = require('./PackValidator');
const { ManifestManager, MANIFEST_FILENAME } = require('./ManifestManager');

// ─── 工具函数 ───────────────────────────────────────────────────────────

/**
 * 生成 UUID v4
 */
function uuidv4() {
  return crypto.randomUUID();
}

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
    let instanceRegistered = false;

    try {
      // 验证输入参数
      this._validateInputs(packPath, userInputs);

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
      if (!tempDir) {
        throw new Error('解压整合包失败：临时目录路径为空');
      }
      this._tempDir = tempDir;
      this._emitOutput(`整合包已解压到: ${tempDir}`);
      this._emitStepChange('extract-pack', 'completed');

      // 3. 生成实例 ID
      instanceId = `instance_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      if (!userInputs.installDir) {
        throw new Error('安装目录 (installDir) 未设置');
      }
      const neoMofoxDir = path.join(userInputs.installDir, instanceId, 'neo-mofox');
      this._emitOutput(`实例 ID: ${instanceId}`);
      this._emitOutput(`Neo-MoFox 目录: ${neoMofoxDir}`);

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
      instanceRegistered = true;
      this._emitOutput(`实例已注册: ${instanceId}`);

      // 8. 执行安装步骤
      await this._executeInstallSteps(installSteps, instanceId, instanceData, userInputs, manifest);

      // 9. 标记安装完成
      storageService.updateInstance(instanceId, { installCompleted: true });
      this._emitProgress(100, '导入完成');
      this._emitOutput('整合包导入成功！');

      // 10. 清理临时目录（后台执行，不等待）
      this._cleanup();

      return { success: true, instanceId };
    } catch (error) {
      console.error('[ImportService] 导入失败:', error);
      this._emitOutput(`导入失败: ${error.message}`);

      // 清理临时目录（后台执行，不等待）
      this._cleanup();

      // 清理失败的实例
      if (instanceId) {
        if (instanceRegistered) {
          // 如果实例已注册，使用实例管理器删除（会删除目录+记录）
          try {
            this._emitOutput(`正在清理已注册的失败实例: ${instanceId}`);
            storageService.deleteInstance(instanceId);
            this._emitOutput(`实例已删除: ${instanceId}`);
          } catch (deleteError) {
            console.error('[ImportService] 删除失败实例时出错:', deleteError);
            this._emitOutput(`警告: 删除实例失败，请手动清理: ${deleteError.message}`);
          }
        } else if (userInputs.installDir) {
          // 如果实例未注册，手动删除实例目录（仅删除目录）
          try {
            // 安全检查：确保 instanceId 格式正确
            if (instanceId.startsWith('instance_')) {
              const instanceRootDir = path.join(userInputs.installDir, instanceId);
              
              // 检查目录是否存在
              if (fs.existsSync(instanceRootDir)) {
                this._emitOutput(`正在删除未注册的失败实例目录: ${instanceRootDir}`);
                
                // 同步删除目录（使用 force 和 recursive 选项）
                fs.rmSync(instanceRootDir, { recursive: true, force: true });
                this._emitOutput(`实例目录已删除: ${instanceId}`);
              } else {
                this._emitOutput(`实例目录不存在，无需删除: ${instanceRootDir}`);
              }
            } else {
              console.warn('[ImportService] instanceId 格式异常，跳过目录删除:', instanceId);
              this._emitOutput(`警告: 实例 ID 格式异常，请手动检查: ${instanceId}`);
            }
          } catch (deleteError) {
            console.error('[ImportService] 删除实例目录时出错:', deleteError);
            this._emitOutput(`警告: 删除实例目录失败，请手动清理: ${deleteError.message}`);
          }
        }
      }

      return { success: false, error: error.message };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 私有方法
  // ───────────────────────────────────────────────────────────────────────

  /**
   * 验证输入参数
   */
  _validateInputs(packPath, userInputs) {
    if (!packPath) {
      throw new Error('整合包路径 (packPath) 不能为空');
    }
    if (!userInputs) {
      throw new Error('用户输入参数 (userInputs) 不能为空');
    }

    const requiredFields = [
      'instanceName',
      'qqNumber',
      'ownerQQNumber',
      'apiKey',
      'wsPort',
      'installDir'
    ];

    const missingFields = requiredFields.filter(field => !userInputs[field]);
    if (missingFields.length > 0) {
      throw new Error(`缺少必需参数: ${missingFields.join(', ')}`);
    }

    this._emitOutput(`参数验证通过`);
    this._emitOutput(`- 实例名称: ${userInputs.instanceName}`);
    this._emitOutput(`- QQ 号: ${userInputs.qqNumber}`);
    this._emitOutput(`- 管理员 QQ: ${userInputs.ownerQQNumber}`);
    this._emitOutput(`- 端口: ${userInputs.wsPort}`);
    this._emitOutput(`- 安装目录: ${userInputs.installDir}`);
  }

  /**
   * 解压整合包到临时目录
   */
  async _extractPack(packPath) {
    // 禁用 Electron 的 asar 拦截，避免将 .asar 文件作为目录处理
    const originalNoAsar = process.noAsar;
    process.noAsar = true;

    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(packPath);

      const tempDirBase = path.join(os.tmpdir(), TEMP_EXTRACT_DIR);
      await fsPromises.mkdir(tempDirBase, { recursive: true });

      const tempDir = path.join(tempDirBase, `extract_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
      await fsPromises.mkdir(tempDir, { recursive: true });

      // 解压所有文件，特殊处理 .asar 文件
      this._emitOutput(`开始解压到: ${tempDir}`);
      const entries = zip.getEntries();
      let extractedCount = 0;
      
      for (const entry of entries) {
        const entryPath = path.join(tempDir, entry.entryName);
        
        // 跳过目录条目，它们会在创建文件时自动创建
        if (entry.isDirectory) {
          await fsPromises.mkdir(entryPath, { recursive: true });
          continue;
        }
        
        // 创建目标目录
        const entryDir = path.dirname(entryPath);
        await fsPromises.mkdir(entryDir, { recursive: true });
        
        // 特殊处理 .asar 文件：直接写入二进制数据，不尝试解压
        if (entry.entryName.endsWith('.asar')) {
          const asarData = entry.getData();
          await fsPromises.writeFile(entryPath, asarData);
          extractedCount++;
          continue;
        }
        
        // 普通文件正常解压
        try {
          zip.extractEntryTo(entry, entryDir, false, true);
          extractedCount++;
        } catch (extractErr) {
          // 如果解压失败，尝试直接写入数据
          this._emitOutput(`警告: 解压 ${entry.entryName} 失败，尝试直接写入`);
          const data = entry.getData();
          await fsPromises.writeFile(entryPath, data);
          extractedCount++;
        }
      }
      
      this._emitOutput(`解压完成，共 ${extractedCount} 个文件`);

      return tempDir;
    } catch (error) {
      this._emitOutput(`解压失败: ${error.message}`);
      throw new Error(`解压整合包失败: ${error.message}`);
    } finally {
      // 恢复 asar 设置
      process.noAsar = originalNoAsar;
    }
  }

  /**
   * 处理配置文件（占位符替换）
   */
  async _processConfigFiles(tempDir, neoMofoxDir, userInputs) {
    if (!tempDir || !neoMofoxDir) {
      throw new Error(`路径参数无效: tempDir=${tempDir}, neoMofoxDir=${neoMofoxDir}`);
    }

    const configSourcePath = path.join(tempDir, 'extra', 'config', 'core.toml');
    const configDestDir = path.join(neoMofoxDir, 'config');
    const configDestPath = path.join(configDestDir, 'core.toml');

    this._emitOutput(`配置源路径: ${configSourcePath}`);
    this._emitOutput(`配置目标路径: ${configDestPath}`);

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
    // 1. 替换管理员 QQ 号（permissions.owner_list 是字符串数组格式）
    if (config.permissions && config.permissions.owner_list) {
      config.permissions.owner_list = [`qq:${userInputs.ownerQQNumber}`];
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
    if (!tempDir || !installDir || !instanceId) {
      throw new Error(`复制文件参数无效: tempDir=${tempDir}, installDir=${installDir}, instanceId=${instanceId}`);
    }

    const instanceRoot = path.join(installDir, instanceId);
    this._emitOutput(`实例根目录: ${instanceRoot}`);

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
    // 禁用 Electron 的 asar 拦截
    const originalNoAsar = process.noAsar;
    process.noAsar = true;

    try {
      await fsPromises.access(src, fs.constants.F_OK);
    } catch (err) {
      this._emitOutput(`警告: 源目录不存在，跳过 ${src}`);
      process.noAsar = originalNoAsar;
      return;
    }

    // 检查目标路径是否存在
    try {
      const destStat = await fsPromises.stat(dest);
      if (destStat.isFile()) {
        // 如果目标是文件，删除它
        this._emitOutput(`警告: 目标路径是文件，删除后重新创建 ${dest}`);
        await fsPromises.unlink(dest);
      }
    } catch (err) {
      // 目标不存在，正常情况
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    // 创建目标目录
    try {
      await fsPromises.mkdir(dest, { recursive: true });
    } catch (err) {
      if (err.code === 'ENOTDIR') {
        // 父路径中存在文件，尝试清理
        this._emitOutput(`错误: 无法创建目录 ${dest}，父路径中可能存在同名文件`);
        this._emitOutput(`尝试清理路径...`);
        
        // 找到问题路径并清理
        const pathParts = dest.split(path.sep);
        for (let i = 1; i <= pathParts.length; i++) {
          const checkPath = pathParts.slice(0, i).join(path.sep);
          try {
            const stat = await fsPromises.stat(checkPath);
            if (stat.isFile()) {
              this._emitOutput(`发现文件冲突: ${checkPath}，删除后重试`);
              await fsPromises.unlink(checkPath);
            }
          } catch (statErr) {
            // 路径不存在，继续
          }
        }
        
        // 重试创建目录
        await fsPromises.mkdir(dest, { recursive: true });
      } else {
        throw err;
      }
    }

    const entries = await fsPromises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this._copyDirRecursive(srcPath, destPath);
      } else {
        // 确保父目录存在
        const parentDir = path.dirname(destPath);
        try {
          await fsPromises.mkdir(parentDir, { recursive: true });
        } catch (mkdirErr) {
          if (mkdirErr.code !== 'EEXIST') {
            this._emitOutput(`警告: 创建父目录失败 ${parentDir}: ${mkdirErr.message}`);
          }
        }
        
        // 复制文件
        try {
          await fsPromises.copyFile(srcPath, destPath);
        } catch (copyErr) {
          this._emitOutput(`警告: 复制文件失败 ${srcPath} -> ${destPath}: ${copyErr.message}`);
        }
      }
    }

    // 恢复 asar 设置
    process.noAsar = originalNoAsar;
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

    // NapCat 处理（Linux 系统跳过）
    const isLinux = platformHelper.isLinux;
    if (isLinux) {
      // Linux 系统不支持自动安装 NapCat，需要用户手动安装
      this._emitOutput('检测到 Linux 系统，跳过 NapCat 自动安装（需手动安装）');
    } else {
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
      webuiApiKey: userInputs.webuiApiKey || "",
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
              installSteps,
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
   * 清理临时目录（后台异步执行，不阻塞主流程）
   */
  _cleanup() {
    if (!this._tempDir) {
      return;
    }

    const tempDir = this._tempDir;
    this._tempDir = null; // 立即清空引用

    this._emitOutput('临时目录清理已启动（后台执行）');

    // Fire-and-forget：在后台异步删除，不阻塞主流程
    this._cleanupAsync(tempDir).catch(err => {
      console.error('[ImportService] 后台清理失败:', err);
    });
  }

  /**
   * 异步清理（内部方法，不对外 await）
   */
  async _cleanupAsync(dir) {
    try {
      // 检查目录是否存在
      await fsPromises.access(dir, fs.constants.F_OK);
    } catch (err) {
      console.log('[ImportService] 临时目录不存在，无需清理');
      return;
    }

    try {
      // 使用 Node.js 14.14+ 的 rm API（异步删除）
      if (fsPromises.rm) {
        await fsPromises.rm(dir, { 
          recursive: true, 
          force: true, 
          maxRetries: 3, 
          retryDelay: 100 
        });
        console.log('[ImportService] 临时目录清理完成');
      } else {
        // 手动递归删除（仅用于旧版 Node.js）
        await this._removeDirRecursive(dir);
        console.log('[ImportService] 临时目录清理完成（递归删除）');
      }
    } catch (err) {
      console.error('[ImportService] 清理失败:', err.message);
    }
  }

  /**
   * 递归删除目录（仅用于不支持 fs.rm 的旧版本）
   */
  async _removeDirRecursive(dir) {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this._removeDirRecursive(fullPath);
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
