/**
 * NapCat 平台更新器。
 * 负责平台版本列表读取、版本覆盖安装和配置备份恢复。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { platformHelper } = require('../../utils/PlatformHelper');
const { getRootPath } = require('./installer');
const { getConfigPath } = require('./config');

/**
 * 获取 NapCat 远程版本列表。
 * @param {Object} helpers 更新工具函数
 * @param {number} limit 返回数量
 * @returns {Promise<Array<Object>>} 版本列表
 */
async function getReleases(helpers, limit = 10) {
  const apiUrls = await helpers.mirrorService.getNapcatReleasesUrls();
  let lastError = null;

  for (const apiUrl of apiUrls) {
    try {
      const separator = apiUrl.includes('?') ? '&' : '?';
      const data = await helpers.httpsGet(`${apiUrl}${separator}per_page=${limit}`, {
        'User-Agent': 'Neo-MoFox-Launcher',
        'Accept': 'application/vnd.github.v3+json',
      });
      const releases = JSON.parse(data);
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
      }));
    } catch (error) {
      lastError = error;
      console.error(`[NapCatUpdater] 获取 Releases 失败 (${apiUrl}):`, error.message);
    }
  }

  throw new Error(`获取 NapCat 版本列表失败: ${lastError?.message}`);
}

/**
 * 更新 NapCat 平台。
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

  emitProgress('update-platform', 0, '获取 NapCat 版本信息...');

  const releases = await getReleases(helpers, 10);
  const targetRelease = targetVersion === 'latest'
    ? (releases.find((release) => !release.prerelease) || releases[0])
    : releases.find((release) => release.version === targetVersion);

  if (!targetRelease) {
    throw new Error(`找不到版本: ${targetVersion}`);
  }

  const assetName = platformHelper.napcatAssetName;
  const asset = targetRelease.assets.find((item) => item.name === assetName);
  if (!asset) {
    throw new Error(`找不到适合当前系统的 NapCat Node 包: ${assetName}`);
  }

  emitProgress('update-platform', 10, `准备下载 ${targetRelease.version}...`);

  const tempDir = path.join(os.tmpdir(), 'napcat-update');
  fs.mkdirSync(tempDir, { recursive: true });
  const zipPath = path.join(tempDir, asset.name);

  emitProgress('update-platform', 20, '下载中...');
  await helpers.downloadFile(asset.downloadUrl, zipPath, (downloaded, total) => {
    const percent = total > 0 ? Math.floor(20 + (downloaded / total) * 40) : 20;
    const downloadedMB = Math.floor(downloaded / 1024 / 1024);
    const totalMB = total > 0 ? Math.floor(total / 1024 / 1024) : '?';
    emitProgress('update-platform', percent, `下载中: ${downloadedMB}MB / ${totalMB}MB`);
  });

  emitProgress('update-platform', 60, '备份配置...');
  const configBackupDir = path.join(os.tmpdir(), `napcat-config-backup-${Date.now()}`);
  const oldConfigDir = getConfigPath(platformDir);
  let hasConfigBackup = false;
  if (fs.existsSync(oldConfigDir)) {
    fs.cpSync(oldConfigDir, configBackupDir, { recursive: true });
    hasConfigBackup = true;
  }

  emitProgress('update-platform', 70, '安装新版本...');
  if (fs.existsSync(platformDir)) {
    fs.rmSync(platformDir, { recursive: true, force: true });
  }
  fs.mkdirSync(platformDir, { recursive: true });
  await helpers.extractZip(zipPath, platformDir);

  if (!getRootPath(platformDir)) {
    throw new Error('NapCat Windows Node 包结构无效，缺少 node.exe、index.js、napcat.bat 或 napcat 目录');
  }

  if (hasConfigBackup) {
    emitProgress('update-platform', 90, '恢复配置...');
    const newConfigDir = getConfigPath(platformDir);
    fs.mkdirSync(newConfigDir, { recursive: true });
    fs.cpSync(configBackupDir, newConfigDir, { recursive: true });
  }

  try {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    if (fs.existsSync(configBackupDir)) fs.rmSync(configBackupDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`[NapCatUpdater] 清理临时文件失败: ${error.message}`);
  }

  emitProgress('update-platform', 100, `更新到 ${targetRelease.version} 完成`);
  return { success: true, version: targetRelease.version };
}

module.exports = { getReleases, update };
