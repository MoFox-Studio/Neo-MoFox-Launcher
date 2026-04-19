// ─── Export Integration Pack Module ──────────────────────────────────

/**
 * 导出整合包模块
 * 处理导出选项卡的交互和逻辑
 */

import { state } from './instances.js';

// ─── Constants ────────────────────────────────────────────────────────

// 系统原生插件列表（必须导出以保证正常运行）
const SYSTEM_PLUGINS = ['default_chatter', 'napcat_adapter', 'booku_memory', 'emoji_sender', 'perm_plugin'];

// ─── State ────────────────────────────────────────────────────────────

let currentPlugins = [];
let currentPluginConfigs = [];
let isExporting = false;

// ─── Elements ─────────────────────────────────────────────────────────

const exportElements = {
  // 元数据编辑器
  packName: null,
  packVersion: null,
  packAuthor: null,
  packDescription: null,
  // 导出选项
  includeNeo: null,
  includeNapcat: null,
  napcatOptionItem: null,
  installNapcatOnImport: null,
  installNapcatOptionItem: null,
  includeConfig: null,
  includePlugins: null,
  includeData: null,
  pluginSelector: null,
  pluginList: null,
  selectAllPlugins: null,
  includePluginConfigs: null,
  pluginConfigSelector: null,
  pluginConfigList: null,
  selectAllPluginConfigs: null,
  btnStartExport: null,
  progressContainer: null,
  progressText: null,
  progressFill: null,
  progressPercent: null,
  exportOutput: null,
};

// ─── Initialization ────────────────────────────────────────────────────

export function initExportTab() {
  // 获取元素引用 - 元数据编辑器
  exportElements.packName = document.getElementById('export-pack-name');
  exportElements.packVersion = document.getElementById('export-pack-version');
  exportElements.packAuthor = document.getElementById('export-pack-author');
  exportElements.packDescription = document.getElementById('export-pack-description');
  
  // 导出选项
  exportElements.includeNeo = document.getElementById('export-include-neo');
  exportElements.includeNapcat = document.getElementById('export-include-napcat');
  exportElements.napcatOptionItem = document.getElementById('napcat-option-item');
  exportElements.installNapcatOnImport = document.getElementById('export-install-napcat-on-import');
  exportElements.installNapcatOptionItem = document.getElementById('install-napcat-option-item');
  exportElements.includeConfig = document.getElementById('export-include-config');
  exportElements.includePlugins = document.getElementById('export-include-plugins');
  exportElements.includeData = document.getElementById('export-include-data');
  exportElements.pluginSelector = document.getElementById('plugin-selector');
  exportElements.pluginList = document.getElementById('export-plugin-list');
  exportElements.selectAllPlugins = document.getElementById('select-all-plugins');
  exportElements.includePluginConfigs = document.getElementById('export-include-plugin-configs');
  exportElements.pluginConfigSelector = document.getElementById('plugin-config-selector');
  exportElements.pluginConfigList = document.getElementById('export-plugin-config-list');
  exportElements.selectAllPluginConfigs = document.getElementById('select-all-plugin-configs');
  exportElements.btnStartExport = document.getElementById('btn-start-export');
  exportElements.progressContainer = document.getElementById('export-progress-container');
  exportElements.progressText = document.getElementById('export-progress-text');
  exportElements.progressFill = document.getElementById('export-progress-fill');
  exportElements.progressPercent = document.getElementById('export-progress-percent');
  exportElements.exportOutput = document.getElementById('export-output');

  // 验证关键元素是否正确获取
  console.log('[ExportTab] 元素初始化状态:', {
    exportOutput: !!exportElements.exportOutput,
    progressContainer: !!exportElements.progressContainer,
    progressText: !!exportElements.progressText,
    progressFill: !!exportElements.progressFill,
    progressPercent: !!exportElements.progressPercent,
  });

  // 绑定事件
  if (exportElements.includeNapcat) {
    exportElements.includeNapcat.addEventListener('change', toggleInstallNapcatOption);
  }

  if (exportElements.installNapcatOnImport) {
    exportElements.installNapcatOnImport.addEventListener('change', togglePackNapcatOption);
  }

  if (exportElements.includePlugins) {
    exportElements.includePlugins.addEventListener('change', togglePluginSelector);
  }

  if (exportElements.selectAllPlugins) {
    exportElements.selectAllPlugins.addEventListener('change', toggleSelectAllPlugins);
  }

  if (exportElements.includePluginConfigs) {
    exportElements.includePluginConfigs.addEventListener('change', togglePluginConfigSelector);
  }

  if (exportElements.selectAllPluginConfigs) {
    exportElements.selectAllPluginConfigs.addEventListener('change', toggleSelectAllPluginConfigs);
  }

  if (exportElements.btnStartExport) {
    exportElements.btnStartExport.addEventListener('click', startExport);
  }

  // 监听导出事件
  window.mofoxAPI.onExportProgress?.(({ percent, message }) => {
    console.log('[ExportTab] 收到进度事件:', percent, message);
    updateExportProgress(percent, message);
  });

  window.mofoxAPI.onExportOutput?.((message) => {
    console.log('[ExportTab] 收到输出事件:', message);
    addExportOutput(message);
  });

  window.mofoxAPI.onExportComplete?.(({ success, filePath, error }) => {
    console.log('[ExportTab] 收到完成事件:', success, filePath, error);
    onExportComplete(success, filePath || error);
  });

  console.log('[ExportTab] 导出选项卡已初始化，监听器已注册');
}

