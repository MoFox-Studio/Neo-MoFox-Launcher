/**
 * 配置编辑器主题适配
 * 动态生成 CodeMirror 6 主题，与系统主题保持一致
 */

const { EditorView } = require('@codemirror/view');
const { tags: t } = require('@lezer/highlight');
const { HighlightStyle, syntaxHighlighting } = require('@codemirror/language');

/**
 * 创建编辑器主题
 * @param {boolean} isDark - 是否为深色模式
 * @param {string} accentColor - 强调色（16进制）
 * @returns {Extension} CodeMirror 主题扩展
 */
function createEditorTheme(isDark, accentColor = '#367BF0') {
  // 从CSS变量获取颜色（回退到默认值）
  const getColor = (varName, fallback) => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
    return value || fallback;
  };

  // 深色/浅色模式颜色
  const colors = isDark
    ? {
        background: getColor('--md-sys-color-surface', '#1c1b1f'),
        foreground: getColor('--md-sys-color-on-surface', '#e6e0e9'),
        cursor: getColor('--md-sys-color-primary', '#d0bcff'),
        selection: getColor('--md-sys-color-primary-container', '#4a4458'),
        activeLine: getColor('--md-sys-color-surface-container-highest', '#36343b'),
        gutterBackground: getColor('--md-sys-color-surface-container', '#211f26'),
        gutterForeground: getColor('--md-sys-color-on-surface-variant', '#cac4d0'),
        lineNumber: getColor('--md-sys-color-outline', '#938f99'),
        matchingBracket: accentColor + '40', // 25% opacity
        comment: getColor('--md-sys-color-outline-variant', '#49454f'),
      }
    : {
        background: getColor('--md-sys-color-surface', '#fef7ff'),
        foreground: getColor('--md-sys-color-on-surface', '#1d1b20'),
        cursor: getColor('--md-sys-color-primary', '#6750a4'),
        selection: getColor('--md-sys-color-primary-container', '#e8def8'),
        activeLine: getColor('--md-sys-color-surface-container-highest', '#e6e0e9'),
        gutterBackground: getColor('--md-sys-color-surface-container', '#f3edf7'),
        gutterForeground: getColor('--md-sys-color-on-surface-variant', '#49454f'),
        lineNumber: getColor('--md-sys-color-outline', '#79747e'),
        matchingBracket: accentColor + '40',
        comment: getColor('--md-sys-color-outline-variant', '#c4c7c5'),
      };

  const editorTheme = EditorView.theme(
    {
      '&': {
        color: colors.foreground,
        backgroundColor: colors.background,
        fontSize: '16px',
        fontFamily: getColor('--font-mono', 'JetBrains Mono, Fira Code, Consolas, monospace'),
      },

      '.cm-content': {
        caretColor: colors.cursor,
        fontFamily: 'inherit',
      },

      '&.cm-focused .cm-cursor': {
        borderLeftColor: colors.cursor,
      },

      '&.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: colors.selection,
      },

      '.cm-activeLine': {
        backgroundColor: colors.activeLine,
      },

      '.cm-gutters': {
        backgroundColor: colors.gutterBackground,
        color: colors.gutterForeground,
        border: 'none',
        borderRight: `1px solid ${colors.lineNumber}30`,
      },

      '.cm-lineNumbers .cm-gutterElement': {
        color: colors.lineNumber,
        fontSize: '15px',
        padding: '0 8px 0 8px',
        minWidth: '32px',
      },

      '.cm-activeLineGutter': {
        backgroundColor: colors.activeLine,
        color: colors.cursor,
      },

      '.cm-foldGutter .cm-gutterElement': {
        padding: '0 4px',
      },

      '.cm-matchingBracket': {
        backgroundColor: colors.matchingBracket,
        outline: `1px solid ${accentColor}`,
      },

      '.cm-selectionMatch': {
        backgroundColor: colors.matchingBracket,
      },

      // 语法高亮
      '.cm-comment': {
        color: colors.comment,
      },

      '.cm-keyword': {
        color: accentColor,
        fontWeight: 'bold',
      },

      '.cm-string': {
        color: isDark ? '#f29e74' : '#c77a00',
      },

      '.cm-number': {
        color: isDark ? '#d4a373' : '#a05900',
      },

      '.cm-bool': {
        color: isDark ? '#8caaee' : '#1e66f5',
        fontWeight: 'bold',
      },

      '.cm-operator': {
        color: colors.foreground,
      },

      '.cm-punctuation': {
        color: colors.foreground,
      },

      '.cm-heading': {
        color: accentColor,
        fontWeight: 'bold',
      },

      // Lint (错误/警告)
      '.cm-lintRange-error': {
        backgroundImage: 'none',
        textDecoration: `underline wavy ${isDark ? '#f38ba8' : '#d20f39'}`,
        textDecorationSkipInk: 'none',
      },

      '.cm-lintRange-warning': {
        backgroundImage: 'none',
        textDecoration: `underline wavy ${isDark ? '#f9e2af' : '#df8e1d'}`,
      },

      '.cm-lintRange-hint': {
        backgroundImage: 'none',
        textDecoration: `underline dotted ${colors.lineNumber}`,
      },

      '.cm-diagnostic-error': {
        borderLeft: `3px solid ${isDark ? '#f38ba8' : '#d20f39'}`,
      },

      '.cm-diagnostic-warning': {
        borderLeft: `3px solid ${isDark ? '#f9e2af' : '#df8e1d'}`,
      },

      // Scrollbar (部分浏览器支持)
      '.cm-scroller::-webkit-scrollbar': {
        width: '12px',
        height: '12px',
      },

      '.cm-scroller::-webkit-scrollbar-track': {
        background: colors.gutterBackground,
      },

      '.cm-scroller::-webkit-scrollbar-thumb': {
        background: colors.lineNumber,
        borderRadius: '6px',
      },

      '.cm-scroller::-webkit-scrollbar-thumb:hover': {
        background: colors.gutterForeground,
      },
    },
    { dark: isDark }
  );

  // 创建动态语法高亮样式，并使其使用主题色
  const highlightStyle = HighlightStyle.define([
    { tag: t.comment, color: colors.comment },
    { tag: t.keyword, color: accentColor, fontWeight: 'bold' },
    { tag: t.typeName, color: accentColor, fontWeight: 'bold' },
    { tag: t.string, color: isDark ? '#f29e74' : '#c77a00' },
    { tag: t.number, color: isDark ? '#d4a373' : '#a05900' },
    { tag: t.bool, color: accentColor, fontWeight: 'bold' }, // 使用主题色
    { tag: t.operator, color: colors.foreground },
    { tag: t.punctuation, color: colors.foreground },
    { tag: t.heading, color: accentColor, fontWeight: 'bold' }, // 方括号等高亮
    { tag: t.variableName, color: isDark ? '#cba6f7' : '#8839ef' },
    { tag: t.propertyName, color: isDark ? '#89b4fa' : '#367BF0' },
    { tag: t.atom, color: isDark ? '#94e2d5' : '#40a02b' },
    { tag: t.meta, color: accentColor, fontWeight: 'bold' }, // TOML Section 使用主题色
  ]);

  return [editorTheme, syntaxHighlighting(highlightStyle, { fallback: true })];
}

/**
 * 监听系统主题变化
 * @param {Function} callback - 主题变化时的回调函数 (isDark => void)
 */
function watchSystemTheme(callback) {
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // 初始调用
  callback(darkModeQuery.matches);

  // 监听变化
  darkModeQuery.addEventListener('change', (e) => {
    callback(e.matches);
  });
}

/**
 * 从设置获取主题配置
 * @returns {Promise<{isDark: boolean, accentColor: string}>}
 */
async function getThemeFromSettings() {
  try {
    const result = await window.mofoxAPI.configEditorGetTheme();
    if (!result.success) {
      console.warn('[Theme] 获取主题失败，使用默认值', result.error);
      return { isDark: true, accentColor: '#367BF0' };
    }

    const { theme, accentColor } = result;

    // 处理 'auto' 模式
    let isDark = theme === 'dark';
    if (theme === 'auto') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    return { isDark, accentColor: accentColor || '#367BF0' };
  } catch (error) {
    console.error('[Theme] 获取主题配置异常', error);
    return { isDark: true, accentColor: '#367BF0' };
  }
}

module.exports = {
  createEditorTheme,
  watchSystemTheme,
  getThemeFromSettings
};
