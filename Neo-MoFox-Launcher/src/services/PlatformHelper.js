/**
 * PlatformHelper - 多系统平台适配模块
 *
 * 统一封装 Windows / Linux (Ubuntu) / macOS 下的命令差异，
 * 包括 Python 可执行文件名、Shell 命令、解压命令、NapCat 资源名等。
 *
 * 新增系统时只需在 PLATFORM_CONFIG 里加一个条目。
 */

'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

// ─── 平台配置表 ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} PlatformConfig
 * @property {string}   id              - 平台标识 (win32 / linux / darwin)
 * @property {string}   label           - 显示名称
 * @property {string}   pythonExeName   - Python 可执行文件名（PATH 搜索用）
 * @property {string[]} venvPythonPaths - 虚拟环境内的 python 相对路径（按优先级）
 * @property {string}   uvBin           - uv 可执行文件名
 * @property {string}   shell           - 是否在 spawn 中启用 shell（=true 走系统 shell）
 * @property {Function} killCmd         - 生成"杀死进程树"的命令 (pid) => { cmd, args }
 * @property {Function} unzipCmd        - 生成解压命令 (zipPath, destDir) => { cmd, args }
 * @property {string|null} napcatAsset  - NapCat Release 中匹配的资源文件名（null 表示不支持自动安装）
 * @property {Function|null} napcatStartCmd - 生成 NapCat 启动命令 (shellDir, qq) => { cmd, args, cwd }
 */

