import { el } from './elements.js';
import { setCurrentInstance, saveIcon } from './icon-manager.js';

// ─── Instance State ───────────────────────────────────────────────────

export const state = {
  instances: [],
  currentEditingInstance: null,
  /** 实时运行状态映射：instanceId -> status */
  runningStatuses: {},
};

// ─── Status Helpers ───────────────────────────────────────────────────

const STATUS_TEXT = {
  stopped:    '未运行',
  starting:   '启动中...',
  running:    '运行中',
  stopping:   '停止中...',
  restarting: '重启中...',
  error:      '错误',
  disabled:   '已禁用',
  incomplete: '安装未完成',
};

function isActiveStatus(status) {
  return status === 'running' || status === 'starting' || status === 'restarting' || status === 'stopping';
}

/** 更新「活跃实例」统计数字 */
function refreshActiveCount() {
  const count = Object.values(state.runningStatuses).filter(s => isActiveStatus(s)).length;
  const activeEl = document.getElementById('active-instances');
  if (activeEl) activeEl.textContent = count.toString();
}

// ─── Load Instances ───────────────────────────────────────────────────

export async function loadInstances() {
  try {
    // 从后端 API 加载实例列表
    const instances = await window.mofoxAPI.getInstances();
    
    // 批量获取所有实例的实时运行状态
    try {
      state.runningStatuses = await window.mofoxAPI.getAllInstanceStatuses() || {};
    } catch (_) {
      state.runningStatuses = {};
    }
    
    // 转换字段名以适配前端显示（从 extra 对象中读取）
    // 同时获取图标的完整路径
    state.instances = await Promise.all(instances.map(async instance => {
      let iconFullPath = null;
      if (instance.extra?.iconPath) {
        try {
          iconFullPath = await window.mofoxAPI.getIconFullPath(instance.extra.iconPath);
        } catch (err) {
          console.warn(`获取图标路径失败 (${instance.id}):`, err);
        }
      }
      
      return {
        id: instance.id,
        name: instance.extra?.displayName || instance.qqNumber || 'Unknown',
        path: instance.neomofoxDir,
        description: instance.extra?.description || '', // 用户编辑的描述
        isLike: instance.extra?.isLike || false, // 收藏状态
        autoInfo: `QQ: ${instance.qqNumber} | 端口: ${instance.wsPort}`, // 自动信息
        status: state.runningStatuses[instance.id] || (instance.enabled ? 'stopped' : 'disabled'),
        branch: instance.channel,
        version: instance.neomofoxVersion || 'unknown',
        // 图标路径
        iconFullPath: iconFullPath, // 完整路径
        // 保留原始数据
        extra: instance.extra, // 保留 extra 对象用于编辑
        qqNumber: instance.qqNumber,
        wsPort: instance.wsPort,
        napcatDir: instance.napcatDir,
        installCompleted: instance.installCompleted,
        createdAt: instance.createdAt,
        lastStartedAt: instance.lastStartedAt,
      };
    }));
    
    renderInstances();
    refreshActiveCount();
  } catch (error) {
    console.error('加载实例失败:', error);
    state.instances = [];
    renderInstances();
  }
}

// ─── Render Instances ─────────────────────────────────────────────────

export function renderInstances() {
  const grid = document.getElementById('instances-grid');
  const favoriteGrid = document.getElementById('favorite-instances-grid');
  const favoriteSection = document.getElementById('favorite-instances-section');
  const addCard = document.getElementById('btn-add-instance');
  
  // 清空两个网格（保留添加按钮）
  const children = Array.from(grid.children);
  children.forEach(child => {
    if (child.id !== 'btn-add-instance') {
      child.remove();
    }
  });
  
  favoriteGrid.innerHTML = '';
  
  // 分离收藏和普通实例
  const favoriteInstances = state.instances.filter(i => i.isLike);
  const normalInstances = state.instances.filter(i => !i.isLike);
  
  // 更新计数
  const countBadge = document.getElementById('instance-count');
  if (countBadge) {
    countBadge.textContent = normalInstances.length.toString();
  }
  
  const favoriteCountBadge = document.getElementById('favorite-count');
  if (favoriteCountBadge) {
    favoriteCountBadge.textContent = favoriteInstances.length.toString();
  }
  
  // 显示/隐藏收藏区域
  if (favoriteSection) {
    favoriteSection.style.display = favoriteInstances.length > 0 ? 'block' : 'none';
  }
  
  refreshActiveCount();
  
  // 渲染收藏的实例
  favoriteInstances.forEach(instance => {
    const card = createInstanceCard(instance);
    favoriteGrid.appendChild(card);
  });
  
  // 渲染普通实例
  normalInstances.forEach(instance => {
    const card = createInstanceCard(instance);
    grid.appendChild(card);
  });
}

