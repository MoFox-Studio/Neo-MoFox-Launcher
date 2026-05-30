/**
 * NapCat 平台运行时能力。
 * 负责声明平台启动命令生成逻辑。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 获取 NapCat 启动命令。
 * @param {string} platformRoot 平台根目录
 * @param {string} qq QQ 号
 * @returns {{cmd: string, args: string[], cwd: string}|null} 启动命令
 */
function getStartCommand(platformRoot, qq) {
  const launcher = path.join(platformRoot, `start_napcat_${qq}.bat`);
  if (fs.existsSync(launcher)) {
    return { cmd: launcher, args: [], cwd: platformRoot };
  }

  const bat = path.join(platformRoot, 'napcat.bat');
  if (fs.existsSync(bat)) {
    return { cmd: bat, args: ['-q', String(qq)], cwd: platformRoot };
  }

  const nodeExe = path.join(platformRoot, 'node.exe');
  const entry = path.join(platformRoot, 'index.js');
  if (fs.existsSync(nodeExe) && fs.existsSync(entry)) {
    return { cmd: nodeExe, args: [entry, '-q', String(qq)], cwd: platformRoot };
  }

  return null;
}

module.exports = { getStartCommand };
