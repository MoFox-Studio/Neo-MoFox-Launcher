/**
 * SnowLuma 平台元数据与系统可用性声明。
 * SnowLuma v1.9.2 提供 Windows x64、Linux x64 与 Linux arm64 完整运行包。
 */

'use strict';

const metadata = {
  id: 'snowluma',
  name: 'SnowLuma',
  displayName: 'SnowLuma',
  description: '基于 SnowLuma 的 OneBot 11 协议接入，支持 WebUI 与多账号会话管理。',
  directoryName: 'snowluma',
  adapterPluginName: 'napcat_adapter',
  supportedPlatforms: ['win32', 'linux'],
  supportedArch: ['x64', 'arm64'],
  systemRequirement: {
    label: 'Windows x64 / Linux x64 / Linux arm64',
    platforms: ['win32', 'linux'],
    arch: ['x64', 'arm64'],
  },
};

/**
 * 判断当前系统是否可安装 SnowLuma 平台。
 * @param {Object} systemInfo 系统环境信息
 * @returns {{available: boolean, reason: string|null}} 可用性结果
 */
function isAvailable(systemInfo) {
  const platform = systemInfo?.platform || process.platform;
  const arch = systemInfo?.arch || process.arch;

  if (!metadata.supportedPlatforms.includes(platform)) {
    return {
      available: false,
      reason: `SnowLuma 自动安装当前仅支持 Windows / Linux，当前系统为 ${platform} ${arch}`,
    };
  }

  if (platform === 'win32' && arch !== 'x64') {
    return {
      available: false,
      reason: `SnowLuma Windows 自动安装当前仅支持 x64，当前架构为 ${arch}`,
    };
  }

  if (platform === 'linux' && !['x64', 'arm64'].includes(arch)) {
    return {
      available: false,
      reason: `SnowLuma Linux 自动安装当前仅支持 x64 / arm64，当前架构为 ${arch}`,
    };
  }

  return { available: true, reason: null };
}

module.exports = { metadata, isAvailable };
