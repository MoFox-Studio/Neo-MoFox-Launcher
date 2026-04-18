/**
 * PackValidator - 整合包验证器
 * 负责验证整合包的完整性、格式、兼容性
 * 
 * 依赖：需要安装 adm-zip 库用于 ZIP 文件验证
 * npm install adm-zip
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { ManifestManager } = require('./ManifestManager');

// TODO: 需要安装 adm-zip 依赖
// const AdmZip = require('adm-zip');

// ─── 常量定义 ───────────────────────────────────────────────────────────

const PACK_EXTENSION = '.mfpack';
const MANIFEST_FILENAME = 'manifest.json';

// ─── PackValidator 类 ──────────────────────────────────────────────────

/**
 * 整合包验证器类
 */
class PackValidator {
  /**
   * 验证整合包文件
   * @param {string} packPath - 整合包文件路径
   * @returns {Promise<Object>} { valid: boolean, errors: string[], warnings: string[], manifest: Object }
   */
  static async validatePack(packPath) {
    const errors = [];
    const warnings = [];
    let manifest = null;

    try {
      // 1. 验证文件存在性
      const fileCheck = await this._checkFileExists(packPath);
      if (!fileCheck.valid) {
        errors.push(fileCheck.error);
        return { valid: false, errors, warnings, manifest: null };
      }

      // 2. 验证文件扩展名
      const extCheck = this._checkFileExtension(packPath);
      if (!extCheck.valid) {
        errors.push(extCheck.error);
        return { valid: false, errors, warnings, manifest: null };
      }

      // 3. 验证 ZIP 文件完整性
      const zipCheck = await this._checkZipIntegrity(packPath);
      if (!zipCheck.valid) {
        errors.push(zipCheck.error);
        return { valid: false, errors, warnings, manifest: null };
      }

      // 4. 验证 manifest.json 存在性
      const manifestCheck = await this._checkManifestExists(packPath);
      if (!manifestCheck.valid) {
        errors.push(manifestCheck.error);
        return { valid: false, errors, warnings, manifest: null };
      }

      // 5. 读取和验证 manifest.json
      const manifestValidation = await this._validateManifest(packPath);
      if (!manifestValidation.valid) {
        errors.push(...manifestValidation.errors);
        return { valid: false, errors, warnings, manifest: null };
      }
      manifest = manifestValidation.manifest;

      // 6. 验证内容完整性（根据 manifest 检查文件是否存在）
      const contentCheck = await this._checkContentIntegrity(packPath, manifest);
      if (!contentCheck.valid) {
        errors.push(...contentCheck.errors);
      }
      warnings.push(...contentCheck.warnings);

      // 7. 兼容性检查
      const compatibilityCheck = this._checkCompatibility(manifest);
      if (!compatibilityCheck.compatible) {
        errors.push(compatibilityCheck.message);
      }
      if (compatibilityCheck.warnings) {
        warnings.push(...compatibilityCheck.warnings);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        manifest,
      };
    } catch (error) {
      errors.push(`验证过程出错: ${error.message}`);
      return { valid: false, errors, warnings, manifest: null };
    }
  }

