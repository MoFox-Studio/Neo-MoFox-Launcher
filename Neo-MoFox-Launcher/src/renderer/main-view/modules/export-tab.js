// ─── Export Integration Pack Module ──────────────────────────────────

/**
 * 导出整合包模块
 * 处理导出选项卡的交互和逻辑
 */

import { state } from './instances.js';

// ─── State ────────────────────────────────────────────────────────────

let currentPlugins = [];
let isExporting = false;

// ─── Elements ─────────────────────────────────────────────────────────

const exportElements = {
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
  btnStartExport: null,
  progressContainer: null,
  progressText: null,
  progressFill: null,
  progressPercent: null,
  exportOutput: null,
};

// ─── Initialization ────────────────────────────────────────────────────

export function initExportTab() {
  // 获取元素引用
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
  exportElements.btnStartExport = document.getElementById('btn-start-export');
  exportElements.progressContainer = document.getElementById('export-progress-container');
  exportElements.progressText = document.getElementById('export-progress-text');
  exportElements.progressFill = document.getElementById('export-progress-fill');
  exportElements.progressPercent = document.getElementById('export-progress-percent');
  exportElements.exportOutput = document.getElementById('export-output');

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

  if (exportElements.btnStartExport) {
    exportElements.btnStartExport.addEventListener('click', startExport);
  }

  // 监听导出事件
  window.mofoxAPI.onExportProgress?.(({ percent, message }) => {
    updateExportProgress(percent, message);
  });

  window.mofoxAPI.onExportOutput?.((message) => {
    addExportOutput(message);
  });

  window.mofoxAPI.onExportComplete?.(({ success, filePath, error }) => {
    onExportComplete(success, filePath || error);
  });

  console.log('[ExportTab] 导出选项卡已初始化');
}

// ─── 打开导出选项卡时加载插件列表 ─────────────────────────────────────

export async function onExportTabOpened(instanceId) {
  // 重置状态
  resetExportState();

  // 检查 NapCat 是否存在
  await checkNapcatAvailability(instanceId);

  // 扫描插件
  await scanPlugins(instanceId);
}

// ─── 私有函数 ──────────────────────────────────────────────────────────

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
function togglePluginSelector() {
  if (exportElements.includePlugins?.checked) {
    exportElements.pluginSelector.style.display = 'block';
  } else {
    exportElements.pluginSelector.style.display = 'none';
  }
}

/**
 * 全选/取消全选插件
 */
function toggleSelectAllPlugins() {
  const isChecked = exportElements.selectAllPlugins.checked;
  const checkboxes = exportElements.pluginList.querySelectorAll('input[type="checkbox"]');
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
      
      const iconSpan = document.createElement('span');
      iconSpan.className = 'material-symbols-rounded plugin-item-icon';
      iconSpan.textContent = plugin.type === 'folder' ? 'folder' : 'description';
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'plugin-item-name';
      nameSpan.textContent = plugin.name;
      
      const typeSpan = document.createElement('span');
      typeSpan.className = 'plugin-item-type';
      typeSpan.textContent = plugin.type === 'folder' ? '文件夹' : '文件';
      
      item.appendChild(checkbox);
      item.appendChild(iconSpan);
      item.appendChild(nameSpan);
      item.appendChild(typeSpan);
      
      exportElements.pluginList.appendChild(item);
    });

    console.log(`[ExportTab] 已扫描到 ${plugins.length} 个插件`);
  } catch (error) {
    console.error('[ExportTab] 扫描插件失败:', error);
    exportElements.pluginList.innerHTML = `<div class="loading-plugins"><span style="color: var(--md-sys-color-error);">扫描失败: ${error.message}</span></div>`;
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

  // 收集导出选项
  const options = {
    includeNeoMofox: exportElements.includeNeo.checked,
    includeNapcat: exportElements.includeNapcat.checked,
    includeConfig: exportElements.includeConfig.checked,
    includePlugins: exportElements.includePlugins.checked,
    includeData: exportElements.includeData.checked,
    installNapcatOnImport: exportElements.installNapcatOnImport?.checked || false,
    selectedPlugins: [],
  };

  // 收集选中的插件
  if (options.includePlugins) {
    const checkedPlugins = exportElements.pluginList.querySelectorAll('input[type="checkbox"]:checked');
    options.selectedPlugins = Array.from(checkedPlugins).map(cb => cb.value);

    if (options.selectedPlugins.length === 0) {
      await window.customAlert('请至少选择一个插件，或取消"包含插件"选项', '提示');
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
  exportElements.includeData.disabled = disable;
  exportElements.selectAllPlugins.disabled = disable;
  exportElements.btnStartExport.disabled = disable;

  const pluginCheckboxes = exportElements.pluginList.querySelectorAll('input[type="checkbox"]');
  pluginCheckboxes.forEach(cb => {
    cb.disabled = disable;
  });
}

/**
 * 更新进度
 */
export function updateExportProgress(percent, message) {
  exportElements.progressFill.style.width = `${percent}%`;
  exportElements.progressPercent.textContent = `${Math.round(percent)}%`;
  exportElements.progressText.textContent = message;
}

/**
 * 添加输出日志
 */
export function addExportOutput(message) {
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
  if (exportElements.includePlugins) exportElements.includePlugins.checked = false;
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
  
  if (exportElements.pluginSelector) exportElements.pluginSelector.style.display = 'none';
  if (exportElements.progressContainer) exportElements.progressContainer.style.display = 'none';
  if (exportElements.pluginList) exportElements.pluginList.innerHTML = '';
  if (exportElements.exportOutput) exportElements.exportOutput.textContent = '';
}
