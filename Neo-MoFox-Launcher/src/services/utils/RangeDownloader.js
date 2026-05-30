/**
 * RangeDownloader - 基于 HTTP Range 的分片并发下载工具
 * 不依赖外部下载器，使用 Node.js 内置 http/https/fs 模块完成大文件并发下载。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DEFAULT_USER_AGENT = 'Neo-MoFox-Launcher';
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_MIN_RANGE_SIZE = 32 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_PROGRESS_INTERVAL_MS = 200;
const MIN_PROGRESS_PERCENT_DELTA = 1;

/**
 * 解析正整数配置值。
 * @param {unknown} value - 输入值。
 * @param {number} fallback - 默认值。
 * @returns {number} 解析后的正整数。
 */
function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 创建带节流的下载进度回调，避免高频 data chunk 事件淹没 IPC 与渲染进程。
 * @param {(downloaded: number, total: number) => void} [onProgress] - 原始进度回调。
 * @param {number} intervalMs - 最小回调间隔毫秒数。
 * @returns {(downloaded: number, total: number, force?: boolean) => void} 节流后的进度回调。
 */
function createProgressReporter(onProgress, intervalMs) {
  if (typeof onProgress !== 'function') {
    return () => {};
  }

  const safeInterval = Math.max(0, Number(intervalMs) || 0);
  let lastEmitAt = 0;
  let lastDownloaded = -1;
  let lastPercent = -1;

  return (downloaded, total, force = false) => {
    const now = Date.now();
    const completed = total > 0 && downloaded >= total;
    const percent = total > 0 ? Math.floor((downloaded / total) * 100) : -1;
    const percentChanged = percent < 0 || lastPercent < 0 || percent - lastPercent >= MIN_PROGRESS_PERCENT_DELTA;
    if (!force && !completed && now - lastEmitAt < safeInterval && !percentChanged) {
      return;
    }
    if (!force && downloaded === lastDownloaded) {
      return;
    }

    lastEmitAt = now;
    lastDownloaded = downloaded;
    lastPercent = percent;
    onProgress(downloaded, total);
  };
}

/**
 * 判断响应是否为重定向。
 * @param {number | undefined} statusCode - HTTP 状态码。
 * @returns {boolean} 是否为重定向状态。
 */
function isRedirect(statusCode) {
  return statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308;
}

/**
 * 解析重定向地址。
 * @param {string} reqUrl - 当前请求地址。
 * @param {string | undefined} location - Location 响应头。
 * @returns {string} 绝对重定向地址。
 */
function resolveRedirectUrl(reqUrl, location) {
  if (!location) {
    throw new Error('重定向响应缺少 Location 头');
  }
  return new URL(location, reqUrl).toString();
}

/**
 * 执行 HTTP/HTTPS 请求。
 * @param {string} reqUrl - 请求地址。
 * @param {Object} options - 请求选项。
 * @param {string} options.method - HTTP 方法。
 * @param {Object<string, string>} options.headers - 请求头。
 * @returns {Promise<import('http').IncomingMessage>} 响应对象。
 */
function request(reqUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const client = reqUrl.startsWith('https') ? https : http;
    const req = client.request(reqUrl, {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, resolve);
    req.on('error', reject);
    req.end();
  });
}

/**
 * 获取最终下载地址与文件元信息。
 * @param {string} url - 下载地址。
 * @param {Object} options - 下载选项。
 * @param {number} options.maxRedirects - 最大重定向次数。
 * @param {string} options.userAgent - User-Agent。
 * @returns {Promise<{url: string, total: number, acceptRanges: boolean}>} 文件元信息。
 */
async function getDownloadMeta(url, options) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
    const res = await request(currentUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': options.userAgent },
    });

    if (isRedirect(res.statusCode)) {
      currentUrl = resolveRedirectUrl(currentUrl, res.headers.location);
      res.resume();
      continue;
    }

    if (res.statusCode !== 200) {
      res.resume();
      throw new Error(`获取文件信息失败 HTTP ${res.statusCode}`);
    }

    const total = Number.parseInt(String(res.headers['content-length'] || '0'), 10);
    const acceptRanges = String(res.headers['accept-ranges'] || '').toLowerCase().includes('bytes');
    res.resume();
    return { url: currentUrl, total: Number.isFinite(total) ? total : 0, acceptRanges };
  }

  throw new Error('重定向次数过多');
}

