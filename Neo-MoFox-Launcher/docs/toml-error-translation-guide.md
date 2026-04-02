# TOML 错误翻译系统指南

## 概述

本项目使用基于真实错误信息的精确前缀匹配系统来翻译 TOML 解析错误，避免了正则部分匹配导致的误翻译问题。

## 架构

### 1. 错误收集脚本 (`scripts/collect-toml-errors.js`)

自动运行各种 TOML 测试用例，收集 `@iarna/toml` 的真实错误信息。

**使用方法：**
```bash
node scripts/collect-toml-errors.js
```

**输出文件：**
- `docs/toml-errors-collected.json` - 详细的错误信息（包括测试用例和上下文）
- `docs/toml-unique-errors.json` - 去重后的唯一错误信息列表
- `docs/toml-error-translations-template.json` - 翻译模板（待填充）

### 2. 翻译系统 (`src/windows/editor/toml-linter.js`)

#### 翻译映射表 (`TOML_ERROR_PATTERNS`)

格式：`[英文前缀, 中文翻译]`

```javascript
const TOML_ERROR_PATTERNS = [
  ['Unterminated string at', '未闭合的字符串'],
  ['Invalid number at', '无效的数字'],
  // ...
];
```

**重要规则：**
- ✅ 使用精确前缀匹配（`startsWith`）
- ✅ 更具体的模式放在前面（如 "Unterminated multi-line string" 在 "Unterminated string" 之前）
- ❌ 不使用正则表达式部分匹配
- ❌ 不使用 `.replace()` 全局替换

#### 翻译函数 (`translateTOMLError`)

**工作流程：**
1. 提取错误消息的第一行（去掉代码片段）
2. 遍历 `TOML_ERROR_PATTERNS`，找到匹配的前缀
3. 提取位置信息（行、列、位置）
4. 组合翻译后的错误信息和位置信息

**示例：**
```javascript
// 输入
"Unterminated string at row 1, col 15, pos 14:\n1> key = \"value\n..."

// 输出
"未闭合的字符串（第 1 行，第 15 列，位置 14）"
```

## 添加新的错误翻译

### 方法 1：通过脚本收集（推荐）

1. 在 `scripts/collect-toml-errors.js` 中添加新的测试用例：

```javascript
const testCases = [
  // 现有测试用例...
  
  // 新增测试用例
  { 
    name: '你的测试用例名称', 
    content: 'invalid = toml content' 
  },
];
```

2. 运行脚本：
```bash
node scripts/collect-toml-errors.js
```

3. 查看 `docs/toml-unique-errors.json`，找到新的错误信息

4. 在 `toml-linter.js` 的 `TOML_ERROR_PATTERNS` 中添加翻译：

```javascript
const TOML_ERROR_PATTERNS = [
  // 注意：更具体的错误放在前面
  ['你的新错误前缀', '中文翻译'],
  // 现有的翻译...
];
```

### 方法 2：手动添加

如果你已经知道错误信息的格式：

1. 直接在 `TOML_ERROR_PATTERNS` 中添加：

```javascript
['Error message prefix', '错误信息前缀'],
```

2. 测试翻译是否正确工作

## 维护指南

### 检查翻译准确性

1. 在编辑器中打开一个 TOML 文件
2. 故意输入错误的内容
3. 检查错误提示是否正确翻译

### 更新现有翻译

如果发现翻译不准确：

1. 找到 `TOML_ERROR_PATTERNS` 中对应的条目
2. 修改中文翻译
3. 重新测试

### 处理优先级问题

如果一个更通用的模式覆盖了更具体的错误：

1. 将更具体的模式移到数组前面
2. 确保 `startsWith` 匹配的顺序正确

**示例：**
```javascript
// ✅ 正确的顺序
['Unterminated multi-line string at', '未闭合的多行字符串'],  // 更具体
['Unterminated string at', '未闭合的字符串'],                // 更通用

// ❌ 错误的顺序
['Unterminated string at', '未闭合的字符串'],                // 会匹配所有情况
['Unterminated multi-line string at', '未闭合的多行字符串'],  // 永远不会被匹配到
```

## 测试用例覆盖

当前已覆盖的错误类型：

- ✅ 未闭合的字符串（单引号、双引号、三引号）
- ✅ 重复的键
- ✅ 无效的转义序列
- ✅ 数字格式错误（小数点、前导零、十六进制）
- ✅ 布尔值错误
- ✅ 日期时间格式错误
- ✅ 数组错误（类型混合、未闭合）
- ✅ 内联表错误
- ✅ 表定义冲突
- ✅ 键值对格式错误
- ✅ Unicode 错误

## 常见问题

### Q: 为什么不使用正则表达式？

**A:** 正则表达式的部分匹配会导致误翻译。例如：
- `"Expected"` 可能会匹配到 `"Unexpected"` 中的一部分
- 导致 "Unexpected character" 被错误翻译

### Q: 如何处理包含变量的错误信息？

**A:** 只匹配固定的前缀部分，让变量部分保持原样。例如：

```javascript
// 错误信息：Unknown escape character: 120 at row 1...
// 匹配模式
['Unknown escape character:', '未知的转义字符:']
// 翻译结果：未知的转义字符: 120（第 1 行...）
```

### Q: 新版本的 @iarna/toml 更新了错误信息怎么办？

**A:** 
1. 重新运行 `collect-toml-errors.js`
2. 对比 `toml-unique-errors.json` 的差异
3. 更新 `TOML_ERROR_PATTERNS`

## 贡献指南

如果你发现了新的错误类型：

1. Fork 项目
2. 在 `collect-toml-errors.js` 中添加测试用例
3. 在 `TOML_ERROR_PATTERNS` 中添加翻译
4. 提交 Pull Request，附上测试截图

---

**最后更新：** 2026-04-02  
**维护者：** Neo-MoFox 团队
