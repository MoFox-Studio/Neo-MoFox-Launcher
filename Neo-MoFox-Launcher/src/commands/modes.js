/**
 * 模式注册文件
 *
 * 集中管理所有启动模式的注册。每个模式通过 registerMode() 注册，
 * 并声明是否需要跳过后续 GUI 加载流程（skipGui）。
 *
 * 新增模式时只需在此文件中添加 registerMode() 调用即可。
 */
'use strict';

const { registerMode, getUserArgs, startupContext } = require('./args-parser');

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

// ─── Start 模式 ───────────────────────────────────────────────────────
// 启动 GUI 并直接跳转到指定实例页面，自动启动该实例。
// 用法: neo-mofox-launcher --start <实例名称或ID>
registerMode({
  flag: '--start',
  commands: null,
  skipGui: false,
  handler: async () => {
    // 解析 --start 后面的实例名称参数
    const args = getUserArgs();
    const startIdx = args.indexOf('--start');
    const instanceName = startIdx !== -1 ? args[startIdx + 1] : null;

    if (!instanceName) {
      console.error('[--start] 错误: 必须指定实例名称或 ID');
      console.error('用法: neo-mofox-launcher --start <实例名称>');
      process.exit(1);
    }

    // 将启动信息写入 startupContext，供 GUI 启动时读取
    startupContext.navigateTo = 'instance-view';
    startupContext.instanceName = instanceName;
    startupContext.autoStart = true;
  },
});
