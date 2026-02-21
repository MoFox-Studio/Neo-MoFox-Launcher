/**
 * theme-init.js — 同步主题注入，在 <head> 中最早执行
 * 必须以普通 <script> 引入（非 module），保证在任何 CSS 渲染前运行。
 * 通过 sendSync IPC 读取用户设置，立即写入 :root CSS 变量，彻底避免 FOUC。
 */
(function () {
  'use strict';

  // ─── 颜色工具 ──────────────────────────────────────────────────────────
  function hexToHsl(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + h / 30) % 12;
      var color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    }
    return '#' + f(0) + f(8) + f(4);
  }

  function generatePalette(hex, isDark) {
    var hsl = hexToHsl(hex);
    var h = hsl[0], s = hsl[1];
    if (isDark) {
      return {
        '--md-sys-color-primary':               hslToHex(h, Math.min(s, 80), 80),
        '--md-sys-color-on-primary':            hslToHex(h, s, 20),
        '--md-sys-color-primary-container':     hslToHex(h, s, 30),
        '--md-sys-color-on-primary-container':  hslToHex(h, Math.min(s, 60), 90),
        '--md-sys-color-secondary':             hslToHex((h + 30) % 360, Math.max(s - 20, 20), 78),
        '--md-sys-color-on-secondary':          hslToHex((h + 30) % 360, s, 20),
        '--md-sys-color-secondary-container':   hslToHex((h + 30) % 360, Math.max(s - 20, 20), 28),
        '--md-sys-color-on-secondary-container':hslToHex((h + 30) % 360, s, 88),
        '--md-sys-color-tertiary':              hslToHex((h + 60) % 360, Math.max(s - 10, 20), 78),
        '--md-sys-color-on-tertiary':           hslToHex((h + 60) % 360, s, 18),
        '--md-sys-color-tertiary-container':    hslToHex((h + 60) % 360, Math.max(s - 10, 20), 28),
        '--md-sys-color-on-tertiary-container': hslToHex((h + 60) % 360, s, 88),
      };
    } else {
      return {
        '--md-sys-color-primary':               hslToHex(h, s, 38),
        '--md-sys-color-on-primary':            '#ffffff',
        '--md-sys-color-primary-container':     hslToHex(h, Math.min(s, 60), 92),
        '--md-sys-color-on-primary-container':  hslToHex(h, s, 12),
        '--md-sys-color-secondary':             hslToHex((h + 30) % 360, Math.max(s - 20, 20), 40),
        '--md-sys-color-on-secondary':          '#ffffff',
        '--md-sys-color-secondary-container':   hslToHex((h + 30) % 360, Math.max(s - 20, 20), 90),
        '--md-sys-color-on-secondary-container':hslToHex((h + 30) % 360, s, 12),
        '--md-sys-color-tertiary':              hslToHex((h + 60) % 360, Math.max(s - 10, 20), 40),
        '--md-sys-color-on-tertiary':           '#ffffff',
        '--md-sys-color-tertiary-container':    hslToHex((h + 60) % 360, Math.max(s - 10, 20), 90),
        '--md-sys-color-on-tertiary-container': hslToHex((h + 60) % 360, s, 12),
      };
    }
  }

  // ─── 主题应用 ──────────────────────────────────────────────────────────
  function applyThemeSync(settings) {
    var theme = (settings && settings.theme) || 'dark';
    var accentColor = (settings && settings.accentColor) || '#7c6bbd';
    var root = document.documentElement;

    var effective = theme;
    if (theme === 'auto') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    root.setAttribute('data-theme', effective);
    var isDark = effective === 'dark';

    var palette = generatePalette(accentColor, isDark);
    for (var key in palette) {
      root.style.setProperty(key, palette[key]);
    }
  }

  // ─── 同步读取并立即应用 ────────────────────────────────────────────────
  try {
    if (window.mofoxAPI && typeof window.mofoxAPI.settingsReadSync === 'function') {
      var settings = window.mofoxAPI.settingsReadSync();
      applyThemeSync(settings);
    }
  } catch (e) {
    // 静默失败，保留 CSS 默认主题
    console.warn('[theme-init] 主题同步初始化失败:', e);
  }

  // 暴露给 theme.js 复用（避免重复计算）
  window.__themeApplySync = applyThemeSync;
}());
