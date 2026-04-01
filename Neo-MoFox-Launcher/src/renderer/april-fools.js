// april-fools.js
(function() {
  const isAprilFools = new Date().getMonth() === 3 && new Date().getDate() === 1;
  // 方便测试，强制开启或者匹配到4月1日
  if (!isAprilFools && localStorage.getItem('force-april-fools') !== 'true') return;
  // 如果用户按下了快捷键，则禁用
  if (localStorage.getItem('disable-april-fools') === 'true') return;

  console.log("April Fools Easter Egg Activated!");

  // 1. 镜像/倒转 UI 
  // 结合倒转和镜像，实现完全的“异世界”感，同时加一个过渡动画
  document.body.style.transform = "rotate(180deg) scaleX(-1)";
  document.body.style.transition = "transform 2s ease-in-out";

  // 2. 搞怪字体强制覆盖
  const style = document.createElement('style');
  style.innerHTML = `
    * {
      font-family: "Comic Sans MS", "Comic Sans", "华文彩云", cursive !important;
    }
  `;
  document.head.appendChild(style);

  // 3. 幽默文字替换
  const textReplacements = [
    { from: /启动/g, to: '开始修Bug' },
    { from: /设置/g, to: '格式化C盘' },
    { from: /实例/g, to: '定时炸弹' },
    { from: /Neo-MoFox/gi, to: 'Old-DogFox' },
    { from: /删除/g, to: '准备跑路' },
    { from: /保存/g, to: '祈祷不报错' }
  ];

  const replaceText = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent;
      let newText = text;
      textReplacements.forEach(r => {
        newText = newText.replace(r.from, r.to);
      });
      if (newText !== text) {
        node.textContent = newText;
      }
    } else {
      for (let child of node.childNodes) {
        replaceText(child);
      }
    }
  };
  
  // 定时执行替换，覆盖动态加载的元素
  setInterval(() => replaceText(document.body), 1000);

  // 4. 逃跑的按钮
  const makeButtonsEscape = () => {
    // 针对启动按钮、保存按钮等重要按钮
    const buttons = document.querySelectorAll('.start-button, #btn-add-instance, #btn-save-instance');
    buttons.forEach(btn => {
      // 避免重复绑定
      if (btn.dataset.aprilFool) return;
      btn.dataset.aprilFool = "true";
      
      btn.addEventListener('mouseenter', (e) => {
        if (localStorage.getItem('disable-april-fools') === 'true') return;
        // 随机移动到一个新位置
        const maxX = window.innerWidth - btn.clientWidth - 20;
        const maxY = window.innerHeight - btn.clientHeight - 20;
        const x = Math.max(20, Math.random() * maxX);
        const y = Math.max(20, Math.random() * maxY);
        
        btn.style.position = 'fixed';
        btn.style.left = `${x}px`;
        btn.style.top = `${y}px`;
        btn.style.zIndex = '9999';
        btn.style.transition = 'all 0.2s ease-out';
      });
    });
  };

  setInterval(makeButtonsEscape, 1000);

  // 5. 快捷键关闭 (连按3次 q)
  let qCount = 0;
  let qTimeout;
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'q') {
      qCount++;
      if (qCount >= 3) {
        localStorage.setItem('disable-april-fools', 'true');
        alert("🎉 愚人节快乐！彩蛋已解除，这就为你恢复正常！");
        location.reload();
      }
      clearTimeout(qTimeout);
      qTimeout = setTimeout(() => { qCount = 0; }, 500); // 500ms 内连按才有效
    } else {
      qCount = 0; // 按了别的键就重置
    }
  });

  // 提示用户如何关闭
  setTimeout(() => {
    const tip = document.createElement('div');
    tip.style.position = 'fixed';
    tip.style.bottom = '20px';
    tip.style.right = '20px';
    tip.style.background = 'rgba(255, 64, 129, 0.9)';
    tip.style.color = '#fff';
    tip.style.padding = '10px 20px';
    tip.style.borderRadius = '8px';
    tip.style.zIndex = '10000';
    tip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    tip.style.fontFamily = 'sans-serif'; // 保证这句能看清
    tip.innerText = '💡 愚人节彩蛋已开启！连按 3 次 Q 退出';
    
    // 如果整体旋转了，把提示正过来
    tip.style.transform = "rotate(180deg) scaleX(-1)";
    
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 8000);
  }, 2500);

})();
