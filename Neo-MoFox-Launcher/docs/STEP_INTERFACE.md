# InstallStepExecutor 步骤接口规范

本文档定义了 `InstallStepExecutor` 中所有步骤方法的统一接口规范，用于指导整合包导入服务和其他需要复用安装步骤的服务。

## 统一接口签名

所有步骤方法遵循以下统一签名：

```javascript
async execute<StepName>(context, inputs, options = {})
```

### 参数说明

#### 1. `context` (Object) - 执行上下文

必需参数，包含回调函数用于进度报告和日志输出：

```javascript
{
  emitProgress: Function,  // 进度回调：(step, percent, message, error) => void
  emitOutput: Function     // 输出回调：(output) => void
}
```

**示例**：
```javascript
const context = {
  emitProgress: (step, percent, message, error) => {
    console.log(`[${step}] ${percent}% - ${message}`);
    if (error) console.error(error);
  },
  emitOutput: (output) => {
    console.log(output);
  }
};
```

#### 2. `inputs` (Object) - 用户输入参数

必需参数，包含安装所需的所有用户配置：

```javascript
{
  // 核心字段
  installDir: string,        // 安装根目录
  qqNumber: string,          // Bot QQ 号
  qqNickname: string,        // Bot QQ 昵称
  ownerQQNumber: string,     // 管理员 QQ 号
  apiKey: string,            // LLM API 密钥
  webuiApiKey: string,       // WebUI API 密钥
  wsPort: string|number,     // WebSocket 端口
  channel: string,           // 渠道（'main' | 'dev'）
  instanceName: string,      // 实例显示名称
  
  // 派生字段（由 InstallWizardService 自动添加）
  neoMofoxDir: string        // Neo-MoFox 安装目录
}
```

#### 3. `options` (Object, 可选) - 步骤特定选项

可选参数，根据不同步骤提供特定配置：

```javascript
{
  // clone 步骤不需要额外选项
  
  // venv 步骤
  pythonCmd: string,              // Python 命令路径（默认: 'python'）
  
  // napcat-config 步骤
  shellDir: string,               // NapCat Shell 工作目录
  
  // register 步骤
  neoMofoxDir: string,            // Neo-MoFox 目录
  napcatDir: string,              // NapCat 目录
  installSteps: string[],         // 已执行的步骤列表
  napcatVersion: string           // NapCat 版本号
}
```

### 返回值

所有步骤方法返回 `Promise<Object>`，包含执行结果：

```javascript
{
  success: boolean,      // 执行是否成功
  path?: string,         // 可选：安装路径
  shellPath?: string,    // 可选：NapCat Shell 路径
  version?: string,      // 可选：版本号
  instance?: Object,     // 可选：实例对象（register 步骤）
  skipped?: boolean      // 可选：是否跳过
}
```

---

## 步骤方法清单

### 1. `executeClone` - 克隆 Neo-MoFox 仓库

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `installDir`, `qqNumber`, `channel`
- `options`: 无

**返回**：
```javascript
{
  success: true,
  path: string  // Neo-MoFox 安装目录
}
```

**依赖**：无

---

### 2. `executeVenv` - 创建 Python 虚拟环境

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `neoMofoxDir`
- `options`: 
  ```javascript
  {
    pythonCmd: string  // 默认: 'python'
  }
  ```

**返回**：
```javascript
{ success: true }
```

**依赖**：`clone`

---

### 3. `executeDeps` - 安装 Python 依赖

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `neoMofoxDir`
- `options`: 无

**返回**：
```javascript
{ success: true }
```

**依赖**：`venv`

---

### 4. `executeGenConfig` - 首次启动生成配置文件

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `neoMofoxDir`
- `options`: 无

**返回**：
```javascript
{
  success: true,
  configDir: string  // 配置目录路径
}
```

**依赖**：`deps`

---

### 5. `executeWriteCore` - 写入 core.toml

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `neoMofoxDir`, `ownerQQNumber`
- `options`: 无

**返回**：
```javascript
{ success: true }
```

**依赖**：`gen-config`

---

### 6. `executeWriteModel` - 写入 model.toml

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `neoMofoxDir`, `apiKey`
- `options`: 无

**返回**：
```javascript
{ success: true }
```

**依赖**：`gen-config`

---

