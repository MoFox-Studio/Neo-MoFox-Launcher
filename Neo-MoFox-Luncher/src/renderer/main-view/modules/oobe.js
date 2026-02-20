import { el } from './elements.js';

// ─── 环境检测状态 ─────────────────────────────────────────────────────

const envState = {
  checking: false,
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
  
  // 隐藏摘要和提示
  el.envCheckSummary?.classList.add('hidden');
  el.envInstallHints?.classList.add('hidden');
  
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
    if (el.summaryDesc) el.summaryDesc.textContent = '请安装以下缺失的依赖项后重新检测。';
    
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
      hint: '请从 <a href="https://www.python.org/downloads/" target="_blank">python.org</a> 下载并安装 Python 3.11 或更高版本',
      installed: checks.python.installed,
      version: checks.python.version,
    });
  }
  
  if (!checks.uv.valid) {
    hints.push({
      name: 'uv',
      requirement: '已安装',
      hint: '在终端运行: <code>pip install uv</code>',
      command: 'pip install uv',
    });
  }
  
  if (!checks.git.valid) {
    hints.push({
      name: 'Git',
      requirement: '已安装',
      hint: '请从 <a href="https://git-scm.com/downloads" target="_blank">git-scm.com</a> 下载并安装 Git',
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
          ${hint.command ? `<div class="hint-command"><code>${hint.command}</code></div>` : ''}
        </div>
      </div>
    `).join('');
  }
}

// ─── 事件绑定 ─────────────────────────────────────────────────────────

// 重新检测按钮
el.oobeBtnRecheck?.addEventListener('click', async () => {
  // 清除缓存并重新检测
  await window.mofoxAPI.envCheckClearCache();
  resetCheckUI();
  await runEnvCheck();
});

// 继续按钮
el.oobeBtnContinue?.addEventListener('click', () => {
  if (envState.allPassed) {
    hideEnvCheck();
  }
});
