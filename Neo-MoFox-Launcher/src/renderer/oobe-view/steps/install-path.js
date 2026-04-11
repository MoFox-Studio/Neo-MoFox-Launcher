/**
 * OOBE 步骤 3: 安装路径配置
 */

let currentPath = ''; // 默认路径

export async function renderInstallPathStep(container, stepManager) {
  // 尝试从现有配置读取
  const settings = await window.mofoxAPI.settingsRead();
  currentPath = settings.defaultInstallDir || currentPath;

  container.innerHTML = `
    <div class="step-content">
      <div class="step-header">
        <h2 class="step-title">设置默认安装路径</h2>
        <p class="step-description">
          选择 MoFox 实例的默认安装目录。您可以稍后在创建实例时自定义路径。
        </p>
      </div>

      <div class="path-config" style="margin-top: 32px;">
        <div class="form-field">
          <label class="form-label">默认安装目录</label>
          <div class="input-group">
            <input 
              type="text" 
              id="install-path" 
              value="${currentPath}"
              placeholder="例如: D:\\Neo-MoFox_Bots"
              style="flex: 1;">
            <button id="btn-browse" class="oobe-btn secondary">
              <span class="material-symbols-rounded">folder_open</span>
              <span>浏览</span>
            </button>
          </div>
          <p class="form-description">
            建议选择磁盘空间充足的目录（至少 5GB 可用空间）
          </p>
        </div>

        <div id="path-info" class="path-info hidden" style="margin-top: 20px;">
          <!-- 路径验证信息将显示在这里 -->
        </div>

        <div class="quick-actions" style="margin-top: 24px;">
          <button id="btn-default-path" class="oobe-btn text">
            <span class="material-symbols-rounded">restore</span>
            <span>清空路径</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // 样式
  const style = document.createElement('style');
  style.textContent = `
    .path-info {
      padding: 12px 16px;
      border-radius: 8px;
      background: var(--md-sys-color-surface-variant);
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .path-info.valid {
      background: rgba(var(--md-sys-color-primary-rgb), 0.1);
      color: var(--md-sys-color-on-surface);
    }
    .path-info.warning {
      background: rgba(255, 152, 0, 0.1);
      color: #ff9800;
    }
    .path-info.invalid {
      background: rgba(var(--md-sys-color-error-rgb), 0.1);
      color: var(--md-sys-color-error);
    }
    .path-info .material-symbols-rounded {
      font-size: 20px;
    }
    .quick-actions {
      display: flex;
      gap: 12px;
    }
  `;
  container.appendChild(style);

  // 获取元素
  const inputPath = document.getElementById('install-path');
  const btnBrowse = document.getElementById('btn-browse');
  const btnDefaultPath = document.getElementById('btn-default-path');
  const pathInfo = document.getElementById('path-info');

  // 浏览按钮
  btnBrowse.addEventListener('click', async () => {
    try {
      const selectedPath = await window.mofoxAPI.oobeSelectPath();
      if (selectedPath) {
        inputPath.value = selectedPath;
        currentPath = selectedPath;
        await validatePath(selectedPath);
      }
    } catch (error) {
      console.error('选择路径失败:', error);
    }
  });

  // 恢复默认路径
  btnDefaultPath.addEventListener('click', () => {
    const defaultPath = '';
    inputPath.value = defaultPath;
    currentPath = defaultPath;
    validatePath(defaultPath);
  });

  // 输入框变化
  inputPath.addEventListener('change', async (e) => {
    currentPath = e.target.value;
    await validatePath(currentPath);
  });

  // 初始验证
  // 设置验证函数
  stepManager.setValidator('install-path', async () => {
    const isValid = await validatePath(currentPath);
    if (isValid) {
      stepManager.config.defaultInstallDir = currentPath;
      return true;
    }
    return false;
  });

  await validatePath(currentPath);

  async function validatePath(path) {
    if (!path || path.trim() === '') {
      pathInfo.className = 'path-info invalid';
      pathInfo.innerHTML = `
        <span class="material-symbols-rounded">error</span>
        <span>请输入有效的路径</span>
      `;
      pathInfo.classList.remove('hidden');
      return false;
    }

    try {
      const validation = await window.mofoxAPI.oobeValidatePath(path);
      if (validation.valid) {
        pathInfo.className = 'path-info valid';
        pathInfo.innerHTML = `
          <span class="material-symbols-rounded">check_circle</span>
          <span>路径有效</span>
        `;
        pathInfo.classList.remove('hidden');
        return true;
      } else {
        pathInfo.className = 'path-info invalid';
        pathInfo.innerHTML = `
          <span class="material-symbols-rounded">error</span>
          <span>${validation.error || '路径无效'}</span>
        `;
        pathInfo.classList.remove('hidden');
        return false;
      }
    } catch (error) {
      console.error('验证路径失败:', error);
      pathInfo.className = 'path-info invalid';
      pathInfo.innerHTML = `
        <span class="material-symbols-rounded">error</span>
        <span>验证失败</span>
      `;
      pathInfo.classList.remove('hidden');
      return false;
    }
  }
}