### 7. `executeWriteWebuiKey` - 写入 WebUI API 密钥

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `neoMofoxDir`, `webuiApiKey`
- `options`: 无

**返回**：
```javascript
{ success: true }
```

**依赖**：`gen-config` (需要先有 core.toml)

---

### 8. `executeWriteAdapter` - 写入 napcat_adapter 配置

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `neoMofoxDir`, `qqNumber`, `qqNickname`, `wsPort`
- `options`: 无

**返回**：
```javascript
{ success: true }
```

**依赖**：无（配置文件自动创建）

---

### 9. `executeNapcat` - 安装 NapCat

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `installDir`, `qqNumber`
- `options`: 无

**返回**：
```javascript
{
  success: true,
  path: string,       // NapCat 安装目录
  shellPath: string,  // NapCat Shell 工作目录
  version: string     // NapCat 版本号
}
```

**依赖**：无（独立安装）

---

### 10. `executeNapcatConfig` - 写入 NapCat 配置

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `qqNumber`, `wsPort`
- `options`:
  ```javascript
  {
    shellDir: string  // NapCat Shell 工作目录（必需）
  }
  ```

**返回**：
```javascript
{ success: true }
```

**依赖**：`napcat`

---

### 11. `executeWebui` - 安装 WebUI

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `neoMofoxDir`
- `options`: 无

**返回**：
```javascript
{
  success: true,
  path: string,      // WebUI 安装目录
  skipped?: boolean  // 如果已存在则跳过
}
```

**依赖**：无（插件形式安装）

---

### 12. `executeRegister` - 注册实例

**参数**：
- `context`: 执行上下文
- `inputs`: 必需字段 `qqNumber`, `qqNickname`, `ownerQQNumber`, `apiKey`, `webuiApiKey`, `channel`, `instanceName`, `wsPort`
- `options`:
  ```javascript
  {
    neoMofoxDir: string,      // Neo-MoFox 目录（必需）
    napcatDir: string|null,   // NapCat 目录（可选）
    installSteps: string[],   // 已执行的步骤列表（必需）
    napcatVersion: string     // NapCat 版本号（可选）
  }
  ```

**返回**：
```javascript
{
  success: true,
  instance: Object  // 实例对象
}
```

**依赖**：所有前置步骤

---

## 步骤调度器

`InstallStepExecutor` 提供了统一的步骤调度方法：

```javascript
/**
 * 根据步骤名称执行对应的步骤方法
 * @param {string} stepName - 步骤名称 (如 'clone', 'venv' 等)
 * @param {Object} context - 执行上下文
 * @param {Object} inputs - 用户输入参数
 * @param {Object} options - 步骤特定选项
 * @returns {Promise<Object>} 步骤执行结果
 */
async executeStep(stepName, context, inputs, options = {})
```

**使用示例**：
```javascript
const { installStepExecutor } = require('./InstallStepExecutor');

const context = {
  emitProgress: (step, percent, message, error) => console.log(message),
  emitOutput: (output) => console.log(output)
};

const inputs = {
  installDir: 'C:/bot',
  qqNumber: '123456',
  channel: 'main',
  neoMofoxDir: 'C:/bot/bot-123456/neo-mofox'
};

// 执行克隆步骤
await installStepExecutor.executeStep('clone', context, inputs);

// 执行venv步骤（带选项）
await installStepExecutor.executeStep('venv', context, inputs, { pythonCmd: 'python3.11' });
```

---

## 步骤依赖关系图

```
clone (克隆仓库)
  └─> venv (创建虚拟环境)
       └─> deps (安装依赖)
            └─> gen-config (生成配置)
                 ├─> write-core (写入 core.toml)
                 ├─> write-model (写入 model.toml)
                 └─> write-webui-key (写入 WebUI 密钥)
                 
write-adapter (写入适配器配置) [独立]

napcat (安装 NapCat) [独立]
  └─> napcat-config (写入 NapCat 配置)
  
webui (安装 WebUI) [独立]

register (注册实例) [需要所有前置步骤完成]
```

---

## 错误处理

所有步骤方法应使用 `throw` 抛出错误，由调用者统一捕获处理：

```javascript
try {
  await installStepExecutor.executeStep('clone', context, inputs);
} catch (error) {
  console.error(`步骤执行失败: ${error.message}`);
  // 错误处理逻辑
}
```