// ─── Create Instance Card ──────────────────────────────────────────────

function createInstanceCard(instance) {
  const card = document.createElement('div');
  card.className = 'instance-card';
  card.dataset.instanceId = instance.id;
  
  // 检查是否是未完成安装的实例
  const isIncomplete = instance.installCompleted === false;
  
  // 实时状态
  const liveStatus = state.runningStatuses[instance.id] || instance.status || 'stopped';
  let statusClass = liveStatus;
  if (isIncomplete) {
    statusClass = 'incomplete';
    card.classList.add('incomplete');
  }
  
  // 根据安装状态显示不同内容
  if (isIncomplete) {
    card.innerHTML = `
      <div class="instance-card-header">
        <div class="instance-icon incomplete">
          <span class="material-symbols-rounded">construction</span>
        </div>
        <div class="instance-status-dot ${statusClass}" title="安装未完成"></div>
      </div>
      
      <div class="instance-card-body">
        <div class="instance-name" title="${instance.name}">${instance.name}</div>
        <div class="instance-path" title="${instance.path}">${instance.path}</div>
        <div class="instance-desc incomplete-warning">
          <span class="material-symbols-rounded">warning</span>
          安装未完成，点击继续
        </div>
      </div>
      
      <div class="instance-card-footer">
        <button class="md3-btn md3-btn-text md3-btn-sm btn-delete-incomplete">
          删除
        </button>
        <button class="md3-btn md3-btn-filled md3-btn-sm btn-continue-install">
          继续安装
        </button>
      </div>
    `;
    
    // 绑定继续安装按钮
    const btnContinue = card.querySelector('.btn-continue-install');
    btnContinue.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `../install-wizard/wizard.html?instanceId=${encodeURIComponent(instance.id)}&resume=1`;
    });
    
    // 绑定删除按钮
    const btnDelete = card.querySelector('.btn-delete-incomplete');
    btnDelete.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await window.customConfirm('确定要删除这个未完成的实例吗？已下载的文件也会被清理。', '确认删除')) {
        try {
          await window.mofoxAPI.installCleanup(instance.id);
          await loadInstances();
        } catch (err) {
          console.error('清理失败:', err);
          await window.customAlert('清理失败: ' + err.message, '错误');
        }
      }
    });
    
    // 点击卡片也可以继续安装
    card.addEventListener('click', () => {
      window.location.href = `../install-wizard/wizard.html?instanceId=${encodeURIComponent(instance.id)}&resume=1`;
    });
    
  } else {
    // 如果是出错状态，用户希望能有一个停止按钮来强制重置状态
    const isRunning = isActiveStatus(liveStatus) || liveStatus === 'error';
    const isStopped = liveStatus === 'stopped';
    const statusLabel = STATUS_TEXT[liveStatus] || liveStatus;
    
    // 运行中的卡片加上特殊 class
    if (isRunning) card.classList.add('instance-running');
    if (liveStatus === 'error') card.classList.add('instance-error');
    
    // 准备图标HTML - 优先显示自定义图标，否则显示默认图标
    let iconHTML = '';
    if (instance.iconFullPath) {
      // 使用完整路径（已通过 getIconFullPath 获取）
      iconHTML = `<img src="${instance.iconFullPath}" alt="${instance.name}" class="instance-icon-img" onerror="this.style.display='none'">`;
      console.log('使用实例图标:', instance.iconFullPath);
    } else {
      iconHTML = `<span class="material-symbols-rounded">${isRunning ? 'play_circle' : 'dns'}</span>`;
    }
    
    card.innerHTML = `
      <div class="instance-card-header">
        <div class="instance-icon ${isRunning ? 'running' : ''}">
          ${iconHTML}
        </div>
        <div class="instance-status-indicator">
          <div class="instance-status-dot ${liveStatus}"></div>
          <span class="instance-status-label">${statusLabel}</span>
        </div>
      </div>
      
      <div class="instance-card-body">
        <div class="instance-name" title="${instance.name}">${instance.name}</div>
        <div class="instance-path" title="${instance.path}">${instance.path}</div>
        <div class="instance-meta">${instance.autoInfo}</div>
        ${instance.description ? `<div class="instance-desc" title="${instance.description}">${instance.description}</div>` : ''}
      </div>
      
      <div class="instance-card-footer">
        <button class="md3-btn md3-btn-text md3-btn-sm btn-settings-instance" title="管理实例">
          <span class="material-symbols-rounded">settings</span>
          管理
        </button>
        ${isRunning ? `
          <button class="md3-btn md3-btn-danger md3-btn-sm btn-stop-instance" title="停止实例" ${(liveStatus !== 'running' && liveStatus !== 'error') ? 'disabled' : ''}>
            <span class="material-symbols-rounded">stop</span>
            停止
          </button>
          <button class="md3-btn md3-btn-tonal md3-btn-sm btn-view-instance" title="查看日志">
            <span class="material-symbols-rounded">terminal</span>
            日志
          </button>
        ` : `
          <button class="md3-btn md3-btn-tonal md3-btn-sm btn-version-instance" title="版本管理">
            <span class="material-symbols-rounded">system_update</span>
            版本
          </button>
          <button class="md3-btn md3-btn-filled md3-btn-sm btn-start-instance" title="立即启动" ${!isStopped ? 'disabled' : ''}>
            <span class="material-symbols-rounded">play_arrow</span>
            启动
          </button>
        `}
      </div>
    `;
    
    // 事件绑定 - 管理按钮 → 打开编辑对话框
    const btnSettings = card.querySelector('.btn-settings-instance');
    btnSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(instance);
    });
    
    // 事件绑定 - 版本管理按钮 → 跳转到版本管理页面
    const btnVersion = card.querySelector('.btn-version-instance');
    if (btnVersion) {
      btnVersion.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = `../version-view/index.html?instanceId=${encodeURIComponent(instance.id)}&name=${encodeURIComponent(instance.name)}`;
      });
    }

    // 事件绑定 - 启动按钮 → 在主界面直接启动，然后刷新卡片
    const btnStart = card.querySelector('.btn-start-instance');
    if (btnStart) {
      btnStart.addEventListener('click', async (e) => {
        e.stopPropagation();
        await startInstanceFromCard(instance.id);
      });
    }
    
    // 事件绑定 - 停止按钮 → 在主界面直接停止
    const btnStop = card.querySelector('.btn-stop-instance');
    if (btnStop) {
      btnStop.addEventListener('click', async (e) => {
        e.stopPropagation();
        await stopInstanceFromCard(instance.id);
      });
    }
    
    // 事件绑定 - 查看日志按钮 → 跳转到实例视图（不自动启动）
    const btnView = card.querySelector('.btn-view-instance');
    if (btnView) {
      btnView.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = `../instance-view/index.html?instanceId=${encodeURIComponent(instance.id)}&name=${encodeURIComponent(instance.name)}`;
      });
    }
    
    // 整个卡片点击：运行中 → 进入日志，停止中 → 进入实例视图
    card.addEventListener('click', () => {
      window.location.href = `../instance-view/index.html?instanceId=${encodeURIComponent(instance.id)}&name=${encodeURIComponent(instance.name)}`;
    });
  }
  
  return card;
}

