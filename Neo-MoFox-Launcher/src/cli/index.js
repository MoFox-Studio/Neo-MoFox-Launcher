#!/usr/bin/env node
'use strict';

/**
 * Neo-MoFox-Launcher CLI
 *
 * 面向无桌面环境的 Linux（以及通用环境）的命令行入口，提供实例的
 * 列出 / 启动 / 停止 / 状态 / 日志 等基础操作，无需 Electron GUI。
 *
 * 用法：
 *   neo-mofox-cli <command> [options]
 *
 * 命令：
 *   list                       列出所有实例
 *   info <id|name>             显示实例详情
 *   env-check                  检测 Python / uv / git 等环境
 *   install [--config <path>] [--non-interactive]
 *                              安装新实例（交互式或从 JSON 配置文件）
 *   start <id|name> [--detach] 启动实例（默认前台运行；--detach 后台运行）
 *   stop <id|name>             停止后台运行的实例
 *   status [id|name]           查看运行状态
 *   logs <id|name> [--follow] [--lines=N]
 *                              查看实例日志
 *   delete <id|name> [--yes]   删除实例（含文件）
 *   data-dir                   打印数据目录路径
 *   help                       显示本帮助
 *
 * 全局参数：
 *   --data-dir <path>          指定数据目录
 *   --json                     以 JSON 形式输出（list/status/info/env-check）
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { resolveDataDir } = require('./dataDir');
const tui = require('./tui');

// ─── 通用工具 ────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function hasFlag(name) {
  return argv.includes(name);
}

function getOption(name, fallback) {
  const eq = `${name}=`;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(eq)) return argv[i].slice(eq.length);
  }
  return fallback;
}

function positionalArgs() {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data-dir') { i++; continue; }
    if (a.startsWith('--')) continue;
    out.push(a);
  }
  return out;
}

const dataDir = resolveDataDir(process.argv);
const instancesFile = path.join(dataDir, 'instances.json');
const cliRuntimeDir = path.join(dataDir, 'cli');
const cliLogsDir = path.join(dataDir, 'logs', 'cli');

function readInstances() {
  try {
    if (!fs.existsSync(instancesFile)) return [];
    const data = JSON.parse(fs.readFileSync(instancesFile, 'utf8'));
    return Array.isArray(data?.instances) ? data.instances : [];
  } catch (err) {
    console.error(`[CLI] 读取实例文件失败: ${err.message}`);
    process.exit(2);
  }
}

function findInstance(idOrName) {
  if (!idOrName) return null;
  const instances = readInstances();
  return (
    instances.find(i => i.id === idOrName) ||
    instances.find(i => i.name === idOrName) ||
    instances.find(i => i.id && i.id.startsWith(idOrName)) ||
    null
  );
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function pidFilePath(instanceId) {
  return path.join(cliRuntimeDir, `${instanceId}.pid`);
}

function readPidFile(instanceId) {
  const p = pidFilePath(instanceId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writePidFile(instanceId, payload) {
  ensureDir(cliRuntimeDir);
  fs.writeFileSync(pidFilePath(instanceId), JSON.stringify(payload, null, 2), 'utf8');
}

function removePidFile(instanceId) {
  const p = pidFilePath(instanceId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

// ─── Python 解释器查找（与 PlatformHelper 行为一致，但不依赖 electron）─

const VENV_PYTHON_PATHS = process.platform === 'win32'
  ? [path.join('.venv', 'Scripts', 'python.exe'), path.join('venv', 'Scripts', 'python.exe')]
  : [
    path.join('.venv', 'bin', 'python'),
    path.join('.venv', 'bin', 'python3'),
    path.join('venv', 'bin', 'python'),
    path.join('venv', 'bin', 'python3'),
  ];

function findVenvPython(projectDir) {
  for (const rel of VENV_PYTHON_PATHS) {
    const abs = path.join(projectDir, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function buildSpawnEnv(extra = {}) {
  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
    ...extra,
  };
  if (process.platform === 'linux' || process.platform === 'darwin') {
    const home = require('os').homedir();
    const extraBins = [
      path.join(home, '.cargo', 'bin'),
      path.join(home, '.local', 'bin'),
      path.join(home, 'bin'),
    ];
    const parts = (env.PATH || '').split(path.delimiter);
    for (const b of extraBins) {
      if (fs.existsSync(b) && !parts.includes(b)) parts.unshift(b);
    }
    env.PATH = parts.join(path.delimiter);
  }
  return env;
}

// ─── 输出工具 ────────────────────────────────────────────────────────────

const useJson = hasFlag('--json');

function printTable(rows, columns) {
  if (rows.length === 0) {
    console.log('（暂无数据）');
    return;
  }
  const widths = columns.map(c => Math.max(
    c.header.length,
    ...rows.map(r => String(r[c.key] ?? '').length),
  ));
  const line = columns.map((c, i) => c.header.padEnd(widths[i])).join('  ');
  console.log(line);
  console.log(columns.map((_, i) => '-'.repeat(widths[i])).join('  '));
  for (const r of rows) {
    console.log(columns.map((c, i) => String(r[c.key] ?? '').padEnd(widths[i])).join('  '));
  }
}

// ─── 命令实现 ────────────────────────────────────────────────────────────

function cmdHelp() {
  console.log(`Neo-MoFox-Launcher CLI

用法: neo-mofox-cli <command> [options]

命令:
  list                       列出所有实例
  info <id|name>             显示实例详情
  env-check                  检测 Python / uv / git 等环境是否就绪
  install [--config <path>] [--non-interactive]
                             安装新实例：默认交互式（TUI 方向键导航）；
                             指定 --config 时从 JSON 文件读取所有字段（无人值守）
                             追加 --no-tui 强制使用普通行模式
  menu                       打开 TUI 主菜单（直接运行 \`neo-mofox-cli\`，
                             在交互式终端下也会自动打开）
  start <id|name> [--detach] 启动实例（默认前台；--detach 后台守护）
  stop <id|name>             停止后台运行的实例
  status [id|name]           查看运行状态
  logs <id|name> [--follow] [--lines=N]
                             查看实例日志（默认 200 行）
  delete <id|name> [--yes]   删除实例（含文件、日志，需确认）
  data-dir                   打印数据目录路径
  help                       显示本帮助

全局参数:
  --data-dir <path>          指定数据目录
  --json                     JSON 输出（list/status/info/env-check）

数据目录: ${dataDir}

安装配置文件示例（JSON）:
  {
    "instanceName":   "my-bot",
    "qqNumber":       "123456789",
    "qqNickname":     "小狐",
    "ownerQQNumber":  "10000",
    "apiKey":         "sk-xxxx",
    "webuiApiKey":    "webui-xxxx",
    "wsPort":         8095,
    "installDir":     "/srv/neo-mofox",
    "channel":        "main",
    "pythonCmd":      "python3",
    "installSteps":   null
  }

  说明：Linux 不支持自动安装 NapCat，install 时会自动从默认步骤中移除
  napcat / napcat-config，请自行部署 NapCat 并连接 WS 端口。
`);
}

function cmdList() {
  const instances = readInstances();
  if (useJson) {
    console.log(JSON.stringify(instances, null, 2));
    return;
  }
  const rows = instances.map(i => {
    const pf = readPidFile(i.id);
    const running = pf && isProcessAlive(pf.pid);
    return {
      id: i.id,
      name: i.name || '',
      path: i.neomofoxDir || '',
      installed: i.installCompleted ? '是' : '否',
      status: running ? `running(pid ${pf.pid})` : 'stopped',
    };
  });
  printTable(rows, [
    { key: 'id', header: 'ID' },
    { key: 'name', header: '名称' },
    { key: 'installed', header: '已安装' },
    { key: 'status', header: '状态' },
    { key: 'path', header: '路径' },
  ]);
}

function cmdInfo(idOrName) {
  const inst = findInstance(idOrName);
  if (!inst) {
    console.error(`未找到实例: ${idOrName}`);
    process.exit(1);
  }
  const pf = readPidFile(inst.id);
  const running = pf && isProcessAlive(pf.pid);
  const detail = {
    ...inst,
    runtime: {
      running,
      pid: running ? pf.pid : null,
      pidFile: pidFilePath(inst.id),
      logFile: path.join(cliLogsDir, `${inst.id}.log`),
    },
  };
  if (useJson) {
    console.log(JSON.stringify(detail, null, 2));
    return;
  }
  console.log(`实例:  ${inst.name || '(未命名)'}`);
  console.log(`ID:    ${inst.id}`);
  console.log(`目录:  ${inst.neomofoxDir || '(未知)'}`);
  console.log(`已安装: ${inst.installCompleted ? '是' : '否'}`);
  console.log(`运行:  ${running ? `是 (pid ${pf.pid})` : '否'}`);
  console.log(`日志:  ${detail.runtime.logFile}`);
}

function buildStartCommand(inst) {
  const dir = inst.neomofoxDir;
  if (!dir || !fs.existsSync(dir)) {
    throw new Error(`实例目录无效: ${dir}`);
  }
  const mainPy = path.join(dir, 'main.py');
  if (!fs.existsSync(mainPy)) {
    throw new Error(`未找到 main.py: ${mainPy}`);
  }
  const py = findVenvPython(dir);
  if (py) return { cmd: py, args: ['main.py'], cwd: dir };
  // 回退到 uv
  const uv = process.platform === 'win32' ? 'uv.exe' : 'uv';
  return { cmd: uv, args: ['run', 'python', 'main.py'], cwd: dir };
}

function cmdStart(idOrName) {
  const inst = findInstance(idOrName);
  if (!inst) {
    console.error(`未找到实例: ${idOrName}`);
    process.exit(1);
  }
  if (inst.installCompleted === false) {
    console.error('该实例尚未完成安装，无法通过 CLI 启动。');
    process.exit(1);
  }
  const existing = readPidFile(inst.id);
  if (existing && isProcessAlive(existing.pid)) {
    console.error(`实例已在运行 (pid ${existing.pid})。请先执行 stop。`);
    process.exit(1);
  }
  if (existing) removePidFile(inst.id);

  const detach = hasFlag('--detach') || hasFlag('-d');
  const { cmd, args, cwd } = buildStartCommand(inst);
  const env = buildSpawnEnv();

  ensureDir(cliRuntimeDir);
  ensureDir(cliLogsDir);
  const logPath = path.join(cliLogsDir, `${inst.id}.log`);

  if (!detach) {
    console.log(`[CLI] 启动 ${inst.name || inst.id} (前台)`);
    console.log(`[CLI] 命令: ${cmd} ${args.join(' ')}`);
    console.log(`[CLI] 工作目录: ${cwd}`);
    const child = spawn(cmd, args, { cwd, env, stdio: 'inherit' });
    writePidFile(inst.id, {
      pid: child.pid,
      mode: 'foreground',
      startedAt: new Date().toISOString(),
      cmd, args, cwd,
    });
    const cleanup = () => removePidFile(inst.id);
    child.on('exit', code => {
      cleanup();
      process.exit(code ?? 0);
    });
    const forward = (sig) => {
      try { child.kill(sig); } catch (_) { /* ignore */ }
    };
    process.on('SIGINT', () => forward('SIGINT'));
    process.on('SIGTERM', () => forward('SIGTERM'));
    return;
  }

  // 守护模式：分离子进程并将日志重定向到文件
  console.log(`[CLI] 启动 ${inst.name || inst.id} (守护模式)`);
  const out = fs.openSync(logPath, 'a');
  const err = fs.openSync(logPath, 'a');
  const child = spawn(cmd, args, {
    cwd, env,
    detached: true,
    stdio: ['ignore', out, err],
  });
  child.unref();
  writePidFile(inst.id, {
    pid: child.pid,
    mode: 'detached',
    startedAt: new Date().toISOString(),
    cmd, args, cwd,
    logFile: logPath,
  });
  console.log(`[CLI] PID: ${child.pid}`);
  console.log(`[CLI] 日志: ${logPath}`);
  console.log('[CLI] 使用 `neo-mofox-cli stop ' + inst.id + '` 停止');
}

