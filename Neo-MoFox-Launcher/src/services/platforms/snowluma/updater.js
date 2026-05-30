/**
 * SnowLuma 平台更新器。
 * 负责平台版本列表读取、版本覆盖安装和配置/数据备份恢复。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getRootPath, fetchSnowLumaReleases, selectAssetForCurrentSystem } = require('./helpers');
const { removePathSafe } = require('../../utils/NativeFileRemover');

/**
 * 获取 SnowLuma 远程版本列表。
 * @param {Object} helpers 更新工具函数
 * @param {number} limit 返回数量
 * @returns {Promise<Array<Object>>} 版本列表
 */
async function getReleases(helpers, limit = 10) {
  const releases = await fetchSnowLumaReleases(helpers, limit);
  return releases.map((release) => ({
    version: release.tag_name,
    name: release.name,
    publishedAt: release.published_at,
    prerelease: release.prerelease,
    assets: release.assets.map((asset) => ({
      name: asset.name,
      size: asset.size,
      downloadUrl: asset.browser_download_url,
    })),
    raw: release,
  }));
}

/**
 * 更新 SnowLuma 平台。
 * @param {Object} params 更新参数
 * @param {Object} params.instance 实例对象
 * @param {string} params.targetVersion 目标版本
 * @param {Object} params.helpers 更新工具函数
 * @param {Function} params.emitProgress 进度回调
 * @returns {Promise<Object>} 更新结果
 */
