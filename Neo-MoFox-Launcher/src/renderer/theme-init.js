/**
 * theme-init.js — 同步主题注入，在 <head> 中最早执行
 * 必须以普通 <script> 引入（非 module），保证在任何 CSS 渲染前运行。
 * 通过 sendSync IPC 读取后端预计算的 Material Design 3 主题，立即应用，彻底避免 FOUC。
 */
(function () {
  'use strict';

  // ─── 主题应用 ──────────────────────────────────────────────────────────
  function applyThemeSync(settings, computedTheme) {
    var theme = (settings && settings.theme) || 'dark';
    var root = document.documentElement;

    // 确定实际使用的主题
    var effective = theme;
    if (theme === 'auto') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    root.setAttribute('data-theme', effective);
    console.log('[theme-init] 应用主题:', effective);

    // 如果有预计算的主题，直接应用
    if (computedTheme && computedTheme[effective]) {
      var palette = computedTheme[effective];
      console.log('[theme-init] 应用 Material Design 3 CSS 变量到 :root');
      for (var key in palette) {
        root.style.setProperty(key, palette[key]);
        if (key.indexOf('primary') !== -1) {
          console.log('[theme-init] ' + key + ' = ' + palette[key]);
        }
      }
    } else {
      console.warn('[theme-init] 未找到预计算主题，使用 CSS 默认值');
    }
  }

  // ─── 同步读取并立即应用 ────────────────────────────────────────────────
  try {
    if (window.mofoxAPI) {
      // 读取用户设置
      var settings = null;
      if (typeof window.mofoxAPI.settingsReadSync === 'function') {
        settings = window.mofoxAPI.settingsReadSync();
      }

      // 读取预计算的主题
      var computedTheme = null;
      if (typeof window.mofoxAPI.themeGetSync === 'function') {
        computedTheme = window.mofoxAPI.themeGetSync();
      }

      applyThemeSync(settings, computedTheme);
    }
  } catch (e) {
    // 静默失败，保留 CSS 默认主题
    console.warn('[theme-init] 主题同步初始化失败:', e);
  }

  // 暴露给其他脚本复用（避免重复计算）
  window.__themeApplySync = applyThemeSync;
}());