// ─── 主界面直接启动/停止实例 ──────────────────────────────────────────

async function startInstanceFromCard(instanceId) {
  try {
    // 立即更新UI状态
    updateCardStatus(instanceId, 'starting');
    
    const result = await window.mofoxAPI.startInstance(instanceId);
    if (!result.success) {
      console.error('启动失败:', result.error);
      updateCardStatus(instanceId, 'error');
      await window.customAlert('启动失败: ' + result.error, '错误');
    }
    // 成功后状态会由 IPC 事件自动更新
  } catch (error) {
    console.error('启动异常:', error);
    updateCardStatus(instanceId, 'error');
    await window.customAlert('启动异常: ' + error.message, '错误');
  }
}

async function stopInstanceFromCard(instanceId) {
  try {
    updateCardStatus(instanceId, 'stopping');
    
    const result = await window.mofoxAPI.stopInstance(instanceId);
    if (!result.success) {
      console.error('停止失败:', result.error);
      await window.customAlert('停止失败: ' + result.error, '错误');
      updateCardStatus(instanceId, 'error');
    } else {
      // 成功停止时，确保UI状态更新为未运行
      updateCardStatus(instanceId, 'stopped');
    }
  } catch (error) {
    console.error('停止异常:', error);
    await window.customAlert('停止异常: ' + error.message, '错误');
    updateCardStatus(instanceId, 'error');
  }
}