/**
 * 单线程流式下载文件。
 * @param {string} url - 下载地址。
 * @param {string} destPath - 目标文件路径。
 * @param {(downloaded: number, total: number) => void} [onProgress] - 进度回调。
 * @param {Object} options - 下载选项。
 * @param {number} options.maxRedirects - 最大重定向次数。
 * @param {string} options.userAgent - User-Agent。
 * @returns {Promise<void>} 下载完成 Promise。
 */
function downloadSingle(url, destPath, onProgress, options) {
  return new Promise((resolve, reject) => {
    const doDownload = (reqUrl, redirectCount = 0) => {
      if (redirectCount > options.maxRedirects) return reject(new Error('重定向次数过多'));
      const client = reqUrl.startsWith('https') ? https : http;
      const req = client.get(reqUrl, { headers: { 'User-Agent': options.userAgent } }, (res) => {
        if (isRedirect(res.statusCode)) {
          res.resume();
          return doDownload(resolveRedirectUrl(reqUrl, res.headers.location), redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`下载失败 HTTP ${res.statusCode}`));
        }

        const total = Number.parseInt(String(res.headers['content-length'] || '0'), 10) || 0;
        let downloaded = 0;
        const file = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (onProgress) onProgress(downloaded, total);
        });
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch (_) {}
          reject(err);
        });
      });
      req.on('error', reject);
    };

    doDownload(url);
  });
}

/**
 * 下载指定字节范围到分片文件。
 * @param {string} url - 最终下载地址。
 * @param {Object} part - 分片信息。
 * @param {number} part.index - 分片序号。
 * @param {number} part.start - 起始字节。
 * @param {number} part.end - 结束字节。
 * @param {string} part.path - 分片路径。
 * @param {Object} state - 下载状态。
 * @param {(downloaded: number, total: number) => void} [state.onProgress] - 进度回调。
 * @param {number} state.total - 总大小。
 * @param {number} state.maxRedirects - 最大重定向次数。
 * @param {string} state.userAgent - User-Agent。
 * @returns {Promise<void>} 分片下载完成 Promise。
 */
function downloadPart(url, part, state) {
  return new Promise((resolve, reject) => {
    const doDownload = (reqUrl, redirectCount = 0) => {
      if (redirectCount > state.maxRedirects) return reject(new Error('重定向次数过多'));
      const client = reqUrl.startsWith('https') ? https : http;
      const req = client.get(reqUrl, {
        headers: {
          'User-Agent': state.userAgent,
          Range: `bytes=${part.start}-${part.end}`,
        },
      }, (res) => {
        if (isRedirect(res.statusCode)) {
          res.resume();
          return doDownload(resolveRedirectUrl(reqUrl, res.headers.location), redirectCount + 1);
        }
        if (res.statusCode !== 206) {
          res.resume();
          return reject(new Error(`分片 ${part.index} 下载失败 HTTP ${res.statusCode}`));
        }

        let partDownloaded = 0;
        const file = fs.createWriteStream(part.path);
        res.on('data', (chunk) => {
          partDownloaded += chunk.length;
          state.downloadedBytes += chunk.length;
          if (state.onProgress) state.onProgress(state.downloadedBytes, state.total);
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            const expectedSize = part.end - part.start + 1;
            if (partDownloaded !== expectedSize) {
              return reject(new Error(`分片 ${part.index} 大小异常: ${partDownloaded}/${expectedSize}`));
            }
            resolve();
          });
        });
        file.on('error', reject);
      });
      req.on('error', reject);
    };

    doDownload(url);
  });
}

/**
 * 合并分片文件。
 * @param {Array<{path: string}>} parts - 分片列表。
 * @param {string} destPath - 目标文件路径。
 * @returns {Promise<void>} 合并完成 Promise。
 */
