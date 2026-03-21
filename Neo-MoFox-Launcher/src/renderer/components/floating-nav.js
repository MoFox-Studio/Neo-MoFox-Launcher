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

  // 设置页面内部 tab 项
  const SETTINGS_TABS = [
    { id: 'appearance', icon: 'palette',     label: '外观',   section: 'section-appearance' },
    { id: 'general',    icon: 'tune',        label: '通用',   section: 'section-general' },
    { id: 'logs',       icon: 'description', label: '日志',   section: 'section-logs' },
    { id: 'about',      icon: 'info',        label: '关于',   section: 'section-about' },
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

  if (isSettingsPage) {
    // 设置页面：左侧返回首页按钮 + 分隔线 + 设置 tab 切换
    const homeBtn = document.createElement('button');
    homeBtn.className = 'floating-nav-item';
    homeBtn.title = '返回首页';
    const homeIcon = document.createElement('span');
    homeIcon.className = 'material-symbols-rounded';
    homeIcon.textContent = 'home';
    homeBtn.appendChild(homeIcon);
    homeBtn.addEventListener('click', () => {
      window.location.href = '../main-view/index.html';
    });
    track.appendChild(homeBtn);

    // 分隔线
    const divider = document.createElement('div');
    divider.className = 'floating-nav-divider';
    track.appendChild(divider);

    // 设置页面的 tab 按钮
    SETTINGS_TABS.forEach((tab, idx) => {
      const btn = document.createElement('button');
      btn.className = 'floating-nav-item' + (idx === 0 ? ' active' : '');
      btn.setAttribute('data-section', tab.id);
      btn.title = tab.label;

      const icon = document.createElement('span');
      icon.className = 'material-symbols-rounded';
      icon.textContent = tab.icon;

      const label = document.createElement('span');
      label.className = 'floating-nav-label';
      label.textContent = tab.label;

      btn.appendChild(icon);
      btn.appendChild(label);

      btn.addEventListener('click', () => {
        // 切换 tab
        track.querySelectorAll('.floating-nav-item[data-section]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // 切换 section 可见性
        document.querySelectorAll('.settings-section').forEach(s => {
          s.classList.toggle('active', s.id === tab.section);
        });
      });

      track.appendChild(btn);
    });

  } else {
    // 其他页面：全局导航
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
  }

  nav.appendChild(track);
  document.body.appendChild(nav);
})();