// ─── 单卡片实时状态更新（无需重渲染全部） ─────────────────────────────

function updateCardStatus(instanceId, status) {
  state.runningStatuses[instanceId] = status;
  
  // 同步到 state.instances
  const inst = state.instances.find(i => i.id === instanceId);
  if (inst) inst.status = status;
  
  const card = document.querySelector(`.instance-card[data-instance-id="${instanceId}"]`);
  if (!card || card.classList.contains('incomplete')) return;
  
  // 轻量级 DOM 更新，避免重新渲染所有卡片
  updateCardDOM(card, inst, status);
  refreshActiveCount();
}

// ─── 轻量级更新单个卡片 DOM ──────────────────────────────────────────

function updateCardDOM(card, instance, status) {
  // 如果是出错状态，用户希望能有一个停止按钮来强制重置状态
  const isRunning = isActiveStatus(status) || status === 'error';
  const isStopped = status === 'stopped';
  const statusLabel = STATUS_TEXT[status] || status;
  
  // 更新卡片样式类
  card.classList.remove('instance-running', 'instance-error');
  if (isRunning) card.classList.add('instance-running');
  if (status === 'error') card.classList.add('instance-error');
  
  // 更新状态指示器
  const statusDot = card.querySelector('.instance-status-dot');
  if (statusDot) {
    statusDot.className = `instance-status-dot ${status}`;
  }
  
  const statusLabelEl = card.querySelector('.instance-status-label');
  if (statusLabelEl) {
    statusLabelEl.textContent = statusLabel;
  }
  
  // 更新图标
  const icon = card.querySelector('.instance-icon');
  const iconSymbol = card.querySelector('.instance-icon .material-symbols-rounded');
  const iconImg = card.querySelector('.instance-icon-img');
  
  if (icon) {
    // 如果有自定义图标，保留图标；否则更新默认图标
    if (!instance.iconFullPath) {
      // 清除可能存在的图标图片
      if (iconImg) iconImg.remove();
      
      // 确保有图标元素
      if (!iconSymbol) {
        const newSymbol = document.createElement('span');
        newSymbol.className = 'material-symbols-rounded';
        icon.appendChild(newSymbol);
      }
      
      const symbol = icon.querySelector('.material-symbols-rounded');
      if (symbol) {
        symbol.textContent = isRunning ? 'play_circle' : 'dns';
      }
      
      if (isRunning) {
        icon.classList.add('running');
      } else {
        icon.classList.remove('running');
      }
    }
    // 如果有自定义图标，移除默认图标并保持图片
    else if (iconSymbol && !iconImg) {
      iconSymbol.remove();
    }
  }
  
  // 更新按钮组（启动/停止按钮切换）
  const footer = card.querySelector('.instance-card-footer');
  if (footer) {
    // 重建按钮组（因为结构不同，使用innerHTML更新）
    footer.innerHTML = `
      <button class="md3-btn md3-btn-text md3-btn-sm btn-settings-instance" title="管理实例">
        <span class="material-symbols-rounded">settings</span>
        管理
      </button>
      ${isRunning ? `
        <button class="md3-btn md3-btn-danger md3-btn-sm btn-stop-instance" title="停止实例" ${(status !== 'running' && status !== 'error') ? 'disabled' : ''}>
          <span class="material-symbols-rounded">stop</span>
          停止
        </button>
        <button class="md3-btn md3-btn-tonal md3-btn-sm btn-view-instance" title="查看日志">
          <span class="material-symbols-rounded">terminal</span>
          日志
        </button>
      ` : `
        <button class="md3-btn md3-btn-tonal md3-btn-sm btn-version-instance" title="版本管理">
          <span class="material-symbols-rounded">system_update</span>
          版本
        </button>
        <button class="md3-btn md3-btn-filled md3-btn-sm btn-start-instance" title="立即启动" ${!isStopped ? 'disabled' : ''}>
          <span class="material-symbols-rounded">play_arrow</span>
          启动
        </button>
      `}
    `;
    
    // 重新绑定按钮事件
    const btnSettings = footer.querySelector('.btn-settings-instance');
    if (btnSettings) {
      btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(instance);
      });
    }
    
    const btnVersion = footer.querySelector('.btn-version-instance');
    if (btnVersion) {
      btnVersion.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = `../version-view/index.html?instanceId=${encodeURIComponent(instance.id)}&name=${encodeURIComponent(instance.name)}`;
      });
    }
    
    const btnStart = footer.querySelector('.btn-start-instance');
    if (btnStart) {
      btnStart.addEventListener('click', async (e) => {
        e.stopPropagation();
        await startInstanceFromCard(instance.id);
      });
    }
    
    const btnStop = footer.querySelector('.btn-stop-instance');
    if (btnStop) {
      btnStop.addEventListener('click', async (e) => {
        e.stopPropagation();
        await stopInstanceFromCard(instance.id);
      });
    }
    
    const btnView = footer.querySelector('.btn-view-instance');
    if (btnView) {
      btnView.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = `../instance-view/index.html?instanceId=${encodeURIComponent(instance.id)}&name=${encodeURIComponent(instance.name)}`;
      });
    }
  }
}

