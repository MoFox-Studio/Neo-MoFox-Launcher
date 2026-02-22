/**
 * theme.js - 全局主题应用工具
 * 根据用户设置应用 dark/light/auto 主题与强调色
 * 可在任意渲染进程页面中 import 使用
 */

// ─── 颜色工具函数 ─────────────────────────────────────────────────────────

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToRgb(hex) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

/**
 * 从 base hex 生成 MD3 风格的色调组
 */
function generatePalette(hex, isDark) {
  const [h, s] = hexToHsl(hex);
  console.log('[theme] 生成调色板 -', { hex, isDark, h, s });
  const palette = {};

  const p = (key, val) => { palette[key] = val; };
  const prgb = (key, val) => { palette[key] = val; palette[`${key}-rgb`] = hexToRgb(val); };

  if (isDark) {
      prgb('--md-sys-color-primary',               hslToHex(h, Math.min(s, 80), 80));
      p   ('--md-sys-color-on-primary',            hslToHex(h, s, 20));
      prgb('--md-sys-color-primary-container',     hslToHex(h, s, 30));
      p   ('--md-sys-color-on-primary-container',  hslToHex(h, Math.min(s, 60), 90));
      
      prgb('--md-sys-color-secondary',             hslToHex((h + 30) % 360, Math.max(s - 20, 20), 78));
      p   ('--md-sys-color-on-secondary',          hslToHex((h + 30) % 360, s, 20));
      prgb('--md-sys-color-secondary-container',   hslToHex((h + 30) % 360, Math.max(s - 20, 20), 28));
      p   ('--md-sys-color-on-secondary-container',hslToHex((h + 30) % 360, s, 88));
      
      prgb('--md-sys-color-tertiary',              hslToHex((h + 60) % 360, Math.max(s - 10, 20), 78));
      p   ('--md-sys-color-on-tertiary',           hslToHex((h + 60) % 360, s, 18));
      prgb('--md-sys-color-tertiary-container',    hslToHex((h + 60) % 360, Math.max(s - 10, 20), 28));
      p   ('--md-sys-color-on-tertiary-container', hslToHex((h + 60) % 360, s, 88));
      
      prgb('--md-sys-color-error',                 '#f2b8b5');
      p   ('--md-sys-color-on-error',              '#601410');
      prgb('--md-sys-color-error-container',       '#8c1d18');
      p   ('--md-sys-color-on-error-container',    '#f9dedc');
  } else {
      prgb('--md-sys-color-primary',               hslToHex(h, s, 38));
      p   ('--md-sys-color-on-primary',            '#ffffff');
      prgb('--md-sys-color-primary-container',     hslToHex(h, Math.min(s, 60), 92));
      p   ('--md-sys-color-on-primary-container',  hslToHex(h, s, 12));
      
      prgb('--md-sys-color-secondary',             hslToHex((h + 30) % 360, Math.max(s - 20, 20), 40));
      p   ('--md-sys-color-on-secondary',          '#ffffff');
      prgb('--md-sys-color-secondary-container',   hslToHex((h + 30) % 360, Math.max(s - 20, 20), 90));
      p   ('--md-sys-color-on-secondary-container',hslToHex((h + 30) % 360, s, 12));
      
      prgb('--md-sys-color-tertiary',              hslToHex((h + 60) % 360, Math.max(s - 10, 20), 40));
      p   ('--md-sys-color-on-tertiary',           '#ffffff');
      prgb('--md-sys-color-tertiary-container',    hslToHex((h + 60) % 360, Math.max(s - 10, 20), 90));
      p   ('--md-sys-color-on-tertiary-container', hslToHex((h + 60) % 360, s, 12));
      
      prgb('--md-sys-color-error',                 '#ba1a1a');
      p   ('--md-sys-color-on-error',              '#ffffff');
      prgb('--md-sys-color-error-container',       '#ffdad6');
      p   ('--md-sys-color-on-error-container',    '#410002');
  }
  console.log('[theme] 生成的调色板:', palette);
  return palette;
}

// ─── 主题应用 ─────────────────────────────────────────────────────────────

/**
 * 根据 settings 应用主题与强调色
 * 优先复用 theme-init.js 注入的同步函数（避免重复计算）
 * @param {{ theme: string, accentColor: string }} settings
 */
export function applyTheme(settings) {
  console.log('[theme] 应用主题 -', settings);
  if (window.__themeApplySync) {
    window.__themeApplySync(settings);
    return;
  }
  // 备用实现（theme-init.js 未加载时）
  const { theme = 'dark', accentColor = '#7c6bbd' } = settings || {};
  const root = document.documentElement;
  let effective = theme;
  if (theme === 'auto') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', effective);
  const isDark = effective === 'dark';
  const palette = generatePalette(accentColor, isDark);
  console.log('[theme] 应用 CSS 变量到 :root');
  for (const [key, val] of Object.entries(palette)) {
    root.style.setProperty(key, val);
  }
}

/**
 * 监听系统主题变化（auto 模式下使用）
 * @param {{ theme: string, accentColor: string }} settings
 */
export function watchSystemTheme(settings) {
  if (settings.theme !== 'auto') return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => applyTheme(settings);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/**
 * 从 mofoxAPI 加载设置并应用主题（方便在 DOMContentLoaded 中调用）
 * theme-init.js 已在 head 中同步应用过一次；
 * 此函数主要负责启动系统主题监听（auto 模式）。
 */
export async function initTheme() {
  if (!window.mofoxAPI) return;
  try {
    const settings = await window.mofoxAPI.settingsRead();
    // 如果当前 data-theme 与设置一致，无需重复写入 CSS 变量
    const effective = settings.theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : (settings.theme || 'dark');
    if (document.documentElement.getAttribute('data-theme') !== effective) {
      applyTheme(settings);
    }
    watchSystemTheme(settings);
  } catch (e) {
    console.warn('[theme] 加载设置失败，使用默认主题', e);
  }
}