function killPid(pid, signal = 'SIGTERM') {
  try { process.kill(pid, signal); return true; }
  catch (err) {
    if (err.code === 'ESRCH') return false;
    throw err;
  }
}

async function cmdStop(idOrName) {
  const inst = findInstance(idOrName);
  if (!inst) {
    console.error(`未找到实例: ${idOrName}`);
    process.exit(1);
  }
  const pf = readPidFile(inst.id);
  if (!pf || !isProcessAlive(pf.pid)) {
    console.log('实例未在运行。');
    if (pf) removePidFile(inst.id);
    return;
  }

  console.log(`[CLI] 发送 SIGTERM -> pid ${pf.pid}`);
  killPid(pf.pid, 'SIGTERM');

  // 等待最多 10 秒
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pf.pid)) break;
    await new Promise(r => setTimeout(r, 300));
  }
  if (isProcessAlive(pf.pid)) {
    console.log(`[CLI] 进程未在 10 秒内退出，发送 SIGKILL`);
    killPid(pf.pid, 'SIGKILL');
  }
  removePidFile(inst.id);
  console.log('[CLI] 已停止。');
}

function cmdStatus(idOrName) {
  const instances = idOrName
    ? [findInstance(idOrName)].filter(Boolean)
    : readInstances();

  if (idOrName && instances.length === 0) {
    console.error(`未找到实例: ${idOrName}`);
    process.exit(1);
  }

  const rows = instances.map(i => {
    const pf = readPidFile(i.id);
    const running = pf && isProcessAlive(pf.pid);
    return {
      id: i.id,
      name: i.name || '',
      running,
      pid: running ? pf.pid : null,
      mode: running ? pf.mode : null,
      startedAt: running ? pf.startedAt : null,
    };
  });

  if (useJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  printTable(
    rows.map(r => ({
      id: r.id,
      name: r.name,
      status: r.running ? 'running' : 'stopped',
      pid: r.pid ?? '-',
      mode: r.mode ?? '-',
      startedAt: r.startedAt ?? '-',
    })),
    [
      { key: 'id', header: 'ID' },
      { key: 'name', header: '名称' },
      { key: 'status', header: '状态' },
      { key: 'pid', header: 'PID' },
      { key: 'mode', header: '模式' },
      { key: 'startedAt', header: '启动时间' },
    ],
  );
}

function cmdLogs(idOrName) {
  const inst = findInstance(idOrName);
  if (!inst) {
    console.error(`未找到实例: ${idOrName}`);
    process.exit(1);
  }
  const logPath = path.join(cliLogsDir, `${inst.id}.log`);
  if (!fs.existsSync(logPath)) {
    console.error(`日志文件不存在: ${logPath}`);
    console.error('提示：仅在使用 --detach 启动时才会生成 CLI 日志文件。');
    process.exit(1);
  }
  const lines = parseInt(getOption('--lines', '200'), 10) || 200;
  const follow = hasFlag('--follow') || hasFlag('-f');

  // 简单 tail 实现
  const data = fs.readFileSync(logPath, 'utf8').split('\n');
  const tail = data.slice(Math.max(0, data.length - lines - 1));
  process.stdout.write(tail.join('\n'));

  if (!follow) return;

  let size = fs.statSync(logPath).size;
  const watcher = fs.watch(logPath, { persistent: true }, () => {
    try {
      const stat = fs.statSync(logPath);
      if (stat.size < size) size = 0; // 日志被截断
      if (stat.size > size) {
        const stream = fs.createReadStream(logPath, { start: size, end: stat.size });
        stream.on('data', chunk => process.stdout.write(chunk));
        stream.on('end', () => { size = stat.size; });
      }
    } catch (_) { /* ignore */ }
  });

  const close = () => { watcher.close(); process.exit(0); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

// ─── env-check / install / delete ────────────────────────────────────────

/**
 * 设置 --data-dir 环境变量，让被 lazy-load 的服务读到正确目录
 * 因为 storageService 自己也会解析 process.argv，所以此处保证一致即可。
 */
function exposeDataDirToServices() {
  if (!process.env.NEO_MOFOX_LAUNCHER_DATA) {
    process.env.NEO_MOFOX_LAUNCHER_DATA = dataDir;
  }
}

function loadInstallServices() {
  exposeDataDirToServices();
  // 延迟引入：仅 install/env-check/delete 命令需要
  const { installWizardService } = require('../services/install/InstallWizardService');
  const { storageService } = require('../services/install/StorageService');
  const { platformHelper } = require('../services/PlatformHelper');
  return { installWizardService, storageService, platformHelper };
}

async function cmdEnvCheck() {
  const { installWizardService, platformHelper } = loadInstallServices();
  const sysEnv = platformHelper.detectSystemEnv();
  const result = await installWizardService.runEnvCheck();

  if (useJson) {
    console.log(JSON.stringify({ system: sysEnv, ...result }, null, 2));
    return;
  }

  console.log(`系统:    ${sysEnv.platformLabel}${sysEnv.distro ? ' (' + sysEnv.distro + ')' : ''}`);
  console.log(`架构:    ${sysEnv.arch}`);
  if (sysEnv.packageManager) console.log(`包管理:  ${sysEnv.packageManager}`);
  console.log('');

  const c = result.checks;
  const fmt = (name, v) => {
    if (v.installed === false || v.valid === false) {
      const ver = v.version ? `${v.version}` : '未安装';
      const hint = v.installHint ? `（建议: ${v.installHint}）` : '';
      return `  ✗ ${name}: ${ver}${hint}`;
    }
    return `  ✓ ${name}: ${v.version || 'OK'}`;
  };
  console.log('环境检查:');
  console.log(fmt('Python', c.python));
  console.log(fmt('uv    ', c.uv));
  console.log(fmt('Git   ', c.git));
  console.log('');
  console.log(result.passed ? '✓ 全部通过' : `✗ 未通过：\n${result.error}`);
  if (!result.passed) process.exit(1);
}

// ─── 交互式输入 ────────────────────────────────────────────────────────

function createReadline() {
  const readline = require('readline');
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, prompt, { defaultValue, required = false, validator } = {}) {
  return new Promise((resolve) => {
    const suffix = defaultValue !== undefined && defaultValue !== '' ? ` [${defaultValue}]` : '';
    const tip = required ? ' *' : '';
    const askOnce = () => rl.question(`${prompt}${suffix}${tip}: `, (answer) => {
      let value = (answer || '').trim();
      if (!value && defaultValue !== undefined) value = String(defaultValue);
      if (required && !value) {
        console.log('  ! 此项为必填，请重新输入');
        return askOnce();
      }
      if (validator) {
        const err = validator(value);
        if (err) {
          console.log(`  ! ${err}`);
          return askOnce();
        }
      }
      resolve(value);
    });
    askOnce();
  });
}

async function collectInstallInputsInteractive() {
  // 优先使用 TUI（方向键 + Enter）；终端不支持时退回 readline 行模式
  if (tui.isTTY() && !hasFlag('--no-tui')) {
    return collectInstallInputsTUI();
  }
  return collectInstallInputsReadline();
}

async function collectInstallInputsTUI() {
  const isLinuxLike = process.platform !== 'win32';
  const fields = [
    { key: 'instanceName', title: '实例名称', prompt: '为这个实例起个名字（1-32 字符）',
      validator: (v) => v && v.length >= 1 && v.length <= 32 ? null : '长度应为 1-32 字符' },
    { key: 'qqNumber', title: 'Bot QQ 号', prompt: '机器人登录使用的 QQ 号',
      validator: (v) => /^\d{5,12}$/.test(v) ? null : '应为 5-12 位纯数字' },
    { key: 'qqNickname', title: 'Bot QQ 昵称', prompt: '机器人的昵称',
      validator: (v) => v && v.trim() ? null : '昵称不能为空' },
    { key: 'ownerQQNumber', title: '管理员 QQ 号', prompt: '拥有最高权限的管理员 QQ',
      validator: (v) => /^\d{5,12}$/.test(v) ? null : '应为 5-12 位纯数字' },
    { key: 'apiKey', title: 'LLM API Key', prompt: '大模型 API Key（必填）', mask: true,
      validator: (v) => v && v.trim() ? null : 'API Key 不能为空' },
    { key: 'webuiApiKey', title: 'WebUI API Key', prompt: 'WebUI 访问密钥（可留空）', defaultValue: '' },
    { key: 'wsPort', title: 'WebSocket 端口', prompt: 'NapCat 反向 WS 端口（1024-65535）',
      defaultValue: '8095',
      validator: (v) => {
        const n = parseInt(v, 10);
        return (!isNaN(n) && n >= 1024 && n <= 65535) ? null : '端口应在 1024-65535 之间';
      } },
    { key: 'installDir', title: '安装路径', prompt: '机器人将被安装到此目录（不要含中文/空格）',
      defaultValue: isLinuxLike ? '/opt/neo-mofox' : 'C:\\NeoMofox',
      validator: (v) => {
        if (!v || !v.trim()) return '路径不能为空';
        if (/[\u4e00-\u9fa5\s]/.test(v)) return '不应包含中文或空格';
        return null;
      } },
    { key: 'channel', title: '版本分支', prompt: '使用 main（稳定）或 dev（开发）',
      defaultValue: 'main',
      validator: (v) => v === 'main' || v === 'dev' ? null : '只能填 main 或 dev' },
    { key: 'pythonCmd', title: 'Python 命令', prompt: 'PATH 中可调用的 Python 命令',
      defaultValue: isLinuxLike ? 'python3' : 'python' },
  ];

  const result = {};
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    // 显示进度提示
    const value = await tui.inputBox({
      title: `${f.title}  (${i + 1}/${fields.length})`,
      prompt: f.prompt,
      defaultValue: f.defaultValue !== undefined ? f.defaultValue : '',
      mask: !!f.mask,
      validator: f.validator,
    });
    if (value === null) {
      // Esc 取消：询问是否真的取消
      const giveUp = await tui.confirm({
        title: '取消安装？',
        message: '已填写的内容将被丢弃。\n确定取消安装吗？',
        defaultYes: false,
        yesLabel: '取消安装', noLabel: '继续填写',
      });
      if (giveUp) return null;
      // 不取消：退回上一字段
      i = i - 1; // for++ 后会重做当前 i
      continue;
    }
    result[f.key] = value;
  }

  // 二次确认
  const confirmMsg =
    `实例名称:    ${result.instanceName}\n` +
    `Bot QQ:      ${result.qqNumber} (${result.qqNickname})\n` +
    `管理员 QQ:   ${result.ownerQQNumber}\n` +
    `WS 端口:     ${result.wsPort}\n` +
    `安装路径:    ${result.installDir}\n` +
    `分支:        ${result.channel}\n` +
    `Python:      ${result.pythonCmd}`;
  const ok = await tui.confirm({
    title: '确认安装信息',
    message: confirmMsg,
    defaultYes: true,
    yesLabel: '开始安装', noLabel: '取消',
  });
  if (!ok) return null;

  return {
    ...result,
    wsPort: parseInt(result.wsPort, 10),
  };
}

async function collectInstallInputsReadline() {
  const rl = createReadline();
  console.log('请按提示填写实例信息（带 * 为必填，按回车使用默认值）');
  console.log('');

  try {
    const inRange = (lo, hi, msg) => (v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < lo || n > hi) return msg;
      return null;
    };

    const instanceName = await ask(rl, '实例名称', { required: true });
    const qqNumber = await ask(rl, 'Bot QQ 号', {
      required: true,
      validator: (v) => /^\d{5,12}$/.test(v) ? null : '应为 5-12 位纯数字',
    });
    const qqNickname = await ask(rl, 'Bot QQ 昵称', { required: true });
    const ownerQQNumber = await ask(rl, '管理员 QQ 号', {
      required: true,
      validator: (v) => /^\d{5,12}$/.test(v) ? null : '应为 5-12 位纯数字',
    });
    const apiKey = await ask(rl, 'LLM API Key', { required: true });
    const webuiApiKey = await ask(rl, 'WebUI API Key', { defaultValue: '' });
    const wsPort = await ask(rl, 'WebSocket 端口', {
      defaultValue: '8095',
      validator: inRange(1024, 65535, '端口应在 1024-65535 之间'),
    });
    const installDir = await ask(rl, '安装路径（不要包含中文/空格）', {
      required: true,
      defaultValue: process.platform === 'win32' ? 'C:\\NeoMofox' : '/opt/neo-mofox',
      validator: (v) => /[\u4e00-\u9fa5\s]/.test(v) ? '不应包含中文或空格' : null,
    });
    const channel = await ask(rl, '版本分支 (main/dev)', { defaultValue: 'main' });
    const pythonCmd = await ask(rl, 'Python 命令', { defaultValue: 'python3' });

    return {
      instanceName, qqNumber, qqNickname, ownerQQNumber,
      apiKey, webuiApiKey,
      wsPort: parseInt(wsPort, 10),
      installDir, channel, pythonCmd,
    };
  } finally {
    rl.close();
  }
}

async function cmdInstall() {
  const { installWizardService, platformHelper } = loadInstallServices();
  const sysEnv = platformHelper.detectSystemEnv();

  // 收集输入
  const configPath = getOption('--config');
  const nonInteractive = hasFlag('--non-interactive') || hasFlag('-y');

  let inputs;
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      console.error(`配置文件不存在: ${configPath}`);
      process.exit(1);
    }
    try {
      inputs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.error(`配置文件解析失败: ${err.message}`);
      process.exit(1);
    }
  } else {
    if (nonInteractive) {
      console.error('--non-interactive 模式必须配合 --config <path> 使用');
      process.exit(1);
    }
    if (!process.stdin.isTTY) {
      console.error('当前非交互式终端，请使用 --config <path> 提供配置');
      process.exit(1);
    }
    inputs = await collectInstallInputsInteractive();
    if (inputs === null) {
      console.log('已取消安装。');
      return;
    }
  }

  // 默认值与 Linux 适配：自动剔除 napcat 步骤（不支持自动安装）
  inputs.channel = inputs.channel || 'main';
  inputs.pythonCmd = inputs.pythonCmd || (sysEnv.platform === 'win32' ? 'python' : 'python3');
  if (inputs.wsPort != null) inputs.wsPort = String(inputs.wsPort);

  if (!Array.isArray(inputs.installSteps) && !platformHelper.supportsNapcatAutoInstall) {
    // CLI 默认环境（Linux/macOS）下移除 napcat 相关步骤
    const ALL = [
      'clone', 'venv', 'deps', 'gen-config', 'write-core', 'write-model',
      'write-webui-key', 'write-adapter', 'webui', 'register',
    ];
    inputs.installSteps = ALL;
    console.log('[安装] 当前平台不支持自动安装 NapCat，已跳过 napcat / napcat-config 步骤。');
  }

  // 校验
  const validation = await installWizardService.validateInputs(inputs);
  if (!validation.valid) {
    console.error('输入校验未通过:');
    for (const e of validation.errors) console.error(`  - [${e.field}] ${e.error}`);
    process.exit(1);
  }

  // 环境检查
  console.log('[安装] 正在检查环境...');
  const env = await installWizardService.runEnvCheck();
  if (!env.passed) {
    console.error('环境未就绪，无法继续安装：');
    console.error(env.error);
    console.error('提示：可先运行 `neo-mofox-cli env-check` 查看详情。');
    process.exit(1);
  }

  // 进度回调
  installWizardService.setProgressCallback(({ step, percent, message, error }) => {
    if (error) {
      console.error(`[${step}] ${percent}% ${message}`);
    } else {
      console.log(`[${step}] ${percent}% ${message}`);
    }
  });
  installWizardService.setOutputCallback((line) => {
    process.stdout.write(line.endsWith('\n') ? line : line + '\n');
  });

  console.log('[安装] 开始执行安装流程...');
  try {
    const result = await installWizardService.runInstall(inputs);
    console.log('[安装] 完成。');
    if (useJson) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result && result.id) {
      console.log(`实例 ID: ${result.id}`);
      console.log(`目录:    ${result.neomofoxDir || ''}`);
      console.log('使用 `neo-mofox-cli start ' + result.id + ' --detach` 启动。');
    }
  } catch (err) {
    console.error(`[安装] 失败: ${err.message}`);
    console.error('已保留实例进度，可重新执行 install 命令进行断点续装。');
    process.exit(1);
  }
}

