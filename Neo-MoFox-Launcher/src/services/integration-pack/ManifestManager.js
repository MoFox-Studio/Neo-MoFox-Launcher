/**
 * ManifestManager - 整合包元数据管理器
 * 负责 manifest.json 的创建、读取、验证和版本兼容性检查
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// ─── 常量定义 ───────────────────────────────────────────────────────────

const MANIFEST_VERSION = '1.0.0';
const MANIFEST_FILENAME = 'manifest.json';

// ─── ManifestManager 类 ──────────────────────────────────────────────────

/**
 * 元数据管理器类
 */
class ManifestManager {
  /**
   * 创建新的 manifest 对象
   * @param {Object} params - manifest 参数
   * @param {string} params.packName - 整合包名称
   * @param {string} [params.packVersion='1.0.0'] - 整合包版本
   * @param {string} [params.author=''] - 作者名称
   * @param {string} [params.description=''] - 整合包描述
   * @param {Object} params.content - 包含的内容配置
   * @param {Object} [params.content.neoMofox] - Neo-MoFox 主程序信息
   * @param {boolean} params.content.neoMofox.included - 是否包含主程序
   * @param {string} [params.content.neoMofox.version] - 主程序版本
   * @param {string} [params.content.neoMofox.commit] - Git commit hash
   * @param {Object} [params.content.napcat] - NapCat 信息
   * @param {boolean} params.content.napcat.included - 是否包含 NapCat
   * @param {string} [params.content.napcat.version] - NapCat 版本
   * @param {boolean} [params.content.napcat.installOnImport] - 导入时是否安装 NapCat（仅当未包含 NapCat 时有效）
   * @param {Object} [params.content.plugins] - 插件信息
   * @param {boolean} params.content.plugins.included - 是否包含插件
   * @param {string[]} [params.content.plugins.list] - 插件列表
   * @param {Object} [params.content.config] - 配置文件信息
   * @param {boolean} params.content.config.included - 是否包含配置文件
   * @param {Object} [params.content.data] - 数据文件信息
   * @param {boolean} params.content.data.included - 是否包含数据文件
   * @returns {Object} manifest 对象
   */
  static createManifest({
    packName,
    packVersion = '1.0.0',
    author = '',
    description = '',
    content,
  }) {
    const launcherVersion = app.getVersion();
    
    return {
      version: MANIFEST_VERSION,
      packName,
      packVersion,
      author,
      description,
      createdAt: new Date().toISOString(),
      launcherVersion,
      content: {
        neoMofox: content.neoMofox || { included: false },
        napcat: content.napcat || { included: false },
        plugins: content.plugins || { included: false, list: [] },
        config: content.config || { included: false },
        data: content.data || { included: false },
      },
    };
  }

  /**
   * 从文件读取 manifest
   * @param {string} manifestPath - manifest.json 文件路径
   * @returns {Promise<Object>} manifest 对象
   * @throws {Error} 文件不存在或解析失败
   */
  static async readManifest(manifestPath) {
    return new Promise((resolve, reject) => {
      fs.readFile(manifestPath, 'utf8', (err, data) => {
        if (err) {
          return reject(new Error(`读取 manifest 失败: ${err.message}`));
        }

        try {
          const manifest = JSON.parse(data);
          resolve(manifest);
        } catch (parseErr) {
          reject(new Error(`解析 manifest 失败: ${parseErr.message}`));
        }
      });
    });
  }

  /**
   * 将 manifest 写入文件
   * @param {string} manifestPath - manifest.json 文件路径
   * @param {Object} manifest - manifest 对象
   * @returns {Promise<void>}
   */
  static async writeManifest(manifestPath, manifest) {
    return new Promise((resolve, reject) => {
      const jsonStr = JSON.stringify(manifest, null, 2);
      fs.writeFile(manifestPath, jsonStr, 'utf8', (err) => {
        if (err) {
          return reject(new Error(`写入 manifest 失败: ${err.message}`));
        }
        resolve();
      });
    });
  }

  /**
   * 验证 manifest 格式
   * @param {Object} manifest - manifest 对象
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  static validateManifest(manifest) {
    const errors = [];

    // 检查必需字段
    if (!manifest.version) {
      errors.push('缺少 version 字段');
    }

    if (!manifest.packName || typeof manifest.packName !== 'string') {
      errors.push('packName 必须为非空字符串');
    }

    if (!manifest.content || typeof manifest.content !== 'object') {
      errors.push('缺少 content 字段');
    } else {
      // 检查 content 子字段
      const requiredContentFields = ['neoMofox', 'napcat', 'plugins', 'config', 'data'];
      requiredContentFields.forEach(field => {
        if (!manifest.content[field]) {
          errors.push(`content.${field} 缺失`);
        } else if (typeof manifest.content[field].included !== 'boolean') {
          errors.push(`content.${field}.included 必须为布尔值`);
        }
      });

      // 检查插件列表
      if (manifest.content.plugins && manifest.content.plugins.included) {
        if (!Array.isArray(manifest.content.plugins.list)) {
          errors.push('content.plugins.list 必须为数组');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 检查版本兼容性
   * @param {Object} manifest - manifest 对象
   * @returns {Object} { compatible: boolean, message: string }
   */
  static checkCompatibility(manifest) {
    const currentLauncherVersion = app.getVersion();
    const manifestVersion = manifest.version;

    // 简单版本检查（可扩展为语义化版本比较）
    if (manifestVersion !== MANIFEST_VERSION) {
      return {
        compatible: false,
        message: `不支持的 manifest 版本: ${manifestVersion}（当前支持 ${MANIFEST_VERSION}）`,
      };
    }

    // 可以添加更多兼容性检查
    // 例如：Launcher 版本要求等

    return {
      compatible: true,
      message: '兼容',
    };
  }

  /**
   * 从整合包目录解析 manifest
   * @param {string} packDir - 整合包解压目录
   * @returns {Promise<Object>} manifest 对象
   */
  static async parseFromPack(packDir) {
    const manifestPath = path.join(packDir, MANIFEST_FILENAME);
    
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`整合包中缺少 ${MANIFEST_FILENAME}`);
    }

    const manifest = await this.readManifest(manifestPath);
    
    // 验证格式
    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(`manifest 格式错误:\n${validation.errors.join('\n')}`);
    }

    // 检查兼容性
    const compatibility = this.checkCompatibility(manifest);
    if (!compatibility.compatible) {
      throw new Error(compatibility.message);
    }

    return manifest;
  }
}

// ─── 导出 ─────────────────────────────────────────────────────────────

module.exports = { ManifestManager, MANIFEST_FILENAME };