// ─── IPC 事件监听（实时状态推送） ─────────────────────────────────────

export function setupInstanceStatusListener() {
  window.mofoxAPI?.onInstanceStatusChange?.((data) => {
    const { instanceId, status } = data;
    const oldStatus = state.runningStatuses[instanceId];
    
    if (oldStatus !== status) {
      console.log(`[Main] 实例 ${instanceId} 状态: ${oldStatus} → ${status}`);
      updateCardStatus(instanceId, status);
    }
  });
}

function openEditModal(instance) {
  state.currentEditingInstance = instance.id;
  
  // 设置图标管理器的当前实例
  setCurrentInstance(instance.id, instance.extra?.iconPath);
  
  // 填充概览数据
  document.getElementById('overview-state').textContent = STATUS_TEXT[instance.status] || instance.status;
  document.getElementById('overview-version').textContent = instance.version;
  document.getElementById('overview-channel').textContent = instance.branch || '未知';
  document.getElementById('overview-qq').textContent = instance.qqNumber || '未绑定';
  document.getElementById('overview-post').textContent = instance.wsPort || '未知';
  
  // 填充名称和描述
  document.getElementById('edit-instance-name').value = instance.name || '';
  document.getElementById('edit-instance-desc').value = instance.description || '';
  
  // 填充收藏状态
  const likeCheckbox = document.getElementById('edit-instance-like');
  const likeLabel = document.getElementById('edit-instance-like-label');
  if (likeCheckbox && likeLabel) {
    likeCheckbox.checked = instance.isLike || false;
    likeLabel.textContent = instance.isLike ? '已收藏' : '未收藏';
    
    // 初始化卡片样式
    const toggleCard = likeCheckbox.closest('.favorite-toggle-card');
    if (toggleCard) toggleCard.classList.toggle('is-active', instance.isLike);
    
    // 添加切换事件监听
    likeCheckbox.onchange = function() {
      likeLabel.textContent = this.checked ? '已收藏' : '未收藏';
      if (toggleCard) toggleCard.classList.toggle('is-active', this.checked);
    };
  }
  
  // 设置模态框标题
  const modalTitle = document.querySelector('#edit-instance-title') || document.querySelector('#edit-modal-title');
  if (modalTitle) {
    modalTitle.textContent = '实例管理';
  }
  
  // 显示删除按钮
  const deleteBtn = document.getElementById('btn-delete-instance');
  if (deleteBtn) {
    deleteBtn.style.display = 'flex';
  }
  
  // 将 Tab 重新置为 default (实例概览)
  const sidebarTabs = document.querySelectorAll('#edit-instance-sidebar .sidebar-tab');
  if (sidebarTabs.length > 0) {
    sidebarTabs.forEach(t => t.classList.remove('active'));
    const defaultTab = document.querySelector('#edit-instance-sidebar .sidebar-tab[data-tab="overview"]');
    if (defaultTab) {
      defaultTab.classList.add('active');
    } else {
      sidebarTabs[0].classList.add('active'); // fallback
    }
  }
  
  const contentPanes = document.querySelectorAll('#edit-instance-content .tab-pane');
  if (contentPanes.length > 0) {
    contentPanes.forEach(p => p.classList.remove('active'));
    const defaultPane = document.getElementById('tab-overview');
    if (defaultPane) {
      defaultPane.classList.add('active');
    } else {
      contentPanes[0].classList.add('active');
    }
  }
  
  // 显示模态框
  document.getElementById('edit-instance-modal').classList.remove('hidden');
}

