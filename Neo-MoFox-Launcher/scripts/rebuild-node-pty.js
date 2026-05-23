#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/rebuild-node-pty.js
 *
 * 仅当目标 Electron 版本 / arch / platform 与上一次构建的 stamp 不同时，
 * 才会调用 @electron/rebuild 重新编译 node-pty。
 *
 * 在跨架构构建（如 GitHub Actions 矩阵中 x64 主机为 ia32 / arm64 打包）时，
 * 通过下列任一环境变量指定目标 arch：
 *   - TARGET_ARCH
 *   - npm_config_target_arch
 *   - npm_config_arch
 *
 * 当在 Linux x64 主机上为 arm64 编译时，会自动注入 aarch64-linux-gnu 工具链
 * （需事先 `apt-get install -y gcc-aarch64-linux-gnu g++-aarch64-linux-gnu`）。
 *
 * 触发方式：
 *   - npm ci / npm install 后由 package.json 的 postinstall 自动调用
 *   - 手动：`node scripts/rebuild-node-pty.js [--force]`
 *   - 设置 NEO_MOFOX_FORCE_REBUILD=1 也可强制重编
 *
 * 退出码：
 *   0  成功（无需重编 / 重编通过）
 *   1  失败
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const PKG = require(PKG_PATH);
const NODE_PTY_DIR = path.join(ROOT, 'node_modules', 'node-pty');
const STAMP_FILE = path.join(NODE_PTY_DIR, '.neo-mofox-rebuild-stamp.json');

const args = process.argv.slice(2);
const FORCE =
  args.includes('--force') ||
  args.includes('-f') ||
  process.env.NEO_MOFOX_FORCE_REBUILD === '1';

