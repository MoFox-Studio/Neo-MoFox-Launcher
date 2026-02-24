const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const path = require('path');
const fs = require('fs');
const si = require('systeminformation');

const execAsync = promisify(exec);

/**
 * 环境管理服务
 * 负责检测系统环境、推荐软件、VS Code 扩展管理等
 */
class EnvironmentService {
  constructor() {
    this.detectedTools = new Map();
    this.vscodeInstalled = false;
    this.vscodeVersion = null;
    this.installedExtensions = [];
  }

  /**
   * 检测 VS Code 是否安装
   */
  async detectVSCode() {
    try {
      const isWindows = os.platform() === 'win32';
      const command = isWindows ? 'code --version' : 'code --version';
      
      const { stdout } = await execAsync(command, { timeout: 5000 });
      const lines = stdout.trim().split('\n');
      
      if (lines.length > 0) {
        this.vscodeInstalled = true;
        this.vscodeVersion = lines[0].trim();
        return {
          installed: true,
          version: this.vscodeVersion,
          path: await this.getVSCodePath()
        };
      }
    } catch (error) {
      // VS Code 未安装或不在 PATH 中
      this.vscodeInstalled = false;
      this.vscodeVersion = null;
    }

    return {
      installed: false,
      version: null,
      path: null
    };
  }

  /**
   * 获取 VS Code 安装路径
   */
  async getVSCodePath() {
    const isWindows = os.platform() === 'win32';
    
    if (isWindows) {
      const possiblePaths = [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Microsoft VS Code', 'Code.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft VS Code', 'Code.exe'),
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
    } else {
      try {
        const { stdout } = await execAsync('which code');
        return stdout.trim();
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  /**
   * 获取已安装的 VS Code 扩展列表
   */
  async getInstalledExtensions() {
    if (!this.vscodeInstalled) {
      return [];
    }

    try {
      const { stdout } = await execAsync('code --list-extensions --show-versions', { timeout: 10000 });
      const extensions = stdout
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.match(/(.+)@(.+)/);
          if (match) {
            return {
              id: match[1],
              version: match[2]
            };
          }
          return { id: line, version: 'unknown' };
        });

      this.installedExtensions = extensions;
      return extensions;
    } catch (error) {
      console.error('获取已安装扩展失败:', error.message);
      return [];
    }
  }

  /**
   * 检查指定扩展是否已安装
   */
  isExtensionInstalled(extensionId) {
    return this.installedExtensions.some(ext => ext.id === extensionId);
  }

  /**
   * 检测常用工具是否安装
   */
  async detectTool(toolName, command) {
    try {
      // Windows Terminal 特殊处理，使用 where 命令检测
      if (toolName === 'windows-terminal' && os.platform() === 'win32') {
        try {
          const { stdout } = await execAsync('where wt.exe', { timeout: 3000 });
          if (stdout.trim()) {
            const result = {
              installed: true,
              version: 'Installed',
              command: command
            };
            this.detectedTools.set(toolName, result);
            return result;
          }
        } catch (e) {
          // 未安装
        }
        const result = {
          installed: false,
          version: null,
          command: command
        };
        this.detectedTools.set(toolName, result);
        return result;
      }

      const { stdout } = await execAsync(command, { timeout: 5000 });
      const result = {
        installed: true,
        version: stdout.trim().split('\n')[0],
        command: command
      };
      this.detectedTools.set(toolName, result);
      return result;
    } catch (error) {
      const result = {
        installed: false,
        version: null,
        command: command
      };
      this.detectedTools.set(toolName, result);
      return result;
    }
  }

  /**
   * 批量检测多个工具
   */
  async detectAllTools(tools) {
    const results = {};
    
    for (const [name, command] of Object.entries(tools)) {
      results[name] = await this.detectTool(name, command);
    }

    return results;
  }

  /**
   * 获取系统信息（基础，performFullCheck 用）
   */
  getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      type: os.type(),
      hostname: os.hostname(),
      homeDir: os.homedir(),
      tmpDir: os.tmpdir()
    };
  }

