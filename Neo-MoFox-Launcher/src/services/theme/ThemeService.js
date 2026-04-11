/**
 * ThemeService.js - Material Design 3 主题服务
 * 使用 @material/material-color-utilities 生成完整的 Material You 主题
 */

const fs = require('fs');
const path = require('path');
const { storageService } = require('../install/StorageService');

class ThemeService {
  constructor() {
    this.themeCache = null;
    this.lastAccentColor = null;
    this.lastThemeMode = null;
    this.materialColorUtils = null;
    this._initPromise = null;
  }

  /**
   * 初始化 Material Color Utilities（动态导入 ES Module）
   * @private
   */
  async _ensureInitialized() {
    if (this.materialColorUtils) {
      return;
    }

    if (this._initPromise) {
      await this._initPromise;
      return;
    }

    this._initPromise = (async () => {
      try {
        this.materialColorUtils = await import('@material/material-color-utilities');
        console.log('[ThemeService] Material Color Utilities 已加载');
      } catch (error) {
        console.error('[ThemeService] 加载 Material Color Utilities 失败:', error);
        throw error;
      }
    })();

    await this._initPromise;
  }

  /**
   * 获取主题文件路径
   */
  getThemeFilePath() {
    const dataDir = storageService.getDataDir();
    return path.join(dataDir, 'theme-computed.json');
  }

  /**
   * 从源颜色生成完整主题
   * @param {string} accentColor - 主题色（十六进制格式，如 '#7c6bbd'）
   * @param {string} themeMode - 主题模式 ('light' | 'dark' | 'auto')
   * @param {object} options - 额外选项
   * @returns {Promise<object>} 包含 light 和 dark 两套主题的对象
   */
  async generateTheme(accentColor, themeMode = 'dark', options = {}) {
    await this._ensureInitialized();
    
    const {
      schemeType = 'tonalSpot', // 'content' | 'tonalSpot' | 'vibrant' | 'expressive'
    } = options;

    console.log('[ThemeService] 生成主题 -', { accentColor, themeMode, schemeType });

    const { argbFromHex, Hct, SchemeContent, SchemeTonalSpot, SchemeVibrant, SchemeExpressive } = this.materialColorUtils;

    // 将十六进制颜色转为 ARGB
    const argb = argbFromHex(accentColor);
    
    // 创建 HCT 颜色对象（色相、色度、色调）
    const hct = Hct.fromInt(argb);

    // 根据 schemeType 生成不同的配色方案
    let lightScheme, darkScheme;
    
    switch (schemeType) {
      case 'content':
        lightScheme = new SchemeContent(hct, false, 0.0);
        darkScheme = new SchemeContent(hct, true, 0.0);
        break;
      case 'vibrant':
        lightScheme = new SchemeVibrant(hct, false, 0.0);
        darkScheme = new SchemeVibrant(hct, true, 0.0);
        break;
      case 'expressive':
        lightScheme = new SchemeExpressive(hct, false, 0.0);
        darkScheme = new SchemeExpressive(hct, true, 0.0);
        break;
      case 'tonalSpot':
      default:
        lightScheme = new SchemeTonalSpot(hct, false, 0.0);
        darkScheme = new SchemeTonalSpot(hct, true, 0.0);
        break;
    }

    // 转换为 CSS 变量格式
    const lightTheme = this._schemeToVars(lightScheme, false);
    const darkTheme = this._schemeToVars(darkScheme, true);

    const result = {
      accentColor,
      themeMode,
      schemeType,
      generatedAt: new Date().toISOString(),
      light: lightTheme,
      dark: darkTheme,
    };

    // 缓存结果
    this.themeCache = result;
    this.lastAccentColor = accentColor;
    this.lastThemeMode = themeMode;

    console.log('[ThemeService] 主题生成完成');
    return result;
  }

