const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const path = require('path');
const fs = require('fs');

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
   * 获取系统信息
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
    const commonTools = {
      'python': 'python --version',
      'nodejs': 'node --version',
      'git': 'git --version',
      'npm': 'npm --version',
      'uv': 'uv --version',
      'vscode': 'code --version',
      'windows-terminal': 'wt.exe --version',
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
