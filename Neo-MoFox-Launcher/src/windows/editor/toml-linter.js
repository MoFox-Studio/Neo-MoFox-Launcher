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
        // 解析失败，提取行号和列号
        const errorMessage = validationResult.error || 'TOML 解析错误';
        
        // 优先使用后端返回的精确位置信息
        let lineNumber = validationResult.line;
        let columnNumber = validationResult.column;
        
        // 如果后端没有提供，尝试从错误信息中提取
        if (!lineNumber || !columnNumber) {
          const extracted = extractLineAndColumn(errorMessage);
          lineNumber = lineNumber || extracted.line;
          columnNumber = columnNumber || extracted.column;
        }
        
        let from = 0;
        let to = doc.length;
        
        // 如果有行号，定位到具体行
        if (lineNumber && lineNumber > 0 && lineNumber <= doc.lines) {
          try {
            const targetLine = doc.line(lineNumber);
            from = targetLine.from;
            to = targetLine.to;
            
            // 如果有列号，进一步精确定位错误字符
            if (columnNumber && columnNumber > 0) {
              const columnPos = targetLine.from + columnNumber - 1;
              if (columnPos >= targetLine.from && columnPos <= targetLine.to) {
                from = columnPos;
                // 高亮当前字符及其后的几个字符（或到行尾）
                to = Math.min(columnPos + 5, targetLine.to);
              }
            }
          } catch (e) {
            // 行号无效，使用整个文档
            console.warn(`无效的行号: ${lineNumber}`, e);
          }
        }
        
        // 翻译错误信息为中文
        const translatedError = translateTOMLError(errorMessage);
        
        // 只显示错误类型，不显示行列数（CodeMirror 会通过高亮显示位置）
        const detailedMessage = `TOML 解析错误: ${translatedError}`;
        
        diagnostics.push({
          from,
          to,
          severity: 'error',
          message: detailedMessage,
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
 * @returns {Promise<{valid: boolean, error?: string, line?: number, column?: number, position?: number}>}
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

/**
 * 从错误信息中提取行号和列号
 * @param {string} errorMessage - 错误信息
 * @returns {{line: number|null, column: number|null}}
 */
function extractLineAndColumn(errorMessage) {
  // 匹配常见的行号格式
  const patterns = [
    /row\s+(\d+)/i,                    // row 7
    /line\s+(\d+)/i,                   // line 7
    /at\s+line\s+(\d+)/i,              // at line 7
    /第\s*(\d+)\s*行/,                 // 第 7 行
    /(\d+)\s*行/,                      // 7 行
    /pos\s+(\d+)/i,                    // pos 124
  ];

  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) {
      return { line: parseInt(match[1]), column: null };
    }
  }

  // 匹配行列格式 (row 7, col 21) 或 (line 7:21)
  const lineColPattern = /(?:row|line)\s+(\d+).*?(?:col|column|:)\s*(\d+)/i;
  const lineColMatch = errorMessage.match(lineColPattern);
  if (lineColMatch) {
    return { 
      line: parseInt(lineColMatch[1]), 
      column: parseInt(lineColMatch[2]) 
    };
  }

  return { line: null, column: null };
}

/**
 * TOML 错误信息翻译映射表
 * 基于 @iarna/toml 真实错误信息，使用精确前缀匹配
 * 每个条目格式：[英文前缀, 中文翻译]
 * 顺序很重要：更具体的错误应该放在前面
 */
const TOML_ERROR_PATTERNS = [
  // 字符串相关错误
  ['Unterminated multi-line string at', '未闭合的多行字符串'],
  ['Unterminated string at', '未闭合的字符串'],
  
  // 键重复错误
  ["Can't redefine an existing key at", '不能重新定义已存在的键'],
  ["Can't redefine existing key at", '不能重新定义已存在的键'],
  
  // 转义序列错误
  ['Unknown escape character:', '未知的转义字符:'],
  
  // 意外字符错误（按优先级排序）
  ['Unexpected character, expected only whitespace or comments till end of line at', '意外的字符，此处应只有空白或注释直到行尾'],
  ['Unexpected character, expecting string, number, datetime, boolean, inline array or inline table at', '意外的字符，期望字符串、数字、日期时间、布尔值、内联数组或内联表'],
  ['Unexpected character', '意外的字符'],
  
  // 日期时间解析错误
  ['Expected digit while parsing year part of a date at', '解析日期年份部分时期望数字'],
  ['Invalid Datetime', '无效的日期时间格式'],
  
  // 数字错误
  ['Invalid number at', '无效的数字'],
  
  // 数组相关错误
  ['Inline lists must be a single type, not a mix of', '内联列表必须是单一类型，不能混合'],
  ['Invalid character, expected whitespace, comma (,) or close bracket (]) at', '无效的字符，期望空白、逗号 (,) 或右方括号 (])'],
  ['Unterminated inline array at', '未闭合的内联数组'],
  
  // 键值对相关错误
  ['Key ended without value at', '键在没有值的情况下结束'],
  ['Key without value at', '键缺少值'],
  ['Invalid character, expected "=" at', '无效的字符，期望 "="'],
  
  // Unicode 错误
  ['Invalid unicode, character in range 0xD800 - 0xDFFF is reserved at', '无效的 Unicode，0xD800 - 0xDFFF 范围内的字符是保留的'],
  
  // 未知字符错误
  ['Unknown character', '未知字符'],
];

/**
 * 翻译 TOML 错误信息为中文
 * 使用精确前缀匹配，避免误翻译
 * 只翻译错误类型，不包含位置信息（位置信息由调用方统一添加）
 * @param {string} errorMessage - 原始英文错误信息
 * @returns {string} 中文化的错误信息（不含位置）
 */
function translateTOMLError(errorMessage) {
  // 提取错误信息的主要部分（去掉代码片段）
  const mainError = errorMessage.split('\n')[0];
  
  // 尝试匹配错误模式
  for (const [pattern, translation] of TOML_ERROR_PATTERNS) {
    if (mainError.startsWith(pattern)) {
      // 只返回翻译后的错误类型，不包含位置信息
      return translation;
    }
  }
  
  // 如果没有匹配到任何模式，移除位置信息后返回原始错误
  let translated = mainError
    .replace(/at row \d+, col \d+, pos \d+:/g, '')  // 移除行列位置
    .replace(/at pos \d+/g, '')
    .replace(/at row \d+/g, '')
    .replace(/at line \d+/g, '')
    .replace(/col \d+/g, '')
    .replace(/column \d+/g, '')
    .trim();
  
  return translated || '未知 TOML 错误';
}

module.exports = {
  lintTOML,
  validateTOMLWithNode,
  extractLineAndColumn,
  translateTOMLError
};