// ─── Attach Events ────────────────────────────────────────────────────

function attachInstanceCardEvents() {
  document.querySelectorAll('.btn-open-instance').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.instance-card');
      const instanceId = card.dataset.instanceId;
      openInstance(instanceId);
    });
  });
  
  document.querySelectorAll('.btn-edit-instance-card').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.instance-card');
      const instanceId = card.dataset.instanceId;
      editInstance(instanceId);
    });
  });
  
  document.querySelectorAll('.instance-card').forEach(card => {
    card.addEventListener('click', () => {
      const instanceId = card.dataset.instanceId;
      openInstance(instanceId);
    });
  });
}

// ─── Open Instance ────────────────────────────────────────────────────

export function openInstance(instanceId) {
  console.log('打开实例:', instanceId);
  // 在同一窗口中加载实例视图
  window.location.href = `instance-view/instance.html?id=${instanceId}`;
}

// ─── Edit Instance ────────────────────────────────────────────────────

export function editInstance(instanceId) {
  const instance = state.instances.find(i => i.id === instanceId);
  if (!instance) return;
  
  state.currentEditingInstance = instanceId;
  
  // 只填充名称和描述
  el.editInstanceName.value = instance.name;
  el.editInstanceDesc.value = instance.description || '';
  
  // 设置模态框标题
  el.editModalTitle.textContent = '编辑实例';
  
  // 显示删除按钮
  el.btnDeleteInstance.style.display = 'flex';
  
  el.editInstanceModal.classList.remove('hidden');
}

// ─── Create New Instance ──────────────────────────────────────────────

export function createNewInstance() {
  state.currentEditingInstance = null;
  el.editModalTitle.textContent = '新建实例';
  
  // 只清空名称和描述
  el.editInstanceName.value = '';
  el.editInstanceDesc.value = '';
  
  // 隐藏删除按钮
  el.btnDeleteInstance.style.display = 'none';
  
  el.editInstanceModal.classList.remove('hidden');
}

// ─── Save Instance ────────────────────────────────────────────────────

export async function saveInstance() {
  const name = el.editInstanceName.value.trim();
  const description = el.editInstanceDesc.value.trim();
  const isLike = document.getElementById('edit-instance-like')?.checked || false;
  
  // 验证：名称必填
  if (!name) {
    await window.customAlert('请填写实例名称', '提示');
    return;
  }
  
  try {
    if (state.currentEditingInstance) {
      // 保存图标（如果有修改）
      const iconResult = await saveIcon(state.currentEditingInstance);
      if (!iconResult.success) {
        console.error('保存图标失败:', iconResult.error);
        await window.customAlert('保存图标失败: ' + iconResult.error, '错误');
        return;
      }
      
      // 编辑现有实例 - 更新名称、描述、收藏状态和图标路径（存储在 extra 对象中）
      console.log('保存实例:', state.currentEditingInstance, { extra: { displayName: name, description, isLike } });
      
      const instance = state.instances.find(i => i.id === state.currentEditingInstance);
      const updateData = {
        extra: {
          displayName: name,
          description: description,
          isLike: isLike,
          iconPath: iconResult.iconPath, // 直接使用返回的路径（可能是 null，表示删除图标）
        },
      };
      
      await window.mofoxAPI.updateInstance(state.currentEditingInstance, updateData);
      
      console.log('实例更新成功');
      
      // 立即更新本地状态并重新渲染
      if (instance) {
        instance.name = name;
        instance.description = description;
        instance.isLike = isLike;
        
        // 无论是设置新图标还是删除图标，都要更新
        instance.extra = instance.extra || {};
        instance.extra.iconPath = iconResult.iconPath;
        
        // 更新完整路径
        if (iconResult.iconPath) {
          console.log('更新实例图标路径:', iconResult.iconPath);
          try {
            instance.iconFullPath = await window.mofoxAPI.getIconFullPath(iconResult.iconPath);
          } catch (err) {
            console.warn('获取图标完整路径失败:', err);
            instance.iconFullPath = null;
          }
        } else {
          // 图标被删除，清除完整路径
          console.log('清除实例图标路径');
          instance.iconFullPath = null;
        }
        
        // 重新渲染列表以更新分组
        renderInstances();
      }
    } else {
      // 新建实例应该通过安装向导，这里给出提示
      await window.customAlert('请通过安装向导创建新实例', '提示');
      return;
    }
    
    // 关闭模态框
    el.editInstanceModal.classList.add('hidden');
    
  } catch (error) {
    console.error('保存实例失败:', error);
    await window.customAlert('保存失败: ' + error.message, '错误');
  }
}