// ─── 打开导出选项卡时加载插件列表 ─────────────────────────────────────

export async function onExportTabOpened(instanceId) {
  // 重置状态
  resetExportState();

  // 加载实例信息并填充元数据
  loadInstanceMetadata(instanceId);

  // 检查 NapCat 是否存在
  await checkNapcatAvailability(instanceId);

  // 扫描插件
  await scanPlugins(instanceId);

  // 扫描插件配置
  await scanPluginConfigs(instanceId);
}

// ─── 私有函数 ──────────────────────────────────────────────────────────

/**
 * 加载实例元数据并填充到表单
 */
function loadInstanceMetadata(instanceId) {
  const instance = state.instances.find(i => i.id === instanceId);
  if (!instance) return;

  // 填充默认值
  if (exportElements.packName) {
    exportElements.packName.value = instance.name || '';
  }
  if (exportElements.packVersion) {
    exportElements.packVersion.value = '1.0.0';
  }
  if (exportElements.packAuthor) {
    exportElements.packAuthor.value = '';
  }
  if (exportElements.packDescription) {
    exportElements.packDescription.value = instance.description || `基于 ${instance.name} 实例的整合包`;
  }
}

/**
 * 检查 NapCat 是否存在并动态显示选项
 */
async function checkNapcatAvailability(instanceId) {
  try {
    const napcatExists = await window.mofoxAPI.checkNapcatExists(instanceId);
    
    if (napcatExists) {
      // 实例有 NapCat，显示两个选项，允许用户选择
      if (exportElements.napcatOptionItem) {
        exportElements.napcatOptionItem.style.display = 'flex';
      }
      if (exportElements.installNapcatOptionItem) {
        exportElements.installNapcatOptionItem.style.display = 'flex';
      }
    } else {
      // 实例没有 NapCat，隐藏打包选项，仅显示安装选项
      if (exportElements.napcatOptionItem) {
        exportElements.napcatOptionItem.style.display = 'none';
      }
      if (exportElements.installNapcatOptionItem) {
        exportElements.installNapcatOptionItem.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error('[ExportTab] 检查 NapCat 失败:', err);
    // 出错时隐藏两个选项
    if (exportElements.napcatOptionItem) {
      exportElements.napcatOptionItem.style.display = 'none';
    }
    if (exportElements.installNapcatOptionItem) {
      exportElements.installNapcatOptionItem.style.display = 'none';
    }
  }
}

/**
 * 切换 NapCat 选项的互斥状态
 */
function toggleInstallNapcatOption() {
  // 如果勾选了打包 NapCat，则禁用"导入时安装"选项
  if (exportElements.includeNapcat?.checked) {
    if (exportElements.installNapcatOnImport) {
      exportElements.installNapcatOnImport.disabled = true;
      exportElements.installNapcatOnImport.checked = false;
    }
    if (exportElements.installNapcatOptionItem) {
      exportElements.installNapcatOptionItem.style.opacity = '0.5';
      exportElements.installNapcatOptionItem.style.pointerEvents = 'none';
    }
  } else {
    // 取消勾选打包 NapCat，恢复"导入时安装"选项
    if (exportElements.installNapcatOnImport) {
      exportElements.installNapcatOnImport.disabled = false;
    }
    if (exportElements.installNapcatOptionItem) {
      exportElements.installNapcatOptionItem.style.opacity = '1';
      exportElements.installNapcatOptionItem.style.pointerEvents = 'auto';
    }
  }
}

/**
 * 切换打包选项的互斥状态（当勾选"导入时安装"时）
 */
function togglePackNapcatOption() {
  // 如果勾选了"导入时安装"，则禁用打包选项
  if (exportElements.installNapcatOnImport?.checked) {
    if (exportElements.includeNapcat) {
      exportElements.includeNapcat.disabled = true;
      exportElements.includeNapcat.checked = false;
    }
    if (exportElements.napcatOptionItem) {
      exportElements.napcatOptionItem.style.opacity = '0.5';
      exportElements.napcatOptionItem.style.pointerEvents = 'none';
    }
  } else {
    // 取消勾选"导入时安装"，恢复打包选项
    if (exportElements.includeNapcat) {
      exportElements.includeNapcat.disabled = false;
    }
    if (exportElements.napcatOptionItem) {
      exportElements.napcatOptionItem.style.opacity = '1';
      exportElements.napcatOptionItem.style.pointerEvents = 'auto';
    }
  }
}

/**
 * 切换插件选择器显示/隐藏
 */
async function togglePluginSelector() {
  if (exportElements.includePlugins?.checked) {
    exportElements.pluginSelector.style.display = 'block';
  } else {
    // 取消勾选时显示警告
    const confirmResult = await window.customConfirm(
      '警告：不导出插件可能导致整合包无法正常运行！\n\n系统需要以下核心插件才能正常工作：\n' +
      SYSTEM_PLUGINS.map(p => `• ${p}`).join('\n') +
      '\n\n确定要取消勾选"包含插件"吗？',
      '警告'
    );
    if (!confirmResult) {
      // 用户取消，恢复勾选状态
      exportElements.includePlugins.checked = true;
      return;
    }
    exportElements.pluginSelector.style.display = 'none';
  }
}

/**
 * 全选/取消全选插件
 */
async function toggleSelectAllPlugins() {
  const isChecked = exportElements.selectAllPlugins.checked;
  
  // 如果是取消全选，检查是否包含系统核心插件
  if (!isChecked) {
    const checkboxes = exportElements.pluginList.querySelectorAll('input[type="checkbox"]');
    const checkedSystemPlugins = [];
    
    checkboxes.forEach(cb => {
      if (cb.checked && SYSTEM_PLUGINS.includes(cb.value)) {
        checkedSystemPlugins.push(cb.value);
      }
    });
    
    if (checkedSystemPlugins.length > 0) {
      const confirmResult = await window.customConfirm(
        '警告：取消全选将会取消勾选以下核心插件，可能导致整合包无法正常运行：\n' +
        checkedSystemPlugins.map(p => `• ${p}`).join('\n') +
        '\n\n确定要取消全选吗？',
        '警告'
      );
      if (!confirmResult) {
        // 用户取消，恢复全选状态
        exportElements.selectAllPlugins.checked = true;
        return;
      }
    }
  }
  
  const checkboxes = exportElements.pluginList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = isChecked;
  });
}