async function update({ instance, targetVersion = 'latest', helpers, emitProgress }) {
  const platformDir = instance.platformDir;
  if (!platformDir) {
    throw new Error('实例未配置平台目录');
  }

  emitProgress('update-platform', 0, '获取 SnowLuma 版本信息...');

  const rawReleases = await fetchSnowLumaReleases(helpers, 10);
  const targetRelease = targetVersion === 'latest'
    ? (rawReleases.find((release) => !release.prerelease) || rawReleases[0])
    : rawReleases.find((release) => release.tag_name === targetVersion);

  if (!targetRelease) {
    throw new Error(`找不到版本: ${targetVersion}`);
  }

  const asset = selectAssetForCurrentSystem(targetRelease);
  emitProgress('update-platform', 10, `准备下载 ${targetRelease.tag_name}...`);

  const tempDir = path.join(os.tmpdir(), `snowluma-update-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const archivePath = path.join(tempDir, asset.name);

  emitProgress('update-platform', 20, '下载中...');
  const downloadUrls = await resolveDownloadUrls(asset.browser_download_url, helpers);
  let lastDownloadError = null;
  for (let index = 0; index < downloadUrls.length; index += 1) {
    const downloadUrl = downloadUrls[index];
    try {
      emitProgress('update-platform', 20, `下载中 (${index + 1}/${downloadUrls.length})...`);
      await helpers.downloadFile(downloadUrl, archivePath, (downloaded, total) => {
        const percent = total > 0 ? Math.floor(20 + (downloaded / total) * 40) : 20;
        const downloadedMB = Math.floor(downloaded / 1024 / 1024);
        const totalMB = total > 0 ? Math.floor(total / 1024 / 1024) : '?';
        emitProgress('update-platform', percent, `下载中: ${downloadedMB}MB / ${totalMB}MB`);
      });
      lastDownloadError = null;
      break;
    } catch (error) {
      lastDownloadError = error;
      console.warn(`[SnowLumaUpdater] 下载失败 (${downloadUrl}): ${error.message}`);
    }
  }

  if (lastDownloadError) {
    throw new Error(`下载 SnowLuma 更新包失败: ${lastDownloadError.message}`);
  }

  if (asset.digest && asset.digest.startsWith('sha256:')) {
    emitProgress('update-platform', 58, '校验更新包完整性...');
    const expectedSha256 = asset.digest.slice('sha256:'.length).toLowerCase();
    const actualSha256 = await helpers.computeFileSha256(archivePath);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `SnowLuma 更新包校验失败。\n期望: ${expectedSha256}\n实际: ${actualSha256}`
      );
    }
  }

  emitProgress('update-platform', 60, '备份配置与数据...');
  const backupDir = path.join(os.tmpdir(), `snowluma-backup-${Date.now()}`);
  const oldRoot = instance.platformRoot || getRootPath(platformDir) || platformDir;
  const backupEntries = backupPersistentEntries(oldRoot, backupDir);

  emitProgress('update-platform', 70, '安装新版本...');
  if (fs.existsSync(platformDir)) {
    await removePathSafe(platformDir, {
      label: 'SnowLuma 旧平台目录',
      onOutput: (message) => console.warn(`[SnowLumaUpdater] ${message}`),
    });
  }
  fs.mkdirSync(platformDir, { recursive: true });
  await extractArchive(archivePath, platformDir, helpers);

  const newRoot = getRootPath(platformDir);
  if (!newRoot) {
    throw new Error('SnowLuma 包结构无效，缺少 index.mjs 与 launcher 脚本');
  }

  if (backupEntries.length > 0) {
    emitProgress('update-platform', 90, '恢复配置与数据...');
    restorePersistentEntries(newRoot, backupDir, backupEntries);
  }

  await cleanupTempPaths([archivePath, tempDir, backupDir]);
  ensureExecutableLauncher(newRoot);

  emitProgress('update-platform', 100, `更新到 ${targetRelease.tag_name} 完成`);
  return { success: true, version: targetRelease.tag_name, rootPath: newRoot };
}

/**
 * 备份 SnowLuma 持久化目录。
 * @param {string} root 旧运行根目录
 * @param {string} backupDir 备份目录
 * @returns {string[]} 已备份条目
 */
function backupPersistentEntries(root, backupDir) {
  const entries = ['config', 'data', 'logs'];
  const backed = [];
  fs.mkdirSync(backupDir, { recursive: true });
  for (const entry of entries) {
    const source = path.join(root, entry);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(backupDir, entry), { recursive: true });
    backed.push(entry);
  }
  return backed;
}

/**
 * 恢复 SnowLuma 持久化目录。
 * @param {string} root 新运行根目录
 * @param {string} backupDir 备份目录
 * @param {string[]} entries 已备份条目
 * @returns {void}
 */
function restorePersistentEntries(root, backupDir, entries) {
  for (const entry of entries) {
    const source = path.join(backupDir, entry);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(root, entry), { recursive: true });
  }
}

/**
 * 解压 SnowLuma 更新包。
 * @param {string} archivePath 压缩包路径
 * @param {string} destDir 目标目录
 * @param {Object} helpers 更新工具函数
 * @returns {Promise<void>} 解压完成 Promise
 */
async function extractArchive(archivePath, destDir, helpers) {
  if (archivePath.endsWith('.zip')) {
    await helpers.extractZip(archivePath, destDir);
    return;
  }

  if (archivePath.endsWith('.tar.gz')) {
    await helpers.execCommand('tar', ['-xzf', archivePath, '-C', destDir]);
    return;
  }

  throw new Error(`不支持的 SnowLuma 压缩包格式: ${archivePath}`);
}

/**
 * 确保启动脚本可执行。
 * @param {string} platformRoot SnowLuma 运行根目录
 * @returns {void}
 */
function ensureExecutableLauncher(platformRoot) {
  if (process.platform === 'win32') return;
  const launcher = path.join(platformRoot, 'launcher.sh');
  if (!fs.existsSync(launcher)) return;
  try { fs.chmodSync(launcher, 0o755); } catch (_) {}
}

/**
 * 清理临时路径。
 * @param {string[]} paths 路径列表
 * @returns {Promise<void>}
 */
async function cleanupTempPaths(paths) {
  for (const itemPath of paths) {
    try {
      if (!fs.existsSync(itemPath)) continue;
      await removePathSafe(itemPath, {
        label: itemPath,
        onOutput: (message) => console.warn(`[SnowLumaUpdater] ${message}`),
      });
    } catch (error) {
      console.warn(`[SnowLumaUpdater] 清理临时文件失败 (${itemPath}): ${error.message}`);
    }
  }
}

/**
 * 解析下载地址的镜像列表。
 * @param {string} originUrl 原始下载地址
 * @param {Object} helpers 更新工具函数
 * @returns {Promise<string[]>} 下载地址列表
 */
async function resolveDownloadUrls(originUrl, helpers) {
  if (typeof helpers.getMirroredUrls !== 'function') {
    return [originUrl];
  }

  const urls = await helpers.getMirroredUrls(originUrl);
  return Array.isArray(urls) && urls.length > 0 ? urls : [originUrl];
}

module.exports = { getReleases, update };
