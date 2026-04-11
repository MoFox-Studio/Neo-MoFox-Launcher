/**
 * theme.js - 全局主题应用工具
 * 从后端获取预计算的 Material Design 3 主题并应用
 * 可在任意渲染进程页面中 import 使用
 */

/**
 * 应用从后端获取的 Material Design 3 主题 CSS 变量到 :root
 * @param {Object} palette - 包含所有 CSS 变量的对象
 */
function applyThemeVars(palette) {
  const root = document.documentElement;
  
  console.log('[theme] 应用主题变量（从后端获取）');
  
  // 遍历并设置所有 CSS 变量
  for (const key in palette) {
    root.style.setProperty(key, palette[key]);
  }
}

// ─── 主题应用 ─────────────────────────────────────────────────────────────

/**
 * 从后端获取预计算的主题并应用
 * @param {{ theme: string, accentColor: string }} settings - 用户设置
 */
export async function applyTheme(settings) {
  console.log('[theme] 应用主题 -', settings);
  
  const { theme = 'dark' } = settings || {};
  const root = document.documentElement;
  
  // 计算有效主题
  let effective = theme;
  if (theme === 'auto') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  // 更新 data-theme 属性
  root.setAttribute('data-theme', effective);
  
  // 从后端获取预计算的主题
  if (window.mofoxAPI && typeof window.mofoxAPI.themeGet === 'function') {
    try {
      const computedTheme = await window.mofoxAPI.themeGet();
      if (computedTheme && computedTheme[effective]) {
        console.log('[theme] 应用从后端获取的主题变量');
        applyThemeVars(computedTheme[effective]);
      } else {
        console.warn('[theme] 未找到预计算主题，使用 CSS 默认值');
      }
    } catch (e) {
      console.warn('[theme] 获取后端主题失败，使用 CSS 默认值', e);
    }
  } else {
    console.warn('[theme] mofoxAPI.themeGet 不可用，使用 CSS 默认值');
  }
  
  console.log('[theme] 主题应用完成 -', { theme, effective });
}

/**
 * 监听系统主题变化（auto 模式下使用）
 * @param {{ theme: string, accentColor: string }} settings
 */
export function watchSystemTheme(settings) {
  if (settings.theme !== 'auto') return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    console.log('[theme] 系统主题变化，重新应用主题');
    applyTheme(settings);
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/**
 * 从 mofoxAPI 加载设置并应用主题（方便在 DOMContentLoaded 中调用）
 * theme-init.js 已在 head 中同步应用过一次；
 * 此函数主要负责确保主题正确应用并启动系统主题监听（auto 模式）。
 */
export async function initTheme() {
  if (!window.mofoxAPI) {
    console.warn('[theme] mofoxAPI 不可用');
    return;
  }
  
  try {
    const settings = await window.mofoxAPI.settingsRead();
    
    // 计算有效主题
    const effective = settings.theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : (settings.theme || 'dark');
    
    // 如果当前 data-theme 与设置不一致，重新应用主题
    if (document.documentElement.getAttribute('data-theme') !== effective) {
      console.log('[theme] 主题不一致，重新应用');
      await applyTheme(settings);
    }
    
    // 启动系统主题监听
    watchSystemTheme(settings);
  } catch (e) {
    console.warn('[theme] 加载设置失败，使用默认主题', e);
  }
}
