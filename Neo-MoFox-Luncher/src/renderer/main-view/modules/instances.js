import { el } from './elements.js';

// ─── Instance State ───────────────────────────────────────────────────

export const state = {
  instances: [],
  currentEditingInstance: null,
};

// ─── Load Instances ───────────────────────────────────────────────────

export async function loadInstances() {
  try {
    // 从后端 API 加载实例列表
    const instances = await window.mofoxAPI.getInstances();
    
    // 转换字段名以适配前端显示（后端使用 displayName，前端使用 name）
    state.instances = instances.map(instance => ({
      id: instance.id,
      name: instance.displayName,
      path: instance.neomofoxDir,
      description: `QQ: ${instance.qqNumber} | 端口: ${instance.wsPort}`,
      status: instance.enabled ? 'stopped' : 'disabled',
      branch: instance.channel,
      version: instance.neomofoxVersion || 'unknown',
      // 保留原始数据
      qqNumber: instance.qqNumber,
      wsPort: instance.wsPort,
      napcatDir: instance.napcatDir,
      installCompleted: instance.installCompleted,
      createdAt: instance.createdAt,
      lastStartedAt: instance.lastStartedAt,
    }));
    
    renderInstances();
  } catch (error) {
    console.error('加载实例失败:', error);
    state.instances = [];
    renderInstances();
  }
}

// ─── Render Instances ─────────────────────────────────────────────────

export function renderInstances() {
  const grid = document.getElementById('instances-grid');
  const addCard = document.getElementById('btn-add-instance');
  // 仅清空除了添加按钮以外的卡片
  // 将 addCard 暂时移除，清空 grid，再加回去，或者只移除 .instance-card:not(.add-card)
  
  // 方法：保留 Add Card，移除其他
  const children = Array.from(grid.children);
  children.forEach(child => {
    if (child.id !== 'btn-add-instance') {
      child.remove();
    }
  });

  // 更新计数
  const countBadge = document.getElementById('instance-count');
  if (countBadge) {
    countBadge.textContent = state.instances.length.toString();
  }
  
  // 如果没有实例，不需要显示 Empty State，因为 Add Card 就在那里
  
  // 渲染实例
  state.instances.forEach(instance => {
    const card = document.createElement('div');
    card.className = 'instance-card';
    card.dataset.instanceId = instance.id;
    
    // 检查是否是未完成安装的实例
    const isIncomplete = instance.installCompleted === false;
    
    // 状态样式映射
    let statusClass = instance.status || 'stopped';
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
        // 跳转到安装向导继续安装
        window.location.href = '../install-wizard/wizard.html';
      });
      
      // 绑定删除按钮
      const btnDelete = card.querySelector('.btn-delete-incomplete');
      btnDelete.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确定要删除这个未完成的实例吗？已下载的文件也会被清理。')) {
          try {
            await window.mofoxAPI.installCleanup(instance.id);
            await loadInstances(); // 重新加载列表
          } catch (err) {
            console.error('清理失败:', err);
            alert('清理失败: ' + err.message);
          }
        }
      });
      
      // 点击卡片也可以继续安装
      card.addEventListener('click', () => {
        window.location.href = '../install-wizard/wizard.html';
      });
      
    } else {
      card.innerHTML = `
        <div class="instance-card-header">
          <div class="instance-icon">
            <span class="material-symbols-rounded">dns</span>
          </div>
          <div class="instance-status-dot ${statusClass}" title="状态: ${statusClass}"></div>
        </div>
        
        <div class="instance-card-body">
          <div class="instance-name" title="${instance.name}">${instance.name}</div>
          <div class="instance-path" title="${instance.path}">${instance.path}</div>
          <div class="instance-desc" title="${instance.description || ''}">
            ${instance.description || '暂无描述'}
          </div>
        </div>
        
        <div class="instance-card-footer">
          <button class="md3-btn md3-btn-text md3-btn-sm btn-edit-instance-card">
            设置
          </button>
          <button class="md3-btn md3-btn-tonal md3-btn-sm btn-open-instance">
            启动
          </button>
        </div>
      `;
      
      // 事件绑定
      const btnOpen = card.querySelector('.btn-open-instance');
      btnOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        // TODO: 打开实例逻辑
        console.log('Open instance', instance.id);
      });
      
      const btnEdit = card.querySelector('.btn-edit-instance-card');
      btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        // 打开编辑模态框
        openEditModal(instance);
      });
    }
    
    // 将卡片插入到 Add Card 后面
    grid.appendChild(card);
  });
}

