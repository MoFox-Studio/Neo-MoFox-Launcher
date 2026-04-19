/**
 * ExportService - 整合包导出服务
 * 负责扫描实例文件、选择性打包、配置文件脱敏、生成整合包
 * 
 * 依赖：需要安装 archiver 库
 * npm install archiver
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const TOML = require('@iarna/toml');
const { ManifestManager } = require('./ManifestManager');
const { storageService } = require('../install/StorageService');

// TODO: 需要安装 archiver 依赖
// const archiver = require('archiver');

// ─── 常量定义 ───────────────────────────────────────────────────────────

const PACK_EXTENSION = '.mfpack';
const TEMP_EXPORT_DIR = 'export-temp';

// ─── ExportService 类 ──────────────────────────────────────────────────

/**
 * 导出服务类
 */
class ExportService {
  /**
   * 检查实例是否包含 NapCat
   * @param {string} instanceId - 实例 ID
   * @returns {Promise<boolean>} 是否存在 NapCat
   */
  static async checkNapcatExists(instanceId) {
    const instances = storageService.getInstances();
    const instance = instances.find(i => i.id === instanceId);
    
    if (!instance || !instance.neomofoxDir) {
      return false;
    }

    const instanceRoot = path.dirname(instance.neomofoxDir);
    const napcatDir = path.join(instanceRoot, 'napcat');
    
    try {
      await fsPromises.access(napcatDir);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * 扫描实例的插件目录
   * @param {string} instanceId - 实例 ID
   * @returns {Promise<Array>} 插件列表 [{ name: 'plugin1', type: 'folder'|'file' }]
   */
  static async scanInstancePlugins(instanceId) {
    // 获取实例信息
    const instances = storageService.getInstances();
    const instance = instances.find(i => i.id === instanceId);
    
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    if (!instance.neomofoxDir) {
      throw new Error(`实例配置错误: 缺少 neomofoxDir 字段 (instanceId: ${instanceId})`);
    }

    // 实例根目录 = neomofoxDir 的父目录
    // 例如: E:/install/instance_12345/neo-mofox
    const instanceRoot = instance.neomofoxDir;
    const pluginsDir = path.join(instanceRoot, 'plugins');
    console.log(`[ExportService] 扫描插件目录: ${pluginsDir}`);
    
    // 检查插件目录是否存在
    try {
      await fsPromises.access(pluginsDir);
    } catch (err) {
      return [];
    }

    try {
      // 读取插件目录
      const items = await fsPromises.readdir(pluginsDir, { withFileTypes: true });
      
      const plugins = items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'folder' : 'file',
      }));

      return plugins;
    } catch (err) {
      throw new Error(`扫描插件目录失败: ${err.message}`);
    }
  }

  /**
   * 扫描实例的插件配置目录
   * @param {string} instanceId - 实例 ID
   * @returns {Promise<Array>} 插件配置列表 [{ name: 'plugin1', type: 'folder'|'file' }]
   */
  static async scanInstancePluginConfigs(instanceId) {
    // 获取实例信息
    const instances = storageService.getInstances();
    const instance = instances.find(i => i.id === instanceId);
    
    if (!instance) {
      throw new Error(`实例不存在: ${instanceId}`);
    }

    if (!instance.neomofoxDir) {
      throw new Error(`实例配置错误: 缺少 neomofoxDir 字段 (instanceId: ${instanceId})`);
    }

    // 实例根目录 = neomofoxDir
    const instanceRoot = instance.neomofoxDir;
    const pluginConfigsDir = path.join(instanceRoot, 'config', 'plugins');
    console.log(`[ExportService] 扫描插件配置目录: ${pluginConfigsDir}`);
    
    // 检查插件配置目录是否存在
    try {
      await fsPromises.access(pluginConfigsDir);
    } catch (err) {
      return [];
    }

    try {
      // 读取配置目录
      const items = await fsPromises.readdir(pluginConfigsDir, { withFileTypes: true });
      
      const pluginConfigs = items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'folder' : 'file',
      }));

      return pluginConfigs;
    } catch (err) {
      throw new Error(`扫描插件配置目录失败: ${err.message}`);
    }
  }

  /**
   * 导出整合包
   * @param {string} instanceId - 实例 ID
   * @param {Object} options - 导出选项
   * @param {string} [options.packName] - 整合包名称（可选，默认使用实例名称）
   * @param {string} [options.packVersion='1.0.0'] - 整合包版本号
   * @param {string} [options.packAuthor] - 整合包作者（可选，默认使用系统用户名）
   * @param {string} [options.packDescription] - 整合包描述（可选）
   * @param {boolean} [options.includeNeoMofox=false] - 是否包含 Neo-MoFox 主程序
   * @param {boolean} [options.includeNapcat=false] - 是否包含 NapCat
   * @param {boolean} [options.includeConfig=false] - 是否包含配置文件
   * @param {boolean} [options.includePlugins=false] - 是否包含插件
   * @param {string[]} [options.selectedPlugins=[]] - 选中的插件列表（插件名称数组）
   * @param {boolean} [options.includePluginConfigs=false] - 是否包含插件配置文件
   * @param {string[]} [options.selectedPluginConfigs=[]] - 选中的插件配置列表（配置文件名称数组）
   * @param {boolean} [options.includeData=false] - 是否包含数据文件
   * @param {boolean} [options.installNapcatOnImport=false] - 导入时是否安装 NapCat（仅当未包含 NapCat 时有效，将存储在 content.napcat.installOnImport）
   * @param {string} destPath - 导出目标路径（完整文件路径，包含文件名）
   * @param {Function} [onProgress] - 进度回调 (percent, message)
   * @param {Function} [onOutput] - 输出回调 (message)
   * @returns {Promise<string>} 导出的文件路径
   */
  static async exportIntegrationPack(instanceId, options, destPath, onProgress, onOutput) {
    // 立即输出开始日志
    console.log('[ExportService] ========== 开始导出整合包 ==========');
    console.log('[ExportService] 实例 ID:', instanceId);
    console.log('[ExportService] 导出选项:', JSON.stringify(options, null, 2));
    console.log('[ExportService] 目标路径:', destPath);
    
    this._emitOutput(onOutput, '初始化导出服务...');
    this._emitProgress(onProgress, 1, '初始化中...');
    
    try {
      // 检查 archiver 是否已安装
      console.log('[ExportService] 检查 archiver 依赖...');
      let archiver;
      try {
        archiver = require('archiver');
        console.log('[ExportService] archiver 已加载');
      } catch (err) {
        const errorMsg = '缺少依赖：archiver。请运行: npm install archiver';
        console.error('[ExportService] 错误:', errorMsg);
        this._emitOutput(onOutput, `错误: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log('[ExportService] 获取实例列表...');
      const instances = storageService.getInstances();
      const instance = instances.find(i => i.id === instanceId);
      
      if (!instance) {
        const errorMsg = `实例不存在: ${instanceId}`;
        console.error('[ExportService] 错误:', errorMsg);
        this._emitOutput(onOutput, `错误: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      console.log('[ExportService] 找到实例:', instance.name);

      if (!instance.neomofoxDir) {
        const errorMsg = `实例配置错误: 缺少 neomofoxDir 字段 (instanceId: ${instanceId})`;
        console.error('[ExportService] 错误:', errorMsg);
        this._emitOutput(onOutput, `错误: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      console.log('[ExportService] Neo-MoFox 目录:', instance.neomofoxDir);

      // 实例根目录 = neomofoxDir 的父目录
      // 例如: E:/install/instance_12345/neo-mofox -> E:/install/instance_12345
      const installPath = path.dirname(instance.neomofoxDir);
      const MoFoxPath = instance.neomofoxDir;
      console.log('[ExportService] 实例根目录:', installPath);
      
      try {
        await fsPromises.access(installPath);
        console.log('[ExportService] 实例目录存在');
      } catch (err) {
        const errorMsg = `实例目录不存在: ${installPath}`;
        console.error('[ExportService] 错误:', errorMsg, err);
        this._emitOutput(onOutput, `错误: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // 验证 neo-mofox 子目录存在
      try {
        await fsPromises.access(instance.neomofoxDir);
        console.log('[ExportService] Neo-MoFox 子目录存在');
      } catch (err) {
        const errorMsg = `Neo-MoFox 目录不存在: ${instance.neomofoxDir}`;
        console.error('[ExportService] 错误:', errorMsg, err);
        this._emitOutput(onOutput, `错误: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // 创建临时导出目录
      const tempDir = path.join(storageService.getDataDir(), TEMP_EXPORT_DIR, instanceId);
      console.log('[ExportService] 临时目录:', tempDir);
      
      try {
        await fsPromises.access(tempDir);
        console.log('[ExportService] 清理已存在的临时目录...');
        this._emitOutput(onOutput, '清理已存在的临时目录...');
        await this._removeDir(tempDir);
      } catch (err) {
        // 目录不存在，无需清理
      }
      
      await fsPromises.mkdir(tempDir, { recursive: true });

      this._emitProgress(onProgress, 5, '准备导出...');
      this._emitOutput(onOutput, '开始导出整合包...');

      // 收集版本信息
      const versions = await this._collectVersionInfo(instance, options);
      
      // 复制文件
      let progress = 10;
      
      // 1. 复制 Neo-MoFox 主程序
      if (options.includeNeoMofox) {
        this._emitProgress(onProgress, progress, '打包主程序文件...');
        this._emitOutput(onOutput, '复制 Neo-MoFox 主程序...');
        await this._copyNeoMofox(instance.neomofoxDir, tempDir);
        progress += 25;
      }

      // 2. 复制 NapCat
      if (options.includeNapcat) {
        this._emitProgress(onProgress, progress, '打包 NapCat...');
        this._emitOutput(onOutput, '复制 NapCat...');
        await this._copyNapcat(installPath, tempDir);
        progress += 15;
      }

      // 3. 复制额外文件（配置、插件、数据）到 extra 目录
      let exportedPlugins = [];
      if (options.includeConfig || options.includePluginConfigs || options.includePlugins || options.includeData) {
        this._emitProgress(onProgress, progress, '打包额外文件...');
        let extraItems = [];
        if (options.includeConfig) extraItems.push('配置文件');
        if (options.includePluginConfigs) extraItems.push(`${options.selectedPluginConfigs.length} 个插件配置`);
        if (options.includePlugins) extraItems.push(`${options.selectedPlugins.length} 个插件`);
        if (options.includeData) extraItems.push('数据文件');
        this._emitOutput(onOutput, `复制 ${extraItems.join('、')}...`);
        
        exportedPlugins = await this._copyExtraFiles(MoFoxPath, tempDir, options);
        progress += 35;
      }

      // 生成 manifest.json
      this._emitProgress(onProgress, 70, '生成元数据...');
      this._emitOutput(onOutput, '生成 manifest.json...');
      
      const manifest = ManifestManager.createManifest({
        packName: options.packName || instance.name,
        packVersion: options.packVersion || '1.0.0',
        author: options.packAuthor || process.env.USERNAME || process.env.USER || 'Unknown',
        description: options.packDescription || instance.description || `基于 ${instance.name} 实例的整合包`,
        content: {
          neoMofox: {
            included: options.includeNeoMofox,
            ...(options.includeNeoMofox && versions.neoMofox),
          },
          napcat: {
            included: options.includeNapcat,
            installOnImport: options.installNapcatOnImport || false,
            ...(options.includeNapcat && versions.napcat),
          },
          plugins: {
            included: options.includePlugins && exportedPlugins.length > 0,
            list: exportedPlugins,
          },
          config: {
            included: options.includeConfig,
          },
          data: {
            included: options.includeData,
          },
        },
      });

      const manifestPath = path.join(tempDir, 'manifest.json');
      await ManifestManager.writeManifest(manifestPath, manifest);

      // 打包为 ZIP
      this._emitProgress(onProgress, 75, '压缩打包...');
      this._emitOutput(onOutput, '正在生成 .mfpack 文件...');
      
      await this._zipDirectory(tempDir, destPath, (zipProgress) => {
        const finalProgress = 75 + zipProgress * 0.20; // 75% - 95%
        this._emitProgress(onProgress, finalProgress, '压缩中...');
      });

      // 清理临时目录
      this._emitProgress(onProgress, 95, '清理临时文件...');
      await this._removeDir(tempDir);

      this._emitProgress(onProgress, 100, '导出完成');
      this._emitOutput(onOutput, `整合包已导出: ${destPath}`);

      return destPath;
    } catch (error) {
      const errorMsg = `导出失败: ${error.message}`;
      console.error('[ExportService] ========== 导出失败 ==========');
      console.error('[ExportService] 错误详情:', error);
      console.error('[ExportService] 错误堆栈:', error.stack);
      
      // 确保通过回调通知前端
      this._emitOutput(onOutput, `错误: ${errorMsg}`);
      this._emitProgress(onProgress, 0, '导出失败');
      
      throw new Error(errorMsg);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 私有工具方法
  // ───────────────────────────────────────────────────────────────────────

  /**
   * 收集版本信息
   * @param {Object} instance - 实例对象
   * @param {Object} options - 导出选项
   */
  static async _collectVersionInfo(instance, options) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const versions = {};

    if (options.includeNeoMofox) {
      console.log('[ExportService] 收集 Neo-MoFox 版本信息...');
      // 使用 git 命令获取 commit（异步）
      try {
        const neomofoxDir = instance.neomofoxDir;
        const gitDir = path.join(neomofoxDir, '.git');
        console.log('[ExportService] 检查 Git 目录:', gitDir);
        
        if (fs.existsSync(gitDir)) {
          console.log('[ExportService] Git 目录存在，获取 commit...');
          const { stdout } = await execAsync('git rev-parse --short=7 HEAD', {
            cwd: neomofoxDir,
            encoding: 'utf8',
            timeout: 5000 // 5秒超时
          });
          versions.neoMofox = {
            commit: stdout.trim()
          };
          console.log('[ExportService] Neo-MoFox commit:', versions.neoMofox.commit);
        } else {
          console.log('[ExportService] Git 目录不存在，跳过版本收集');
        }
      } catch (err) {
        console.warn('[ExportService] 无法获取 Neo-MoFox commit:', err.message);
        versions.neoMofox = {
          commit: 'unknown'
        };
      }
    }

    if (options.includeNapcat) {
      // 从实例配置读取 NapCat 版本
      try {
        if (instance.napcatVersion) {
          versions.napcat = {
            version: instance.napcatVersion
          };
        } else {
          versions.napcat = {
            version: 'unknown'
          };
        }
      } catch (err) {
        console.warn('[ExportService] 无法读取 NapCat 版本:', err.message);
        versions.napcat = {
          version: 'unknown'
        };
      }
    }

    return versions;
  }

  /**
   * 复制 Neo-MoFox 主程序
   * @param {string} neomofoxDir - Neo-MoFox 目录路径 (e.g., E:/install/instance_12345/neo-mofox)
   */
  static async _copyNeoMofox(neomofoxDir, tempDir) {
    const destDir = path.join(tempDir, 'neo-mofox');
    await fsPromises.mkdir(destDir, { recursive: true });

    // 排除列表（这些目录会在 extra 目录中单独处理）
    const excludeItems = ['data', 'config', 'plugins','.venv','venv'];

    // 读取 Neo-MoFox 目录下的所有项
    let allItems;
    try {
      allItems = await fsPromises.readdir(neomofoxDir, { withFileTypes: true });
    } catch (err) {
      console.error(`[ExportService] 无法读取 Neo-MoFox 目录: ${err.message}`);
      return;
    }

    // 复制所有项，除了排除列表中的
    for (const item of allItems) {
      // 跳过排除列表中的目录
      if (excludeItems.includes(item.name)) {
        continue;
      }

      const srcPath = path.join(neomofoxDir, item.name);
      const destPath = path.join(destDir, item.name);
      
      try {
        if (item.isDirectory()) {
          await this._copyDirRecursive(srcPath, destPath);
        } else {
          await fsPromises.copyFile(srcPath, destPath);
        }
      } catch (err) {
        console.warn(`[ExportService] 复制失败，跳过 ${item.name}: ${err.message}`);
      }
      
      // 让出事件循环，防止阻塞
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  /**
   * 复制 NapCat（使用系统命令避免 asar 文件访问问题）
   */
  static async _copyNapcat(installPath, tempDir) {
    const srcPath = path.join(installPath, 'napcat');
    const destPath = path.join(tempDir, 'napcat');
    
    try {
      await fsPromises.access(srcPath);
    } catch (err) {
      return;
    }

    // 使用系统命令复制，避免 Node.js fs 模块对 .asar 文件的特殊处理
    await this._copyDirWithSystemCommand(srcPath, destPath);
  }

  /**
   * 复制额外文件（配置、插件、数据）到 extra 目录
   * @param {string} installPath - 实例根目录路径
   * @param {string} tempDir - 临时导出目录
   * @param {Object} options - 导出选项
   * @returns {Array} 复制的插件列表
   */
  static async _copyExtraFiles(installPath, tempDir, options) {
    const extraDir = path.join(tempDir, 'extra');
    await fsPromises.mkdir(extraDir, { recursive: true });
    
    const copiedPlugins = [];

    // 1. 复制配置文件（脱敏处理）
    if (options.includeConfig) {
      const configSrcDir = path.join(installPath, 'config');
      const configDestDir = path.join(extraDir, 'config');
      await fsPromises.mkdir(configDestDir, { recursive: true });

      // 只处理 core.toml
      const coreTomlPath = path.join(configSrcDir, 'core.toml');
      try {
        await fsPromises.access(coreTomlPath);
        const content = await fsPromises.readFile(coreTomlPath, 'utf8');
        const config = TOML.parse(content);

        // 替换敏感信息为占位符
        if (config.permissions && config.permissions.owner_list) {
          // 替换所有 owner QQ 号为占位符
          config.permissions.owner_list = ['{{OWNER_QQ}}'];
        }

        if (config.http_router && config.http_router.api_keys) {
          // 替换 WebUI API 密钥
          config.http_router.api_keys = ['{{WEBUI_KEY}}'];
        }

        // 写入处理后的配置
        const destPath = path.join(configDestDir, 'core.toml');
        const modifiedContent = TOML.stringify(config);
        await fsPromises.writeFile(destPath, modifiedContent, 'utf8');
      } catch (err) {
        // 文件不存在，跳过
      }
      // 不导出 model.toml（包含 LLM API Key）
    }

    // 1.5 复制插件配置文件
    if (options.includePluginConfigs && options.selectedPluginConfigs.length > 0) {
      const pluginConfigsSrcDir = path.join(installPath, 'config', 'plugins');
      console.log(`[ExportService] 复制插件配置，源目录: ${pluginConfigsSrcDir}`);
      const pluginConfigsDestDir = path.join(extraDir, 'config', 'plugins');
      console.log(`[ExportService] 复制插件配置，目标目录: ${pluginConfigsDestDir}`);
      
      try {
        await fsPromises.access(pluginConfigsSrcDir);
        await fsPromises.mkdir(pluginConfigsDestDir, { recursive: true });
        
        for (const configName of options.selectedPluginConfigs) {
          const srcPath = path.join(pluginConfigsSrcDir, configName);
          const destPath = path.join(pluginConfigsDestDir, configName);
          
          try {
            const stats = await fsPromises.stat(srcPath);
            
            if (stats.isDirectory()) {
              await this._copyDirRecursive(srcPath, destPath);
            } else if (stats.isFile()) {
              await fsPromises.copyFile(srcPath, destPath);
            }
          } catch (err) {
            console.warn(`[ExportService] 插件配置不存在，跳过: ${configName}`);
          }
          
          // 让出事件循环
          await new Promise(resolve => setImmediate(resolve));
        }
      } catch (err) {
        console.warn(`[ExportService] config/plugins 目录不存在`);
      }
    }

    // 2. 复制插件
    if (options.includePlugins && options.selectedPlugins.length > 0) {
      const pluginsSrcDir = path.join(installPath, 'plugins');
      console.log(`[ExportService] 复制插件，源目录: ${pluginsSrcDir}`);
      const pluginsDestDir = path.join(extraDir, 'plugins');
      console.log(`[ExportService] 复制插件，目标目录: ${pluginsDestDir}`);
      
      try {
        await fsPromises.access(pluginsSrcDir);
        await fsPromises.mkdir(pluginsDestDir, { recursive: true });
        
        for (const pluginName of options.selectedPlugins) {
          const srcPath = path.join(pluginsSrcDir, pluginName);
          const destPath = path.join(pluginsDestDir, pluginName);
          
          try {
            const stats = await fsPromises.stat(srcPath);
            
            if (stats.isDirectory()) {
              await this._copyDirRecursive(srcPath, destPath);
              copiedPlugins.push(pluginName);
            } else if (stats.isFile()) {
              await fsPromises.copyFile(srcPath, destPath);
              copiedPlugins.push(pluginName);
            }
          } catch (err) {
            // 插件不存在，跳过
          }
          
          // 让出事件循环
          await new Promise(resolve => setImmediate(resolve));
        }
      } catch (err) {
        // plugins 目录不存在
      }
    }

    // 3. 复制数据文件（使用系统命令以提高性能和可靠性）
    if (options.includeData) {
      const dataSrcDir = path.join(installPath, 'data');
      const dataDestDir = path.join(extraDir, 'data');
      
      try {
        await fsPromises.access(dataSrcDir);
        // 使用系统命令复制大目录
        await this._copyDirWithSystemCommand(dataSrcDir, dataDestDir);
      } catch (err) {
        // data 目录不存在
      }
    }

    return copiedPlugins;
  }

  /**
   * 使用系统命令复制目录（适用于大目录或包含特殊文件）
   * @param {string} srcPath - 源目录路径
   * @param {string} destPath - 目标目录路径
   */
  static async _copyDirWithSystemCommand(srcPath, destPath) {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        // Windows: 使用 robocopy
        const cmd = `robocopy "${srcPath}" "${destPath}" /E /NFL /NDL /NJH /NJS /NC /NS /NP`;
        try {
          await execAsync(cmd);
        } catch (err) {
          // robocopy 返回值 <= 7 表示成功
          if (err.code && err.code > 7) {
            throw err;
          }
        }
      } else {
        // Linux/macOS: 使用 cp -r
        await execAsync(`cp -r "${srcPath}" "${destPath}"`);
      }
      
      console.log(`[ExportService] 目录已使用系统命令复制: ${srcPath} -> ${destPath}`);
    } catch (err) {
      console.error(`[ExportService] 使用系统命令复制失败，回退到 Node.js 方法: ${err.message}`);
      // 回退到原方法
      await this._copyDirRecursive(srcPath, destPath);
    }
  }

  /**
   * 递归复制目录（异步版本，避免阻塞事件循环）
   */
  static async _copyDirRecursive(src, dest) {
    try {
      await fsPromises.access(src);
    } catch (err) {
      return; // 源路径不存在
    }

    // 特殊处理：如果源路径本身是 .asar 文件，直接复制不递归
    if (src.endsWith('.asar')) {
      const destDir = path.dirname(dest);
      await fsPromises.mkdir(destDir, { recursive: true });
      await fsPromises.copyFile(src, dest);
      return;
    }

    // 使用 try-catch 保护文件系统操作，避免 asar 路径误解析
    let stats;
    try {
      stats = await fsPromises.stat(src);
      
      // 如果是文件而不是目录，直接复制
      if (stats.isFile()) {
        const destDir = path.dirname(dest);
        await fsPromises.mkdir(destDir, { recursive: true });
        await fsPromises.copyFile(src, dest);
        return;
      }
    } catch (err) {
      console.warn(`[ExportService] 无法访问路径 ${src}: ${err.message}`);
      return;
    }

    await fsPromises.mkdir(dest, { recursive: true });
    
    let entries;
    try {
      entries = await fsPromises.readdir(src, { withFileTypes: true });
    } catch (err) {
      console.warn(`[ExportService] 无法读取目录 ${src}: ${err.message}`);
      return;
    }
    
    let processedCount = 0;
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      // 跳过 .asar 文件（作为普通文件处理，不递归）
      if (entry.name.endsWith('.asar')) {
        try {
          await fsPromises.copyFile(srcPath, destPath);
        } catch (err) {
          console.warn(`[ExportService] 复制 asar 文件失败 ${srcPath}: ${err.message}`);
        }
        continue;
      }
      
      if (entry.isDirectory()) {
        // 跳过某些目录
        if (entry.name === '__pycache__' || entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        await this._copyDirRecursive(srcPath, destPath);
      } else {
        try {
          await fsPromises.copyFile(srcPath, destPath);
        } catch (err) {
          console.warn(`[ExportService] 复制文件失败 ${srcPath}: ${err.message}`);
        }
      }
      
      // 每处理 10 个文件让出一次事件循环，防止阻塞
      processedCount++;
      if (processedCount % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  /**
   * 递归删除目录（异步版本，带重试机制）
   */
  static async _removeDir(dir) {
    try {
      await fsPromises.access(dir);
    } catch (err) {
      return; // 目录不存在
    }

    // 使用 Node.js 14.14+ 的 fs.rm API（支持递归删除和重试）
    if (fsPromises.rm) {
      try {
        await fsPromises.rm(dir, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100
        });
        return;
      } catch (err) {
        console.warn(`[ExportService] fs.rm 删除失败，回退到手动删除: ${err.message}`);
        // 如果 fs.rm 失败，继续使用下面的手动删除逻辑
      }
    }

    // 手动递归删除（带重试机制）
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await this._removeDir(fullPath);
      } else {
        // 带重试的文件删除
        await this._unlinkWithRetry(fullPath);
      }
    }
    
    // 带重试的目录删除
    await this._rmdirWithRetry(dir);
  }

  /**
   * 带重试机制的文件删除
   * @param {string} filePath - 文件路径
   * @param {number} maxRetries - 最大重试次数
   * @param {number} retryDelay - 重试延迟（毫秒）
   */
  static async _unlinkWithRetry(filePath, maxRetries = 3, retryDelay = 100) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await fsPromises.unlink(filePath);
        return;
      } catch (err) {
        if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'ENOENT') {
          if (err.code === 'ENOENT') {
            // 文件已不存在，视为成功
            return;
          }
          
          if (i < maxRetries - 1) {
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
            continue;
          }
        }
        // 最后一次重试失败或其他错误，记录警告但不抛出
        console.warn(`[ExportService] 无法删除文件 ${filePath}: ${err.message}`);
        // 不抛出错误，允许继续处理其他文件
        return;
      }
    }
  }

  /**
   * 带重试机制的目录删除
   * @param {string} dirPath - 目录路径
   * @param {number} maxRetries - 最大重试次数
   * @param {number} retryDelay - 重试延迟（毫秒）
   */
  static async _rmdirWithRetry(dirPath, maxRetries = 3, retryDelay = 100) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await fsPromises.rmdir(dirPath);
        return;
      } catch (err) {
        if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'ENOTEMPTY' || err.code === 'ENOENT') {
          if (err.code === 'ENOENT') {
            // 目录已不存在，视为成功
            return;
          }
          
          if (i < maxRetries - 1) {
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
            continue;
          }
        }
        // 最后一次重试失败，记录警告但不抛出
        console.warn(`[ExportService] 无法删除目录 ${dirPath}: ${err.message}`);
        // 不抛出错误，允许继续
        return;
      }
    }
  }

  /**
   * 将目录打包为 ZIP
   */
  static async _zipDirectory(sourceDir, outPath, onProgress) {
    return new Promise((resolve, reject) => {
      const archiver = require('archiver');
      const output = fs.createWriteStream(outPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // 最高压缩级别
      });

      output.on('close', () => {
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      // 进度追踪（估算）
      let processedBytes = 0;
      let totalBytes = 0;

      // 计算总大小（估算）
      const calculateDirSize = (dir) => {
        let size = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            size += calculateDirSize(fullPath);
          } else {
            size += fs.statSync(fullPath).size;
          }
        }
        return size;
      };

      totalBytes = calculateDirSize(sourceDir);

      archive.on('progress', (progress) => {
        processedBytes = progress.fs.processedBytes;
        if (totalBytes > 0 && onProgress) {
          const percent = (processedBytes / totalBytes) * 100;
          onProgress(percent);
        }
      });

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  /**
   * 进度回调辅助方法
   */
  static _emitProgress(callback, percent, message) {
    if (callback && typeof callback === 'function') {
      callback(percent, message);
    }
  }

  /**
   * 输出回调辅助方法
   */
  static _emitOutput(callback, message) {
    console.log(`[ExportService] ${message}`);
    if (callback && typeof callback === 'function') {
      callback(message);
    }
  }
}

// ─── 导出 ─────────────────────────────────────────────────────────────

module.exports = { ExportService, PACK_EXTENSION };
