/**
 * NapCat 平台元数据与系统可用性声明。
 * 当前自动安装仅支持 Windows x64，后续平台扩展在此独立维护。
 */

'use strict';

const metadata = {
  id: 'napcat',
  name: 'NapCat',
  displayName: 'NapCat',
  description: '基于 NapCatQQ 的 OneBot 11 平台接入。',
  directoryName: 'napcat',
  adapterPluginName: 'napcat_adapter',
  supportedPlatforms: ['win32'],
  supportedArch: ['x64'],
  systemRequirement: {
    label: 'Windows x64',
    platforms: ['win32'],
    arch: ['x64'],
  },
};

/**
 * 判断当前系统是否可安装 NapCat 平台。
 * @param {Object} systemInfo 系统环境信息
 * @returns {{available: boolean, reason: string|null}} 可用性结果
 */
function isAvailable(systemInfo) {
  const platform = systemInfo?.platform || process.platform;
  const arch = systemInfo?.arch || process.arch;

  if (!metadata.supportedPlatforms.includes(platform)) {
    return {
      available: false,
      reason: `NapCat 自动安装当前仅支持 Windows x64，当前系统为 ${platform} ${arch}`,
    };
  }

  if (!metadata.supportedArch.includes(arch)) {
    return {
      available: false,
      reason: `NapCat 自动安装当前仅支持 Windows x64，当前架构为 ${arch}`,
    };
  }

  return { available: true, reason: null };
}

module.exports = { metadata, isAvailable };
