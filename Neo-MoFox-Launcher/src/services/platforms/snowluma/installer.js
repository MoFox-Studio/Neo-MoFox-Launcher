/**
 * SnowLuma 平台安装器。
 * 负责下载、校验、解压 SnowLuma 完整运行包并返回平台安装信息。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { platformHelper } = require('../../utils/PlatformHelper');
const { fetchLatestSnowLumaRelease, getRootPath, selectAssetForCurrentSystem } = require('./helpers');
const { removePathSafe } = require('../../utils/NativeFileRemover');

const MAX_DOWNLOAD_RETRY = 3;

/**
 * 安装 SnowLuma 平台。
 * @param {Object} params 安装参数
 * @param {Object} params.context 安装上下文
 * @param {Object} params.helpers 步骤执行器工具函数
 * @param {string} params.platformDir 平台安装目录
 * @returns {Promise<Object>} 安装结果
 */
async function install({ context, helpers, platformDir }) {
  context.emitProgress('platform-install', 5, '正在获取 SnowLuma 最新版本信息...');
  const release = await fetchLatestSnowLumaRelease({ context, helpers });
  const asset = selectAssetForCurrentSystem(release);

  context.emitOutput(`[snowluma] 版本: ${release.tag_name}`);
  context.emitOutput(`[snowluma] 资源: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`);

  let expectedSha256 = null;
  if (asset.digest && asset.digest.startsWith('sha256:')) {
    expectedSha256 = asset.digest.slice('sha256:'.length).toLowerCase();
    context.emitOutput(`[snowluma] 期望校验值: ${expectedSha256}`);
  }

  const archivePath = path.join(platformDir, asset.name);
  const downloadUrls = await resolveDownloadUrls(asset.browser_download_url, helpers);
  let downloadSuccess = false;
  let lastDownloadError = null;

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRY; attempt += 1) {
    const downloadUrl = downloadUrls[(attempt - 1) % downloadUrls.length];
    context.emitProgress(
      'platform-install',
      10,
      `正在下载 SnowLuma ${release.tag_name}...${attempt > 1 ? ` (第 ${attempt} 次尝试)` : ''}`
    );
    context.emitOutput(`[snowluma] 下载源: ${downloadUrl}`);

    try {
      await helpers.downloadFile(downloadUrl, archivePath, (downloaded, total) => {
        const pct = total > 0 ? Math.floor(10 + (downloaded / total) * 55) : 10;
        const dlMB = (downloaded / 1024 / 1024).toFixed(1);
        const totalMB = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?';
        context.emitProgress('platform-install', pct, `下载中... ${dlMB} MB / ${totalMB} MB`);
      });
    } catch (error) {
      lastDownloadError = error;
      context.emitOutput(`[snowluma] 下载失败 (第 ${attempt}/${MAX_DOWNLOAD_RETRY} 次): ${error.message}`);
      await cleanupDownloadPath(archivePath, context);
      if (attempt >= MAX_DOWNLOAD_RETRY) {
        throw new Error(`SnowLuma 下载失败: ${lastDownloadError.message}`);
      }
      continue;
    }

    context.emitOutput(`[snowluma] 下载完成: ${archivePath}`);

    if (expectedSha256) {
      context.emitProgress('platform-install', 66, '正在校验文件完整性...');
      const actualSha256 = await helpers.computeFileSha256(archivePath);
      context.emitOutput(`[snowluma] 实际校验值: ${actualSha256}`);

      if (actualSha256 === expectedSha256) {
        context.emitOutput('[snowluma] 校验通过');
        downloadSuccess = true;
        break;
      }

      context.emitOutput(`[snowluma] 校验失败 (第 ${attempt}/${MAX_DOWNLOAD_RETRY} 次)`);
      context.emitOutput(`[snowluma]   期望: ${expectedSha256}`);
      context.emitOutput(`[snowluma]   实际: ${actualSha256}`);
      await cleanupDownloadPath(archivePath, context);

      if (attempt >= MAX_DOWNLOAD_RETRY) {
        throw new Error(
          `SnowLuma 下载校验失败，已重试 ${MAX_DOWNLOAD_RETRY} 次仍不一致。`
          + `\n期望: ${expectedSha256}`
          + `\n实际: ${actualSha256}`
          + '\n请检查网络环境后重试。'
        );
      }
    } else {
      context.emitOutput('[snowluma] 未找到校验值信息，跳过完整性校验');
      downloadSuccess = true;
      break;
    }
  }

  if (!downloadSuccess) {
    throw new Error('SnowLuma 下载失败');
  }

  context.emitProgress('platform-install', 68, '正在解压 SnowLuma...');
  await extractArchive(archivePath, platformDir, helpers, context);
  context.emitOutput('[snowluma] 解压完成');

  await cleanupDownloadPath(archivePath, context);

  const platformRoot = getRootPath(platformDir);
  if (!platformRoot) {
    throw new Error('SnowLuma 包结构无效，缺少 index.mjs 与 launcher 脚本');
  }

  ensureExecutableLauncher(platformRoot, context);

  context.emitOutput(`[snowluma] 运行根目录: ${platformRoot}`);
  context.emitProgress('platform-install', 100, 'SnowLuma 安装完成');

  return {
    success: true,
    path: platformDir,
    rootPath: platformRoot,
    version: release.tag_name,
  };
}

