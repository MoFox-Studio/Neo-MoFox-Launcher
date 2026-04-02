/**
 * TOML 错误收集脚本
 * 用于收集 @iarna/toml 解析器的真实错误信息，生成翻译映射表
 */

const TOML = require('@iarna/toml');
const fs = require('fs');
const path = require('path');

/**
 * 测试用例集合
 * 每个测试用例包含一个会触发错误的 TOML 内容
 */
const testCases = [
  // 未闭合字符串
  { name: '未闭合的双引号', content: 'key = "value' },
  { name: '未闭合的单引号', content: "key = 'value" },
  { name: '未闭合的三引号字符串', content: 'key = """value' },
  
  // 重复键
  { name: '重复的键', content: 'key = "value1"\nkey = "value2"' },
  { name: '表中重复的键', content: '[table]\nkey = 1\nkey = 2' },
  
  // 无效的转义序列
  { name: '无效的转义序列', content: 'key = "\\x41"' },
  
  // 数字格式错误
  { name: '无效的数字格式', content: 'key = 12.34.56' },
  { name: '前导零', content: 'key = 012' },
  { name: '无效的十六进制', content: 'key = 0xGHI' },
  
  // 布尔值错误
  { name: '无效的布尔值', content: 'key = True' },
  { name: '大写布尔值', content: 'key = TRUE' },
  
  // 日期时间错误
  { name: '无效的日期格式', content: 'key = 2023-13-45' },
  { name: '无效的时间格式', content: 'key = 25:99:99' },
  { name: '无效的日期时间偏移', content: 'key = 2023-01-01T12:00:00+99:00' },
  
  // 数组错误
  { name: '数组类型混合', content: 'key = [1, "string", true]' },
  { name: '数组未闭合', content: 'key = [1, 2, 3' },
  { name: '多余的逗号', content: 'key = [1, 2, 3,]' },
  
  // 内联表错误
  { name: '内联表未闭合', content: 'key = { a = 1, b = 2' },
  { name: '内联表中换行', content: 'key = { a = 1,\nb = 2 }' },
  
  // 表/节错误
  { name: '重复定义表', content: '[table]\nkey = 1\n[table]\nkey = 2' },
  { name: '重新定义为表数组', content: '[table]\nkey = 1\n[[table]]\nkey = 2' },
  { name: '未闭合的表名', content: '[table' },
  
  // 键值对错误
  { name: '缺少等号', content: 'key "value"' },
  { name: '缺少值', content: 'key =' },
  { name: '多余的等号', content: 'key = = value' },
  { name: '点键未引用空格', content: 'my key = "value"' },
  
  // 意外字符
  { name: '行首意外字符', content: '@ invalid' },
  { name: '键后意外字符', content: 'key @ = "value"' },
  { name: '等号后意外字符', content: 'key = @ "value"' },
  
  // 表数组错误
  { name: '表数组与普通表冲突', content: '[[array]]\nkey = 1\n[array]\nkey = 2' },
  
  // UTF-8 相关
  { name: '无效的 Unicode 转义', content: 'key = "\\uDEAD"' },
  
  // 注释相关（这些应该不会报错，但测试一下）
  { name: '注释后的内容', content: '# comment\nkey = "value" # inline comment' },
  
  // 空键
  { name: '空键', content: '"" = "value"' },
  { name: '仅空白的键', content: '"  " = "value"' },
  
  // 嵌套错误
  { name: '深层嵌套表重复', content: '[a.b.c]\nkey = 1\n[a.b.c]\nkey = 2' },
];

/**
 * 执行测试并收集错误信息
 */
function collectErrors() {
  console.log('\n========================================');
  console.log('开始收集 TOML 解析错误信息');
  console.log('========================================\n');

  const errors = [];
  const uniqueErrors = new Set();

  testCases.forEach((testCase, index) => {
    try {
      TOML.parse(testCase.content);
      console.log(`✓ 测试 ${index + 1}/${testCases.length}: ${testCase.name} - 意外通过（未触发错误）`);
    } catch (error) {
      const errorMessage = error.message;
      console.log(`✗ 测试 ${index + 1}/${testCases.length}: ${testCase.name}`);
      console.log(`  错误信息: ${errorMessage}`);
      console.log(`  错误位置: 行 ${error.line || 'N/A'}, 列 ${error.column || 'N/A'}\n`);

      errors.push({
        testName: testCase.name,
        content: testCase.content,
        errorMessage: errorMessage,
        line: error.line,
        column: error.column,
        position: error.pos,
      });

      uniqueErrors.add(errorMessage);
    }
  });

  console.log('\n========================================');
  console.log(`测试完成: ${testCases.length} 个测试用例`);
  console.log(`收集到 ${errors.length} 个错误`);
  console.log(`唯一错误信息: ${uniqueErrors.size} 条`);
  console.log('========================================\n');

  return { errors, uniqueErrors: Array.from(uniqueErrors) };
}

/**
 * 生成翻译映射表
 */
function generateTranslationMap(uniqueErrors) {
  console.log('\n========================================');
  console.log('生成翻译映射表');
  console.log('========================================\n');

  const translations = {};

  // 为每个唯一错误提供建议翻译（需要人工审核）
  uniqueErrors.forEach((error) => {
    translations[error] = `[待翻译] ${error}`;
  });

  console.log('请为以下错误信息提供中文翻译：\n');
  uniqueErrors.forEach((error, index) => {
    console.log(`${index + 1}. "${error}"`);
  });

  return translations;
}

/**
 * 保存结果到文件
 */
function saveResults(errors, uniqueErrors, translations) {
  const outputDir = path.join(__dirname, '../docs');
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 保存详细错误信息
  const errorsFile = path.join(outputDir, 'toml-errors-collected.json');
  fs.writeFileSync(errorsFile, JSON.stringify(errors, null, 2), 'utf-8');
  console.log(`\n详细错误信息已保存到: ${errorsFile}`);

  // 保存唯一错误列表
  const uniqueErrorsFile = path.join(outputDir, 'toml-unique-errors.json');
  fs.writeFileSync(uniqueErrorsFile, JSON.stringify(uniqueErrors, null, 2), 'utf-8');
  console.log(`唯一错误列表已保存到: ${uniqueErrorsFile}`);

  // 保存翻译映射模板
  const translationsFile = path.join(outputDir, 'toml-error-translations-template.json');
  fs.writeFileSync(translationsFile, JSON.stringify(translations, null, 2), 'utf-8');
  console.log(`翻译映射模板已保存到: ${translationsFile}`);
}

/**
 * 主函数
 */
function main() {
  const { errors, uniqueErrors } = collectErrors();
  const translations = generateTranslationMap(uniqueErrors);
  saveResults(errors, uniqueErrors, translations);

  console.log('\n========================================');
  console.log('✓ 错误收集完成');
  console.log('========================================\n');
  console.log('下一步：');
  console.log('1. 查看 docs/toml-unique-errors.json 中的错误信息');
  console.log('2. 编辑 docs/toml-error-translations-template.json 提供中文翻译');
  console.log('3. 将翻译后的映射表更新到 toml-linter.js 中');
  console.log('\n');
}

// 运行脚本
if (require.main === module) {
  main();
}

module.exports = {
  collectErrors,
  generateTranslationMap,
  saveResults,
};