  /**
   * 获取详细硬件信息 —— 使用 systeminformation 库
   * 跨平台：Windows / Linux / macOS / FreeBSD 全覆盖
   */
  async getDetailedSystemInfo() {
    const basic = this.getSystemInfo();

    // 并行查询所有硬件信息
    const [osInfo, cpuInfo, memInfo, memLayout, graphics, baseboard, diskLayout, blockDevices] =
      await Promise.all([
        si.osInfo().catch(() => null),
        si.cpu().catch(() => null),
        si.mem().catch(() => null),
        si.memLayout().catch(() => []),
        si.graphics().catch(() => null),
        si.baseboard().catch(() => null),
        si.diskLayout().catch(() => []),
        si.blockDevices().catch(() => []),
      ]);

    // ── 操作系统 ──
    const osName = osInfo?.distro || basic.type;
    const osVersion = osInfo?.release
      ? (osInfo.build ? `${osInfo.release} (Build ${osInfo.build})` : osInfo.release)
      : basic.release;

    // ── CPU ──
    const cpuModel = cpuInfo?.brand
      ? `${cpuInfo.manufacturer || ''} ${cpuInfo.brand}`.trim()
      : (os.cpus()[0]?.model?.trim() || '未知');
    const cpuCores = cpuInfo?.physicalCores || '?';
    const cpuLogical = cpuInfo?.cores || os.cpus().length;
    const cpuSpeed = cpuInfo?.speed ? `${cpuInfo.speed} GHz` : (cpuInfo?.speedMax ? `${cpuInfo.speedMax} GHz` : '');

    // ── 内存 ──
    const totalMemGB = memInfo ? (memInfo.total / 1024 / 1024 / 1024).toFixed(1) : '?';
    const usedMemGB = memInfo ? ((memInfo.total - memInfo.available) / 1024 / 1024 / 1024).toFixed(1) : '?';
    const freeMemGB = memInfo ? (memInfo.available / 1024 / 1024 / 1024).toFixed(1) : '?';
    const memUsage = memInfo ? Math.round(((memInfo.total - memInfo.available) / memInfo.total) * 100) : 0;

    // ── GPU ── 过滤虚拟显卡
    const virtualGpuKeywords = [
      'Microsoft Basic', 'Virtual', 'IddDriver',
      'Hyper-V', 'VMware', 'VirtualBox', 'Parsec',
      'Remote Desktop', 'Citrix', 'RDP',
    ];
    const gpus = (graphics?.controllers || [])
      .filter(g => g.model && !virtualGpuKeywords.some(k => g.model.toLowerCase().includes(k.toLowerCase())))
      .map(g => ({
        name: g.model || '未知',
        vram: g.vram ? `${g.vram} MB` : (g.memoryTotal ? `${g.memoryTotal} MB` : '未知'),
        driver: g.driverVersion || '未知',
      }));

    // ── 主板 ──
    const mbMfr = (baseboard?.manufacturer || '').trim();
    const mbModel = (baseboard?.model || '').trim();
    const motherboard = (mbMfr || mbModel) ? `${mbMfr} ${mbModel}`.trim() : '未知';

    // ── 硬盘 ──
    const disks = diskLayout.length > 0
      ? diskLayout.map(d => ({
          model: (d.name || d.vendor || '未知').trim(),
          size: d.size ? `${Math.round(d.size / 1024 / 1024 / 1024)} GB` : '未知',
          interface: d.interfaceType || d.type || '未知',
        }))
      : [];

    // ── 显示器 ── 过滤无意义名称
    const uselessMonitorNames = ['default monitor', 'generic pnp monitor', 'generic monitor', 'unknown'];
    const monitors = (graphics?.displays || [])
      .filter(d => {
        const name = (d.model || d.deviceName || '').trim().toLowerCase();
        return name && !uselessMonitorNames.some(u => name.includes(u));
      })
      .map(d => ({
        name: (d.model || d.deviceName || '').trim(),
        resolution: (d.currentResX && d.currentResY) ? `${d.currentResX}×${d.currentResY}` : '',
        size: d.sizeX && d.sizeY
          ? `${(Math.sqrt(d.sizeX * d.sizeX + d.sizeY * d.sizeY) / 25.4).toFixed(1)}英寸`
          : '',
        connection: d.connection || '',
      }));

    // ── 内存条 ──
    const ramSticks = (Array.isArray(memLayout) ? memLayout : [])
      .filter(m => m.size > 0)
      .map(m => ({
        manufacturer: (m.manufacturer || '未知').trim(),
        size: m.size ? `${Math.round(m.size / 1024 / 1024 / 1024)} GB` : '未知',
        speed: m.clockSpeed ? `${m.clockSpeed} MHz` : '未知',
        type: m.type || '',
      }));

    return {
      ...basic,
      osName,
      osVersion,
      cpuModel,
      cpuCores,
      cpuLogical,
      cpuSpeed,
      totalMem: `${totalMemGB} GB`,
      usedMem: `${usedMemGB} GB`,
      freeMem: `${freeMemGB} GB`,
      memUsage,
      gpus,
      motherboard,
      disks,
      monitors,
      ramSticks,
      uptime: this._formatUptime(os.uptime()),
    };
  }

  _formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}天 ${h}小时`;
    if (h > 0) return `${h}小时 ${m}分钟`;
    return `${m}分钟`;
  }

  /**
   * 完整环境检测
   */
  async performFullCheck() {
    // 检测 VS Code
    const vscodeInfo = await this.detectVSCode();
    
    // 如果 VS Code 已安装，获取扩展列表
    let extensions = [];
    if (vscodeInfo.installed) {
      extensions = await this.getInstalledExtensions();
    }

    // 检测常用开发工具（使用小写 ID 与前端匹配）
    const isWin = os.platform() === 'win32';
    const commonTools = {
      'python': isWin ? 'python --version' : 'python3 --version',
      'nodejs': 'node --version',
      'git': 'git --version',
      'npm': 'npm --version',
      'uv': 'uv --version',
      'vscode': 'code --version',
      ...(isWin ? { 'windows-terminal': 'wt.exe --version' } : {}),
    };

    const toolsStatus = await this.detectAllTools(commonTools);

    return {
      vscode: vscodeInfo,
      extensions: extensions,
      tools: toolsStatus,
      system: this.getSystemInfo()
    };
  }
}

// 单例模式
let instance = null;

function getEnvironmentService() {
  if (!instance) {
    instance = new EnvironmentService();
  }
  return instance;
}

module.exports = {
  EnvironmentService,
  getEnvironmentService
};
