/**
 * NapCat 平台安装器。
 * 负责下载、校验、解压 NapCat Windows Node 包并返回平台安装信息。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { platformHelper } = require('../../utils/PlatformHelper');
const { fetchLatestNapCatRelease } = require('./helpers');
const { removePathSafe } = require('../../utils/NativeFileRemover');

const MAX_DOWNLOAD_RETRY = 3;
const WINDOWS_NODE_ASSET_NAME = 'NapCat.Shell.Windows.Node.zip';

/**
 * 安装 NapCat 平台。
 * @param {Object} params 安装参数
 * @param {Object} params.context 安装上下文
 * @param {Object} params.inputs 用户输入
 * @param {Object} params.helpers 步骤执行器工具函数
 * @param {string} params.platformDir 平台安装目录
 * @returns {Promise<Object>} 安装结果
 */
async function install({ context, helpers, platformDir }) {
  context.emitProgress('platform-install', 5, '正在获取 NapCat 最新版本信息...');
  const release = await fetchLatestNapCatRelease({ context, helpers });

  const assetName = WINDOWS_NODE_ASSET_NAME;
  const asset = release.assets.find((item) => item.name === assetName);
  if (!asset) {
    throw new Error(`在 ${release.tag_name} 中未找到 ${assetName}`);
  }

  context.emitOutput(`[napcat] 版本: ${release.tag_name}`);
  context.emitOutput(`[napcat] 资源: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`);

  let expectedSha256 = null;
  if (asset.digest && asset.digest.startsWith('sha256:')) {
    expectedSha256 = asset.digest.slice('sha256:'.length).toLowerCase();
    context.emitOutput(`[napcat] 期望校验值: ${expectedSha256}`);
  }

  const zipPath = path.join(platformDir, assetName);
  const downloadUrls = await resolveDownloadUrls(asset.browser_download_url, helpers);
  let downloadSuccess = false;
  let lastDownloadError = null;

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRY; attempt += 1) {
    const downloadUrl = downloadUrls[(attempt - 1) % downloadUrls.length];
    context.emitProgress(
      'platform-install',
      10,
      `正在下载 NapCat ${release.tag_name}...${attempt > 1 ? ` (第 ${attempt} 次尝试)` : ''}`
    );
    context.emitOutput(`[napcat] 下载源: ${downloadUrl}`);

    try {
      await helpers.downloadFile(downloadUrl, zipPath, (downloaded, total) => {
        const pct = total > 0 ? Math.floor(10 + (downloaded / total) * 55) : 10;
        const dlMB = (downloaded / 1024 / 1024).toFixed(1);
        const totalMB = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?';
        context.emitProgress('platform-install', pct, `下载中... ${dlMB} MB / ${totalMB} MB`);
      });
    } catch (error) {
      lastDownloadError = error;
      context.emitOutput(`[napcat] 下载失败 (第 ${attempt}/${MAX_DOWNLOAD_RETRY} 次): ${error.message}`);
      await cleanupDownloadPath(zipPath, context);
      if (attempt >= MAX_DOWNLOAD_RETRY) {
        throw new Error(`NapCat 下载失败: ${lastDownloadError.message}`);
      }
      continue;
    }

    context.emitOutput(`[napcat] 下载完成: ${zipPath}`);

    if (expectedSha256) {
      context.emitProgress('platform-install', 66, '正在校验文件完整性...');
      const actualSha256 = await helpers.computeFileSha256(zipPath);
      context.emitOutput(`[napcat] 实际校验值: ${actualSha256}`);

      if (actualSha256 === expectedSha256) {
        context.emitOutput('[napcat] 校验通过');
        downloadSuccess = true;
        break;
      }

      context.emitOutput(`[napcat] 校验失败 (第 ${attempt}/${MAX_DOWNLOAD_RETRY} 次)`);
      context.emitOutput(`[napcat]   期望: ${expectedSha256}`);
      context.emitOutput(`[napcat]   实际: ${actualSha256}`);
      await cleanupDownloadPath(zipPath, context);

      if (attempt >= MAX_DOWNLOAD_RETRY) {
        throw new Error(
          `NapCat 下载校验失败，已重试 ${MAX_DOWNLOAD_RETRY} 次仍不一致。` +
          `\n期望: ${expectedSha256}` +
          `\n实际: ${actualSha256}` +
          '\n请检查网络环境后重试。'
        );
      }
    } else {
      context.emitOutput('[napcat] 未找到校验值信息，跳过完整性校验');
      downloadSuccess = true;
      break;
    }
  }

  if (!downloadSuccess) {
    throw new Error('NapCat 下载失败');
  }

  context.emitProgress('platform-install', 68, '正在解压...');
  await platformHelper.unzip(zipPath, platformDir);
  context.emitOutput('[napcat] 解压完成');

  await cleanupDownloadPath(zipPath, context);

  const platformRoot = getRootPath(platformDir);
  if (!platformRoot) {
    throw new Error('NapCat Windows Node 包结构无效，缺少 node.exe、index.js、napcat.bat 或 napcat 目录');
  }

  context.emitOutput(`[napcat] Node 包根目录: ${platformRoot}`);
  context.emitOutput(`[napcat] 启动脚本: ${path.join(platformRoot, 'napcat.bat')}`);
  context.emitProgress('platform-install', 100, 'NapCat 安装完成');

  return {
    success: true,
    path: platformDir,
    rootPath: platformRoot,
    version: release.tag_name,
  };
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
      label: 'NapCat 下载包',
      onOutput: (message) => context.emitOutput(message),
    });
  } catch (error) {
    context.emitOutput(`[napcat] 清理下载包失败: ${error.message}`);
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
  return await helpers.getMirroredUrls(originUrl);
}

/**
 * 获取 NapCat Windows Node 包根目录。
 * @param {string} platformDir 平台安装目录
 * @returns {string|null} Node 包根目录
 */
function getRootPath(platformDir) {
  try {
    if (!platformDir || !fs.existsSync(platformDir)) return null;
    const requiredFiles = ['node.exe', 'index.js', 'napcat.bat'];
    const hasNodeRoot = requiredFiles.every((fileName) => fs.existsSync(path.join(platformDir, fileName)))
      && fs.existsSync(path.join(platformDir, 'napcat'));
    return hasNodeRoot ? platformDir : null;
  } catch (_) {
    return null;
  }
}

module.exports = { install, getRootPath, WINDOWS_NODE_ASSET_NAME };
