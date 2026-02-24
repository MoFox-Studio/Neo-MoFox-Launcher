/**
 * 推荐的开发工具和软件
 */

/**
 * 推荐的通用开发工具
 */
const RECOMMENDED_TOOLS = [
  {
    id: 'python',
    name: 'Python',
    description: 'Neo-MoFox 运行所需的 Python 解释器',
    icon: 'data_object',
    category: 'runtime',
    required: true,
    downloadUrl: 'https://www.python.org/downloads/',
    detectionCommand: 'python --version',
    platforms: ['win32', 'darwin', 'linux']
  },
  {
    id: 'git',
    name: 'Git',
    description: '版本控制工具，用于管理 Neo-MoFox 源码',
    icon: 'share',
    category: 'tools',
    required: true,
    downloadUrl: 'https://git-scm.com/downloads',
    detectionCommand: 'git --version',
    platforms: ['win32', 'darwin', 'linux']
  },
  {
    id: 'uv',
    name: 'uv',
    description: '极速 Python 包管理器和项目管理工具',
    icon: 'package_2',
    category: 'tools',
    required: true,
    downloadUrl: 'https://github.com/astral-sh/uv',
    detectionCommand: 'uv --version',
    platforms: ['win32', 'darwin', 'linux']
  },
  {
    id: 'nodejs',
    name: 'Node.js',
    description: 'JavaScript 运行时，用于前端开发和构建工具',
    icon: 'javascript',
    category: 'runtime',
    required: false,
    downloadUrl: 'https://nodejs.org/',
    detectionCommand: 'node --version',
    platforms: ['win32', 'darwin', 'linux']
  },
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    description: '强大的代码编辑器，推荐用于开发 Neo-MoFox 插件',
    icon: 'code',
    category: 'editor',
    required: false,
    downloadUrl: 'https://code.visualstudio.com/',
    detectionCommand: 'code --version',
    platforms: ['win32', 'darwin', 'linux']
  },
  {
    id: 'windows-terminal',
    name: 'Windows Terminal',
    description: '现代化的终端应用，支持多标签和自定义主题',
    icon: 'terminal',
    category: 'tools',
    required: false,
    downloadUrl: 'https://aka.ms/terminal',
    detectionCommand: 'wt.exe --version',
    platforms: ['win32']
  }
];

/**
 * 推荐的 VS Code 扩展
 */
const RECOMMENDED_VSCODE_EXTENSIONS = [
  // Python 插件开发必需
  {
    id: 'ms-python.python',
    name: 'Python',
    publisher: 'Microsoft',
    description: 'Python 语言支持，开发 Neo-MoFox 插件必需',
    icon: '🐍',
    category: 'essential',
    required: true,
    installCommand: 'code --install-extension ms-python.python',
    marketplaceUrl: 'vscode:extension/ms-python.python'
  },
  {
    id: 'ms-python.vscode-pylance',
    name: 'Pylance',
    publisher: 'Microsoft',
    description: '高性能 Python 语言服务器，提供智能提示',
    icon: '⚡',
    category: 'essential',
    required: true,
    installCommand: 'code --install-extension ms-python.vscode-pylance',
    marketplaceUrl: 'vscode:extension/ms-python.vscode-pylance'
  },

  // 配置文件编辑
  {
    id: 'tamasfe.even-better-toml',
    name: 'Even Better TOML',
    publisher: 'tamasfe',
    description: 'TOML 配置文件语法高亮和验证（core.toml, model.toml）',
    icon: '📄',
    category: 'config',
    required: true,
    installCommand: 'code --install-extension tamasfe.even-better-toml',
    marketplaceUrl: 'vscode:extension/tamasfe.even-better-toml'
  }
];

/**
 * 扩展分类
 */
const EXTENSION_CATEGORIES = {
  essential: { name: '插件开发必需', icon: 'extension', color: '#3776ab' },
  config: { name: '配置文件支持', icon: 'settings', color: '#ff9800' }
};

/**
 * 工具分类
 */
const TOOL_CATEGORIES = {
  runtime: { name: '运行时环境', icon: 'settings', color: '#2196f3' },
  tools: { name: '开发工具', icon: 'build', color: '#4caf50' },
  editor: { name: '代码编辑器', icon: 'edit', color: '#9c27b0' }
};

module.exports = {
  RECOMMENDED_TOOLS,
  RECOMMENDED_VSCODE_EXTENSIONS,
  EXTENSION_CATEGORIES,
  TOOL_CATEGORIES
};