**常见错误类型**：
- 网络错误（克隆失败、下载失败）
- 权限错误（文件写入失败）
- 命令执行失败（Python、uv、git 等）
- 超时错误（配置生成超时）
- 配置错误（TOML 读写失败）

---

## 条件执行策略

整合包导入服务可根据整合包内容动态决定执行哪些步骤：

```javascript
const steps = [];

// 如果整合包不包含 Neo-MoFox 主程序
if (!packContainsNeoMofox) {
  steps.push('clone', 'venv', 'deps', 'gen-config');
}

// 如果整合包包含配置文件
if (packContainsConfig) {
  // 跳过 write-core, write-model, write-webui-key
} else {
  steps.push('write-core', 'write-model', 'write-webui-key');
}

// 始终写入适配器配置（因为需要替换占位符）
steps.push('write-adapter');

// 如果整合包不包含 NapCat
if (!packContainsNapcat) {
  steps.push('napcat', 'napcat-config');
}

// 始终执行注册
steps.push('register');

// 执行步骤
for (const step of steps) {
  await installStepExecutor.executeStep(step, context, inputs, options);
}
```

---

## 向后兼容性

`InstallStepExecutor` 保持与旧 `InstallWizardService` 方法签名的兼容性：

| 旧方法名 | 新方法名 | 兼容性 |
|---------|---------|-------|
| `cloneRepository(installDir, instanceId, channel)` | `executeClone(context, inputs)` | ✅ 通过参数映射兼容 |
| `createVenv(neoMofoxDir, pythonCmd)` | `executeVenv(context, inputs, {pythonCmd})` | ✅ |
| `installDependencies(neoMofoxDir)` | `executeDeps(context, inputs)` | ✅ |
| `generateConfig(neoMofoxDir)` | `executeGenConfig(context, inputs)` | ✅ |
| (其他步骤类似) | | |

---

## 完整示例：整合包导入

```javascript
const { installStepExecutor } = require('./InstallStepExecutor');

async function importIntegrationPack(packPath, userInputs) {
  // 1. 解析整合包
  const manifest = parseManifest(packPath);
  
  // 2. 创建执行上下文
  const context = {
    emitProgress: (step, percent, message) => {
      console.log(`[${step}] ${percent}% - ${message}`);
    },
    emitOutput: (output) => {
      console.log(output);
    }
  };
  
  // 3. 准备输入参数
  const inputs = {
    installDir: userInputs.installDir,
    qqNumber: userInputs.qqNumber,
    qqNickname: userInputs.qqNickname,
    ownerQQNumber: userInputs.ownerQQNumber,
    apiKey: userInputs.apiKey,
    webuiApiKey: userInputs.webuiApiKey,
    wsPort: userInputs.wsPort,
    channel: manifest.channel || 'main',
    instanceName: userInputs.instanceName,
    neoMofoxDir: path.join(userInputs.installDir, `bot-${userInputs.qqNumber}`, 'neo-mofox')
  };
  
  // 4. 决定执行步骤
  const steps = [];
  if (!manifest.files.neoMofox) {
    steps.push('clone', 'venv', 'deps', 'gen-config');
  }
  if (!manifest.files.config) {
    steps.push('write-core', 'write-model', 'write-webui-key');
  }
  steps.push('write-adapter');
  if (!manifest.files.napcat) {
    steps.push('napcat', 'napcat-config');
  }
  steps.push('register');
  
  // 5. 执行步骤
  let napcatShellPath = null;
  for (const step of steps) {
    const options = {};
    if (step === 'napcat-config') {
      options.shellDir = napcatShellPath || path.join(inputs.installDir, `bot-${inputs.qqNumber}`, 'napcat');
    }
    if (step === 'register') {
      options.neoMofoxDir = inputs.neoMofoxDir;
      options.napcatDir = path.join(inputs.installDir, `bot-${inputs.qqNumber}`, 'napcat');
      options.installSteps = steps;
    }
    
    const result = await installStepExecutor.executeStep(step, context, inputs, options);
    
    if (step === 'napcat' && result.shellPath) {
      napcatShellPath = result.shellPath;
    }
  }
  
  return { success: true };
}
```

---

## 更新日志

### v1.0.0 (2025-04-18)
- 初始版本
- 定义12个步骤的统一接口
- 提供步骤调度器方法
- 添加完整示例代码