async function cmdDelete(idOrName) {
  const inst = findInstance(idOrName);
  if (!inst) {
    console.error(`未找到实例: ${idOrName}`);
    process.exit(1);
  }

  // 防止删除运行中的实例
  const pf = readPidFile(inst.id);
  if (pf && isProcessAlive(pf.pid)) {
    console.error(`实例正在运行 (pid ${pf.pid})，请先 stop 后再删除。`);
    process.exit(1);
  }

  if (!hasFlag('--yes') && !hasFlag('-y')) {
    if (!process.stdin.isTTY) {
      console.error('非交互式终端，请追加 --yes 确认删除。');
      process.exit(1);
    }
    const ok = await tui.confirm({
      title: '删除实例',
      message: `确认删除实例「${inst.extra?.displayName || inst.name || inst.id}」？\n` +
               `ID: ${inst.id}\n` +
               `这将删除以下内容：\n` +
               `  • neo-mofox 与 napcat 文件夹\n` +
               `  • 实例日志\n` +
               `  • instances.json 中的记录\n` +
               `此操作不可撤销。`,
      defaultYes: false,
      yesLabel: '删除', noLabel: '取消',
    });
    if (!ok) {
      console.log('已取消。');
      return;
    }
  }

  const { storageService } = loadInstallServices();
  storageService.deleteInstance(inst.id);
  console.log('[CLI] 实例已删除。');
}

