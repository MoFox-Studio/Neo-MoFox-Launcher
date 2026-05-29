/**
 * UpdateChecker.js - 启动器自动更新检查服务
 * 启动时比较本地构建版本号与远程最新版本号，若有更新则通知用户。
 * 版本号为空时（包管理器安装）跳过检查。
 */

const https = require('https');
const http = require('http');
const { BUILD_VERSION } = require('../../version');
const { mirrorService } = require('../utils/MirrorService');

// GitHub Releases API 地址（通过镜像服务动态获取）

class UpdateChecker {
  constructor() {
    this._latestVersion = null;
    this._releaseUrl = null;
    this._releaseNotes = null;
  }

  /**
   * 获取本地构建版本号
   * @returns {string} 本地版本号，空字符串表示包管理器安装
   */
  getLocalVersion() {
    return BUILD_VERSION;
  }

  /**
   * 判断是否应该检查更新
   * 版本号为空时（AUR/PPA 等包管理器安装）不检查
   * @returns {boolean}
   */
  shouldCheck() {
    return BUILD_VERSION !== '';
  }

  /**
   * 发起 HTTP GET 请求（支持重定向）
   * @param {string} url - 请求地址
   * @returns {Promise<string>} 响应体
   */
  _httpGet(url) {
    return new Promise((resolve, reject) => {
      const doGet = (reqUrl, redirectCount = 0) => {
        if (redirectCount > 5) return reject(new Error('重定向次数过多'));
        const client = reqUrl.startsWith('https') ? https : http;
        const urlObj = new URL(reqUrl);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          headers: {
            'User-Agent': 'Neo-MoFox-Launcher-UpdateChecker',
            'Accept': 'application/vnd.github.v3+json',
          },
        };
        client.get(options, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return doGet(res.headers.location, redirectCount + 1);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}: ${reqUrl}`));
          }
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve(data));
        }).on('error', reject);
      };
      doGet(url);
    });
  }

  /**
   * 从多个镜像源尝试获取最新 Release 信息
   * @returns {Promise<{version: string, url: string, notes: string} | null>}
   */
  async _fetchLatestRelease() {
    const releaseApiUrls = await mirrorService.getLauncherReleasesUrls();
    for (const apiUrl of releaseApiUrls) {
      try {
        const raw = await this._httpGet(apiUrl);
        const releases = JSON.parse(raw);
        // 返回的是数组，取第一个（最新的）
        const release = Array.isArray(releases) ? releases[0] : releases;
        if (!release) continue;
        // tag_name 格式通常为 "nightly-20260526"
        const version = release.tag_name || '';
        const url = release.html_url || '';
        const notes = release.body || '';
        return { version, url, notes };
      } catch (err) {
        console.warn(`[UpdateChecker] 从 ${apiUrl} 获取失败: ${err.message}`);
        continue;
      }
    }
    return null;
  }

  /**
   * 比较版本号，判断远程版本是否比本地新
   * 版本号格式: "nightly-YYYYMMDD" 或 "YYYYMMDD+SHORTHASH"
   * @param {string} local - 本地版本号
   * @param {string} remote - 远程版本号（tag_name）
   * @returns {boolean} 远程版本是否更新
   */
  _isNewer(local, remote) {
    // 提取日期部分进行比较
    const localDate = this._extractDate(local);
    const remoteDate = this._extractDate(remote);

    if (!localDate || !remoteDate) {
      // 无法解析时做字符串比较
      return remote !== local;
    }

    return remoteDate > localDate;
  }

  /**
   * 从版本号字符串中提取日期数字
   * 支持格式: "nightly-20260526", "20260526+abc123", "20260526"
   * @param {string} version
   * @returns {number | null}
   */
  _extractDate(version) {
    // 匹配 8 位连续数字（YYYYMMDD）
    const match = version.match(/(\d{8})/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * 执行更新检查
   * @returns {Promise<{hasUpdate: boolean, localVersion: string, remoteVersion: string, releaseUrl: string, releaseNotes: string} | null>}
   *   返回 null 表示不需要检查或检查失败
   */
  async check() {
    if (!this.shouldCheck()) {
      console.log('[UpdateChecker] 版本号为空，跳过更新检查（包管理器安装）');
      return null;
    }

    console.log(`[UpdateChecker] 当前版本: ${BUILD_VERSION}`);

    const release = await this._fetchLatestRelease();
    if (!release) {
      console.warn('[UpdateChecker] 无法获取远程版本信息');
      return null;
    }

    this._latestVersion = release.version;
    this._releaseUrl = release.url;
    this._releaseNotes = release.notes;

    console.log(`[UpdateChecker] 远程最新版本: ${release.version}`);

    const hasUpdate = this._isNewer(BUILD_VERSION, release.version);

    if (hasUpdate) {
      console.log('[UpdateChecker] 发现新版本可用！');
    } else {
      console.log('[UpdateChecker] 当前已是最新版本');
    }

    return {
      hasUpdate,
      localVersion: BUILD_VERSION,
      remoteVersion: release.version,
      releaseUrl: release.url,
      releaseNotes: release.notes,
    };
  }
}

const updateChecker = new UpdateChecker();

module.exports = { updateChecker, UpdateChecker };
