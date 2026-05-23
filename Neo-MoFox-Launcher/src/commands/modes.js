/**
 * 模式注册文件
 *
 * 集中管理所有启动模式的注册。每个模式通过 registerMode() 注册，
 * 并声明是否需要跳过后续 GUI 加载流程（skipGui）。
 *
 * 新增模式时只需在此文件中添加 registerMode() 调用即可。
 */
'use strict';

const { registerMode } = require('./args-parser');

// ─── CLI 模式 ─────────────────────────────────────────────────────────
// 面向无桌面环境的命令行模式，执行完毕后退出进程，不启动 Electron GUI。
const CLI_COMMANDS = new Set([
  'list', 'ls', 'info', 'env-check', 'install', 'start', 'stop',
  'status', 'logs', 'delete', 'remove', 'rm', 'data-dir',
  'help', '--help', '-h', 'menu', 'tui',
]);

registerMode({
  flag: '--cli',
  commands: CLI_COMMANDS,
  skipGui: true,
  handler: async () => {
    const { main: cliMain } = require('./cli/index');
    await cliMain();
  },
  prepareArgv: ({ explicit }) => {
    // 从 process.argv 中移除 --cli 标志（如果是显式调用）
    if (explicit) {
      const cliArgIdx = process.argv.indexOf('--cli');
      if (cliArgIdx !== -1) {
        process.argv.splice(cliArgIdx, 1);
      }
    }
    // 如果是打包模式，CLI 模块期望 argv[0]=node, argv[1]=script, argv[2+]=args
    // 但打包模式下 argv 是 [executable, ...args]，需要补一个占位使 slice(2) 正确
    if (!process.defaultApp && process.argv.length >= 1) {
      process.argv.splice(1, 0, '__cli__');
    }
  },
});
