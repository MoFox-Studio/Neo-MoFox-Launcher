/**
 * 配置编辑器 - 主逻辑
 * 基于 CodeMirror 6 的 TOML 配置文件编辑器
 */

const { EditorState, Compartment } = require('@codemirror/state');
const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } = require('@codemirror/view');
const { defaultKeymap, history, historyKeymap, indentWithTab } = require('@codemirror/commands');
const { search, searchKeymap } = require('@codemirror/search');
const { lintGutter, linter } = require('@codemirror/lint');
const { StreamLanguage } = require('@codemirror/language');
const { toml } = require('@codemirror/legacy-modes/mode/toml');
const { createEditorTheme, getThemeFromSettings, watchSystemTheme } = require('./theme.js');
const { lintTOML } = require('./toml-linter.js');

// ═══ 全局状态 ═══
let editor = null;
let filePath = null;
let fileContent = null;
let isModified = false;

// 自动保存配置
const AUTO_SAVE_DELAY = 3000; // 30秒
let autoSaveTimer = null;
let lastChangeTime = null;

// 主题 Compartment（用于动态切换）
const themeCompartment = new Compartment();

// ═══ DOM 元素 ═══
const elements = {
  container: document.getElementById('editor-container'),
  fileName: document.getElementById('file-name'),
  fileStatus: document.getElementById('file-status'),
  btnSave: document.getElementById('btn-save'),
  btnClose: document.getElementById('btn-close'),
  cursorPosition: document.getElementById('cursor-position'),
  errorCount: document.getElementById('error-count'),
  errorNumber: document.getElementById('error-number')
};

// ═══ 初始化 ═══
async function initialize() {
  try {
    // 从URL参数或命令行参数获取文件路径
    filePath = getFilePath();
    if (!filePath) {
      showError('未指定文件路径');
      return;
    }

    // 加载文件内容
    const result = await window.mofoxAPI.configEditorRead(filePath);
    if (!result.success) {
      showError(`加载文件失败: ${result.error}`);
      return;
    }

    fileContent = result.content;
    updateFileName();

    // 初始化编辑器
    await initializeEditor();

    // 绑定事件
    bindEvents();

    console.log('[Editor] 初始化完成', filePath);
  } catch (error) {
    console.error('[Editor] 初始化失败', error);
    showError(`初始化失败: ${error.message}`);
  }
}

// ═══ 获取文件路径 ═══
function getFilePath() {
  // 方法1: 从命令行参数获取（主进程传递）
  const args = process.argv || [];
  for (const arg of args) {
    if (arg.startsWith('--file-path=')) {
      return arg.substring('--file-path='.length);
    }
  }

  // 方法2: 从URL参数获取
  const params = new URLSearchParams(window.location.search);
  return params.get('file');
}

// ═══ 初始化编辑器 ═══
async function initializeEditor() {
  try {
    // 获取主题配置
    const { isDark, accentColor } = await getThemeFromSettings();

    // 创建编辑器状态
    const state = EditorState.create({
      doc: fileContent,
      extensions: [
        // 基础功能
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        EditorView.lineWrapping,
        
        // 语言支持
        StreamLanguage.define(toml),
        
        // 语法检查
        lintGutter(),
        linter(lintTOML),
        
        // 搜索
        search(),
        
        // 键盘映射
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              saveFile();
              return true;
            }
          }
        ]),
        
        // 主题
        themeCompartment.of(createEditorTheme(isDark, accentColor)),
        
        // 内容变化监听
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setModified(true);
            updateCursorPosition(update.view);
            // 触发自动保存倒计时
            scheduleAutoSave();
          }
          if (update.selectionSet) {
            updateCursorPosition(update.view);
          }
          // 更新错误计数
          updateErrorCount(update.view);
        }),
      ],
    });

    // 创建编辑器视图
    editor = new EditorView({
      state,
      parent: elements.container,
    });

    // 初始化光标位置和错误计数
    updateCursorPosition(editor);
    updateErrorCount(editor);

    // 监听主题变化
    watchSystemTheme(async (darkMode) => {
      const { accentColor } = await getThemeFromSettings();
      editor.dispatch({
        effects: themeCompartment.reconfigure(createEditorTheme(darkMode, accentColor))
      });
    });

    console.log('[Editor] CodeMirror 初始化完成');
  } catch (error) {
    console.error('[Editor] CodeMirror 初始化失败', error);
    showError(`编辑器初始化失败: ${error.message}`);
  }
}

