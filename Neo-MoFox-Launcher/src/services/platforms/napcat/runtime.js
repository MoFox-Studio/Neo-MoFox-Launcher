/**
 * NapCat 平台运行时能力。
 * 负责声明平台启动命令生成逻辑。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 获取 NapCat 启动命令。
 * 优先使用当前 Node 包结构；若找不到启动脚本，则回退到旧版 NapCat.*.Shell 子目录结构。
 * @param {string} platformRoot 平台根目录
 * @param {string} qq QQ 号
 * @returns {{cmd: string, args: string[], cwd: string}|null} 启动命令
 */
function getStartCommand(platformRoot, qq) {
  for (const candidateRoot of resolveStartRoots(platformRoot)) {
    const startInfo = getStartCommandFromRoot(candidateRoot, qq);
    if (startInfo) {
      return startInfo;
    }
  }

  return null;
}

/**
 * 解析可尝试启动的 NapCat 根目录列表。
 * @param {string} platformRoot 平台根目录
 * @returns {string[]} 待检测的启动根目录列表
 */
function resolveStartRoots(platformRoot) {
  if (!platformRoot || !fs.existsSync(platformRoot)) {
    return [];
  }

  const roots = [platformRoot];
  const shellDirs = fs.readdirSync(platformRoot)
    .filter((name) => name.startsWith('NapCat') && name.includes('Shell'))
    .map((name) => path.join(platformRoot, name))
    .filter((shellPath) => fs.existsSync(shellPath) && fs.statSync(shellPath).isDirectory());

  roots.push(...shellDirs);
  return roots;
}

/**
 * 从指定根目录获取 NapCat 启动命令。
 * @param {string} rootPath NapCat 启动根目录
 * @param {string} qq QQ 号
 * @returns {{cmd: string, args: string[], cwd: string}|null} 启动命令
 */
function getStartCommandFromRoot(rootPath, qq) {
  const launcher = path.join(rootPath, `start_napcat_${qq}.bat`);
  if (fs.existsSync(launcher)) {
    return { cmd: launcher, args: [], cwd: rootPath };
  }

  const nodeExe = path.join(rootPath, 'node.exe');
  const entry = path.join(rootPath, 'index.js');
  if (fs.existsSync(nodeExe) && fs.existsSync(entry)) {
    return { cmd: nodeExe, args: [entry, '-q', String(qq)], cwd: rootPath };
  }

  return null;
}

module.exports = { getStartCommand, resolveStartRoots, getStartCommandFromRoot };
