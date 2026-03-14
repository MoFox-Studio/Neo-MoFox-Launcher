// ═══ 自动更新检查模块 ═══

import { state } from './instances.js';

/**
 * 检查所有实例的更新状态
 * @returns {Promise<Array>} 返回有更新的实例列表
 */
export async function checkAllInstancesUpdates() {
  const instancesWithUpdates = [];
  
  // 只检查已完成安装的实例
  const completeInstances = state.instances.filter(
    instance => instance.installCompleted !== false
  );
  
  if (completeInstances.length === 0) {
    return instancesWithUpdates;
  }
  
  // 并发检查所有实例的更新
  const checkPromises = completeInstances.map(async (instance) => {
    try {
      const result = await window.mofoxAPI.versionCheckMofoxUpdate(instance.id);
      
      if (result.hasUpdate && result.behindCount > 0) {
        return {
          id: instance.id,
          name: instance.name,
          behindCount: result.behindCount,
          currentCommit: result.currentCommit || 'unknown',
          latestCommit: result.latestCommit || 'unknown',
        };
      }
      return null;
    } catch (error) {
      console.warn(`检查实例 ${instance.name} 更新失败:`, error);
      return null;
    }
  });
  
  const results = await Promise.all(checkPromises);
  
  // 过滤出有更新的实例
  results.forEach(result => {
    if (result) {
      instancesWithUpdates.push(result);
    }
  });
  
  return instancesWithUpdates;
}

/**
 * 显示更新检查结果的 Toast 通知
 * @param {Array} instancesWithUpdates - 有更新的实例列表
 */
export function showUpdateNotifications(instancesWithUpdates) {
  if (instancesWithUpdates.length === 0) {
    // 静默处理，不显示"无更新"通知
    console.log('✓ 所有实例均为最新版本');
    return;
  }
  
  if (instancesWithUpdates.length === 1) {
    // 单个实例有更新
    const instance = instancesWithUpdates[0];
    const message = `${instance.name} 有 ${instance.behindCount} 个新提交可更新`;
    
    window.showInfo(message, 8000, {
      actionText: '前往更新',
      onAction: () => {
        navigateToVersionManager(instance.id);
      }
    });
  } else {
    // 多个实例有更新
    const totalUpdates = instancesWithUpdates.reduce((sum, inst) => sum + inst.behindCount, 0);
    const message = `${instancesWithUpdates.length} 个实例共有 ${totalUpdates} 个更新可用`;
    
    window.showInfo(message, 10000, {
      actionText: '查看详情',
      onAction: () => {
        showUpdateDetailsModal(instancesWithUpdates);
      }
    });
  }
}

/**
 * 导航到版本管理页面
 * @param {string} instanceId - 实例 ID
 */
function navigateToVersionManager(instanceId) {
  window.location.href = `../version-view/index.html?instanceId=${encodeURIComponent(instanceId)}`;
}

/**
 * 显示更新详情模态框
 * @param {Array} instancesWithUpdates - 有更新的实例列表
 */
function showUpdateDetailsModal(instancesWithUpdates) {
  const modalHTML = `
    <div class="dialog-container" id="update-details-modal">
      <div class="dialog-backdrop"></div>
      <div class="dialog-card" style="max-width: 600px;">
        <div class="dialog-header">
          <h2 class="dialog-title">可用更新</h2>
        </div>
        <div class="dialog-content">
          <div class="update-list">
            ${instancesWithUpdates.map(inst => `
              <div class="update-item" data-instance-id="${inst.id}">
                <div class="update-item-content">
                  <div class="update-item-name">${inst.name}</div>
                  <div class="update-item-info">
                    <span class="material-symbols-rounded">update</span>
                    ${inst.behindCount} 个新提交
                  </div>
                </div>
                <span class="material-symbols-rounded update-item-arrow">chevron_right</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-text" id="close-update-modal">稍后</button>
        </div>
      </div>
    </div>
  `;
  
  // 移除已存在的模态框
  const existingModal = document.getElementById('update-details-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 添加到页面
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  const modal = document.getElementById('update-details-modal');
  
  // 点击实例项导航到版本管理页面
  modal.querySelectorAll('.update-item').forEach(item => {
    item.addEventListener('click', () => {
      const instanceId = item.dataset.instanceId;
      navigateToVersionManager(instanceId);
    });
  });
  
  // 关闭按钮
  const closeBtn = document.getElementById('close-update-modal');
  
  const closeModal = () => {
    modal.classList.add('hidden');
    setTimeout(() => modal.remove(), 300);
  };
  
  closeBtn.addEventListener('click', closeModal);
  
  // 点击背景关闭
  const backdrop = modal.querySelector('.dialog-backdrop');
  backdrop.addEventListener('click', closeModal);
}

/**
 * 在主页面初始化时执行自动更新检查
 */
export async function performAutoUpdateCheck() {
  try {
    console.log('🔍 开始检查实例更新...');
    
    const instancesWithUpdates = await checkAllInstancesUpdates();
    
    if (instancesWithUpdates.length > 0) {
      console.log(`✓ 发现 ${instancesWithUpdates.length} 个实例有更新`);
      showUpdateNotifications(instancesWithUpdates);
    } else {
      console.log('✓ 所有实例均为最新版本');
    }
  } catch (error) {
    console.error('自动更新检查失败:', error);
    // 静默失败，不打扰用户
  }
}
