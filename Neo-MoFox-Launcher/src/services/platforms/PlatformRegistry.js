/**
 * PlatformRegistry - 单平台安装注册表
 * 负责声明 Launcher 可安装平台、系统可用性、平台能力入口和平台通用工具函数。
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { platformHelper } = require('../utils/PlatformHelper');
const { mirrorService } = require('../utils/MirrorService');
const { downloadFile } = require('../utils/RangeDownloader');
const { napcatPlatform } = require('./napcat');
const { snowlumaPlatform } = require('./snowluma');

const PLATFORM_MODULES = [napcatPlatform, snowlumaPlatform];
const REQUIRED_PLATFORM_FIELDS = [
  'id',
  'name',
  'displayName',
  'description',
  'directoryName',
  'adapterPluginName',
  'supportedPlatforms',
  'supportedArch',
  'systemRequirement',
];
const REQUIRED_PLATFORM_FUNCTIONS = ['isAvailable'];
const REQUIRED_CAPABILITY_FUNCTIONS = {
  installer: ['install'],
  config: ['writeAdapterConfig', 'configure'],
  updater: ['getReleases', 'update'],
  runtime: ['getStartCommand'],
};

class PlatformRegistry {
  constructor(platforms = PLATFORM_MODULES) {
    this._platforms = new Map();
    for (const platform of platforms) {
      this.register(platform);
    }
  }

  /**
   * 执行命令并返回 Promise。
   * @param {string} command 命令名
   * @param {string[]} args 参数列表
   * @param {Object} options 执行选项
   * @returns {Promise<{stdout: string, stderr: string}>} 命令执行结果
   */
  /**
   * 执行命令并返回 Promise（统一代理到 platformHelper.execCommand）。
   *
   * @param {string} command 命令名
   * @param {string[]} args 参数列表
   * @param {Object} options 执行选项
   * @returns {Promise<{stdout: string, stderr: string}>} 命令执行结果
   */
  _execCommand(command, args, options = {}) {
    return platformHelper.execCommand(command, args, options);
  }

  /**
   * HTTP/HTTPS GET 请求，支持重定向。
   * @param {string} url 请求地址
   * @param {Object<string, string>} headers 请求头
   * @returns {Promise<string>} 响应文本
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
   * 下载文件到本地路径。
   * @param {string} url 下载地址
   * @param {string} destPath 目标路径
   * @param {Function} [onProgress] 进度回调
   * @returns {Promise<void>} 下载完成 Promise
   */
  _downloadFile(url, destPath, onProgress) {
    return downloadFile(url, destPath, onProgress, { concurrency: 8 });
  }

  /**
   * 计算文件 SHA-256。
   * @param {string} filePath 文件路径
   * @returns {Promise<string>} 小写十六进制 SHA-256
   */
  _computeFileSha256(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * 解压 ZIP 文件（使用 extract-zip JS 库，跨平台统一）。
   * @param {string} zipPath ZIP 文件路径
   * @param {string} destDir 目标目录
   * @returns {Promise<void>} 解压完成 Promise
   */
  async _extractZip(zipPath, destDir) {
    await platformHelper.unzip(zipPath, destDir);
  }

  /**
   * 构建平台安装器通用工具集。
   * @returns {Object} 平台安装工具集
   */
  _buildInstallHelpers() {
    return {
      mirrorService,
      httpsGet: this._httpsGet.bind(this),
      execCommand: this._execCommand.bind(this),
      downloadFile: this._downloadFile.bind(this),
      computeFileSha256: this._computeFileSha256.bind(this),
      extractZip: this._extractZip.bind(this),
      getMirroredUrls: mirrorService.getUrls.bind(mirrorService),
    };
  }

  /**
   * 构建平台更新器专用工具集。
   * @returns {Object} 平台更新工具集
   */
  _buildUpdateHelpers() {
    return {
      mirrorService,
      httpsGet: this._httpsGet.bind(this),
      execCommand: this._execCommand.bind(this),
      downloadFile: this._downloadFile.bind(this),
      computeFileSha256: this._computeFileSha256.bind(this),
      extractZip: this._extractZip.bind(this),
      getMirroredUrls: mirrorService.getUrls.bind(mirrorService),
    };
  }

  /**
   * 注册平台实现。
   * @param {Object} platform 平台实现对象
   * @returns {void}
   */
  register(platform) {
    this._validatePlatform(platform);
    if (this._platforms.has(platform.id)) {
      throw new Error(`平台注册失败: 平台已存在 ${platform.id}`);
    }
    this._platforms.set(platform.id, platform);
  }

  /**
   * 校验平台是否完整声明必填元数据与能力函数。
   * @param {Object} platform 平台实现对象
   * @returns {void}
   */
  _validatePlatform(platform) {
    if (!platform || typeof platform !== 'object') {
      throw new Error('平台注册失败: 平台实现必须是对象');
    }

    for (const fieldName of REQUIRED_PLATFORM_FIELDS) {
      const value = platform[fieldName];
      const isEmptyArray = Array.isArray(value) && value.length === 0;
      if (value === undefined || value === null || value === '' || isEmptyArray) {
        throw new Error(`平台注册失败: 平台 ${platform.id || '<unknown>'} 缺少必填字段 ${fieldName}`);
      }
    }

    for (const functionName of REQUIRED_PLATFORM_FUNCTIONS) {
      if (typeof platform[functionName] !== 'function') {
        throw new Error(`平台注册失败: 平台 ${platform.id} 缺少必填函数 ${functionName}()`);
      }
    }

    for (const [capabilityName, functionNames] of Object.entries(REQUIRED_CAPABILITY_FUNCTIONS)) {
      const capability = platform[capabilityName];
      if (!capability || typeof capability !== 'object') {
        throw new Error(`平台注册失败: 平台 ${platform.id} 缺少能力模块 ${capabilityName}`);
      }

      for (const functionName of functionNames) {
        if (typeof capability[functionName] !== 'function') {
          throw new Error(`平台注册失败: 平台 ${platform.id} 的 ${capabilityName} 缺少必填函数 ${functionName}()`);
        }
      }
    }
  }

  /**
   * 获取平台实现。
   * @param {string} platformId 平台 ID
   * @returns {Object} 平台实现对象
   */
  getPlatform(platformId) {
    const platform = this._platforms.get(platformId);
    if (!platform) {
      throw new Error(`未知安装平台: ${platformId}`);
    }
    return platform;
  }

  /**
   * 获取平台实现，缺失时返回 null。
   * @param {string} platformId 平台 ID
   * @returns {Object|null} 平台实现对象
   */
  getPlatformOrNull(platformId) {
    return this._platforms.get(platformId) || null;
  }

  /**
   * 获取默认平台 ID。
   * @returns {string|null} 默认平台 ID
   */
  getDefaultPlatformId() {
    return null;
  }

  /**
   * 获取平台对当前系统的可用性。
   * @param {Object} platform 平台实现对象
   * @param {Object} [systemInfo] 系统信息
   * @returns {{available: boolean, reason: string|null}} 可用性结果
   */
  getAvailability(platform, systemInfo = platformHelper.detectSystemEnv()) {
    return platform.isAvailable(systemInfo);
  }

  /**
   * 列出可供前端展示的平台。
   * @param {Object} [systemInfo] 系统信息
   * @returns {Array<Object>} 平台展示列表
   */
  listPlatforms(systemInfo = platformHelper.detectSystemEnv()) {
    return Array.from(this._platforms.values()).map((platform) => {
      const availability = this.getAvailability(platform, systemInfo);
      return {
        id: platform.id,
        name: platform.name,
        displayName: platform.displayName,
        description: platform.description,
        directoryName: platform.directoryName,
        supportedPlatforms: platform.supportedPlatforms,
        supportedArch: platform.supportedArch,
        systemRequirement: platform.systemRequirement,
        available: availability.available,
        unavailableReason: availability.reason || null,
      };
    });
  }

  /**
   * 校验平台当前系统是否可安装。
   * @param {string} platformId 平台 ID
   * @param {Object} [systemInfo] 系统信息
   * @returns {Object} 平台实现对象
   */
  assertInstallable(platformId, systemInfo = platformHelper.detectSystemEnv()) {
    const platform = this.getPlatform(platformId);
    const availability = this.getAvailability(platform, systemInfo);
    if (!availability.available) {
      throw new Error(availability.reason || `${platform.displayName || platform.name} 不支持当前系统`);
    }
    return platform;
  }

  /**
   * 执行指定平台安装，内部注入平台安装 helper。
   * @param {string} platformId 平台 ID
   * @param {Object} params 安装参数
   * @param {Object} params.context 安装上下文
   * @param {Object} params.inputs 用户输入
   * @param {Object} params.options 步骤选项
   * @param {string} params.platformDir 平台安装目录
   * @returns {Promise<Object>} 安装结果
   */
  async installPlatform(platformId, { context, inputs, options, platformDir }) {
    const platform = this.getPlatform(platformId);
    return await platform.installer.install({
      context,
      inputs,
      options,
      platformDir,
      helpers: this._buildInstallHelpers(),
    });
  }

  /**
   * 获取指定平台版本列表，内部注入平台更新 helper。
   * @param {string} platformId 平台 ID
   * @param {number} limit 返回数量
   * @returns {Promise<Array<Object>>} Release 列表
   */
  async getPlatformReleases(platformId, limit = 10) {
    const platform = this.getPlatform(platformId);
    return await platform.updater.getReleases(this._buildUpdateHelpers(), limit);
  }

  /**
   * 更新指定实例的平台，内部注入平台更新 helper。
   * @param {Object} instance 实例对象
   * @param {string} targetVersion 目标版本
   * @param {Function} emitProgress 进度回调
   * @returns {Promise<Object>} 更新结果
   */
  async updatePlatform(instance, targetVersion, emitProgress) {
    const platform = this.getPlatform(instance.platform);
    return await platform.updater.update({
      instance,
      targetVersion,
      emitProgress,
      helpers: this._buildUpdateHelpers(),
    });
  }
}

const platformRegistry = new PlatformRegistry();

module.exports = { platformRegistry, PlatformRegistry };
