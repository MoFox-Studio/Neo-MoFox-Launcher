import { el } from './elements.js';

// ─── 环境检测状态 ─────────────────────────────────────────────────────

const envState = {
  checking: false,
  installing: false,
  results: {
    python: null,
    uv: null,
    git: null,
  },
  allPassed: false,
};

// ─── 启动时环境检测 ───────────────────────────────────────────────────

/**
 * 检查环境并决定是否需要显示 OOBE
 * 返回 true 表示需要运行环境检测，false 表示环境已就绪
 */
export async function checkEnvironmentAndRunOOBE() {
  // 先尝试读取缓存结果
  const cachedResult = await window.mofoxAPI.envCheckGetCached();
  
  if (cachedResult && cachedResult.passed) {
    console.log('环境检测已通过（使用缓存）');
    envState.results = cachedResult.checks;
    envState.allPassed = true;
    return false; // 环境已就绪，不需要显示检测界面
  }
  
  // 没有缓存或缓存未通过，显示检测界面
  showEnvCheck();
  
  // 运行环境检测
  const passed = await runEnvCheck();
  
  return !passed; // 如果没通过，返回 true 表示需要用户处理
}

// ─── 显示/隐藏环境检测界面 ─────────────────────────────────────────────

export function showEnvCheck() {
  resetCheckUI();
  el.oobeOverlay?.classList.remove('hidden');
}

export function hideEnvCheck() {
  el.oobeOverlay?.classList.add('hidden');
}

function resetCheckUI() {
  // 重置所有检测项为检测中状态
  const checkItems = ['python', 'uv', 'git'];
  checkItems.forEach(name => {
    const item = document.getElementById(`check-${name}`);
    const icon = item?.querySelector('.check-icon .material-symbols-rounded');
    const status = document.getElementById(`check-${name}-status`);
    const result = document.getElementById(`check-${name}-result`);
    
    if (icon) {
      icon.textContent = 'sync';
      icon.classList.add('spinning');
    }
    if (item) {
      item.classList.remove('passed', 'failed');
    }
    if (status) {
      status.textContent = '检测中...';
    }
    if (result) {
      result.innerHTML = '';
    }
  });
  
  // 隐藏摘要、提示和进度
  el.envCheckSummary?.classList.add('hidden');
  el.envInstallHints?.classList.add('hidden');
  el.envInstallProgress?.classList.add('hidden');
  
  // 隐藏安装按钮
  if (el.oobeBtnAutoInstall) el.oobeBtnAutoInstall.style.display = 'none';
  
  // 禁用按钮
  if (el.oobeBtnRecheck) el.oobeBtnRecheck.disabled = true;
  if (el.oobeBtnContinue) el.oobeBtnContinue.disabled = true;
}

// ─── 运行环境检测 ─────────────────────────────────────────────────────

async function runEnvCheck() {
  if (envState.checking) return envState.allPassed;
  envState.checking = true;
  
  try {
    // 调用后端进行环境检测
    const result = await window.mofoxAPI.envCheckAll();
    
    // 更新各检测项 UI
    updateCheckItem('python', result.checks.python);
    updateCheckItem('uv', result.checks.uv);
    updateCheckItem('git', result.checks.git);
    
    envState.results = result.checks;
    envState.allPassed = result.passed;
    
    // 显示结果摘要
    showSummary(result.passed, result.checks);
    
    // 启用按钮
    if (el.oobeBtnRecheck) el.oobeBtnRecheck.disabled = false;
    if (el.oobeBtnContinue) el.oobeBtnContinue.disabled = !result.passed;
    
    // 如果有未通过项，显示"一键安装"按钮
    if (!result.passed) {
      showAutoInstallButton(result.checks);
    }
    
    return result.passed;
  } catch (error) {
    console.error('环境检测失败:', error);
    showSummary(false, null, error.message);
    if (el.oobeBtnRecheck) el.oobeBtnRecheck.disabled = false;
    return false;
  } finally {
    envState.checking = false;
  }
}

// ─── 更新单个检测项 UI ────────────────────────────────────────────────