async function mergeParts(parts, destPath) {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const output = fs.createWriteStream(destPath);

  for (const part of parts) {
    await new Promise((resolve, reject) => {
      const input = fs.createReadStream(part.path);
      input.on('error', reject);
      output.on('error', reject);
      input.on('end', resolve);
      input.pipe(output, { end: false });
    });
  }

  await new Promise((resolve, reject) => {
    output.end(resolve);
    output.on('error', reject);
  });
}

/**
 * 删除分片目录。
 * @param {string} partsDir - 分片目录。
 */
function cleanupParts(partsDir) {
  try {
    if (fs.existsSync(partsDir)) {
      fs.rmSync(partsDir, { recursive: true, force: true });
    }
  } catch (_) {}
}

/**
 * 基于 HTTP Range 分片并发下载文件，服务端不支持 Range 时自动回退单线程。
 * @param {string} url - 下载地址。
 * @param {string} destPath - 目标文件路径。
 * @param {(downloaded: number, total: number) => void} [onProgress] - 进度回调。
 * @param {Object} [options] - 下载选项。
 * @param {number} [options.concurrency] - 并发分片数。
 * @param {number} [options.minRangeSize] - 启用分片的最小文件大小。
 * @param {number} [options.maxRedirects] - 最大重定向次数。
 * @param {string} [options.userAgent] - User-Agent。
 * @param {number} [options.progressIntervalMs] - 进度回调最小间隔毫秒数。
 * @returns {Promise<void>} 下载完成 Promise。
 */
async function downloadFile(url, destPath, onProgress, options = {}) {
  const normalizedOptions = {
    concurrency: parsePositiveInteger(options.concurrency || process.env.NEO_MOFOX_DOWNLOAD_THREADS, DEFAULT_CONCURRENCY),
    minRangeSize: parsePositiveInteger(options.minRangeSize, DEFAULT_MIN_RANGE_SIZE),
    maxRedirects: parsePositiveInteger(options.maxRedirects, DEFAULT_MAX_REDIRECTS),
    userAgent: options.userAgent || DEFAULT_USER_AGENT,
    progressIntervalMs: parsePositiveInteger(
      options.progressIntervalMs || process.env.NEO_MOFOX_DOWNLOAD_PROGRESS_INTERVAL_MS,
      DEFAULT_PROGRESS_INTERVAL_MS
    ),
  };
  const reportProgress = createProgressReporter(onProgress, normalizedOptions.progressIntervalMs);

  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

  let meta;
  try {
    meta = await getDownloadMeta(url, normalizedOptions);
  } catch (_) {
    await downloadSingle(url, destPath, reportProgress, normalizedOptions);
    return;
  }

  if (!meta.acceptRanges || meta.total < normalizedOptions.minRangeSize || normalizedOptions.concurrency <= 1) {
    await downloadSingle(meta.url, destPath, reportProgress, normalizedOptions);
    return;
  }

  const partCount = Math.min(normalizedOptions.concurrency, Math.ceil(meta.total / normalizedOptions.minRangeSize));
  const partSize = Math.ceil(meta.total / partCount);
  const partsDir = `${destPath}.parts-${Date.now()}`;
  await fs.promises.mkdir(partsDir, { recursive: true });

  const parts = [];
  for (let index = 0; index < partCount; index += 1) {
    const start = index * partSize;
    const end = Math.min(meta.total - 1, start + partSize - 1);
    parts.push({ index, start, end, path: path.join(partsDir, `${index}.part`) });
  }

  const state = {
    total: meta.total,
    downloadedBytes: 0,
    onProgress: reportProgress,
    maxRedirects: normalizedOptions.maxRedirects,
    userAgent: normalizedOptions.userAgent,
  };

  try {
    await Promise.all(parts.map((part) => downloadPart(meta.url, part, state)));
    try { fs.unlinkSync(destPath); } catch (_) {}
    await mergeParts(parts, destPath);
    reportProgress(meta.total, meta.total, true);
  } catch (error) {
    try { fs.unlinkSync(destPath); } catch (_) {}
    throw error;
  } finally {
    cleanupParts(partsDir);
  }
}

module.exports = {
  downloadFile,
};
