// ═══ Icon Manager Module ═══
// 处理实例图标的上传、裁剪和显示

let cropperInstance = null;
let currentInstanceId = null;
let pendingIconDataURL = null;

// ─── 初始化图标管理器 ───────────────────────────────────────────────────────

export function initIconManager() {
  const iconFileInput = document.getElementById('icon-file-input');
  const iconPreview = document.getElementById('icon-preview');
  const btnRemoveIcon = document.getElementById('btn-remove-icon');
  const btnCloseCropModal = document.getElementById('btn-close-crop-modal');
  const btnCancelCrop = document.getElementById('btn-cancel-crop');
  const btnConfirmCrop = document.getElementById('btn-confirm-crop');

  // 点击预览区域触发文件选择
  iconPreview.addEventListener('click', () => {
    iconFileInput.click();
  });

  // 文件选择后处理
  iconFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      await window.customAlert('请选择图像文件', '错误');
      return;
    }

    // 检查文件大小 (最大 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      await window.customAlert('图像文件过大，最大支持 5MB', '错误');
      return;
    }

    // 读取文件并打开裁剪对话框
    const reader = new FileReader();
    reader.onload = (event) => {
      openCropModal(event.target.result);
    };
    reader.readAsDataURL(file);

    // 清空input，允许重复选择同一文件
    iconFileInput.value = '';
  });

  // 移除图标按钮
  btnRemoveIcon.addEventListener('click', async (e) => {
    e.stopPropagation();
    
    if (!await window.customConfirm('确定要移除图标吗？', '确认')) {
      return;
    }
    
    // 清除预览
    clearIconPreview();
    pendingIconDataURL = null;
    
    // 如果是编辑现有实例，删除服务器上的图标
    if (currentInstanceId) {
      try {
        await window.mofoxAPI.deleteInstanceIcon(currentInstanceId);
      } catch (error) {
        console.error('删除图标失败:', error);
      }
    }
  });

  // 关闭裁剪对话框
  btnCloseCropModal.addEventListener('click', () => {
    closeCropModal();
  });
  
  btnCancelCrop.addEventListener('click', () => {
    closeCropModal();
  });

  // 确认裁剪
  btnConfirmCrop.addEventListener('click', () => {
    confirmCrop();
  });
}

// ─── 打开裁剪对话框 ─────────────────────────────────────────────────────────

function openCropModal(imageDataURL) {
  const modal = document.getElementById('icon-crop-modal');
  const cropImage = document.getElementById('crop-image');

  // 设置图像并显示对话框
  cropImage.src = imageDataURL;
  modal.classList.remove('hidden');

  // 等待图像加载后初始化Cropper
  cropImage.onload = () => {
    if (cropperInstance) {
      cropperInstance.destroy();
    }

    cropperInstance = new Cropper(cropImage, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.8,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      background: false,
      minCropBoxWidth: 100,
      minCropBoxHeight: 100,
    });
  };
}

// ─── 关闭裁剪对话框 ─────────────────────────────────────────────────────────

function closeCropModal() {
  const modal = document.getElementById('icon-crop-modal');
  modal.classList.add('hidden');

  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
}

// ─── 确认裁剪 ───────────────────────────────────────────────────────────────

function confirmCrop() {
  if (!cropperInstance) return;

  // 获取裁剪后的Canvas，并调整为 256x256
  const canvas = cropperInstance.getCroppedCanvas({
    width: 256,
    height: 256,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  });

  // 转换为Data URL
  const dataURL = canvas.toDataURL('image/png', 0.9);
  
  // 更新预览
  updateIconPreview(dataURL);
  
  // 保存待处理的图标数据
  pendingIconDataURL = dataURL;

  // 关闭对话框
  closeCropModal();
}

// ─── 更新图标预览 ───────────────────────────────────────────────────────────

function updateIconPreview(dataURL) {
  const iconPreview = document.getElementById('icon-preview');
  const btnRemoveIcon = document.getElementById('btn-remove-icon');

  // 清空现有内容
  iconPreview.innerHTML = '';

  // 添加图像
  const img = document.createElement('img');
  img.src = dataURL;
  iconPreview.appendChild(img);

  // 更新样式类
  iconPreview.classList.add('has-icon');

  // 显示移除按钮
  btnRemoveIcon.style.display = 'flex';
}

// ─── 清除图标预览 ───────────────────────────────────────────────────────────

function clearIconPreview() {
  const iconPreview = document.getElementById('icon-preview');
  const btnRemoveIcon = document.getElementById('btn-remove-icon');

  // 恢复默认显示
  iconPreview.innerHTML = `
    <span class="material-symbols-rounded">add_photo_alternate</span>
    <span class="icon-hint">点击上传图标</span>
  `;

  iconPreview.classList.remove('has-icon');
  btnRemoveIcon.style.display = 'none';
}

// ─── 设置当前编辑的实例 ─────────────────────────────────────────────────────

export function setCurrentInstance(instanceId, iconPath) {
  currentInstanceId = instanceId;
  pendingIconDataURL = null;

  if (iconPath) {
    // 加载现有图标
    loadExistingIcon(iconPath);
  } else {
    // 清空预览
    clearIconPreview();
  }
}

// ─── 加载现有图标 ───────────────────────────────────────────────────────────

async function loadExistingIcon(iconPath) {
  try {
    const fullPath = await window.mofoxAPI.getIconFullPath(iconPath);
    if (fullPath) {
      // 使用 file:// 协议加载本地文件（Windows 路径格式）
      const fileURL = fullPath.startsWith('file://') 
        ? fullPath 
        : 'file:///' + fullPath.replace(/\\/g, '/');
      updateIconPreview(fileURL);
    }
  } catch (error) {
    console.error('加载图标失败:', error);
    clearIconPreview();
  }
}

// ─── 保存图标 ──────────────────────────────────────────────────────────────

export async function saveIcon(instanceId) {
  if (!pendingIconDataURL) {
    return { success: true };
  }

  try {
    const result = await window.mofoxAPI.saveInstanceIcon(instanceId, pendingIconDataURL);
    if (result.success) {
      pendingIconDataURL = null;
      return { success: true, iconPath: result.iconPath };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('保存图标失败:', error);
    return { success: false, error: error.message };
  }
}

// ─── 获取实例图标URL ───────────────────────────────────────────────────────

export async function getInstanceIconURL(iconPath) {
  if (!iconPath) return null;
  
  try {
    const fullPath = await window.mofoxAPI.getIconFullPath(iconPath);
    if (fullPath) {
      // 返回 file:// URL
      return `file:///${fullPath.replace(/\\/g, '/')}`;
    }
  } catch (error) {
    console.error('获取图标路径失败:', error);
  }
  
  return null;
}

// ─── 重置状态 ──────────────────────────────────────────────────────────────

export function resetIconManager() {
  currentInstanceId = null;
  pendingIconDataURL = null;
  clearIconPreview();
}