function updateCheckItem(name, checkResult) {
  const item = document.getElementById(`check-${name}`);
  const icon = item?.querySelector('.check-icon .material-symbols-rounded');
  const status = document.getElementById(`check-${name}-status`);
  const result = document.getElementById(`check-${name}-result`);
  
  if (!item || !icon || !status) return;
  
  // 停止旋转
  icon.classList.remove('spinning');
  
  if (checkResult.valid) {
    // 检测通过
    icon.textContent = 'check_circle';
    item.classList.add('passed');
    item.classList.remove('failed');
    status.textContent = `已安装: ${checkResult.version || '是'}`;
    if (result) {
      result.innerHTML = '<span class="material-symbols-rounded text-success">verified</span>';
    }
  } else {
    // 检测失败
    icon.textContent = 'cancel';
    item.classList.add('failed');
    item.classList.remove('passed');
    
    if (checkResult.installed) {
      status.textContent = `版本不符: ${checkResult.version} (需要 ${checkResult.requirement})`;
    } else {
      status.textContent = '未安装';
    }
    
    if (result) {
      result.innerHTML = '<span class="material-symbols-rounded text-error">error</span>';
    }
  }
}

// ─── 显示"一键安装"按钮 ──────────────────────────────────────────────

function showAutoInstallButton(checks) {
  const missing = [];
  if (!checks.python.valid) missing.push('Python');
  if (!checks.uv.valid)     missing.push('uv');
  if (!checks.git.valid)    missing.push('Git');

  if (missing.length > 0 && el.oobeBtnAutoInstall) {
    el.oobeBtnAutoInstall.style.display = '';
    const label = el.oobeBtnAutoInstall.querySelector('span:last-child');
    if (label) {
      label.textContent = `一键安装 (${missing.join(', ')})`;
    }
  }
}

// ─── 显示结果摘要 ─────────────────────────────────────────────────────

function showSummary(passed, checks, errorMessage = null) {
  el.envCheckSummary?.classList.remove('hidden');
  
  if (errorMessage) {
    // 检测出错
    if (el.summaryIcon) el.summaryIcon.innerHTML = '<span class="material-symbols-rounded text-error">error</span>';
    if (el.summaryTitle) el.summaryTitle.textContent = '检测失败';
    if (el.summaryDesc) el.summaryDesc.textContent = errorMessage;
    return;
  }
  
  if (passed) {
    // 全部通过
    if (el.summaryIcon) el.summaryIcon.innerHTML = '<span class="material-symbols-rounded text-success">check_circle</span>';
    if (el.summaryTitle) el.summaryTitle.textContent = '环境检测通过';
    if (el.summaryDesc) el.summaryDesc.textContent = '所有依赖项均已正确安装，您可以开始使用 Neo-MoFox。';
    el.envInstallHints?.classList.add('hidden');
  } else {
    // 部分失败
    if (el.summaryIcon) el.summaryIcon.innerHTML = '<span class="material-symbols-rounded text-warning">warning</span>';
    if (el.summaryTitle) el.summaryTitle.textContent = '缺少依赖项';
    if (el.summaryDesc) el.summaryDesc.textContent = '可点击下方「一键安装」自动下载并静默安装所有缺失依赖。';
    
    // 显示安装提示
    showInstallHints(checks);
  }
}

// ─── 显示安装提示 ─────────────────────────────────────────────────────

function showInstallHints(checks) {
  if (!checks) return;
  
  const hints = [];
  
  if (!checks.python.valid) {
    hints.push({
      name: 'Python',
      requirement: checks.python.requirement,
      hint: '将自动下载 Python 3.11 安装包并静默安装',
      installed: checks.python.installed,
      version: checks.python.version,
    });
  }
  
  if (!checks.uv.valid) {
    hints.push({
      name: 'uv',
      requirement: '已安装',
      hint: '将通过官方安装脚本自动安装',
    });
  }
  
  if (!checks.git.valid) {
    hints.push({
      name: 'Git',
      requirement: '已安装',
      hint: '将自动下载 Git 安装包并静默安装',
    });
  }
  
  if (hints.length === 0) {
    el.envInstallHints?.classList.add('hidden');
    return;
  }
  
  el.envInstallHints?.classList.remove('hidden');
  
  if (el.installHintsList) {
    el.installHintsList.innerHTML = hints.map(hint => `
      <div class="install-hint-item">
        <div class="hint-header">
          <span class="hint-name">${hint.name}</span>
          ${hint.installed ? `<span class="hint-version">当前: ${hint.version}</span>` : ''}
        </div>
        <div class="hint-body">
          <p>${hint.hint}</p>
        </div>
      </div>
    `).join('');
  }
}