  /**
   * 快速验证（仅检查文件存在性和 manifest 格式）
   * @param {string} packPath - 整合包文件路径
   * @returns {Promise<Object>} { valid: boolean, manifest: Object, error?: string }
   */
  static async quickValidate(packPath) {
    try {
      // 检查文件存在性
      const fileCheck = await this._checkFileExists(packPath);
      if (!fileCheck.valid) {
        return { valid: false, manifest: null, error: fileCheck.error };
      }

      // 检查扩展名
      const extCheck = this._checkFileExtension(packPath);
      if (!extCheck.valid) {
        return { valid: false, manifest: null, error: extCheck.error };
      }

      // 检查 manifest 存在性
      const manifestCheck = await this._checkManifestExists(packPath);
      if (!manifestCheck.valid) {
        return { valid: false, manifest: null, error: manifestCheck.error };
      }

      // 验证 manifest
      const manifestValidation = await this._validateManifest(packPath);
      if (!manifestValidation.valid) {
        return {
          valid: false,
          manifest: null,
          error: manifestValidation.errors.join('; '),
        };
      }

      return {
        valid: true,
        manifest: manifestValidation.manifest,
      };
    } catch (error) {
      return { valid: false, manifest: null, error: error.message };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 私有验证方法
  // ───────────────────────────────────────────────────────────────────────

  /**
   * 检查文件是否存在
   */
  static async _checkFileExists(filePath) {
    return new Promise((resolve) => {
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          resolve({ valid: false, error: `文件不存在: ${filePath}` });
        } else {
          resolve({ valid: true });
        }
      });
    });
  }

  /**
   * 检查文件扩展名
   */
  static _checkFileExtension(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== PACK_EXTENSION) {
      return {
        valid: false,
        error: `文件扩展名错误: 期望 ${PACK_EXTENSION}，实际为 ${ext}`,
      };
    }
    return { valid: true };
  }

  /**
   * 检查 ZIP 文件完整性
   * @param {string} packPath - 整合包文件路径
   * @returns {Promise<Object>} { valid: boolean, error?: string }
   */
  static async _checkZipIntegrity(packPath) {
    try {
      // 使用 adm-zip 验证 ZIP 文件
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(packPath);
      const zipEntries = zip.getEntries();

      if (zipEntries.length === 0) {
        return { valid: false, error: '整合包为空' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: `ZIP 文件损坏或格式错误: ${error.message}` };
    }
  }

  /**
   * 检查 manifest.json 是否存在于 ZIP 中
   */
  static async _checkManifestExists(packPath) {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(packPath);
      const manifestEntry = zip.getEntry(MANIFEST_FILENAME);

      if (!manifestEntry) {
        return { valid: false, error: `整合包中缺少 ${MANIFEST_FILENAME}` };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: `检查 manifest 时出错: ${error.message}` };
    }
  }

  /**
   * 验证 manifest.json 格式
   */
  static async _validateManifest(packPath) {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(packPath);
      const manifestEntry = zip.getEntry(MANIFEST_FILENAME);

      if (!manifestEntry) {
        return { valid: false, errors: [`缺少 ${MANIFEST_FILENAME}`], manifest: null };
      }

      // 读取 manifest 内容
      const manifestContent = manifestEntry.getData().toString('utf8');
      let manifest;

      try {
        manifest = JSON.parse(manifestContent);
      } catch (parseErr) {
        return {
          valid: false,
          errors: [`manifest.json 格式错误: ${parseErr.message}`],
          manifest: null,
        };
      }

      // 使用 ManifestManager 验证格式
      const validation = ManifestManager.validateManifest(manifest);
      if (!validation.valid) {
        return { valid: false, errors: validation.errors, manifest: null };
      }

      return { valid: true, errors: [], manifest };
    } catch (error) {
      return { valid: false, errors: [`验证 manifest 时出错: ${error.message}`], manifest: null };
    }
  }

  /**
   * 检查内容完整性（根据 manifest 检查文件是否存在）
   */
  static async _checkContentIntegrity(packPath, manifest) {
    const errors = [];
    const warnings = [];

    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(packPath);

      // 检查 Neo-MoFox 主程序
      if (manifest.content.neoMofox.included) {
        const neoMofoxEntry = zip.getEntry('neo-mofox/');
        if (!neoMofoxEntry) {
          errors.push('manifest 声明包含 Neo-MoFox，但未找到 neo-mofox/ 目录');
        } else {
          // 检查关键文件
          const requiredFiles = ['neo-mofox/main.py', 'neo-mofox/pyproject.toml'];
          for (const file of requiredFiles) {
            const entry = zip.getEntry(file);
            if (!entry) {
              warnings.push(`Neo-MoFox 目录中缺少 ${file}`);
            }
          }
        }
      }

      // 检查 NapCat
      if (manifest.content.napcat.included) {
        const napcatEntry = zip.getEntry('napcat/');
        if (!napcatEntry) {
          errors.push('manifest 声明包含 NapCat，但未找到 napcat/ 目录');
        }
      }

      // 检查插件
      if (manifest.content.plugins.included) {
        const pluginsEntry = zip.getEntry('extra/plugins/');
        if (!pluginsEntry) {
          errors.push('manifest 声明包含插件，但未找到 extra/plugins/ 目录');
        } else {
          // 检查插件列表是否匹配
          const pluginList = manifest.content.plugins.list || [];
          for (const pluginName of pluginList) {
            const pluginEntry = zip.getEntry(`extra/plugins/${pluginName}/`) || zip.getEntry(`extra/plugins/${pluginName}`);
            if (!pluginEntry) {
              warnings.push(`插件列表中声明了 ${pluginName}，但未找到对应文件`);
            }
          }
        }
      }

      // 检查配置文件
      if (manifest.content.config.included) {
        const configEntry = zip.getEntry('extra/config/core.toml');
        if (!configEntry) {
          errors.push('manifest 声明包含配置文件，但未找到 extra/config/core.toml');
        }
      }

      // 检查数据文件
      if (manifest.content.data.included) {
        const dataEntry = zip.getEntry('extra/data/');
        if (!dataEntry) {
          warnings.push('manifest 声明包含数据文件，但未找到 extra/data/ 目录');
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(`检查内容完整性时出错: ${error.message}`);
      return { valid: false, errors, warnings };
    }
  }

  /**
   * 兼容性检查
   */
  static _checkCompatibility(manifest) {
    const warnings = [];
    
    // 使用 ManifestManager 的兼容性检查
    const compatibility = ManifestManager.checkCompatibility(manifest);
    
    if (!compatibility.compatible) {
      return {
        compatible: false,
        message: compatibility.message,
        warnings,
      };
    }

    // 额外的兼容性检查（可扩展）
    const currentLauncherVersion = app.getVersion();
    const manifestLauncherVersion = manifest.launcherVersion;

    // 简单版本比较（可扩展为语义化版本比较）
    if (manifestLauncherVersion && manifestLauncherVersion !== currentLauncherVersion) {
      warnings.push(
        `整合包由 Launcher ${manifestLauncherVersion} 创建，当前版本为 ${currentLauncherVersion}，可能存在兼容性问题`
      );
    }

    return {
      compatible: true,
      message: '兼容',
      warnings,
    };
  }
}

// ─── 导出 ─────────────────────────────────────────────────────────────

module.exports = { PackValidator };
