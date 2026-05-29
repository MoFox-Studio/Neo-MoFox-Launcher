/**
 * InstanceIdService - 统一实例 ID 生成工具
 * 集中生成经过冲突检查的实例 ID，并在重复时追加数字后缀。
 */

const { storageService } = require('./StorageService');

/**
 * 生成经过冲突检查的实例 ID。
 *
 * 规则：
 * - 基础 ID 固定为 bot-{qqNumber}。
 * - 如果基础 ID 未被占用，直接返回基础 ID。
 * - 如果基础 ID 已被占用，依次尝试 bot-{qqNumber}-2、bot-{qqNumber}-3，直到可用。
 *
 * @param {string | number} qqNumber - Bot QQ 号。
 * @returns {string} 可用于新实例的唯一实例 ID。
 */
function generateInstanceId(qqNumber) {
  const normalizedQqNumber = String(qqNumber || '').trim();
  if (!normalizedQqNumber) {
    throw new Error('生成实例 ID 失败: QQ 号不能为空');
  }

  const baseId = `bot-${normalizedQqNumber}`;
  const existingIds = new Set(storageService.getInstances().map(instance => instance.id));

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }

  return candidate;
}

module.exports = { generateInstanceId };