function readNamedArg(name) {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const ARG_ARCH = readNamedArg('arch');
const ARG_PLATFORM = readNamedArg('platform');

const TAG = '[rebuild-node-pty]';

function log(msg) {
  console.log(`${TAG} ${msg}`);
}

function warn(msg) {
  console.warn(`${TAG} ⚠ ${msg}`);
}

function fail(msg) {
  console.error(`${TAG} ✗ ${msg}`);
  process.exit(1);
}

function parseElectronVersion() {
  // AUR / copr 流程会在外部覆盖系统 Electron 版本，优先采用
  if (process.env.SYSTEM_ELECTRON_VERSION) {
    return String(process.env.SYSTEM_ELECTRON_VERSION).replace(/^v/, '').trim();
  }
  const dep =
    (PKG.devDependencies && PKG.devDependencies.electron) ||
    (PKG.dependencies && PKG.dependencies.electron);
  if (!dep) {
    fail('未在 package.json 中找到 electron 依赖。');
  }
  return String(dep).replace(/^[\^~>=<\s]+/, '').trim();
}

function resolveTargetArch() {
  return (
    ARG_ARCH ||
    process.env.TARGET_ARCH ||
    process.env.npm_config_target_arch ||
    process.env.npm_config_arch ||
    process.arch
  );
}

function resolveTargetPlatform() {
  return (
    ARG_PLATFORM ||
    process.env.TARGET_PLATFORM ||
    process.env.npm_config_target_platform ||
    process.platform
  );
}

function readStamp() {
  try {
    return JSON.parse(fs.readFileSync(STAMP_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeStamp(stamp) {
  try {
    fs.writeFileSync(STAMP_FILE, JSON.stringify(stamp, null, 2));
  } catch (err) {
    warn(`写入 stamp 文件失败：${err.message}`);
  }
}

function nodePtyArtifactExists() {
  // Linux/macOS: build/Release/pty.node (+ spawn-helper)
  // Windows:    build/Release/pty.node + conpty.node
  const candidates = [
    path.join(NODE_PTY_DIR, 'build', 'Release', 'pty.node'),
    path.join(NODE_PTY_DIR, 'build', 'Release', 'conpty.node'),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

function nodePtyVersion() {
  try {
    return require(path.join(NODE_PTY_DIR, 'package.json')).version;
  } catch {
    return 'unknown';
  }
}

function commandExists(bin) {
  try {
    const cmd = process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`;
    execSync(cmd, { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
}

function injectLinuxArm64Toolchain() {
  const cc = 'aarch64-linux-gnu-gcc';
  const cxx = 'aarch64-linux-gnu-g++';
  if (!commandExists(cc) || !commandExists(cxx)) {
    fail(
      '为 linux/arm64 交叉编译 node-pty 需要 aarch64 工具链，但未检测到。\n' +
        '请先安装：sudo apt-get install -y gcc-aarch64-linux-gnu g++-aarch64-linux-gnu'
    );
  }
  log('注入 aarch64-linux-gnu 交叉编译工具链。');
  process.env.CC = cc;
  process.env.CXX = cxx;
  process.env.AR = 'aarch64-linux-gnu-ar';
  process.env.STRIP = 'aarch64-linux-gnu-strip';
  process.env.LINK = cxx;
}

async function loadElectronRebuild() {
  try {
    return require('@electron/rebuild');
  } catch (err) {
    fail(
      `无法加载 @electron/rebuild：${err.message}\n` +
        '请确认 devDependencies 已正确安装（运行 `npm ci` 或 `npm install`）。'
    );
    return null; // 不会到达，仅为静态分析
  }
}

async function main() {
  if (!fs.existsSync(NODE_PTY_DIR)) {
    log('node-pty 尚未安装，跳过。');
    return;
  }

  const electronVersion = parseElectronVersion();
  const targetArch = resolveTargetArch();
  const targetPlatform = resolveTargetPlatform();
  const ptyVersion = nodePtyVersion();

  const desired = {
    electronVersion,
    targetArch,
    targetPlatform,
    nodePtyVersion: ptyVersion,
  };
  const previous = readStamp();
  const haveArtifact = nodePtyArtifactExists();

  const stampMatches =
    previous &&
    previous.electronVersion === desired.electronVersion &&
    previous.targetArch === desired.targetArch &&
    previous.targetPlatform === desired.targetPlatform &&
    previous.nodePtyVersion === desired.nodePtyVersion;

  if (!FORCE && haveArtifact && stampMatches) {
    log(
      `node-pty 已为 electron ${electronVersion} / ${targetPlatform}-${targetArch} 编译过，跳过。` +
        ' 如需强制重编请设置 NEO_MOFOX_FORCE_REBUILD=1 或加 --force。'
    );
    return;
  }

  log(
    `开始重新编译 node-pty: electron=${electronVersion}, target=${targetPlatform}-${targetArch}, ` +
      `node-pty=${ptyVersion}, previous=${
        previous ? `${previous.targetPlatform}-${previous.targetArch}@${previous.electronVersion}` : 'none'
      }, force=${FORCE}`
  );

  // 把目标 arch / platform 显式塞回 process.env，这样 @electron/rebuild
  // 内部 spawn 的 node-gyp 子进程也能看到。
  process.env.npm_config_target_arch = targetArch;
  process.env.npm_config_arch = targetArch;
  process.env.npm_config_target_platform = targetPlatform;

  if (
    targetPlatform === 'linux' &&
    targetArch === 'arm64' &&
    process.platform === 'linux' &&
    process.arch !== 'arm64'
  ) {
    injectLinuxArm64Toolchain();
  }

  const { rebuild } = await loadElectronRebuild();

  try {
    await rebuild({
      buildPath: ROOT,
      electronVersion,
      arch: targetArch,
      onlyModules: ['node-pty'],
      force: true,
      // 让 @electron/rebuild 自己管控构建环境与并发
    });
  } catch (err) {
    fail(`node-pty 重编译失败：${(err && err.message) || err}`);
  }

  writeStamp(desired);
  log('node-pty 重编译完成。');
}

main().catch((err) => {
  fail((err && err.message) || String(err));
});
