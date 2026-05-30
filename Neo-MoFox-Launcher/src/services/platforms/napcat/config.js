/**
 * NapCat 平台配置器。
 * 负责写入 Neo-MoFox 的 NapCat 适配器配置和 NapCat 自身连接配置。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 写入 Neo-MoFox 的 napcat_adapter 配置。
 * @param {Object} params 配置参数
 * @param {Object} params.context 执行上下文
 * @param {Object} params.inputs 用户输入
 * @param {Object} params.storageService 存储服务
 * @returns {Promise<Object>} 写入结果
 */
async function writeAdapterConfig({ context, inputs, storageService }) {
  context.emitProgress('write-adapter', 0, '正在写入 NapCat 适配器配置...');

  const adapterDir = path.join(inputs.neoMofoxDir, 'config', 'plugins', 'napcat_adapter');
  const adapterTomlPath = path.join(adapterDir, 'config.toml');

  try {
    fs.mkdirSync(adapterDir, { recursive: true });

    let data = {};
    if (fs.existsSync(adapterTomlPath)) {
      data = storageService.readToml(adapterTomlPath);
    }

    if (!data.plugin) data.plugin = {};
    data.plugin.enabled = true;
    if (!data.plugin.config_version) data.plugin.config_version = '2.0.0';

    if (!data.bot) data.bot = {};
    data.bot.qq_id = String(inputs.qqNumber);
    data.bot.qq_nickname = String(inputs.qqNickname || '');

    if (!data.napcat_server) data.napcat_server = {};
    if (!data.napcat_server.mode) data.napcat_server.mode = 'reverse';
    if (!data.napcat_server.host) data.napcat_server.host = 'localhost';
    data.napcat_server.port = parseInt(inputs.wsPort, 10) || 8095;

    storageService.writeToml(adapterTomlPath, data);

    context.emitOutput(`[write-adapter] NapCat 适配器配置: ${adapterTomlPath}`);
    context.emitProgress('write-adapter', 100, 'NapCat 适配器配置写入完成');
    return { success: true };
  } catch (error) {
    throw new Error(`写入 NapCat 适配器配置失败: ${error.message}`);
  }
}

/**
 * 写入 NapCat 自身配置。
 * @param {Object} params 配置参数
 * @param {Object} params.context 执行上下文
 * @param {Object} params.inputs 用户输入
 * @param {string} params.platformRoot 平台根目录
 * @returns {Promise<Object>} 写入结果
 */
async function configure({ context, inputs, platformRoot }) {
  context.emitProgress('platform-config', 0, '正在写入 NapCat 配置...');

  if (!platformRoot) {
    throw new Error('写入 NapCat 配置失败: 缺少 NapCat Node 包根目录');
  }

  const configDir = getConfigPath(platformRoot);
  fs.mkdirSync(configDir, { recursive: true });

  const onebot11Config = {
    network: {
      httpServers: [],
      httpClients: [],
      websocketServers: [],
      websocketClients: [
        {
          name: 'neo-mofox-ws-client',
          enable: true,
          url: `ws://127.0.0.1:${inputs.wsPort}`,
          messagePostFormat: 'array',
          reportSelfMessage: false,
          reconnectInterval: 3000,
          token: '',
        },
      ],
    },
    musicSignUrl: '',
    enableLocalFile2Url: false,
    parseMultMsg: false,
  };

  const napcatConfig = {
    fileLog: true,
    consoleLog: true,
    fileLogLevel: 'info',
    consoleLogLevel: 'info',
  };

  const onebot11Path = path.join(configDir, `onebot11_${inputs.qqNumber}.json`);
  const napcatCfgPath = path.join(configDir, `napcat_${inputs.qqNumber}.json`);

  fs.writeFileSync(onebot11Path, JSON.stringify(onebot11Config, null, 2));
  fs.writeFileSync(napcatCfgPath, JSON.stringify(napcatConfig, null, 2));

  context.emitOutput(`[platform-config] onebot11 配置: ${onebot11Path}`);
  context.emitOutput(`[platform-config] napcat 配置: ${napcatCfgPath}`);

  const launcherPath = writeLauncherScript(platformRoot, inputs.qqNumber);
  if (launcherPath) {
    context.emitOutput(`[platform-config] 启动脚本: ${launcherPath}`);
  }

  context.emitProgress('platform-config', 100, 'NapCat 配置写入完成');
  return { success: true };
}

/**
 * 获取 NapCat 配置目录。
 * @param {string} platformRoot 平台根目录
 * @returns {string} 配置目录
 */
function getConfigPath(platformRoot) {
  return path.join(platformRoot, 'napcat', 'config');
}

/**
 * 写入 NapCat 快速启动脚本。
 * @param {string} platformRoot 平台根目录
 * @param {string} qq QQ 号
 * @returns {string|null} 脚本路径
 */
function writeLauncherScript(platformRoot, qq) {
  const sourceBat = path.join(platformRoot, 'napcat.bat');
  if (!fs.existsSync(sourceBat)) {
    return null;
  }

  const content = [
    '@echo off',
    'chcp 65001 >nul',
    `echo 正在启动 NapCat (QQ: ${qq})...`,
    `call "%~dp0napcat.bat" -q ${qq}`,
    'pause',
  ].join('\r\n');
  const launcherPath = path.join(platformRoot, `start_napcat_${qq}.bat`);
  fs.writeFileSync(launcherPath, content, 'utf8');
  return launcherPath;
}

module.exports = { configure, getConfigPath, writeAdapterConfig, writeLauncherScript };
