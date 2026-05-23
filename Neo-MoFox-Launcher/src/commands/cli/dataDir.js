'use strict';

/**
 * 解析 Neo-MoFox-Launcher 的数据目录
 * 与 StorageService 保持一致的优先级，但不依赖 electron
 *
 * 优先级：--data-dir 参数 > NEO_MOFOX_LAUNCHER_DATA 环境变量 >
 *         XDG_CONFIG_HOME/Neo-MoFox-Launcher > ~/.config/Neo-MoFox-Launcher
 */

const os = require('os');
const path = require('path');

const APP_NAME = 'Neo-MoFox-Launcher';

function resolveDataDir(argv = process.argv) {
  const idx = argv.indexOf('--data-dir');
  if (idx !== -1 && argv[idx + 1]) {
    return path.resolve(argv[idx + 1]);
  }
  if (process.env.NEO_MOFOX_LAUNCHER_DATA) {
    return path.resolve(process.env.NEO_MOFOX_LAUNCHER_DATA);
  }

  // 模拟 electron app.getPath('appData')
  if (process.platform === 'linux') {
    const xdg = process.env.XDG_CONFIG_HOME;
    const base = xdg && xdg.trim() ? xdg : path.join(os.homedir(), '.config');
    return path.join(base, APP_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
  }
  // win32
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, APP_NAME);
}

module.exports = { resolveDataDir, APP_NAME };