const PLATFORM_CONFIG = {
  // ──────────────── Windows ────────────────
  win32: {
    id: 'win32',
    label: 'Windows',
    pythonExeName: 'python.exe',
    venvPythonPaths: [
      path.join('.venv', 'Scripts', 'python.exe'),
      path.join('venv', 'Scripts', 'python.exe'),
    ],
    uvBin: 'uv.exe',
    shell: true,
    killCmd: (pid) => ({
      cmd: 'taskkill',
      args: ['/pid', String(pid), '/f', '/t'],
      shell: true,
    }),
    unzipCmd: (zipPath, destDir) => ({
      cmd: 'powershell',
      args: ['-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`],
    }),
    napcatAsset: 'NapCat.Shell.Windows.OneKey.zip',
    napcatStartCmd: (shellDir, qq) => {
      const bat = path.join(shellDir, `start_napcat_${qq}.bat`);
      const exe = path.join(shellDir, 'NapCatWinBootMain.exe');
      if (fs.existsSync(bat)) {
        return { cmd: 'cmd', args: ['/c', bat], cwd: shellDir };
      }
      if (fs.existsSync(exe)) {
        return { cmd: exe, args: [qq], cwd: shellDir };
      }
      return null;
    },
    /** 生成 NapCat 快速启动脚本 */
    writeNapcatLauncher: (shellDir, qq) => {
      const content = [
        '@echo off',
        'chcp 65001 >nul',
        `echo 正在启动 NapCat (QQ: ${qq})...`,
        `NapCatWinBootMain.exe ${qq}`,
        'pause',
      ].join('\r\n');
      const p = path.join(shellDir, `start_napcat_${qq}.bat`);
      fs.writeFileSync(p, content, 'utf8');
      return p;
    },
  },

  // ──────────────── Linux (Ubuntu / Debian 等) ────────────────
  linux: {
    id: 'linux',
    label: 'Linux',
    pythonExeName: 'python3',
    venvPythonPaths: [
      path.join('.venv', 'bin', 'python'),
      path.join('.venv', 'bin', 'python3'),
      path.join('venv', 'bin', 'python'),
      path.join('venv', 'bin', 'python3'),
    ],
    uvBin: 'uv',
    shell: true,
    killCmd: (pid) => ({
      cmd: 'kill',
      args: ['-9', String(pid)],
      shell: true,
    }),
    unzipCmd: (zipPath, destDir) => ({
      cmd: 'unzip',
      args: ['-o', zipPath, '-d', destDir],
    }),
    napcatAsset: 'NapCat.Shell.Linux.OneKey.zip',
    napcatStartCmd: (shellDir, qq) => {
      const sh = path.join(shellDir, `start_napcat_${qq}.sh`);
      const bootMain = path.join(shellDir, 'NapCatWinBootMain');
      // Linux 版本文件名可能是 napcat (无扩展名) 或 NapCatWinBootMain
      if (fs.existsSync(sh)) {
        return { cmd: 'bash', args: [sh], cwd: shellDir };
      }
      if (fs.existsSync(bootMain)) {
        return { cmd: bootMain, args: [qq], cwd: shellDir };
      }
      return null;
    },
    writeNapcatLauncher: (shellDir, qq) => {
      const content = [
        '#!/usr/bin/env bash',
        `echo "正在启动 NapCat (QQ: ${qq})..."`,
        `./NapCatWinBootMain ${qq}`,
      ].join('\n');
      const p = path.join(shellDir, `start_napcat_${qq}.sh`);
      fs.writeFileSync(p, content, { mode: 0o755 });
      return p;
    },
  },

  // ──────────────── macOS（预留） ────────────────
  darwin: {
    id: 'darwin',
    label: 'macOS',
    pythonExeName: 'python3',
    venvPythonPaths: [
      path.join('.venv', 'bin', 'python'),
      path.join('.venv', 'bin', 'python3'),
      path.join('venv', 'bin', 'python'),
      path.join('venv', 'bin', 'python3'),
    ],
    uvBin: 'uv',
    shell: true,
    killCmd: (pid) => ({
      cmd: 'kill',
      args: ['-9', String(pid)],
      shell: true,
    }),
    unzipCmd: (zipPath, destDir) => ({
      cmd: 'unzip',
      args: ['-o', zipPath, '-d', destDir],
    }),
    napcatAsset: null, // macOS 暂无 NapCat 官方包
    napcatStartCmd: () => null,
    writeNapcatLauncher: () => null,
  },
};

// ─── PlatformHelper 类 ──────────────────────────────────────────────────

class PlatformHelper {
  constructor() {
    this._platform = process.platform; // 'win32' | 'linux' | 'darwin'
    this._config = PLATFORM_CONFIG[this._platform] || PLATFORM_CONFIG.linux;
    this._systemInfo = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 基本信息
  // ═══════════════════════════════════════════════════════════════════════

  /** 当前平台 ID */
  get platform() { return this._platform; }

  /** 当前平台配置 */
  get config() { return this._config; }

  /** 友好标签 */
  get label() { return this._config.label; }

  /** 是否 Windows */
  get isWindows() { return this._platform === 'win32'; }

  /** 是否 Linux */
  get isLinux() { return this._platform === 'linux'; }

  /** 是否 macOS */
  get isMac() { return this._platform === 'darwin'; }

  // ═══════════════════════════════════════════════════════════════════════
  // 系统环境检测
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 检测当前系统环境，返回详细信息
   * @returns {Object} 系统环境信息
   */
  detectSystemEnv() {
    if (this._systemInfo) return this._systemInfo;

    const info = {
      platform: this._platform,
      platformLabel: this._config.label,
      arch: os.arch(),             // x64, arm64 等
      osType: os.type(),           // Windows_NT, Linux, Darwin
      osRelease: os.release(),     // 内核版本号
      hostname: os.hostname(),
      homedir: os.homedir(),
      tmpdir: os.tmpdir(),
      shell: process.env.SHELL || process.env.COMSPEC || 'unknown',
      // Linux 特有
      distro: null,
      distroVersion: null,
    };

    // Linux 下尝试读取发行版信息
    if (this.isLinux) {
      try {
        if (fs.existsSync('/etc/os-release')) {
          const content = fs.readFileSync('/etc/os-release', 'utf-8');
          const idMatch = content.match(/^ID=(.+)$/m);
          const versionMatch = content.match(/^VERSION_ID="?([^"\n]+)"?$/m);
          const nameMatch = content.match(/^PRETTY_NAME="?([^"\n]+)"?$/m);
          info.distro = idMatch ? idMatch[1].replace(/"/g, '') : 'unknown';
          info.distroVersion = versionMatch ? versionMatch[1] : null;
          info.distroName = nameMatch ? nameMatch[1] : info.distro;
        }
      } catch (e) {
        console.warn('[PlatformHelper] 读取 /etc/os-release 失败:', e.message);
      }
    }

    this._systemInfo = info;
    console.log(`[PlatformHelper] 系统环境: ${info.platformLabel} (${info.osType} ${info.osRelease})${info.distro ? ' - ' + info.distroName : ''}`);
    return info;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Python 相关
  // ═══════════════════════════════════════════════════════════════════════

  /** PATH 中搜索的 Python 可执行文件名 */
  get pythonExeName() { return this._config.pythonExeName; }

  /**
   * 在给定项目目录下查找 venv 中的 Python 可执行文件
   * @param {string} projectDir
   * @returns {string|null}
   */
  findVenvPython(projectDir) {
    for (const rel of this._config.venvPythonPaths) {
      const abs = path.join(projectDir, rel);
      if (fs.existsSync(abs)) return abs;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // uv 相关
  // ═══════════════════════════════════════════════════════════════════════

  /** uv 可执行文件名 */
  get uvBin() { return this._config.uvBin; }

  // ═══════════════════════════════════════════════════════════════════════
  // 进程管理
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 生成杀死进程（树）的命令参数
   * @param {number} pid
   * @returns {{ cmd: string, args: string[], shell?: boolean }}
   */
  getKillCommand(pid) {
    return this._config.killCmd(pid);
  }

  /**
   * 杀死进程（树），优先使用 tree-kill，回退到平台命令
   * @param {import('child_process').ChildProcess} proc
   * @param {string} signal - 'SIGTERM' | 'SIGKILL'
   */
  killProcessTree(proc, signal = 'SIGTERM') {
    if (!proc || !proc.pid) return;
    try {
      const treeKill = require('tree-kill');
      treeKill(proc.pid, signal, (err) => {
        if (err) {
          console.warn(`[PlatformHelper] tree-kill 失败, 回退到系统命令: ${err.message}`);
          this._fallbackKill(proc);
        }
      });
    } catch (e) {
      this._fallbackKill(proc);
    }
  }

  _fallbackKill(proc) {
    try {
      if (this.isWindows) {
        const { spawn } = require('child_process');
        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { shell: true });
      } else {
        proc.kill('SIGKILL');
      }
    } catch (_) { /* ignore */ }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 解压
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 获取解压命令
   * @param {string} zipPath
   * @param {string} destDir
   * @returns {{ cmd: string, args: string[] }}
   */
  getUnzipCommand(zipPath, destDir) {
    return this._config.unzipCmd(zipPath, destDir);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NapCat 相关
  // ═══════════════════════════════════════════════════════════════════════

  /** 当前平台对应的 NapCat Release 资源文件名（null = 不支持） */
  get napcatAssetName() { return this._config.napcatAsset; }

  /** 当前平台是否支持 NapCat 自动安装 */
  get supportsNapcatAutoInstall() { return !!this._config.napcatAsset; }

  /**
   * 生成 NapCat 启动命令
   * @param {string} shellDir - NapCat Shell 目录
   * @param {string} qq - QQ 号
   * @returns {{ cmd: string, args: string[], cwd: string }|null}
   */
  getNapcatStartCommand(shellDir, qq) {
    return this._config.napcatStartCmd(shellDir, qq);
  }

  /**
   * 写入 NapCat 快速启动脚本
   * @param {string} shellDir
   * @param {string} qq
   * @returns {string|null} 脚本路径
   */
  writeNapcatLauncherScript(shellDir, qq) {
    if (this._config.writeNapcatLauncher) {
      return this._config.writeNapcatLauncher(shellDir, qq);
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // spawn 参数构建
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 构建 spawn 的通用 env，确保 Python UTF-8 输出
   * @param {Object} [extraEnv] - 额外环境变量
   * @returns {Object}
   */
  buildSpawnEnv(extraEnv = {}) {
    return {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
      ...extraEnv,
    };
  }

  /**
   * 构建 spawn 选项
   * @param {Object} overrides - 额外选项
   * @returns {Object}
   */
  buildSpawnOptions(overrides = {}) {
    return {
      shell: this._config.shell,
      env: this.buildSpawnEnv(overrides.env || {}),
      ...overrides,
      // 合并后确保 env 包含基础变量
      ...(overrides.env ? { env: this.buildSpawnEnv(overrides.env) } : {}),
    };
  }
}

// ─── 单例导出 ────────────────────────────────────────────────────────────

const platformHelper = new PlatformHelper();

module.exports = { platformHelper, PlatformHelper, PLATFORM_CONFIG };