/**
 * 检查并更新全选按钮状态
 */
function updateSelectAllCheckbox() {
  const checkboxes = exportElements.pluginList.querySelectorAll('input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
  
  if (exportElements.selectAllPlugins) {
    exportElements.selectAllPlugins.checked = allChecked;
    // 设置半选状态（如果支持的话）
    exportElements.selectAllPlugins.indeterminate = !allChecked && anyChecked;
  }
}

/**
 * 切换插件配置选择器显示/隐藏
 */
function togglePluginConfigSelector() {
  if (exportElements.includePluginConfigs?.checked) {
    exportElements.pluginConfigSelector.style.display = 'block';
  } else {
    exportElements.pluginConfigSelector.style.display = 'none';
  }
}

/**
 * 全选/取消全选插件配置
 */
function toggleSelectAllPluginConfigs() {
  const isChecked = exportElements.selectAllPluginConfigs.checked;
  const checkboxes = exportElements.pluginConfigList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = isChecked;
  });
}

/**
 * 扫描实例插件
 */
async function scanPlugins(instanceId) {
  try {
    exportElements.pluginList.innerHTML = '<div class="loading-plugins"><span class="spinner"></span><span>扫描插件中...</span></div>';

    const plugins = await window.mofoxAPI.scanInstancePlugins(instanceId);
    currentPlugins = plugins;

    if (plugins.length === 0) {
      exportElements.pluginList.innerHTML = '<div class="loading-plugins"><span>此实例没有插件</span></div>';
      return;
    }

    // 渲染插件列表
    exportElements.pluginList.innerHTML = '';
    plugins.forEach(plugin => {
      const item = document.createElement('label');
      item.className = 'plugin-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = plugin.name;
      checkbox.dataset.pluginName = plugin.name;
      
      const isSystemPlugin = SYSTEM_PLUGINS.includes(plugin.name);
      
      // 默认选中系统原生插件
      if (isSystemPlugin) {
        checkbox.checked = true;
        
        // 为系统插件添加取消勾选警告
        checkbox.addEventListener('change', async (e) => {
          if (!e.target.checked) {
            const confirmResult = await window.customConfirm(
              `警告："${plugin.name}" 是系统核心插件，取消导出可能导致整合包无法正常运行！\n\n确定要取消勾选吗？`,
              '警告'
            );
            if (!confirmResult) {
              // 用户取消，恢复勾选状态
              e.target.checked = true;
            }
          }
          // 更新全选按钮状态
          updateSelectAllCheckbox();
        });
      } else {
        // 为非系统插件也添加 change 事件以更新全选按钮
        checkbox.addEventListener('change', () => {
          updateSelectAllCheckbox();
        });
      }
      
      const iconSpan = document.createElement('span');
      iconSpan.className = 'material-symbols-rounded plugin-item-icon';
      iconSpan.textContent = plugin.type === 'folder' ? 'folder' : 'description';
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'plugin-item-name';
      nameSpan.textContent = plugin.name;
      
      // 为系统插件添加标识
      if (isSystemPlugin) {
        const badge = document.createElement('span');
        badge.className = 'plugin-system-badge';
        badge.textContent = '核心';
        badge.style.cssText = 'margin-left: 8px; padding: 2px 6px; background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); border-radius: 4px; font-size: 10px;';
        nameSpan.appendChild(badge);
      }
      
      const typeSpan = document.createElement('span');
      typeSpan.className = 'plugin-item-type';
      typeSpan.textContent = plugin.type === 'folder' ? '文件夹' : '文件';
      
      item.appendChild(checkbox);
      item.appendChild(iconSpan);
      item.appendChild(nameSpan);
      item.appendChild(typeSpan);
      
      exportElements.pluginList.appendChild(item);
    });
    
    // 扫描完成后更新全选按钮状态
    updateSelectAllCheckbox();

    console.log(`[ExportTab] 已扫描到 ${plugins.length} 个插件`);
  } catch (error) {
    console.error('[ExportTab] 扫描插件失败:', error);
    exportElements.pluginList.innerHTML = `<div class="loading-plugins"><span style="color: var(--md-sys-color-error);">扫描失败: ${error.message}</span></div>`;
  }
}

