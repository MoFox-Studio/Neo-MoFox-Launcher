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
    // NapCat Release 中的资源包名（用于 GitHub 下载）
    napcatAsset: 'NapCat.Shell.zip',
    /**
     * Linux 下 NapCat 安装配置
     * 参照 NapCat 官方安装脚本 install.sh 的 Shell (Rootless) 模式
     * 安装到 $HOME/Napcat/ 下，所有实例共享，只需安装一次
     */
    linuxNapcat: {
      // 路径定义（与官方脚本一致）
      paths: {
        installBase: path.join(os.homedir(), 'Napcat'),
        qqBase: path.join(os.homedir(), 'Napcat', 'opt', 'QQ'),
        targetFolder: path.join(os.homedir(), 'Napcat', 'opt', 'QQ', 'resources', 'app', 'app_launcher'),
        qqExecutable: path.join(os.homedir(), 'Napcat', 'opt', 'QQ', 'qq'),
        qqPackageJson: path.join(os.homedir(), 'Napcat', 'opt', 'QQ', 'resources', 'app', 'package.json'),
      },
      // LinuxQQ 下载信息（版本号和 URL 来自官方安装脚本 install.sh）
      qqDownload: {
        version: '3.2.25-45758',
        urls: {
          amd64_deb: 'https://dldir1.qq.com/qqfile/qq/QQNT/7516007c/linuxqq_3.2.25-45758_amd64.deb',
          arm64_deb: 'https://dldir1.qq.com/qqfile/qq/QQNT/7516007c/linuxqq_3.2.25-45758_arm64.deb',
        },
      },
      // QQ 运行所需的系统依赖（apt-get 包名，来自官方安装脚本）
      systemDeps: [
        'xvfb', 'screen', 'xauth', 'libnss3', 'libgbm1',
        'libasound2', 'libglib2.0-0', 'libatk1.0-0',
        'libatspi2.0-0', 'libgtk-3-0', 'unzip', 'jq',
      ],
    },
    napcatStartCmd: (shellDir, qq) => {
      // 使用 xvfb-run 无头运行 QQ + NapCat（参照官方脚本）
      const qqExe = path.join(os.homedir(), 'Napcat', 'opt', 'QQ', 'qq');
      const launcherSh = path.join(shellDir, `start_napcat_${qq}.sh`);
      if (fs.existsSync(launcherSh)) {
        return { cmd: 'bash', args: [launcherSh], cwd: shellDir };
      }
      return {
        cmd: 'xvfb-run',
        args: ['-a', qqExe, '--no-sandbox', '-q', qq],
        cwd: shellDir,
      };
    },
    writeNapcatLauncher: (shellDir, qq) => {
      const qqExe = path.join(os.homedir(), 'Napcat', 'opt', 'QQ', 'qq');
      const content = [
        '#!/usr/bin/env bash',
        'set -e',
        `echo "正在启动 NapCat (QQ: ${qq})..."`,
        `xvfb-run -a "${qqExe}" --no-sandbox -q ${qq}`,
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
   * 检测系统上是否已安装 NapCat（仅 Linux 有效）
   * 通过检查 $HOME/Napcat/opt/QQ/resources/app/app_launcher/napcat/ 目录判断
   * @returns {{ installed: boolean, napcatDir: string|null, shellPath: string|null, qqVersion: string|null }}
   */
  isNapcatInstalledOnSystem() {
    if (!this.isLinux || !this._config.linuxNapcat) {
      return { installed: false, napcatDir: null, shellPath: null, qqVersion: null };
    }
    const paths = this._config.linuxNapcat.paths;
    const napcatFilesDir = path.join(paths.targetFolder, 'napcat');

    if (!fs.existsSync(napcatFilesDir)) {
      return { installed: false, napcatDir: null, shellPath: null, qqVersion: null };
    }

    let qqVersion = null;
    try {
      if (fs.existsSync(paths.qqPackageJson)) {
        const pkg = JSON.parse(fs.readFileSync(paths.qqPackageJson, 'utf8'));
        qqVersion = pkg.version || null;
      }
    } catch (_) {}

    return {
      installed: true,
      napcatDir: paths.installBase,
      shellPath: napcatFilesDir,
      qqVersion,
    };
  }

  /**
   * 获取 Linux 下 NapCat 安装的配置（路径、QQ 下载信息等）
   * @returns {Object|null} 仅 Linux 返回配置，其他平台返回 null
   */
  getLinuxNapcatConfig() {
    if (!this.isLinux || !this._config.linuxNapcat) return null;
    return this._config.linuxNapcat;
  }

  /**
   * 获取当前架构对应的 LinuxQQ 下载信息
   * @returns {{ url: string, file: string }|null}
   */
  getLinuxQQDownloadInfo() {
    if (!this.isLinux || !this._config.linuxNapcat) return null;
    const arch = os.arch(); // 'x64' or 'arm64'
    const urls = this._config.linuxNapcat.qqDownload.urls;
    if (arch === 'x64') {
      return { url: urls.amd64_deb, file: 'linuxqq.deb' };
    } else if (arch === 'arm64') {
      return { url: urls.arm64_deb, file: 'linuxqq.deb' };
    }
    return null;
  }

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
