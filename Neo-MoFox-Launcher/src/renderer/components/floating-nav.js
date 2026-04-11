/**
 * floating-nav.js - 全局悬浮底栏导航组件
 * 自动注入悬浮底栏 HTML，并根据当前页面高亮对应导航项
 * 设置页面额外支持 tab 切换（外观/通用/关于）
 */
(function () {
  const NAV_ITEMS = [
    { id: 'home',        icon: 'home',         label: '首页',     href: '../main-view/index.html',           match: 'main-view' },
    { id: 'environment', icon: 'build_circle',  label: '环境管理', href: '../environment-view/index.html',    match: 'environment-view' },
    { id: 'settings',    icon: 'settings',      label: '设置',     href: '../settings-view/settings.html',    match: 'settings-view' },
  ];

  

  // 检测当前激活页面
  const currentPath = window.location.pathname.replace(/\\/g, '/');
  function isActive(match) {
    return currentPath.includes(match);
  }

  const isSettingsPage = isActive('settings-view');

  // 构建 HTML
  const nav = document.createElement('nav');
  nav.className = 'floating-nav';
  nav.setAttribute('aria-label', '全局导航');

  const track = document.createElement('div');
  track.className = 'floating-nav-track';

  // 所有页面统一使用全局导航
  NAV_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'floating-nav-item' + (isActive(item.match) ? ' active' : '');
    btn.setAttribute('data-nav', item.id);
    btn.title = item.label;

    const icon = document.createElement('span');
    icon.className = 'material-symbols-rounded';
    icon.textContent = item.icon;

    const label = document.createElement('span');
    label.className = 'floating-nav-label';
    label.textContent = item.label;

    btn.appendChild(icon);
    btn.appendChild(label);

    btn.addEventListener('click', () => {
      if (!isActive(item.match)) {
        window.location.href = item.href;
      }
    });

    track.appendChild(btn);
  });

  nav.appendChild(track);
  document.body.appendChild(nav);
})();
