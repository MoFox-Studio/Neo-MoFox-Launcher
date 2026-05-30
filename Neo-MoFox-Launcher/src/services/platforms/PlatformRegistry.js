/**
 * PlatformRegistry - 单平台安装注册表
 * 负责声明 Launcher 可安装平台、系统可用性和平台能力入口。
 */

'use strict';

const { platformHelper } = require('../utils/PlatformHelper');
const { napcatPlatform } = require('./napcat');

const PLATFORM_MODULES = [napcatPlatform];

class PlatformRegistry {
  constructor(platforms = PLATFORM_MODULES) {
    this._platforms = new Map();
    for (const platform of platforms) {
      this.register(platform);
    }
  }

  /**
   * 注册平台实现。
   * @param {Object} platform 平台实现对象
   * @returns {void}
   */
  register(platform) {
    if (!platform || !platform.id) {
      throw new Error('平台注册失败: 缺少平台 ID');
    }
    if (this._platforms.has(platform.id)) {
      throw new Error(`平台注册失败: 平台已存在 ${platform.id}`);
    }
    this._platforms.set(platform.id, platform);
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
   * @returns {string} 默认平台 ID
   */
  getDefaultPlatformId() {
    return 'napcat';
  }

  /**
   * 获取平台对当前系统的可用性。
   * @param {Object} platform 平台实现对象
   * @param {Object} [systemInfo] 系统信息
   * @returns {{available: boolean, reason: string|null}} 可用性结果
   */
  getAvailability(platform, systemInfo = platformHelper.detectSystemEnv()) {
    if (typeof platform.isAvailable === 'function') {
      return platform.isAvailable(systemInfo);
    }

    return { available: true, reason: null };
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
        displayName: platform.displayName || platform.name,
        description: platform.description || '',
        directoryName: platform.directoryName,
        supportedPlatforms: platform.supportedPlatforms || [],
        supportedArch: platform.supportedArch || [],
        systemRequirement: platform.systemRequirement || null,
        available: availability.available,
        unavailableReason: availability.reason || null,
        recommended: platform.id === this.getDefaultPlatformId(),
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
}

const platformRegistry = new PlatformRegistry();

module.exports = { platformRegistry, PlatformRegistry };
