// ─── Main Entry Point - Redirect to Main View ────────────────────────

// 自动重定向到主界面
window.location.href = 'main-view/index.html';

// ─── Window Controls ──────────────────────────────────────────────────

el.btnMinimize.addEventListener('click', () => window.mofoxAPI.windowMinimize());
el.btnMaximize.addEventListener('click', () => window.mofoxAPI.windowMaximize());
el.btnClose.addEventListener('click', () => window.mofoxAPI.windowClose());

// ─── Project Actions ──────────────────────────────────────────────────

el.btnSelectPath.addEventListener('click', async () => {
  const path = await window.mofoxAPI.selectProjectPath();
  if (path) updateProjectInfo();
});

el.btnOpenFolder.addEventListener('click', () => window.mofoxAPI.openProjectFolder());
el.btnGithub.addEventListener('click', () => window.mofoxAPI.openGithub());

// ─── Process Controls ─────────────────────────────────────────────────

el.btnStart.addEventListener('click', () => window.mofoxAPI.startMofox());
el.btnStop.addEventListener('click', () => window.mofoxAPI.stopMofox());
el.btnRestart.addEventListener('click', () => window.mofoxAPI.restartMofox());

// ─── Log Controls ─────────────────────────────────────────────────────

el.btnAutoScroll.addEventListener('click', () => {
  state.autoScroll = !state.autoScroll;
  el.btnAutoScroll.style.color = state.autoScroll ? '#fff' : '#666';
});

el.btnClearLogs.addEventListener('click', () => {
  state.logs = [];
  window.mofoxAPI.clearLogs();
  renderLogs();
});

el.btnSearchLogs.addEventListener('click', () => {
  el.logSearchBar.classList.remove('hidden');
  el.logSearchInput.focus();
});

el.btnCloseSearch.addEventListener('click', () => {
  el.logSearchBar.classList.add('hidden');
  state.searchQuery = '';
  el.logSearchInput.value = '';
  renderLogs();
});

el.logSearchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value.toLowerCase();
  renderLogs();
});

el.filterChips.forEach(chip => {
  chip.addEventListener('click', () => {
    el.filterChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.filter = chip.dataset.filter;
    renderLogs();
  });
});
