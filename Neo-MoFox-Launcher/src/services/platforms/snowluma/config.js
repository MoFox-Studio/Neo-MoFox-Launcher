/**
 * SnowLuma 平台配置器。
 * 负责写入 Neo-MoFox 适配器配置与 SnowLuma 自身运行时配置。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 写入 Neo-MoFox 的 OneBot 适配器配置。
 * SnowLuma 对外暴露 OneBot v11，当前复用 napcat_adapter 的反向 WebSocket 配置结构。
 * @param {Object} params 配置参数
 * @param {Object} params.context 执行上下文
 * @param {Object} params.inputs 用户输入
 * @param {Object} params.storageService 存储服务
 * @returns {Promise<Object>} 写入结果
 */
async function writeAdapterConfig({ context, inputs, storageService }) {
  context.emitProgress('write-adapter', 0, '正在写入 SnowLuma 适配器配置...');

  const adapterDir = path.join(inputs.neoMofoxDir, 'config', 'plugins', 'onebot_adapter');
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

    context.emitOutput(`[write-adapter] SnowLuma OneBot 适配器配置: ${adapterTomlPath}`);
    context.emitProgress('write-adapter', 100, 'SnowLuma 适配器配置写入完成');
    return { success: true };
  } catch (error) {
    throw new Error(`写入 SnowLuma 适配器配置失败: ${error.message}`);
  }
}

/**
 * 写入 SnowLuma 自身配置。
 * @param {Object} params 配置参数
 * @param {Object} params.context 执行上下文
 * @param {Object} params.inputs 用户输入
 * @param {string} params.platformRoot 平台根目录
 * @returns {Promise<Object>} 写入结果
 */
async function configure({ context, inputs, platformRoot }) {
  context.emitProgress('platform-config', 0, '正在写入 SnowLuma 配置...');

  if (!platformRoot) {
    throw new Error('写入 SnowLuma 配置失败: 缺少 SnowLuma 运行根目录');
  }

  const configDir = getConfigPath(platformRoot);
  fs.mkdirSync(configDir, { recursive: true });

  const runtimePath = path.join(configDir, 'runtime.json');
  const runtimeConfig = readJson(runtimePath, {});
  runtimeConfig.webuiPort = normalizePort(inputs.snowlumaWebuiPort || inputs.platformWebuiPort || 5099, 5099);
  runtimeConfig.hookAutoLoad = process.platform === 'win32';
  fs.writeFileSync(runtimePath, JSON.stringify(runtimeConfig, null, 2), 'utf8');

  const oneBotPath = path.join(configDir, `onebot_${inputs.qqNumber}.json`);
  const oneBotConfig = readJson(oneBotPath, null) || buildOneBotConfig(inputs);
  fs.writeFileSync(oneBotPath, JSON.stringify(oneBotConfig, null, 2), 'utf8');

  const launcherPath = writeLauncherScript(platformRoot, inputs.qqNumber, runtimeConfig.webuiPort);

  context.emitOutput(`[platform-config] SnowLuma runtime 配置: ${runtimePath}`);
  context.emitOutput(`[platform-config] SnowLuma OneBot 配置: ${oneBotPath}`);
  context.emitOutput('[platform-config] SnowLuma v1.9.2 不支持 -q 指定 QQ，启动后会按 QQ 登录状态识别账号。');
  if (launcherPath) {
    context.emitOutput(`[platform-config] 启动脚本: ${launcherPath}`);
  }

  context.emitProgress('platform-config', 100, 'SnowLuma 配置写入完成');
  return { success: true };
}

/**
 * 构建 SnowLuma 每账号 OneBot 配置。
 * @param {Object} inputs 用户输入
 * @returns {Object} OneBot 配置对象
 */
function buildOneBotConfig(inputs) {
  return {
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
}

/**
 * 获取 SnowLuma 配置目录。
 * @param {string} platformRoot 平台根目录
 * @returns {string} 配置目录
 */
function getConfigPath(platformRoot) {
  return path.join(platformRoot, 'config');
}

/**
 * 写入 SnowLuma 快速启动脚本。
 * @param {string} platformRoot 平台根目录
 * @param {string} qq QQ 号
 * @param {number} webuiPort WebUI 端口
 * @returns {string|null} 脚本路径
 */
function writeLauncherScript(platformRoot, qq, webuiPort) {
  if (process.platform === 'win32') {
    const launcherPath = path.join(platformRoot, `start_snowluma_${qq}.bat`);
    const content = [
      '@echo off',
      'chcp 65001 >nul',
      `set SNOWLUMA_WEBUI_PORT=${webuiPort}`,
      'set SNOWLUMA_HOOK_AUTOLOAD=1',
      `echo 正在启动 SnowLuma (实例 QQ: ${qq}, SnowLuma 不支持 -q 指定账号)...`,
      'if exist "%~dp0launcher.bat" (',
      '  call "%~dp0launcher.bat"',
      ') else if exist "%~dp0node.exe" (',
      '  "%~dp0node.exe" "%~dp0index.mjs"',
      ') else (',
      '  node "%~dp0index.mjs"',
      ')',
      'pause',
    ].join('\r\n');
    fs.writeFileSync(launcherPath, content, 'utf8');
    return launcherPath;
  }

  const launcherPath = path.join(platformRoot, `start_snowluma_${qq}.sh`);
  const content = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'cd "$(dirname "$0")"',
    `export SNOWLUMA_WEBUI_PORT=${webuiPort}`,
    'export SNOWLUMA_HOOK_AUTOLOAD=1',
    `echo "正在启动 SnowLuma (实例 QQ: ${qq}, SnowLuma 不支持 -q 指定账号)..."`,
    'if [[ -x "./launcher.sh" ]]; then',
    '  exec ./launcher.sh',
    'elif [[ -x "./node" ]]; then',
    '  exec ./node ./index.mjs',
    'else',
    '  exec node ./index.mjs',
    'fi',
  ].join('\n');
  fs.writeFileSync(launcherPath, content, 'utf8');
  try { fs.chmodSync(launcherPath, 0o755); } catch (_) {}
  return launcherPath;
}

/**
 * 读取 JSON 文件，失败时返回默认值。
 * @param {string} filePath 文件路径
 * @param {Object|null} fallback 默认值
 * @returns {Object|null} JSON 对象或默认值
 */
function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

/**
 * 规范化端口。
 * @param {unknown} value 输入值
 * @param {number} fallback 默认端口
 * @returns {number} 端口
 */
function normalizePort(value, fallback) {
  const port = Number.parseInt(String(value), 10);
  if (Number.isFinite(port) && port > 0 && port <= 65535) return port;
  return fallback;
}

module.exports = { configure, getConfigPath, writeAdapterConfig, writeLauncherScript };