/**
 * 扫描实例插件配置文件
 */
async function scanPluginConfigs(instanceId) {
  try {
    exportElements.pluginConfigList.innerHTML = '<div class="loading-plugins"><span class="spinner"></span><span>扫描插件配置中...</span></div>';

    const pluginConfigs = await window.mofoxAPI.scanInstancePluginConfigs(instanceId);
    currentPluginConfigs = pluginConfigs;

    if (pluginConfigs.length === 0) {
      exportElements.pluginConfigList.innerHTML = '<div class="loading-plugins"><span>此实例没有插件配置文件</span></div>';
      return;
    }

    // 渲染插件配置列表
    exportElements.pluginConfigList.innerHTML = '';
    pluginConfigs.forEach(config => {
      const item = document.createElement('label');
      item.className = 'plugin-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = config.name;
      checkbox.dataset.configName = config.name;
      
      const iconSpan = document.createElement('span');
      iconSpan.className = 'material-symbols-rounded plugin-item-icon';
      iconSpan.textContent = config.type === 'folder' ? 'folder' : 'description';
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'plugin-item-name';
      nameSpan.textContent = config.name;
      
      const typeSpan = document.createElement('span');
      typeSpan.className = 'plugin-item-type';
      typeSpan.textContent = config.type === 'folder' ? '文件夹' : '文件';
      
      item.appendChild(checkbox);
      item.appendChild(iconSpan);
      item.appendChild(nameSpan);
      item.appendChild(typeSpan);
      
      exportElements.pluginConfigList.appendChild(item);
    });

    console.log(`[ExportTab] 已扫描到 ${pluginConfigs.length} 个插件配置`);
  } catch (error) {
    console.error('[ExportTab] 扫描插件配置失败:', error);
    exportElements.pluginConfigList.innerHTML = `<div class="loading-plugins"><span style="color: var(--md-sys-color-error);">扫描失败: ${error.message}</span></div>`;
  }
}

