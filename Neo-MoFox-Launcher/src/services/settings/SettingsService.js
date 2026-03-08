/**
 * SettingsService - Launcher 用户设置服务
 * 管理持久化的用户偏好设置，存储在数据目录的 settings.json 中
 */

const fs = require('fs');
const path = require('path');
const { storageService } = require('../install/StorageService');

// ─── 常量定义 ───────────────────────────────────────────────────────────

const SETTINGS_FILE = 'settings.json';

// ─── 默认设置 ────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  // 通用
  defaultInstallDir: 'D:\\Neo-MoFox_Bots',
  language: 'zh-CN',

  // 外观
  theme: 'dark',             // 'dark' | 'light' | 'auto'
  accentColor: '#367BF0',

  // Napcat
  autoOpenNapcatWebUI: true,  // 实例启动后自动打开 Napcat WebUI
};

// ─── SettingsService 类 ──────────────────────────────────────────────────

class SettingsService {
  constructor() {
    this._cache = null;
  }

  /**
   * 获取 settings.json 路径
   */
  _getSettingsPath() {
    return path.join(storageService.getDataDir(), SETTINGS_FILE);
  }

  /**
   * 读取全部设置（含默认值兜底）
   */
  readSettings() {
    storageService.init();
    if (this._cache) return { ...this._cache };

    const settingsPath = this._getSettingsPath();
    const stored = storageService._readJsonFile(settingsPath, {});
    this._cache = { ...DEFAULT_SETTINGS, ...stored };

    console.log(`[SettingsService] 设置已加载: ${settingsPath}`);
    return { ...this._cache };
  }

  /**
   * 读取单个设置项
   * @param {string} key - 设置键名
   * @returns {*} 对应值，不存在时返回默认值
   */
  get(key) {
    const settings = this.readSettings();
    return key in settings ? settings[key] : DEFAULT_SETTINGS[key];
  }

  /**
   * 更新设置（合并写入，仅传入需要修改的字段）
   * @param {Partial<typeof DEFAULT_SETTINGS>} patch
   * @returns {typeof DEFAULT_SETTINGS} 更新后的完整设置
   */
  set(patch) {
    storageService.init();
    const current = this.readSettings();
    const updated = { ...current, ...patch };

    this._cache = updated;
    storageService._writeJsonFile(this._getSettingsPath(), updated);

    console.log(`[SettingsService] 设置已保存`, Object.keys(patch));
    return { ...updated };
  }

  /**
   * 重置单个或全部设置为默认值
   * @param {string|null} key - 传 null 则重置全部
   */
  reset(key = null) {
    if (key === null) {
      this._cache = { ...DEFAULT_SETTINGS };
    } else {
      const current = this.readSettings();
      current[key] = DEFAULT_SETTINGS[key];
      this._cache = current;
    }
    storageService._writeJsonFile(this._getSettingsPath(), this._cache);
    return { ...this._cache };
  }

  /**
   * 使缓存失效，下次读取时重新从磁盘加载
   */
  invalidateCache() {
    this._cache = null;
  }
}

// ─── 导出单例 ────────────────────────────────────────────────────────────

const settingsService = new SettingsService();

module.exports = { settingsService, SettingsService, DEFAULT_SETTINGS };