// ─── 主菜单（TUI 入口） ─────────────────────────────────────────────────

async function cmdMenu() {
  if (!tui.isTTY()) {
    console.error('TUI 主菜单需要交互式终端。请使用具体子命令，详见 `neo-mofox-cli help`。');
    process.exit(1);
  }
  // 不退出循环，直到用户选择"退出"
  while (true) {
    const action = await tui.selectMenu({
      title: 'Neo-MoFox Launcher',
      footer: '↑/↓ 选择   Enter 确定   Esc 退出',
      items: [
        { label: '🔍  环境检查 (env-check)',          value: 'env-check' },
        { label: '✨  安装新实例 (install)',          value: 'install' },
        { label: '📋  查看实例列表 (list)',           value: 'list' },
        { label: '▶️   启动实例 (start)',              value: 'start' },
        { label: '⏹️   停止实例 (stop)',               value: 'stop' },
        { label: '📄  查看实例日志 (logs)',           value: 'logs' },
        { label: '🗑️   删除实例 (delete)',             value: 'delete' },
        { label: '❌  退出',                          value: '__exit__' },
      ],
    });
    if (!action || action === '__exit__') return;

    try {
      if (action === 'env-check') { await cmdEnvCheck(); }
      else if (action === 'install') { await cmdInstall(); }
      else if (action === 'list') { cmdList(); }
      else if (action === 'start') {
        const id = await pickInstanceTUI('选择要启动的实例');
        if (id) {
          // 守护启动
          const orig = argv.slice();
          argv.length = 0; argv.push('start', id, '--detach');
          cmdStart(id);
          argv.length = 0; argv.push(...orig);
        }
      }
      else if (action === 'stop') {
        const id = await pickInstanceTUI('选择要停止的实例', { runningOnly: true });
        if (id) await cmdStop(id);
      }
      else if (action === 'logs') {
        const id = await pickInstanceTUI('选择要查看日志的实例');
        if (id) cmdLogs(id);
      }
      else if (action === 'delete') {
        const id = await pickInstanceTUI('选择要删除的实例');
        if (id) await cmdDelete(id);
      }
    } catch (err) {
      console.error(`[菜单] ${err.message}`);
    }

    // 在每次操作后等待用户按 Enter 返回菜单
    if (process.stdin.isTTY && action !== 'install') {
      process.stdout.write('\n按 Enter 返回主菜单...');
      await new Promise((resolve) => {
        const rl = createReadline();
        rl.question('', () => { rl.close(); resolve(); });
      });
    }
  }
}

