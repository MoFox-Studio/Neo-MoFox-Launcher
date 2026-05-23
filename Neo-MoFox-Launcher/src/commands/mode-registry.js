/**
 * 模式注册表
 *
 * 负责管理所有启动模式的注册与存储。提供 registerMode() 函数供外部注册模式，
 * 并暴露 registeredModes 供解析模块查询。
 *
 * 每个模式必须显式声明 skipGui 参数，表明是否跳过后续 GUI 加载流程。
 */
'use strict';

/**
 * 已注册的模式映射表。
 * key: 模式标志（如 '--cli'）
 * value: { flag, commands, skipGui, handler, prepareArgv }
 */
const registeredModes = new Map();

/**
 * 注册一个启动模式。
 *
 * @param {object} modeConfig - 模式配置
 * @param {string} modeConfig.flag - 模式标志，如 '--cli'
 * @param {Set<string>|null} modeConfig.commands - 该模式支持的命令集合（可选，null 表示不通过命令名隐式匹配）
 * @param {boolean} modeConfig.skipGui - 是否跳过后续 GUI 加载流程（true = 执行完 handler 后退出，不启动 Electron；false = handler 执行完后继续正常加载）
 * @param {function} modeConfig.handler - 模式处理函数，返回 Promise
 * @param {function|null} [modeConfig.prepareArgv] - 可选的 argv 预处理函数，在调用 handler 前执行
 */
function registerMode(modeConfig) {
  const { flag, commands, skipGui, handler, prepareArgv } = modeConfig;
  if (!flag || !handler) {
    throw new Error('registerMode: flag 和 handler 为必填项');
  }
  if (typeof skipGui !== 'boolean') {
    throw new Error(
      `registerMode(${flag}): skipGui 必须显式指定为 true 或 false，` +
      '用于声明该模式是否跳过后续 GUI 加载流程'
    );
  }
  registeredModes.set(flag, {
    flag,
    commands: commands || null,
    skipGui,
    handler,
    prepareArgv: prepareArgv || null,
  });
}

module.exports = {
  registeredModes,
  registerMode,
};