// ─── 自动安装所有缺失依赖 ──────────────────────────────────────────────

async function autoInstallAll() {
  if (envState.installing) return;
  envState.installing = true;

  // 禁用按钮
  if (el.oobeBtnAutoInstall) {
    el.oobeBtnAutoInstall.disabled = true;
    const label = el.oobeBtnAutoInstall.querySelector('span:last-child');
    if (label) label.textContent = '安装中...';
  }
  if (el.oobeBtnRecheck) el.oobeBtnRecheck.disabled = true;

  // 显示安装进度区域
  el.envInstallHints?.classList.add('hidden');
  el.envInstallProgress?.classList.remove('hidden');
  if (el.installProgressLog) el.installProgressLog.textContent = '';
  if (el.installProgressBar) el.installProgressBar.style.width = '0%';
  if (el.installProgressTitle) el.installProgressTitle.textContent = '正在准备安装...';

  // 监听安装进度事件
  const progressHandler = (data) => {
    if (data.type === 'status' || data.type === 'installing') {
      if (el.installProgressTitle) {
        el.installProgressTitle.textContent = data.message || `正在安装 ${data.depName}...`;
      }
    }
    if (data.type === 'download' && data.percent != null) {
      if (el.installProgressBar) {
        el.installProgressBar.style.width = `${data.percent}%`;
      }
      if (data.message && el.installProgressTitle) {
        el.installProgressTitle.textContent = data.message;
      }
    }
    if (data.type === 'log' && data.message) {
      appendInstallLog(data.message);
    }
  };

  window.mofoxAPI.onEnvInstallProgress(progressHandler);

  try {
    // 调用主进程安装
    const installResult = await window.mofoxAPI.envInstallAllMissing(envState.results);

    if (el.installProgressBar) el.installProgressBar.style.width = '100%';

    if (installResult.success) {
      if (el.installProgressTitle) el.installProgressTitle.textContent = '所有依赖安装完成！';
      appendInstallLog('\n✅ 所有依赖安装完成，正在重新检测...\n');
    } else {
      // 部分失败
      const failedDeps = Object.entries(installResult.results || {})
        .filter(([, r]) => !r.success)
        .map(([name, r]) => `${name}: ${r.error}`)
        .join('\n');
      if (el.installProgressTitle) el.installProgressTitle.textContent = '部分依赖安装失败';
      appendInstallLog(`\n⚠️ 部分安装失败:\n${failedDeps}\n\n将重新检测当前状态...\n`);
    }

    // 安装完成后等一会再重新检测（让 PATH 刷新）
    await new Promise(r => setTimeout(r, 2000));

    // 重新检测
    el.envInstallProgress?.classList.add('hidden');
    if (el.oobeBtnAutoInstall) el.oobeBtnAutoInstall.style.display = 'none';
    resetCheckUI();
    await runEnvCheck();
  } catch (err) {
    console.error('自动安装失败:', err);
    if (el.installProgressTitle) el.installProgressTitle.textContent = '安装过程出错';
    appendInstallLog(`\n❌ 安装出错: ${err.message}\n`);
    if (el.oobeBtnRecheck) el.oobeBtnRecheck.disabled = false;
  } finally {
    envState.installing = false;
    if (el.oobeBtnAutoInstall) el.oobeBtnAutoInstall.disabled = false;
  }
}

function appendInstallLog(text) {
  if (!el.installProgressLog) return;
  el.installProgressLog.textContent += text;
  el.installProgressLog.scrollTop = el.installProgressLog.scrollHeight;
}

// ─── 事件绑定 ─────────────────────────────────────────────────────────

// 重新检测按钮
el.oobeBtnRecheck?.addEventListener('click', async () => {
  // 清除缓存并重新检测
  await window.mofoxAPI.envCheckClearCache();
  resetCheckUI();
  await runEnvCheck();
});

// 一键安装按钮
el.oobeBtnAutoInstall?.addEventListener('click', () => {
  autoInstallAll();
});

// 继续按钮
el.oobeBtnContinue?.addEventListener('click', () => {
  if (envState.allPassed) {
    hideEnvCheck();
  }
});
