/**
 * SnowLuma 平台运行时能力。
 * 负责声明平台启动命令生成逻辑；SnowLuma v1.9.2 不支持 -q 指定 QQ。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 获取 SnowLuma 启动命令。
 * @param {string} platformRoot 平台根目录
 * @param {string} qq QQ 号，仅用于寻找实例启动脚本，不作为 SnowLuma 参数传入
 * @returns {{cmd: string, args: string[], cwd: string, env?: Object}|null} 启动命令
 */
function getStartCommand(platformRoot, qq) {
  const env = {
    SNOWLUMA_WEBUI_PORT: '5099',
    SNOWLUMA_HOOK_AUTOLOAD: '1',
  };

  const customLauncher = process.platform === 'win32'
    ? path.join(platformRoot, `start_snowluma_${qq}.bat`)
    : path.join(platformRoot, `start_snowluma_${qq}.sh`);
  if (fs.existsSync(customLauncher)) {
    return { cmd: customLauncher, args: [], cwd: platformRoot, env };
  }

  if (process.platform === 'win32') {
    const bat = path.join(platformRoot, 'launcher.bat');
    if (fs.existsSync(bat)) {
      return { cmd: bat, args: [], cwd: platformRoot, env };
    }

    const nodeExe = path.join(platformRoot, 'node.exe');
    const entry = path.join(platformRoot, 'index.mjs');
    if (fs.existsSync(nodeExe) && fs.existsSync(entry)) {
      return { cmd: nodeExe, args: [entry], cwd: platformRoot, env };
    }

    if (fs.existsSync(entry)) {
      return { cmd: 'node', args: [entry], cwd: platformRoot, env };
    }

    return null;
  }

  const sh = path.join(platformRoot, 'launcher.sh');
  if (fs.existsSync(sh)) {
    try { fs.chmodSync(sh, 0o755); } catch (_) {}
    return { cmd: sh, args: [], cwd: platformRoot, env };
  }

  const nodeBin = path.join(platformRoot, 'node');
  const entry = path.join(platformRoot, 'index.mjs');
  if (fs.existsSync(nodeBin) && fs.existsSync(entry)) {
    try { fs.chmodSync(nodeBin, 0o755); } catch (_) {}
    return { cmd: nodeBin, args: [entry], cwd: platformRoot, env };
  }

  if (fs.existsSync(entry)) {
    return { cmd: 'node', args: [entry], cwd: platformRoot, env };
  }

  return null;
}

module.exports = { getStartCommand };
