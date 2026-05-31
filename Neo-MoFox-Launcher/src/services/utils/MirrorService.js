/**
 * MirrorService - 镜像源管理服务
 * 集中管理所有 GitHub 镜像源，通过 TCP 连接延迟检测选择最佳镜像。
 * 提供统一的镜像 URL 获取接口，供安装、许可证加载、版本检查等模块复用。
 */

const net = require('net');

// ─── 镜像源定义 ──────────────────────────────────────────────────────────

/**
 * 镜像源配置
 * 每个镜像源包含：
 * - name: 镜像名称（用于日志）
 * - baseUrl: 基础 URL（用于代理类镜像的前缀拼接）
 * - type: 镜像类型
 *   - 'origin': 原始 GitHub 地址，无需前缀
 *   - 'proxy': 代理类镜像，需要在原始 URL 前拼接 baseUrl
 * - testHost: 用于延迟检测的主机名
 * - testPort: 用于延迟检测的端口号
 */
const MIRROR_SOURCES = [
  {
    name: 'GitHub (直连)',
    baseUrl: '',
    type: 'origin',
    testHost: 'github.com',
    testPort: 443,
  },
  {
    name: 'ikun114 镜像',
    baseUrl: 'https://github.ikun114.top/',
    type: 'proxy',
    testHost: 'github.ikun114.top',
    testPort: 443,
  },
  {
    name: 'ghproxy 镜像',
    baseUrl: 'https://ghproxy.com/',
    type: 'proxy',
    testHost: 'ghproxy.com',
    testPort: 443,
  },
];

/**
 * Python 发布文件镜像源配置。
 * 这些镜像按 python.org/ftp/python 后的相对路径映射安装包文件。
 */
const PYTHON_MIRROR_SOURCES = [
  {
    name: 'Python.org (直连)',
    baseUrl: 'https://www.python.org/ftp/python/',
    testHost: 'www.python.org',
    testPort: 443,
  },
  {
    name: '清华 TUNA Python 镜像',
    baseUrl: 'https://mirrors.tuna.tsinghua.edu.cn/python/',
    testHost: 'mirrors.tuna.tsinghua.edu.cn',
    testPort: 443,
  },
  {
    name: '华为云 Python 镜像',
    baseUrl: 'https://mirrors.huaweicloud.com/python/',
    testHost: 'mirrors.huaweicloud.com',
    testPort: 443,
  },
];

/**
 * 原始 URL 模板定义
 * 所有需要镜像加速的原始 GitHub URL 集中在此处管理
 */
const ORIGIN_URLS = {
  // Git 仓库
  repo: {
    neoMofox: 'https://github.com/MoFox-Studio/Neo-MoFox.git',
    webui: 'https://github.com/ikun-1145141/Neo-MoFox-Webui.git',
  },
  // GitHub API
  api: {
    napcatReleases: 'https://api.github.com/repos/NapNeko/NapCatQQ/releases',
    napcatLatest: 'https://api.github.com/repos/NapNeko/NapCatQQ/releases/latest',
    snowlumaReleases: 'https://api.github.com/repos/SnowLuma/SnowLuma/releases',
    snowlumaLatest: 'https://api.github.com/repos/SnowLuma/SnowLuma/releases/latest',
    mofoxBranches: 'https://api.github.com/repos/MoFox-Studio/Neo-MoFox/branches',
    launcherReleases: 'https://api.github.com/repos/MoFox-Studio/Neo-MoFox-Launcher/releases?per_page=1',
  },
  // Raw 内容
  raw: {
    eula: 'https://raw.githubusercontent.com/MoFox-Studio/Neo-MoFox/refs/heads/dev/eula.md',
    privacy: 'https://raw.githubusercontent.com/MoFox-Studio/Neo-MoFox/refs/heads/dev/PRIVACY.md',
  },
  // 第三方依赖下载（用于 OOBE 自动安装）
  dependency: {
    pythonBase: 'https://www.python.org/ftp/python/',
    pythonWin: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe',
    pythonMac: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-macos11.pkg',
    gitWin: 'https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe',
  },
};

// ─── 延迟检测超时 ────────────────────────────────────────────────────────

const CONNECT_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存

// ─── MirrorService 类 ────────────────────────────────────────────────────

class MirrorService {
  constructor() {
    /** @type {Object|null} 缓存的最佳镜像 */
    this._bestMirror = null;
    /** @type {number} 缓存时间戳 */
    this._cacheTimestamp = 0;
    /** @type {Promise|null} 正在进行的检测 Promise（防止并发重复检测） */
    this._detectingPromise = null;
  }

  /**
   * 通过 TCP 连接测试到指定主机的延迟
   * @param {string} host - 目标主机名
   * @param {number} port - 目标端口
   * @returns {Promise<number>} 连接延迟（毫秒），超时或失败返回 Infinity
   */
  _measureLatency(host, port) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();

      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.setTimeout(CONNECT_TIMEOUT_MS);