/**
 * 开始导出
 */
async function startExport() {
  if (isExporting) {
    return;
  }

  const instanceId = state.currentEditingInstance;
  if (!instanceId) {
    await window.customAlert('请先选择一个实例', '错误');
    return;
  }

  // 验证元数据
  if (!exportElements.packName || !exportElements.packVersion) {
    await window.customAlert('元数据编辑器未正确初始化', '错误');
    return;
  }

  const packName = exportElements.packName.value.trim();
  const packVersion = exportElements.packVersion.value.trim();
  const packAuthor = exportElements.packAuthor?.value.trim() || '';
  const packDescription = exportElements.packDescription?.value.trim() || '';

  if (!packName) {
    await window.customAlert('请输入整合包名称', '提示');
    exportElements.packName.focus();
    return;
  }

  if (!packVersion) {
    await window.customAlert('请输入版本号', '提示');
    exportElements.packVersion.focus();
    return;
  }

  // 收集导出选项
  const options = {
    // 元数据
    packName,
    packVersion,
    packAuthor,
    packDescription,
    // 内容选项
    includeNeoMofox: exportElements.includeNeo.checked,
    includeNapcat: exportElements.includeNapcat.checked,
    includeConfig: exportElements.includeConfig.checked,
    includePlugins: exportElements.includePlugins.checked,
    includeData: exportElements.includeData.checked,
    installNapcatOnImport: exportElements.installNapcatOnImport?.checked || false,
    includePluginConfigs: exportElements.includePluginConfigs.checked,
    selectedPlugins: [],
    selectedPluginConfigs: [],
  };

  // 收集选中的插件
  if (options.includePlugins) {
    const checkedPlugins = exportElements.pluginList.querySelectorAll('input[type="checkbox"]:checked');
    options.selectedPlugins = Array.from(checkedPlugins).map(cb => cb.value);

    if (options.selectedPlugins.length === 0) {
      await window.customAlert('请至少选择一个插件，或取消"包含插件"选项', '提示');
      return;
    }
    
    // 检查是否缺少核心插件
    const missingSystemPlugins = SYSTEM_PLUGINS.filter(sp => !options.selectedPlugins.includes(sp));
    if (missingSystemPlugins.length > 0) {
      const confirmResult = await window.customConfirm(
        '警告：以下核心插件未被选中，可能导致整合包无法正常运行：\n' +
        missingSystemPlugins.map(p => `• ${p}`).join('\n') +
        '\n\n确定要继续导出吗？',
        '警告'
      );
      if (!confirmResult) {
        return;
      }
    }
  }

  // 收集选中的插件配置
  if (options.includePluginConfigs) {
    const checkedConfigs = exportElements.pluginConfigList.querySelectorAll('input[type="checkbox"]:checked');
    options.selectedPluginConfigs = Array.from(checkedConfigs).map(cb => cb.value);

    if (options.selectedPluginConfigs.length === 0) {
      await window.customAlert('请至少选择一个插件配置文件，或取消"包含插件配置文件"选项', '提示');
      return;
    }
  }

  // 检查是否至少选择了一项内容
  if (!options.includeNeoMofox && !options.includeNapcat && !options.includeConfig && !options.includePlugins && !options.includeData) {
    await window.customAlert('请至少选择一项要导出的内容', '提示');
    return;
  }

  try {
    // 选择保存路径
    const instance = state.instances.find(i => i.id === instanceId);
    const defaultFileName = `${instance.name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')}_${Date.now()}.mfpack`;
    
    const destPath = await window.mofoxAPI.dialog.showSaveDialog({
      title: '导出整合包',
      defaultPath: defaultFileName,
      filters: [
        { name: 'MoFox 整合包', extensions: ['mfpack'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (!destPath) {
      return; // 用户取消
    }

    // 开始导出
    isExporting = true;
    showProgress(true);
    disableExportOptions(true);

    await window.mofoxAPI.exportIntegrationPack(instanceId, options, destPath);

  } catch (error) {
    console.error('[ExportTab] 导出失败:', error);
    await window.customAlert(`导出失败: ${error.message}`, '错误');
    showProgress(false);
    isExporting = false;
    disableExportOptions(false);
  }
}

/**
 * 显示/隐藏进度区域
 */
function showProgress(show) {
  if (show) {
    exportElements.progressContainer.style.display = 'block';
    exportElements.exportOutput.textContent = '';
  } else {
    exportElements.progressContainer.style.display = 'none';
  }
}

/**
 * 禁用/启用导出选项
 */
function disableExportOptions(disable) {
  exportElements.includeNeo.disabled = disable;
  exportElements.includeNapcat.disabled = disable;
  exportElements.includeConfig.disabled = disable;
  exportElements.includePlugins.disabled = disable;
  exportElements.includePluginConfigs.disabled = disable;
  exportElements.includeData.disabled = disable;
  exportElements.selectAllPlugins.disabled = disable;
  exportElements.selectAllPluginConfigs.disabled = disable;
  exportElements.btnStartExport.disabled = disable;

  const pluginCheckboxes = exportElements.pluginList.querySelectorAll('input[type="checkbox"]');
  pluginCheckboxes.forEach(cb => {
    cb.disabled = disable;
  });

  const configCheckboxes = exportElements.pluginConfigList.querySelectorAll('input[type="checkbox"]');
  configCheckboxes.forEach(cb => {
    cb.disabled = disable;
  });

  // 禁用/启用模态框的保存、取消和关闭按钮
  const btnSaveInstance = document.getElementById('btn-save-instance');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
  
  if (btnSaveInstance) btnSaveInstance.disabled = disable;
  if (btnCancelEdit) btnCancelEdit.disabled = disable;
  if (btnCloseEditModal) btnCloseEditModal.disabled = disable;
  
  // 禁用/启用侧边栏 tab 切换（除了当前的导出 tab）
  const sidebarTabs = document.querySelectorAll('#edit-instance-sidebar .sidebar-tab');
  sidebarTabs.forEach(tab => {
    if (tab.dataset.tab !== 'export') {
      if (disable) {
        tab.style.pointerEvents = 'none';
        tab.style.opacity = '0.5';
      } else {
        tab.style.pointerEvents = '';
        tab.style.opacity = '';
      }
    }
  });
  
  // 如果禁用，还需要禁用元数据输入框
  if (exportElements.packName) exportElements.packName.disabled = disable;
  if (exportElements.packVersion) exportElements.packVersion.disabled = disable;
  if (exportElements.packAuthor) exportElements.packAuthor.disabled = disable;
  if (exportElements.packDescription) exportElements.packDescription.disabled = disable;
}

/**
 * 更新进度
 */
export function updateExportProgress(percent, message) {
  console.log(`[ExportTab] 进度: ${percent}%, ${message}`);
  if (!exportElements.progressFill || !exportElements.progressPercent || !exportElements.progressText) {
    console.error('[ExportTab] 进度元素未找到');
    return;
  }
  exportElements.progressFill.style.width = `${percent}%`;
  exportElements.progressPercent.textContent = `${Math.round(percent)}%`;
  exportElements.progressText.textContent = message;
}

/**
 * 添加输出日志
 */
export function addExportOutput(message) {
  console.log('[ExportTab] 导出日志:', message);
  if (!exportElements.exportOutput) {
    console.error('[ExportTab] exportOutput 元素未找到');
    return;
  }
  exportElements.exportOutput.textContent += message + '\n';
  exportElements.exportOutput.scrollTop = exportElements.exportOutput.scrollHeight;
}

/**
 * 导出完成
 */
export function onExportComplete(success, message) {
  isExporting = false;
  disableExportOptions(false);

  if (success) {
    exportElements.progressText.textContent = '✓ 导出完成';
    window.customAlert(message || '整合包导出成功！', '成功');
  } else {
    exportElements.progressText.textContent = '✗ 导出失败';
    window.customAlert(message || '导出失败', '错误');
  }
}

/**
 * 重置导出状态
 */
function resetExportState() {
  isExporting = false;
  currentPlugins = [];
  currentPluginConfigs = [];
  
  if (exportElements.includeNeo) exportElements.includeNeo.checked = false;
  if (exportElements.includeNapcat) {
    exportElements.includeNapcat.checked = false;
    exportElements.includeNapcat.disabled = false;
  }
  if (exportElements.napcatOptionItem) {
    exportElements.napcatOptionItem.style.opacity = '1';
    exportElements.napcatOptionItem.style.pointerEvents = 'auto';
  }
  if (exportElements.includeConfig) exportElements.includeConfig.checked = false;
  if (exportElements.includePlugins) {
    exportElements.includePlugins.checked = true; // 默认勾选导出插件
    exportElements.pluginSelector.style.display = 'block'; // 默认显示插件选择器
  }
  if (exportElements.includePluginConfigs) exportElements.includePluginConfigs.checked = false;
  if (exportElements.includeData) exportElements.includeData.checked = false;
  if (exportElements.installNapcatOnImport) {
    exportElements.installNapcatOnImport.checked = false;
    exportElements.installNapcatOnImport.disabled = false;
  }
  if (exportElements.installNapcatOptionItem) {
    exportElements.installNapcatOptionItem.style.opacity = '1';
    exportElements.installNapcatOptionItem.style.pointerEvents = 'auto';
  }
  if (exportElements.selectAllPlugins) exportElements.selectAllPlugins.checked = false;
  if (exportElements.selectAllPluginConfigs) exportElements.selectAllPluginConfigs.checked = false;
  
  // 注意：不在这里重置 pluginSelector 的显示状态，因为上面已经根据 includePlugins 的状态设置了
  // if (exportElements.pluginSelector) exportElements.pluginSelector.style.display = 'none';
  if (exportElements.pluginConfigSelector) exportElements.pluginConfigSelector.style.display = 'none';
  if (exportElements.progressContainer) exportElements.progressContainer.style.display = 'none';
  if (exportElements.pluginList) exportElements.pluginList.innerHTML = '';
  if (exportElements.pluginConfigList) exportElements.pluginConfigList.innerHTML = '';
  if (exportElements.exportOutput) exportElements.exportOutput.textContent = '';
}