// ═══ 更新光标位置 ═══
function updateCursorPosition(view) {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  const col = selection.head - line.from + 1;
  elements.cursorPosition.textContent = `行 ${line.number}, 列 ${col}`;
}

// ═══ 更新错误计数 ═══
function updateErrorCount(view) {
  // 获取所有诊断信息
  const state = view.state;
  const diagnostics = state.field(linter, false);
  
  if (diagnostics) {
    const errorCount = diagnostics.filter(d => d.severity === 'error').length;
    if (errorCount > 0) {
      elements.errorCount.classList.remove('hidden');
      elements.errorNumber.textContent = errorCount;
    } else {
      elements.errorCount.classList.add('hidden');
    }
  } else {
    elements.errorCount.classList.add('hidden');
  }
}

// ═══ 更新文件名显示 ═══
function updateFileName() {
  if (filePath) {
    const fileName = filePath.split(/[/\\]/).pop();
    elements.fileName.textContent = fileName;
    
    // 同时更新自定义标题栏
    const titleElement = document.getElementById('editor-title');
    if (titleElement) {
      titleElement.textContent = `编辑配置 - ${fileName}`;
    }
  }
}

// ═══ 更新修改状态 ═══
function setModified(modified) {
  isModified = modified;
  if (modified) {
    elements.fileStatus.textContent = '未保存';
    elements.fileStatus.classList.add('modified');
  } else {
    elements.fileStatus.textContent = '';
    elements.fileStatus.classList.remove('modified');
  }
}

// ═══ 自动保存调度 ═══
function scheduleAutoSave() {
  // 清除现有定时器
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  
  // 记录最后修改时间
  lastChangeTime = Date.now();
  
  // 设置新的自动保存定时器
  autoSaveTimer = setTimeout(() => {
    if (isModified) {
      autoSave();
    }
  }, AUTO_SAVE_DELAY);
}

// ═══ 自动保存 ═══
async function autoSave() {
  try {
    if (!isModified) {
      return;
    }
    
    // 执行保存
    const content = editor.state.doc.toString();
    const result = await window.mofoxAPI.configEditorWrite(filePath, content);
    
    if (!result.success) {
      showError(`自动保存失败: ${result.error}`);
      return;
    }
    
    setModified(false);
    
    // 显示成功提示
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    showInfo(`已在 ${timeStr} 自动保存`, 2000);
    
    console.log('[Editor] 自动保存成功', timeStr);
  } catch (error) {
    console.error('[Editor] 自动保存失败', error);
    showError(`自动保存失败: ${error.message}`);
  }
}

// ═══ 清除自动保存定时器 ═══
function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

// ═══ 保存文件 ═══
async function saveFile() {
  try {
    if (!filePath) {
      showError('未指定文件路径');
      return;
    }

    if (!editor) {
      showError('编辑器未初始化');
      return;
    }

    // 从编辑器获取内容
    const content = editor.state.doc.toString();

    const result = await window.mofoxAPI.configEditorWrite(filePath, content);
    if (!result.success) {
      showError(`保存失败: ${result.error}`);
      return;
    }

    setModified(false);
    clearAutoSaveTimer(); // 清除自动保存定时器
    showSuccess('保存成功');
    console.log('[Editor] 文件已保存', filePath);
  } catch (error) {
    console.error('[Editor] 保存失败', error);
    showError(`保存失败: ${error.message}`);
  }
}

// ═══ 关闭窗口 ═══
function closeWindow() {
  // 清除自动保存定时器
  clearAutoSaveTimer();
  
  if (isModified) {
    const confirmed = confirm('文件未保存，确定要关闭吗？');
    if (!confirmed) return;
  }
  window.close();
}

// ═══ 绑定事件 ═══
function bindEvents() {
  // 保存按钮
  elements.btnSave.addEventListener('click', saveFile);

  // 快捷键（已在 keymap 中处理，这里作为后备）
  document.addEventListener('keydown', (e) => {
    // Esc 关闭
    if (e.key === 'Escape') {
      closeWindow();
    }
  });

  // 窗口关闭前提示
  window.addEventListener('beforeunload', (e) => {
    if (isModified) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ═══ 工具函数 ═══
// 使用系统 Toast 组件（在 toast.js 中定义）
// showError, showSuccess, showInfo, showWarning 等函数已由 toast.js 提供

// ═══ 启动 ═══
document.addEventListener('DOMContentLoaded', initialize);
