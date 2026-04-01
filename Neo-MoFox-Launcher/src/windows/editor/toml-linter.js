/**
 * TOML 语法验证器
 * 结合基础语法检查和 @iarna/toml 完整解析
 */

/**
 * TOML Lint function for CodeMirror
 * 执行双重验证：基础语法检查 + Node.js 端完整 TOML 解析
 * @param {import('@codemirror/view').EditorView} view - CodeMirror 编辑器视图
 * @returns {Promise<import('@codemirror/lint').Diagnostic[]>} 诊断信息数组
 */
async function lintTOML(view) {
  const diagnostics = [];
  const doc = view.state.doc;
  const text = doc.toString();

  try {
    // ═══ 阶段 1: 基础语法检查 ═══
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();

      // 检查未闭合的方括号
      if (trimmed.startsWith('[') && !trimmed.includes(']')) {
        diagnostics.push({
          from: doc.line(lineIndex + 1).from,
          to: doc.line(lineIndex + 1).to,
          severity: 'error',
          message: '未闭合的方括号：缺少 ]',
        });
      }

      // 检查未闭合的引号
      const singleQuotes = (trimmed.match(/'/g) || []).length;
      const doubleQuotes = (trimmed.match(/"/g) || []).length;

      if (singleQuotes % 2 !== 0) {
        diagnostics.push({
          from: doc.line(lineIndex + 1).from,
          to: doc.line(lineIndex + 1).to,
          severity: 'error',
          message: "未闭合的单引号：缺少 '",
        });
      }

      if (doubleQuotes % 2 !== 0 && !trimmed.includes('"""')) {
        diagnostics.push({
          from: doc.line(lineIndex + 1).from,
          to: doc.line(lineIndex + 1).to,
          severity: 'error',
          message: '未闭合的双引号：缺少 "',
        });
      }

      // 检查键值对格式 (基础)
      if (
        trimmed &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('[') &&
        !trimmed.includes('=') &&
        trimmed.length > 0
      ) {
        // 可能是错误的键值对
        diagnostics.push({
          from: doc.line(lineIndex + 1).from,
          to: doc.line(lineIndex + 1).to,
          severity: 'warning',
          message: '可能缺少 = 符号，或这不是有效的 TOML 行',
        });
      }

      // 检查重复的 = 号
      const equalCount = (trimmed.match(/=/g) || []).length;
      if (equalCount > 1 && !trimmed.includes('==')) {
        diagnostics.push({
          from: doc.line(lineIndex + 1).from,
          to: doc.line(lineIndex + 1).to,
          severity: 'error',
          message: '一行中包含多个 = 符号',
        });
      }
    });

    // 检查括号匹配
    const bracketStack = [];
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '[') {
        bracketStack.push({ char, pos: i });
      } else if (char === ']') {
        if (bracketStack.length === 0) {
          diagnostics.push({
            from: i,
            to: i + 1,
            severity: 'error',
            message: '多余的 ] 括号，缺少对应的 [',
          });
        } else {
          bracketStack.pop();
        }
      }
    }

    // 未闭合的括号
    bracketStack.forEach((bracket) => {
      diagnostics.push({
        from: bracket.pos,
        to: bracket.pos + 1,
        severity: 'error',
        message: '未闭合的 [ 括号，缺少对应的 ]',
      });
    });

    // ═══ 阶段 2: Node.js 端完整 TOML 解析验证 ═══
    // 只有在基础检查没有发现致命错误时才进行完整解析
    const hasCriticalErrors = diagnostics.some(d => d.severity === 'error');
    
    if (!hasCriticalErrors) {
      const validationResult = await validateTOMLWithNode(text);
      
      if (!validationResult.valid) {
        // 解析失败，添加错误诊断
        let from = 0;
        let to = doc.length;
        
        // 如果错误消息中包含行号，定位到具体行
        if (validationResult.line && validationResult.line > 0) {
          try {
            const errorLine = doc.line(validationResult.line);
            from = errorLine.from;
            to = errorLine.to;
          } catch {
            // 行号无效，使用整个文档
          }
        }
        
        diagnostics.push({
          from,
          to,
          severity: 'error',
          message: `TOML 解析错误: ${validationResult.error}`,
        });
      }
    }
  } catch (error) {
    // 如果检查过程中出错
    diagnostics.push({
      from: 0,
      to: doc.length,
      severity: 'error',
      message: `语法检查异常: ${error.message}`,
    });
  }

  return diagnostics;
}

/**
 * 使用 Node.js 端验证 TOML（通过 IPC）
 * 这个函数会将内容发送到主进程进行完整的 TOML 解析验证
 * @param {string} content - TOML 内容
 * @returns {Promise<{valid: boolean, error?: string, line?: number}>}
 */
async function validateTOMLWithNode(content) {
  try {
    // 调用主进程的 TOML 验证
    const result = await window.mofoxAPI.validateTOML(content);
    return result;
  } catch (error) {
    return { 
      valid: false, 
      error: error.message || '验证过程中发生错误'
    };
  }
}

module.exports = {
  lintTOML,
  validateTOMLWithNode
};
