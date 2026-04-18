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
      const MoFoxPath = instance.neomofoxDir;
      
      try {
        await fsPromises.access(installPath);
      } catch (err) {
        throw new Error(`实例目录不存在: ${installPath}`);
      }

      // 验证 neo-mofox 子目录存在
      try {
        await fsPromises.access(instance.neomofoxDir);
      } catch (err) {
        throw new Error(`Neo-MoFox 目录不存在: ${instance.neomofoxDir}`);
      }

      // 创建临时导出目录
      const tempDir = path.join(storageService.getDataDir(), TEMP_EXPORT_DIR, instanceId);
      try {
        await fsPromises.access(tempDir);
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
      if (options.includeConfig || options.includePlugins || options.includeData) {
        this._emitProgress(onProgress, progress, '打包额外文件...');
        let extraItems = [];
        if (options.includeConfig) extraItems.push('配置文件');
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
      await this._removeDir(tempDir);

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
   * @param {Object} instance - 实例对象
   * @param {Object} options - 导出选项
   */
  static async _collectVersionInfo(instance, options) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const versions = {};

    if (options.includeNeoMofox) {
      // 使用 git 命令获取 commit（异步）
      try {
        const neomofoxDir = instance.neomofoxDir;
        const gitDir = path.join(neomofoxDir, '.git');
        if (fs.existsSync(gitDir)) {
          const { stdout } = await execAsync('git rev-parse --short=7 HEAD', {
            cwd: neomofoxDir,
            encoding: 'utf8'
          });
          versions.neoMofox = {
            commit: stdout.trim()
          };
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

    // 需要复制的目录和文件（不包含 config 和 data，它们会在 extra 目录中处理）
    const itemsToCopy = [
      'src',
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
      
      try {
        const stats = await fsPromises.stat(srcPath);
        if (stats.isDirectory()) {
          await this._copyDirRecursive(srcPath, destPath);
        } else {
          await fsPromises.copyFile(srcPath, destPath);
        }
      } catch (err) {
        // 文件不存在，跳过
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

        // 写入处理后的配置
        const destPath = path.join(configDestDir, 'core.toml');
        const modifiedContent = TOML.stringify(config);
        await fsPromises.writeFile(destPath, modifiedContent, 'utf8');
      } catch (err) {
        // 文件不存在，跳过
      }
      // 不导出 model.toml（包含 LLM API Key）
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
   * 递归删除目录（异步版本）
   */
  static async _removeDir(dir) {
    try {
      await fsPromises.access(dir);
    } catch (err) {
      return; // 目录不存在
    }

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
