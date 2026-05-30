/**
 * 原生命令文件删除工具。
 * 用于绕过 Node.js 对 asar 路径的特殊处理，并减少 fs.rmSync 在被 Electron/asar 占用路径上删除失败的问题。
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * 使用平台原生命令删除文件或目录。
 * @param {string} targetPath 需要删除的路径
 * @param {Object} [options] 删除选项
 * @param {Function} [options.onOutput] 命令输出回调
 * @returns {Promise<void>}
 */
async function removePathNative(targetPath, options = {}) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return;
  }

  const stat = fs.lstatSync(targetPath);
  const command = buildRemoveCommand(targetPath, stat.isDirectory());
  await runCommand(command.cmd, command.args, options.onOutput);
}

/**
 * 使用原生命令删除路径，失败时再临时关闭 asar 特殊处理后使用 Node.js 删除。
 * @param {string} targetPath 需要删除的路径
 * @param {Object} [options] 删除选项
 * @param {Function} [options.onOutput] 日志输出回调
 * @param {string} [options.label] 日志标签
 * @returns {Promise<void>}
 */
async function removePathSafe(targetPath, options = {}) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return;
  }

  const label = options.label || targetPath;
  try {
    await removePathNative(targetPath, options);
  } catch (nativeError) {
    if (typeof options.onOutput === 'function') {
      options.onOutput(`[delete] 原生命令删除 ${label} 失败，尝试 Node.js noAsar 删除: ${nativeError.message}`);
    }
    removePathWithNoAsar(targetPath);
  }
}

/**
 * 使用原生命令删除路径并忽略删除失败。
 * @param {string} targetPath 需要删除的路径
 * @param {Object} [options] 删除选项
 * @param {Function} [options.onOutput] 日志输出回调
 * @param {string} [options.label] 日志标签
 * @returns {void}
 */
function removePathSafeSync(targetPath, options = {}) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return;
  }

  try {
    removePathWithNoAsar(targetPath);
  } catch (error) {
    if (typeof options.onOutput === 'function') {
      const label = options.label || targetPath;
      options.onOutput(`[delete] 删除 ${label} 失败: ${error.message}`);
    }
  }
}

/**
 * 构造各平台删除命令。
 * @param {string} targetPath 需要删除的路径
 * @param {boolean} isDirectory 是否目录
 * @returns {{cmd: string, args: string[]}} 命令描述
 */
function buildRemoveCommand(targetPath, isDirectory) {
  if (process.platform === 'win32') {
    const normalizedPath = normalizeWindowsPath(targetPath);
    const deleteCommand = isDirectory
      ? `rmdir /s /q "${normalizedPath}"`
      : `del /f /q "${normalizedPath}"`;
    return { cmd: 'cmd.exe', args: ['/d', '/s', '/c', deleteCommand] };
  }

  return { cmd: 'rm', args: ['-rf', '--', targetPath] };
}

/**
 * 规范化 Windows 路径，避免长路径和斜杠转义问题。
 * @param {string} targetPath 原始路径
 * @returns {string} Windows 命令可用路径
 */
function normalizeWindowsPath(targetPath) {
  const absolutePath = path.resolve(targetPath);
  if (absolutePath.startsWith('\\\\?\\')) {
    return absolutePath;
  }

  if (absolutePath.startsWith('\\\\')) {
    return `\\\\?\\UNC\\${absolutePath.slice(2)}`;
  }

  return `\\\\?\\${absolutePath}`;
}

/**
 * 执行命令并等待退出。
 * @param {string} cmd 命令名
 * @param {string[]} args 参数列表
 * @param {Function} [onOutput] 输出回调
 * @returns {Promise<void>}
 */
function runCommand(cmd, args, onOutput) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      shell: false,
      windowsHide: true,
    });

    let stderr = '';
    proc.stdout.on('data', (data) => {
      if (typeof onOutput === 'function') onOutput(data.toString());
    });
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (typeof onOutput === 'function') onOutput(text);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`删除命令退出码: ${code}${stderr ? `\n${stderr}` : ''}`));
      }
    });
  });
}

/**
 * 临时禁用 Electron asar 路径特殊处理后删除路径。
 * @param {string} targetPath 需要删除的路径
 * @returns {void}
 */
function removePathWithNoAsar(targetPath) {
  const previousNoAsar = process.noAsar;
  process.noAsar = true;
  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } else {
      fs.rmSync(targetPath, { force: true, maxRetries: 3, retryDelay: 200 });
    }
  } finally {
    process.noAsar = previousNoAsar;
  }
}

module.exports = {
  removePathNative,
  removePathSafe,
  removePathSafeSync,
  removePathWithNoAsar,
};