// ─── Delete Instance ──────────────────────────────────────────────────

export async function deleteInstance() {
  if (!state.currentEditingInstance) {
    await window.customAlert('无法删除：未选择实例', '提示');
    return;
  }
  
  console.log('准备删除实例，ID:', state.currentEditingInstance, '类型:', typeof state.currentEditingInstance);
  
  if (!await window.customConfirm('确定要删除这个实例吗？这个操作不可撤销。', '确认删除')) {
    return;
  }
  
  try {
    // 调用后端 API 删除实例
    console.log('调用后端 API 删除实例...', state.currentEditingInstance);
    await window.mofoxAPI.deleteInstance(state.currentEditingInstance);
    
    // 重新加载实例列表
    await loadInstances();
    
    // 重置当前编辑实例状态
    state.currentEditingInstance = null;
    
    // 删除成功后才关闭模态框
    el.editInstanceModal.classList.add('hidden');
    
    // 显示成功提示
    console.log('实例删除成功');
  } catch (error) {
    console.error('删除实例失败:', error);
    await window.customAlert('删除失败: ' + error.message, '错误');
    // 出错时不关闭模态框，让用户可以重试或取消
  }
}

// ─── Toggle Instance Like ─────────────────────────────────────────────

async function toggleInstanceLike(instanceId) {
  try {
    const instance = state.instances.find(i => i.id === instanceId);
    if (!instance) return;
    
    const newLikeStatus = !instance.isLike;
    
    // 获取当前实例的 extra 对象
    const currentExtra = {
      displayName: instance.name,
      description: instance.description,
      isLike: newLikeStatus,
    };
    
    // 更新后端
    await window.mofoxAPI.updateInstance(instanceId, {
      extra: currentExtra,
    });
    
    // 更新本地状态
    instance.isLike = newLikeStatus;
    
    // 重新渲染整个列表以更新分组
    renderInstances();
  } catch (error) {
    console.error('切换收藏状态失败:', error);
    await window.customAlert('操作失败: ' + error.message, '错误');
  }
}

// 更新实例卡片UI（名称、描述）- 收藏状态变化时会重新渲染整个列表
function updateInstanceCardUI(instanceId) {
  const instance = state.instances.find(i => i.id === instanceId);
  if (!instance) return;
  
  const card = document.querySelector(`.instance-card[data-instance-id="${instanceId}"]`);
  if (!card) return;
  
  // 更新名称
  const nameEl = card.querySelector('.instance-name');
  if (nameEl) {
    nameEl.textContent = instance.name;
    nameEl.setAttribute('title', instance.name);
  }
  
  // 更新描述
  const descEl = card.querySelector('.instance-desc');
  if (instance.description) {
    if (descEl) {
      descEl.textContent = instance.description;
      descEl.setAttribute('title', instance.description);
    } else {
      // 如果之前没有描述，现在添加了，需要创建元素
      const bodyEl = card.querySelector('.instance-card-body');
      if (bodyEl) {
        const newDescEl = document.createElement('div');
        newDescEl.className = 'instance-desc';
        newDescEl.textContent = instance.description;
        newDescEl.setAttribute('title', instance.description);
        bodyEl.appendChild(newDescEl);
      }
    }
  } else {
    // 如果删除了描述，移除元素
    if (descEl) {
      descEl.remove();
    }
  }
}
