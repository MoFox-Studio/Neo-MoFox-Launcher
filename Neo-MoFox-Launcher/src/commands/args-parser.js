/**
 * 通用参数解析模块
 *
 * 负责解析 process.argv，检测启动模式并分发到对应的命令处理器。
 * 支持通过注册机制扩展新的模式（如 --cli、--daemon、--headless 等），
 * 无需在 main.js 中硬编码命令列表。
 *
 * 用法：
 *   const { parseArgs, registerMode, getActiveMode } = require('./commands/args-parser');
 */
'use strict';

/**
 * 已注册的模式映射表。
 * key: 模式标志（如 '--cli'）
 * value: { flag, commands, handler, prepareArgv }
 */
const registeredModes = new Map();

/**
 * 获取用户传入的参数（排除 electron/app 路径）。
 * - 开发模式: electron . --cli list → ['--cli', 'list']
 * - 打包模式: neo-mofox-launcher --cli list → ['--cli', 'list']
 *
 * Electron 打包后 process.defaultApp 为 undefined，
 * 开发模式下 process.defaultApp 为 true。
 *
 * @returns {string[]} 用户参数数组
 */
function getUserArgs() {
  const startIdx = process.defaultApp ? 2 : 1;
  return process.argv.slice(startIdx);
}

/**
 * 注册一个启动模式。
 *
 * @param {object} modeConfig - 模式配置
 * @param {string} modeConfig.flag - 模式标志，如 '--cli'
 * @param {Set<string>|null} modeConfig.commands - 该模式支持的命令集合（可选，null 表示不通过命令名隐式匹配）
 * @param {boolean} modeConfig.skipGui - 是否跳过后续 GUI 加载流程（true = 执行完 handler 后退出，不启动 Electron）
 * @param {function} modeConfig.handler - 模式处理函数，返回 Promise
 * @param {function|null} [modeConfig.prepareArgv] - 可选的 argv 预处理函数，在调用 handler 前执行
 */
function registerMode(modeConfig) {
  const { flag, commands, skipGui, handler, prepareArgv } = modeConfig;
  if (!flag || !handler) {
    throw new Error('registerMode: flag 和 handler 为必填项');
  }
  if (typeof skipGui !== 'boolean') {
    throw new Error('registerMode: skipGui 必须显式指定为 true 或 false');
  }
  registeredModes.set(flag, {
    flag,
    commands: commands || null,
    skipGui,
    handler,
    prepareArgv: prepareArgv || null,
  });
}

/**
 * 检测当前参数是否匹配某个已注册模式。
 *
 * 匹配规则：
 * 1. 显式标志匹配：参数中包含模式标志（如 --cli）
 * 2. 隐式命令匹配：第一个非 --flag 位置参数是该模式的已知命令
 *
 * @returns {{ mode: object, explicit: boolean } | null} 匹配到的模式及是否为显式匹配
 */
function detectMode() {
  const args = getUserArgs();

  // 优先检查显式标志
  for (const [flag, mode] of registeredModes) {
    if (args.includes(flag)) {
      return { mode, explicit: true };
    }
  }

  // 隐式命令匹配：遍历位置参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // 跳过带值的全局选项
    if (arg === '--data-dir' || arg === '--json') { i++; continue; }
    // 跳过其他 --flag
    if (arg.startsWith('--')) continue;
    // 找到第一个位置参数，检查是否属于某个模式的命令集
    for (const [, mode] of registeredModes) {
      if (mode.commands && mode.commands.has(arg)) {
        return { mode, explicit: false };
      }
    }
    break;
  }

  return null;
}

/**
 * 解析参数并执行匹配到的模式。
 * 如果没有匹配到任何模式，返回 false，表示应继续启动 GUI。
 *
 * @returns {Promise<boolean>} 是否拦截了启动流程（true = 已处理，不启动 GUI）
 */
async function parseAndExecute() {
  const result = detectMode();
  if (!result) return false;

  const { mode, explicit } = result;

  // 执行 argv 预处理
  if (mode.prepareArgv) {
    mode.prepareArgv({ explicit });
  }

  // 执行模式处理器
  await mode.handler();
  return true;
}

/**
 * 获取当前激活的模式（仅检测，不执行）。
 *
 * @returns {object|null} 匹配到的模式配置，或 null
 */
function getActiveMode() {
  const result = detectMode();
  return result ? result.mode : null;
}

module.exports = {
  getUserArgs,
  registerMode,
  detectMode,
  parseAndExecute,
  getActiveMode,
};
