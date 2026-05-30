/**
 * SnowLuma 平台工具函数。
 * 负责 SnowLuma Release 数据读取、资源选择和压缩包结构识别。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/SnowLuma/SnowLuma/releases';
const GITHUB_LATEST_URL = 'https://api.github.com/repos/SnowLuma/SnowLuma/releases/latest';

/**
 * 获取 SnowLuma 最新 Release 信息。
 * @param {Object} params 查询参数
 * @param {Object} params.context 执行上下文
 * @param {Object} params.helpers 平台通用工具函数
 * @returns {Promise<Object>} GitHub Release 对象
 */
async function fetchLatestSnowLumaRelease({ context, helpers }) {
  const apiUrls = await resolveApiUrls(helpers, GITHUB_LATEST_URL);

  let lastError = null;
  for (const apiUrl of apiUrls) {
    try {
      if (context.emitOutput) {
        context.emitOutput(`[snowluma] 正在尝试访问: ${apiUrl}`);
      }
      const data = await helpers.httpsGet(apiUrl, {
        'User-Agent': 'Neo-MoFox-Launcher',
        'Accept': 'application/vnd.github.v3+json',
      });
      const release = JSON.parse(data);
      if (!release.assets) throw new Error('Release 数据无效');
      if (context.emitOutput) {
        context.emitOutput('[snowluma] 成功获取 Release 信息');
      }
      return release;
    } catch (error) {
      lastError = error;
      if (context.emitOutput) {
        context.emitOutput(`[snowluma] 访问失败: ${error.message}`);
      }
    }
  }

  throw new Error(`获取 SnowLuma Release 信息失败: ${lastError?.message}`);
}

/**
 * 获取 SnowLuma Release 列表。
 * @param {Object} helpers 平台通用工具函数
 * @param {number} limit 返回数量
 * @returns {Promise<Array<Object>>} Release 列表
 */
async function fetchSnowLumaReleases(helpers, limit = 10) {
  const apiUrls = await resolveApiUrls(helpers, GITHUB_RELEASES_URL);
  let lastError = null;

  for (const apiUrl of apiUrls) {
    try {
      const separator = apiUrl.includes('?') ? '&' : '?';
      const data = await helpers.httpsGet(`${apiUrl}${separator}per_page=${limit}`, {
        'User-Agent': 'Neo-MoFox-Launcher',
        'Accept': 'application/vnd.github.v3+json',
      });
      const releases = JSON.parse(data);
      if (!Array.isArray(releases)) throw new Error('Release 列表数据无效');
      return releases;
    } catch (error) {
      lastError = error;
      console.error(`[SnowLuma] 获取 Releases 失败 (${apiUrl}):`, error.message);
    }
  }

  throw new Error(`获取 SnowLuma 版本列表失败: ${lastError?.message}`);
}

/**
 * 根据当前系统选择 SnowLuma 完整包资源名称。
 * @param {Object} release GitHub Release 对象
 * @param {NodeJS.Platform} platform Node 平台标识
 * @param {string} arch Node 架构标识
 * @returns {Object} Release asset
 */
function selectAssetForCurrentSystem(release, platform = process.platform, arch = process.arch) {
  if (!release || !Array.isArray(release.assets)) {
    throw new Error('SnowLuma Release 数据无效，缺少 assets');
  }

  const version = release.tag_name || release.version || 'latest';
  const platformPart = resolveAssetPlatformPart(platform, arch);
  const expectedName = `SnowLuma-${version}-${platformPart}`;
  const asset = release.assets.find((item) => {
    if (!item || typeof item.name !== 'string') return false;
    if (item.name.includes('-lite')) return false;
    if (!item.name.startsWith(expectedName)) return false;
    return item.name.endsWith('.zip') || item.name.endsWith('.tar.gz');
  });

  if (!asset) {
    throw new Error(`找不到适合当前系统的 SnowLuma 完整包: ${expectedName}.zip/.tar.gz`);
  }

  return asset;
}

/**
 * 获取 SnowLuma 解压后的运行根目录。
 * @param {string} platformDir 平台安装目录
 * @returns {string|null} 运行根目录
 */
function getRootPath(platformDir) {
  try {
    if (!platformDir || !fs.existsSync(platformDir)) return null;

    const candidates = [
      platformDir,
      ...fs.readdirSync(platformDir)
        .map((item) => path.join(platformDir, item))
        .filter((itemPath) => fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()),
    ];

    for (const candidate of candidates) {
      if (isSnowLumaRoot(candidate)) return candidate;
    }

    return null;
  } catch (_) {
    return null;
  }
}

/**
 * 判断目录是否为 SnowLuma 运行根目录。
 * @param {string} candidate 候选目录
 * @returns {boolean} 是否为运行根目录
 */
function isSnowLumaRoot(candidate) {
  const entry = path.join(candidate, 'index.mjs');
  const packageJson = path.join(candidate, 'package.json');
  const hasLauncher = fs.existsSync(path.join(candidate, 'launcher.bat'))
    || fs.existsSync(path.join(candidate, 'launcher.sh'));
  return fs.existsSync(entry) && (hasLauncher || fs.existsSync(packageJson));
}

/**
 * 解析 GitHub API 地址的镜像列表。
 * @param {Object} helpers 平台通用工具函数
 * @param {string} originUrl 原始 URL
 * @returns {Promise<string[]>} URL 列表
 */
async function resolveApiUrls(helpers, originUrl) {
  if (helpers.mirrorService && typeof helpers.mirrorService.getSnowLumaUrls === 'function') {
    return await helpers.mirrorService.getSnowLumaUrls(originUrl);
  }
  if (typeof helpers.getMirroredUrls === 'function') {
    const urls = await helpers.getMirroredUrls(originUrl);
    return Array.isArray(urls) && urls.length > 0 ? urls : [originUrl];
  }
  return [originUrl];
}

/**
 * 解析当前系统对应的 SnowLuma 资源平台片段。
 * @param {NodeJS.Platform} platform Node 平台标识
 * @param {string} arch Node 架构标识
 * @returns {string} 资源平台片段
 */
function resolveAssetPlatformPart(platform, arch) {
  if (platform === 'win32' && arch === 'x64') return 'win-x64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  throw new Error(`SnowLuma 暂不支持当前系统: ${platform} ${arch}`);
}

module.exports = {
  GITHUB_LATEST_URL,
  GITHUB_RELEASES_URL,
  fetchLatestSnowLumaRelease,
  fetchSnowLumaReleases,
  getRootPath,
  selectAssetForCurrentSystem,
};
