/**
 * ExportService - 整合包导出服务
 * 负责扫描实例文件、选择性打包、配置文件脱敏、生成整合包
 * 
 * 依赖：需要安装 archiver 库
 * npm install archiver
 */

const fs = require('fs');
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
    return new Promise((resolve, reject) => {
      const instances = storageService.getInstances();
      const instance = instances.find(i => i.id === instanceId);
      
      if (!instance || !instance.neomofoxDir) {
        return resolve(false);
      }

      const instanceRoot = path.dirname(instance.neomofoxDir);
      const napcatDir = path.join(instanceRoot, 'napcat');
      
      try {
        resolve(fs.existsSync(napcatDir));
      } catch (err) {
        resolve(false);
      }
    });
  }

  /**
   * 扫描实例的插件目录
   * @param {string} instanceId - 实例 ID
   * @returns {Promise<Array>} 插件列表 [{ name: 'plugin1', type: 'folder'|'file' }]
   */
  static async scanInstancePlugins(instanceId) {
    return new Promise((resolve, reject) => {
      // 获取实例信息
      const instances = storageService.getInstances();
      const instance = instances.find(i => i.id === instanceId);
      
      if (!instance) {
        return reject(new Error(`实例不存在: ${instanceId}`));
      }

      if (!instance.neomofoxDir) {
        return reject(new Error(`实例配置错误: 缺少 neomofoxDir 字段 (instanceId: ${instanceId})`));
      }

      // 实例根目录 = neomofoxDir 的父目录
      // 例如: E:/install/instance_12345/neo-mofox -> E:/install/instance_12345
      const instanceRoot = path.dirname(instance.neomofoxDir);
      const pluginsDir = path.join(instanceRoot, 'plugins');
      
      // 检查插件目录是否存在
      if (!fs.existsSync(pluginsDir)) {
        return resolve([]);
      }

      try {
        // 读取插件目录
        const items = fs.readdirSync(pluginsDir, { withFileTypes: true });
        
        const plugins = items.map(item => ({
          name: item.name,
          type: item.isDirectory() ? 'folder' : 'file',
        }));

        resolve(plugins);
      } catch (err) {
        reject(new Error(`扫描插件目录失败: ${err.message}`));
      }
    });
  }

  /**
   * 导出整合包
   * @param {string} instanceId - 实例 ID
   * @param {Object} options - 导出选项
   * @param {boolean} [options.includeNeoMofox=false] - 是否包含 Neo-MoFox 主程序
   * @param {boolean} [options.includeNapcat=false] - 是否包含 NapCat
   * @param {boolean} [options.includeConfig=false] - 是否包含配置文件
   * @param {boolean} [options.includePlugins=false] - 是否包含插件
   * @param {string[]} [options.selectedPlugins=[]] - 选中的插件列表（插件名称数组）
   * @param {boolean} [options.includeData=false] - 是否包含数据文件
   * @param {boolean} [options.installNapcatOnImport=false] - 导入时是否安装 NapCat（仅当未包含 NapCat 时有效，将存储在 content.napcat.installOnImport）
   * @param {string} destPath - 导出目标路径（完整文件路径，包含文件名）
   * @param {Function} [onProgress] - 进度回调 (percent, message)
   * @param {Function} [onOutput] - 输出回调 (message)
   * @returns {Promise<string>} 导出的文件路径
   */
  static async exportIntegrationPack(instanceId, options, destPath, onProgress, onOutput) {
    try {
      // 检查 archiver 是否已安装
      let archiver;
      try {
        archiver = require('archiver');
      } catch (err) {
        throw new Error('缺少依赖：archiver。请运行: npm install archiver');
      }

      const instances = storageService.getInstances();
      const instance = instances.find(i => i.id === instanceId);
      
      if (!instance) {
        throw new Error(`实例不存在: ${instanceId}`);
      }

      if (!instance.neomofoxDir) {
        throw new Error(`实例配置错误: 缺少 neomofoxDir 字段 (instanceId: ${instanceId})`);
      }

      // 实例根目录 = neomofoxDir 的父目录
      // 例如: E:/install/instance_12345/neo-mofox -> E:/install/instance_12345
      const installPath = path.dirname(instance.neomofoxDir);
      
      if (!fs.existsSync(installPath)) {
        throw new Error(`实例目录不存在: ${installPath}`);
      }

      // 验证 neo-mofox 子目录存在
      if (!fs.existsSync(instance.neomofoxDir)) {
        throw new Error(`Neo-MoFox 目录不存在: ${instance.neomofoxDir}`);
      }

      // 创建临时导出目录
      const tempDir = path.join(storageService.getDataDir(), TEMP_EXPORT_DIR, instanceId);
      if (fs.existsSync(tempDir)) {
        this._removeDir(tempDir);
      }
      fs.mkdirSync(tempDir, { recursive: true });

      this._emitProgress(onProgress, 5, '准备导出...');
      this._emitOutput(onOutput, '开始导出整合包...');

      // 收集版本信息
      const versions = await this._collectVersionInfo(instance.neomofoxDir, installPath, options);
      
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

      // 3. 复制配置文件（脱敏处理）
      if (options.includeConfig) {
        this._emitProgress(onProgress, progress, '处理配置文件...');
        this._emitOutput(onOutput, '处理配置文件（移除敏感信息）...');
        await this._copyConfigWithPlaceholders(installPath, tempDir);
        progress += 10;
      }

      // 4. 复制插件
      let exportedPlugins = [];
      if (options.includePlugins && options.selectedPlugins.length > 0) {
        this._emitProgress(onProgress, progress, '打包插件...');
        this._emitOutput(onOutput, `复制 ${options.selectedPlugins.length} 个插件...`);
        exportedPlugins = await this._copyPlugins(installPath, tempDir, options.selectedPlugins);
        progress += 15;
      }

      // 5. 复制数据文件
      if (options.includeData) {
        this._emitProgress(onProgress, progress, '打包数据文件...');
        this._emitOutput(onOutput, '复制数据文件...');
        await this._copyData(installPath, tempDir);
        progress += 10;
      }

      // 生成 manifest.json
      this._emitProgress(onProgress, 70, '生成元数据...');
      this._emitOutput(onOutput, '生成 manifest.json...');
      
      const manifest = ManifestManager.createManifest({
        packName: instance.name,
        packVersion: instance.version || '1.0.0',
        author: process.env.USERNAME || process.env.USER || 'Unknown',
        description: instance.description || `基于 ${instance.name} 实例的整合包`,
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
      this._removeDir(tempDir);

      this._emitProgress(onProgress, 100, '导出完成');
      this._emitOutput(onOutput, `整合包已导出: ${destPath}`);

      return destPath;
    } catch (error) {
      throw new Error(`导出失败: ${error.message}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 私有工具方法
  // ───────────────────────────────────────────────────────────────────────

  /**
   * 收集版本信息
   * @param {string} neomofoxDir - Neo-MoFox 目录路径
   * @param {string} installPath - 实例根目录路径
   */
  static async _collectVersionInfo(neomofoxDir, installPath, options) {
    const versions = {};

    if (options.includeNeoMofox) {
      // 读取 Neo-MoFox 版本
      try {
        const pyprojectPath = path.join(neomofoxDir, 'pyproject.toml');
        if (fs.existsSync(pyprojectPath)) {
          const content = fs.readFileSync(pyprojectPath, 'utf8');
          const pyproject = TOML.parse(content);
          versions.neoMofox = {
            version: pyproject.project?.version || 'unknown',
          };
          
          // 尝试获取 git commit（可选）
          try {
            const gitHeadPath = path.join(neomofoxDir, '.git', 'HEAD');
            if (fs.existsSync(gitHeadPath)) {
              const headContent = fs.readFileSync(gitHeadPath, 'utf8').trim();
              if (headContent.startsWith('ref:')) {
                const refPath = headContent.replace('ref: ', '').trim();
                const commitPath = path.join(neomofoxDir, '.git', refPath);
                if (fs.existsSync(commitPath)) {
                  versions.neoMofox.commit = fs.readFileSync(commitPath, 'utf8').trim().substring(0, 7);
                }
              } else {
                versions.neoMofox.commit = headContent.substring(0, 7);
              }
            }
          } catch (gitErr) {
            // Git 信息可选，忽略错误
          }
        }
      } catch (err) {
        console.warn('[ExportService] 无法读取 Neo-MoFox 版本:', err.message);
      }
    }

    if (options.includeNapcat) {
      // 读取 NapCat 版本
      try {
        const napcatPackagePath = path.join(installPath, 'napcat', 'package.json');
        if (fs.existsSync(napcatPackagePath)) {
          const packageData = JSON.parse(fs.readFileSync(napcatPackagePath, 'utf8'));
          versions.napcat = {
            version: packageData.version || 'unknown',
          };
        }
      } catch (err) {
        console.warn('[ExportService] 无法读取 NapCat 版本:', err.message);
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
    fs.mkdirSync(destDir, { recursive: true });

    // 需要复制的目录和文件
    const itemsToCopy = [
      'src',
      'config',
      'main.py',
      'bot.py',
      'pyproject.toml',
      'uv.lock',
      'README.md',
      'LICENSE',
      'eula.md',
      'PRIVACY.md',
    ];

    for (const item of itemsToCopy) {
      const srcPath = path.join(neomofoxDir, item);
      const destPath = path.join(destDir, item);
      
      if (fs.existsSync(srcPath)) {
        if (fs.statSync(srcPath).isDirectory()) {
          this._copyDirRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }

  /**
   * 复制 NapCat
   */
  static async _copyNapcat(installPath, tempDir) {
    const srcPath = path.join(installPath, 'napcat');
    const destPath = path.join(tempDir, 'napcat');
    
    if (fs.existsSync(srcPath)) {
      this._copyDirRecursive(srcPath, destPath);
    }
  }

  /**
   * 复制配置文件并替换敏感信息为占位符
   */
  static async _copyConfigWithPlaceholders(installPath, tempDir) {
    const configSrcDir = path.join(installPath, 'config');
    const configDestDir = path.join(tempDir, 'config');
    fs.mkdirSync(configDestDir, { recursive: true });

    // 只处理 core.toml
    const coreTomlPath = path.join(configSrcDir, 'core.toml');
    if (fs.existsSync(coreTomlPath)) {
      const content = fs.readFileSync(coreTomlPath, 'utf8');
      const config = TOML.parse(content);

      // 替换敏感信息为占位符
      if (config.permission && config.permission.master_users) {
        // 替换所有管理员 QQ 号为占位符
        for (const platform in config.permission.master_users) {
          config.permission.master_users[platform] = ['{{OWNER_QQ}}'];
        }
      }

      if (config.http_router && config.http_router.api_keys) {
        // 替换 WebUI API 密钥
        config.http_router.api_keys = ['{{WEBUI_KEY}}'];
      }

      // 写入处理后的配置（直接使用 core.toml 文件名）
      const destPath = path.join(configDestDir, 'core.toml');
      const modifiedContent = TOML.stringify(config);
      fs.writeFileSync(destPath, modifiedContent, 'utf8');
    }

    // 不导出 model.toml（包含 LLM API Key）
  }

  /**
   * 复制插件
   */
  static async _copyPlugins(installPath, tempDir, selectedPlugins) {
    const pluginsSrcDir = path.join(installPath, 'plugins');
    const pluginsDestDir = path.join(tempDir, 'plugins');
    
    if (!fs.existsSync(pluginsSrcDir)) {
      return [];
    }

    fs.mkdirSync(pluginsDestDir, { recursive: true });
    
    const copiedPlugins = [];

    for (const pluginName of selectedPlugins) {
      const srcPath = path.join(pluginsSrcDir, pluginName);
      const destPath = path.join(pluginsDestDir, pluginName);
      
      if (fs.existsSync(srcPath)) {
        const stats = fs.statSync(srcPath);
        
        if (stats.isDirectory()) {
          this._copyDirRecursive(srcPath, destPath);
          copiedPlugins.push(pluginName);
        } else if (stats.isFile()) {
          fs.copyFileSync(srcPath, destPath);
          copiedPlugins.push(pluginName);
        }
      }
    }

    return copiedPlugins;
  }

  /**
   * 复制数据文件
   */
  static async _copyData(installPath, tempDir) {
    const dataSrcDir = path.join(installPath, 'data');
    const dataDestDir = path.join(tempDir, 'data');
    
    if (fs.existsSync(dataSrcDir)) {
      this._copyDirRecursive(dataSrcDir, dataDestDir);
    }
  }

  /**
   * 递归复制目录
   */
  static _copyDirRecursive(src, dest) {
    if (!fs.existsSync(src)) return;

    fs.mkdirSync(dest, { recursive: true });
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        // 跳过某些目录
        if (entry.name === '__pycache__' || entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        this._copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * 递归删除目录
   */
  static _removeDir(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        this._removeDir(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
    }
    
    fs.rmdirSync(dir);
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
    if (callback && typeof callback === 'function') {
      callback(message);
    }
  }
}

// ─── 导出 ─────────────────────────────────────────────────────────────

module.exports = { ExportService, PACK_EXTENSION };