async function pickInstanceTUI(title, { runningOnly = false } = {}) {
  let list = readInstances();
  if (runningOnly) {
    list = list.filter(i => {
      const pf = readPidFile(i.id);
      return pf && isProcessAlive(pf.pid);
    });
  }
  if (list.length === 0) {
    await tui.messageBox({
      title: '提示',
      message: runningOnly ? '当前没有正在运行的实例。' : '尚无实例。',
    });
    return null;
  }
  return tui.selectMenu({
    title,
    items: list.map(i => ({
      label: `${i.extra?.displayName || i.name || i.id}  (${i.id})`,
      value: i.id,
      description: i.neomofoxDir,
    })),
  });
}

// ─── 命令分发 ────────────────────────────────────────────────────────────

async function main() {
  const positional = positionalArgs();
  let command = positional[0];

  // 无参数 + 交互终端：默认打开 TUI 主菜单
  if (!command) {
    if (tui.isTTY()) {
      command = 'menu';
    } else {
      command = 'help';
    }
  }

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      cmdHelp();
      break;
    case 'menu':
    case 'tui':
      await cmdMenu();
      break;
    case 'data-dir':
      console.log(dataDir);
      break;
    case 'list':
    case 'ls':
      cmdList();
      break;
    case 'info':
      cmdInfo(positional[1]);
      break;
    case 'env-check':
      await cmdEnvCheck();
      break;
    case 'install':
      await cmdInstall();
      break;
    case 'delete':
    case 'remove':
    case 'rm':
      await cmdDelete(positional[1]);
      break;
    case 'start':
      cmdStart(positional[1]);
      break;
    case 'stop':
      await cmdStop(positional[1]);
      break;
    case 'status':
      cmdStatus(positional[1]);
      break;
    case 'logs':
      cmdLogs(positional[1]);
      break;
    default:
      console.error(`未知命令: ${command}`);
      cmdHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`[CLI] 错误: ${err.message}`);
  process.exit(1);
});
