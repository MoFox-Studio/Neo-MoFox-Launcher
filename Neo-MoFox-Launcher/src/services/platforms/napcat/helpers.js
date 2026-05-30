/**
 * NapCat 平台工具函数。
 * 负责 NapCat 专属 Release 数据读取与平台内复用逻辑。
 */

'use strict';

/**
 * 获取 NapCat 最新 Release 信息。
 * @param {Object} params 查询参数
 * @param {Object} params.context 执行上下文
 * @param {Object} params.helpers 平台通用工具函数
 * @returns {Promise<Object>} GitHub Release 对象
 */
async function fetchLatestNapCatRelease({ context, helpers }) {
  const apiUrls = await helpers.mirrorService.getNapcatLatestUrls();

  let lastError = null;
  for (const apiUrl of apiUrls) {
    try {
      if (context.emitOutput) {
        context.emitOutput(`[napcat] 正在尝试访问: ${apiUrl}`);
      }
      const data = await helpers.httpsGet(apiUrl, {
        'User-Agent': 'Neo-MoFox-Launcher',
        'Accept': 'application/vnd.github.v3+json',
      });
      const release = JSON.parse(data);
      if (!release.assets) throw new Error('Release 数据无效');
      if (context.emitOutput) {
        context.emitOutput('[napcat] 成功获取 Release 信息');
      }
      return release;
    } catch (error) {
      lastError = error;
      if (context.emitOutput) {
        context.emitOutput(`[napcat] 访问失败: ${error.message}`);
      }
    }
  }

  throw new Error(`获取 NapCat Release 信息失败: ${lastError?.message}`);
}

module.exports = { fetchLatestNapCatRelease };