  /**
   * 将 Scheme 对象转换为 CSS 变量格式
   * @private
   */
  _schemeToVars(scheme, isDark) {
    const { hexFromArgb } = this.materialColorUtils;
    const vars = {};

    // Material Design 3 色彩系统映射
    const colorMap = {
      // Primary
      'primary': scheme.primary,
      'onPrimary': scheme.onPrimary,
      'primaryContainer': scheme.primaryContainer,
      'onPrimaryContainer': scheme.onPrimaryContainer,
      
      // Secondary
      'secondary': scheme.secondary,
      'onSecondary': scheme.onSecondary,
      'secondaryContainer': scheme.secondaryContainer,
      'onSecondaryContainer': scheme.onSecondaryContainer,
      
      // Tertiary
      'tertiary': scheme.tertiary,
      'onTertiary': scheme.onTertiary,
      'tertiaryContainer': scheme.tertiaryContainer,
      'onTertiaryContainer': scheme.onTertiaryContainer,
      
      // Error
      'error': scheme.error,
      'onError': scheme.onError,
      'errorContainer': scheme.errorContainer,
      'onErrorContainer': scheme.onErrorContainer,
      
      // Background
      'background': scheme.background,
      'onBackground': scheme.onBackground,
      
      // Surface
      'surface': scheme.surface,
      'onSurface': scheme.onSurface,
      'surfaceVariant': scheme.surfaceVariant,
      'onSurfaceVariant': scheme.onSurfaceVariant,
      
      // Outline
      'outline': scheme.outline,
      'outlineVariant': scheme.outlineVariant,
      
      // Shadow & Scrim
      'shadow': scheme.shadow,
      'scrim': scheme.scrim,
      
      // Inverse
      'inverseSurface': scheme.inverseSurface,
      'inverseOnSurface': scheme.inverseOnSurface,
      'inversePrimary': scheme.inversePrimary,
    };

    // 转换为 CSS 变量格式
    for (const [key, argb] of Object.entries(colorMap)) {
      const hex = hexFromArgb(argb);
      const cssVarName = `--md-sys-color-${this._camelToKebab(key)}`;
      vars[cssVarName] = hex;
      
      // 同时生成 RGB 格式（用于 rgba 透明度）
      // 包括基础颜色和 container 颜色
      if (['primary', 'secondary', 'tertiary', 'error', 
           'primaryContainer', 'secondaryContainer', 'tertiaryContainer',
           'onPrimary', 'onSecondary', 'onPrimaryContainer'].includes(key)) {
        vars[`${cssVarName}-rgb`] = this._hexToRgb(hex);
      }
    }

    // 添加 Surface 层级变量（Material 3 用于卡片、面板等）
    vars['--md-sys-color-surface-dim'] = hexFromArgb(scheme.surfaceDim);
    vars['--md-sys-color-surface-bright'] = hexFromArgb(scheme.surfaceBright);
    vars['--md-sys-color-surface-container-lowest'] = hexFromArgb(scheme.surfaceContainerLowest);
    vars['--md-sys-color-surface-container-low'] = hexFromArgb(scheme.surfaceContainerLow);
    vars['--md-sys-color-surface-container'] = hexFromArgb(scheme.surfaceContainer);
    vars['--md-sys-color-surface-container-high'] = hexFromArgb(scheme.surfaceContainerHigh);
    vars['--md-sys-color-surface-container-highest'] = hexFromArgb(scheme.surfaceContainerHighest);

    return vars;
  }

  /**
   * 驼峰转短横线
   */
  _camelToKebab(str) {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * 十六进制转 RGB 字符串
   */
  _hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  }

  /**
   * 保存主题到文件
   * @param {object} theme - 主题对象
   */
  saveTheme(theme) {
    const filePath = this.getThemeFilePath();
    try {
      fs.writeFileSync(filePath, JSON.stringify(theme, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('[ThemeService] 保存主题失败:', error);
      return false;
    }
  }

  /**
   * 从文件加载主题
   * @returns {object|null} 主题对象或 null
   */
  loadTheme() {
    const filePath = this.getThemeFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const theme = JSON.parse(content);
        this.themeCache = theme;
        console.log('[ThemeService] 主题已从文件加载');
        return theme;
      }
    } catch (error) {
      console.error('[ThemeService] 加载主题失败:', error);
    }
    return null;
  }

  /**
   * 根据设置更新主题并保存
   * @param {object} settings - 用户设置对象
   * @returns {Promise<object>} 主题对象
   */
  async updateThemeFromSettings(settings) {
    const accentColor = settings.accentColor || '#7c6bbd';
    const themeMode = settings.theme || 'dark';
    const schemeType = settings.schemeType || 'tonalSpot';

    // 检查是否需要重新生成
    if (
      this.themeCache &&
      this.lastAccentColor === accentColor &&
      this.lastThemeMode === themeMode &&
      this.themeCache.schemeType === schemeType
    ) {
      console.log('[ThemeService] 使用缓存的主题');
      return this.themeCache;
    }

    // 生成并保存新主题
    const theme = await this.generateTheme(accentColor, themeMode, { schemeType });
    this.saveTheme(theme);
    return theme;
  }

  /**
   * 获取当前主题（从缓存或文件）
   */
  getCurrentTheme() {
    return this.themeCache || this.loadTheme();
  }

  /**
   * 清除主题缓存
   */
  clearCache() {
    this.themeCache = null;
    this.lastAccentColor = null;
    this.lastThemeMode = null;
    console.log('[ThemeService] 主题缓存已清除');
  }
}

// 导出单例实例
const themeService = new ThemeService();

module.exports = { themeService, ThemeService };