/**
 * 解压 SnowLuma 压缩包。
 * @param {string} archivePath 压缩包路径
 * @param {string} destDir 目标目录
 * @param {Object} helpers 安装工具函数
 * @param {Object} context 执行上下文
 * @returns {Promise<void>} 解压完成 Promise
 */
async function extractArchive(archivePath, destDir, helpers, context) {
  if (archivePath.endsWith('.zip')) {
    await platformHelper.unzip(archivePath, destDir);
    return;
  }

  if (archivePath.endsWith('.tar.gz')) {
    await helpers.execCommand('tar', ['-xzf', archivePath, '-C', destDir], {
      onStderr: (data) => context.emitOutput(data),
    });
    return;
  }

  throw new Error(`不支持的 SnowLuma 压缩包格式: ${archivePath}`);
}

/**
 * 确保 Linux/macOS 启动脚本可执行。
 * @param {string} platformRoot SnowLuma 运行根目录
 * @param {Object} context 执行上下文
 * @returns {void}
 */
function ensureExecutableLauncher(platformRoot, context) {
  if (process.platform === 'win32') return;
  const launcher = path.join(platformRoot, 'launcher.sh');
  if (!fs.existsSync(launcher)) return;
  try {
    fs.chmodSync(launcher, 0o755);
    context.emitOutput(`[snowluma] 已设置启动脚本可执行: ${launcher}`);
  } catch (error) {
    context.emitOutput(`[snowluma] 设置启动脚本权限失败: ${error.message}`);
  }
}

/**
 * 清理下载包文件。
 * @param {string} targetPath 需要清理的下载包路径
 * @param {Object} context 安装上下文
 * @returns {Promise<void>}
 */
async function cleanupDownloadPath(targetPath, context) {
  try {
    await removePathSafe(targetPath, {
      label: 'SnowLuma 下载包',
      onOutput: (message) => context.emitOutput(message),
    });
  } catch (error) {
    context.emitOutput(`[snowluma] 清理下载包失败: ${error.message}`);
  }
}

/**
 * 解析下载地址镜像列表。
 * @param {string} originUrl 原始下载地址
 * @param {Object} helpers 安装工具函数
 * @returns {Promise<string[]>} 下载地址列表
 */
async function resolveDownloadUrls(originUrl, helpers) {
  if (typeof helpers.getMirroredUrls !== 'function') {
    return [originUrl];
  }
  const urls = await helpers.getMirroredUrls(originUrl);
  return Array.isArray(urls) && urls.length > 0 ? urls : [originUrl];
}

module.exports = { install, getRootPath };