      socket.on('connect', () => {
        const latency = Date.now() - startTime;
        cleanup();
        resolve(latency);
      });

      socket.on('timeout', () => {
        cleanup();
        resolve(Infinity);
      });

      socket.on('error', () => {
        cleanup();
        resolve(Infinity);
      });

      socket.connect(port, host);
    });
  }

  /**
   * 检测所有镜像源的延迟，返回按延迟排序的结果
   * @returns {Promise<Array<{mirror: Object, latency: number}>>} 排序后的镜像列表
   */
  async _detectAllLatencies() {
    const results = await Promise.all(
      MIRROR_SOURCES.map(async (mirror) => {
        const latency = await this._measureLatency(mirror.testHost, mirror.testPort);
        return { mirror, latency };
      })
    );

    // 按延迟排序，Infinity 排最后
    results.sort((a, b) => a.latency - b.latency);
    return results;
  }

  /**
   * 获取最佳镜像源（带缓存）
   * 委托给 checkConnectivity 执行检测并返回最佳镜像
   * @returns {Promise<Object|null>} 最佳镜像源配置，全部不可达时返回 null
   */
  async getBestMirror() {
    const { bestMirror } = await this.checkConnectivity();
    return bestMirror;
  }

  /**
   * 强制刷新镜像检测缓存
   * @returns {Promise<Object|null>} 新的最佳镜像
   */
  async refresh() {
    this._bestMirror = null;
    this._cacheTimestamp = 0;
    return await this.getBestMirror();
  }

  /**
   * 根据镜像源配置，将原始 URL 转换为镜像 URL
   * @param {Object} mirror - 镜像源配置
   * @param {string} originUrl - 原始 GitHub URL
   * @returns {string} 镜像 URL
   */
  _applyMirror(mirror, originUrl) {
    if (mirror.type === 'origin') {
      return originUrl;
    }
    // proxy 类型：在原始 URL 前拼接 baseUrl
    return mirror.baseUrl + originUrl;
  }

  /**
   * 获取指定资源的 URL 列表（最佳镜像优先）
   * 如果检测到最佳镜像，返回 [最佳镜像URL]；
   * 如果没有最佳镜像（全部不可达），返回所有镜像源的 URL 列表用于轮询。
   * @param {string} originUrl - 原始 GitHub URL
   * @returns {Promise<string[]>} URL 列表
   */
  async getUrls(originUrl) {
    const bestMirror = await this.getBestMirror();

    if (bestMirror) {
      // 有最佳镜像时，只返回最佳镜像的 URL
      return [this._applyMirror(bestMirror, originUrl)];
    }

    // 没有最佳镜像时，返回所有镜像源的 URL 列表
    return MIRROR_SOURCES.map((mirror) => this._applyMirror(mirror, originUrl));
  }

  /**
   * 获取 Neo-MoFox 仓库的克隆 URL 列表
   * @returns {Promise<string[]>}
   */
  async getRepoUrls() {
    return await this.getUrls(ORIGIN_URLS.repo.neoMofox);
  }

  /**
   * 获取 WebUI 仓库的克隆 URL 列表
   * @returns {Promise<string[]>}
   */
  async getWebuiRepoUrls() {
    return await this.getUrls(ORIGIN_URLS.repo.webui);
  }

  /**
   * 获取 NapCat 最新 Release API 的 URL 列表
   * @returns {Promise<string[]>}
   */
  async getNapcatLatestUrls() {
    return await this.getUrls(ORIGIN_URLS.api.napcatLatest);
  }

  /**
   * 获取 NapCat Releases API 的 URL 列表
   * @returns {Promise<string[]>}
   */
  async getNapcatReleasesUrls() {
    return await this.getUrls(ORIGIN_URLS.api.napcatReleases);
  }

  /**
   * 获取 SnowLuma API 的 URL 列表。
   * @param {string} [originUrl] 指定原始 URL，默认使用 SnowLuma Releases API
   * @returns {Promise<string[]>}
   */
  async getSnowLumaUrls(originUrl = ORIGIN_URLS.api.snowlumaReleases) {
    return await this.getUrls(originUrl);
  }

  /**
   * 获取 SnowLuma 最新 Release API 的 URL 列表。
   * @returns {Promise<string[]>}
   */
  async getSnowLumaLatestUrls() {
    return await this.getUrls(ORIGIN_URLS.api.snowlumaLatest);
  }

  /**
   * 获取 SnowLuma Releases API 的 URL 列表。
   * @returns {Promise<string[]>}
   */
  async getSnowLumaReleasesUrls() {
    return await this.getUrls(ORIGIN_URLS.api.snowlumaReleases);
  }

  /**
   * 获取 MoFox 分支 API 的 URL 列表
   * @returns {Promise<string[]>}
   */
  async getMofoxBranchesUrls() {
    return await this.getUrls(ORIGIN_URLS.api.mofoxBranches);
  }

  /**
   * 获取启动器 Releases API 的 URL 列表
   * @returns {Promise<string[]>}
   */
  async getLauncherReleasesUrls() {
    return await this.getUrls(ORIGIN_URLS.api.launcherReleases);
  }

  /**
   * 获取 EULA 文档的 URL 列表
   * @returns {Promise<string[]>}
   */
  async getEulaUrls() {
    return await this.getUrls(ORIGIN_URLS.raw.eula);
  }

  /**
   * 获取隐私政策文档的 URL 列表
   * @returns {Promise<string[]>}
   */
  async getPrivacyUrls() {
    return await this.getUrls(ORIGIN_URLS.raw.privacy);
  }

  /**
   * 基于 Python 镜像源生成下载 URL 列表。
   * @param {string} originUrl - python.org 官方下载地址
   * @returns {Promise<string[]>} Python 下载 URL 列表
   */
  async getPythonDownloadUrls(originUrl) {
    const relativePath = originUrl.replace(ORIGIN_URLS.dependency.pythonBase, '');
    if (relativePath === originUrl) {
      return [originUrl];
    }

    const results = await Promise.all(
      PYTHON_MIRROR_SOURCES.map(async (mirror) => {
        const latency = await this._measureLatency(mirror.testHost, mirror.testPort);
        return { mirror, latency };
      })
    );

    results.sort((a, b) => a.latency - b.latency);
    const reachable = results.filter((result) => result.latency !== Infinity);
    const ordered = reachable.length > 0 ? reachable : results;

    return ordered.map(({ mirror }) => mirror.baseUrl + relativePath);
  }

  /**
   * 获取 Windows Git 安装包 URL 列表。
   * @returns {Promise<string[]>}
   */
  async getGitForWindowsDownloadUrls() {
    return await this.getUrls(ORIGIN_URLS.dependency.gitWin);
  }

  /**
   * 检查网络连通性并选择最佳镜像源（带缓存）
   * 合并了原 checkConnectivity 和 getBestMirror 的功能：
   * - 检测所有镜像源延迟
   * - 选择最佳镜像并更新缓存
   * - 返回完整的连通性检测结果
   * @returns {Promise<{reachable: boolean, bestMirror: Object|null, results: Array}>}
   *   - reachable: 是否有至少一个源可达
   *   - bestMirror: 最佳镜像源（延迟最低的可达源），不可达时为 null
   *   - results: 所有镜像源的检测结果（含延迟信息）
   */
  async checkConnectivity() {
    // 检查缓存是否有效
    if (this._bestMirror && (Date.now() - this._cacheTimestamp) < CACHE_TTL_MS) {
      return {
        reachable: true,
        bestMirror: this._bestMirror,
        results: [{
          name: this._bestMirror.name,
          host: this._bestMirror.testHost,
          latency: null,
          reachable: true,
          cached: true,
        }],
      };
    }

    // 防止并发重复检测
    if (this._detectingPromise) {
      return await this._detectingPromise;
    }

    this._detectingPromise = this._doCheckConnectivity();
    try {
      return await this._detectingPromise;
    } finally {
      this._detectingPromise = null;
    }
  }

  /**
   * 执行实际的连通性检测逻辑
   * @returns {Promise<{reachable: boolean, bestMirror: Object|null, results: Array}>}
   */
  async _doCheckConnectivity() {
    console.log('[MirrorService] 检查网络连通性...');
    const results = await this._detectAllLatencies();

    for (const { mirror, latency } of results) {
      const latencyStr = latency === Infinity ? '超时' : `${latency}ms`;
      console.log(`[MirrorService]   ${mirror.name}: ${latencyStr}`);
    }

    const reachableResults = results.filter((r) => r.latency !== Infinity);
    const reachable = reachableResults.length > 0;

    if (reachable) {
      // 更新缓存
      this._bestMirror = reachableResults[0].mirror;
      this._cacheTimestamp = Date.now();
      console.log(`[MirrorService] 网络可达，最佳镜像: ${reachableResults[0].mirror.name} (${reachableResults[0].latency}ms)`);
    } else {
      console.warn('[MirrorService] 所有镜像源均不可达');
      this._bestMirror = null;
      this._cacheTimestamp = Date.now();
    }

    return {
      reachable,
      bestMirror: reachable ? reachableResults[0].mirror : null,
      results: results.map(({ mirror, latency }) => ({
        name: mirror.name,
        host: mirror.testHost,
        latency: latency === Infinity ? null : latency,
        reachable: latency !== Infinity,
      })),
    };
  }
}

// ─── 导出单例 ────────────────────────────────────────────────────────────

const mirrorService = new MirrorService();

module.exports = { mirrorService, MirrorService, MIRROR_SOURCES, ORIGIN_URLS };