function openEditModal(instance) {
  // 简单的重新实现，或者导出原本的逻辑
  // 由于模块化限制，这里可能需要重构。
  // 假设 main.js 处理了 UI 逻辑，或者 instances.js 处理。
  // 之前的代码是在 modules/instances.js 里的，所以可以直接调用 state
  state.currentEditingInstance = instance.id; // 修复：保存 ID 而不是整个对象
  
  // 填充表单 (假设 element 存在)
  document.getElementById('edit-instance-name').value = instance.name || '';
  document.getElementById('edit-instance-path').value = instance.path || '';
  document.getElementById('edit-instance-desc').value = instance.description || '';
  document.getElementById('edit-instance-config').value = JSON.stringify(instance.config || {}, null, 2);
  
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
  el.editModalTitle.textContent = '编辑实例';
  el.editInstanceName.value = instance.name;
  el.editInstancePath.value = instance.path;
  el.editInstanceDesc.value = instance.description || '';
  el.editInstanceConfig.value = JSON.stringify(instance.config || {}, null, 2);
  el.btnDeleteInstance.style.display = 'flex';
  
  el.editInstanceModal.classList.remove('hidden');
}

// ─── Create New Instance ──────────────────────────────────────────────

export function createNewInstance() {
  state.currentEditingInstance = null;
  el.editModalTitle.textContent = '新建实例';
  el.editInstanceName.value = '';
  el.editInstancePath.value = '';
  el.editInstanceDesc.value = '';
  el.editInstanceConfig.value = '{}';
  el.btnDeleteInstance.style.display = 'none';
  
  el.editInstanceModal.classList.remove('hidden');
}

// ─── Save Instance ────────────────────────────────────────────────────

export async function saveInstance() {
  const name = el.editInstanceName.value.trim();
  const path = el.editInstancePath.value.trim();
  const description = el.editInstanceDesc.value.trim();
  const configText = el.editInstanceConfig.value.trim();
  
  if (!name || !path) {
    alert('请填写实例名称和路径');
    return;
  }
  
  let config = {};
  try {
    config = JSON.parse(configText);
  } catch (error) {
    alert('配置格式错误，请检查 JSON 格式');
    return;
  }
  
  try {
    if (state.currentEditingInstance) {
      // 编辑现有实例 - 调用后端 API 更新
      await window.mofoxAPI.updateInstance(state.currentEditingInstance, {
        displayName: name,
        neomofoxDir: path,
      });
    } else {
      // 创建新实例 - 这里不应该直接创建，应该通过安装向导
      // 但保留基本的添加功能以便测试
      const newInstance = {
        id: `bot-${Date.now()}`,
        displayName: name,
        neomofoxDir: path,
        qqNumber: '',
        wsPort: 8095,
        channel: 'main',
        enabled: true,
        installCompleted: false,
        createdAt: new Date().toISOString(),
      };
      await window.mofoxAPI.addInstance(newInstance);
    }
    
    // 重新加载实例列表
    await loadInstances();
  } catch (error) {
    console.error('保存实例失败:', error);
    alert('保存失败: ' + error.message);
  }
  
  el.editInstanceModal.classList.add('hidden');
}

// ─── Delete Instance ──────────────────────────────────────────────────

export async function deleteInstance() {
  if (!state.currentEditingInstance) {
    alert('无法删除：未选择实例');
    return;
  }
  
  console.log('准备删除实例，ID:', state.currentEditingInstance, '类型:', typeof state.currentEditingInstance);
  
  if (!confirm('确定要删除这个实例吗？这个操作不可撤销。')) {
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
    alert('删除失败: ' + error.message);
    // 出错时不关闭模态框，让用户可以重试或取消
  }
}

// ─── Browse Path ──────────────────────────────────────────────────────

export async function browsePath() {
  const path = await window.mofoxAPI.selectProjectPath();
  if (path) {
    el.editInstancePath.value = path;
  }
}
