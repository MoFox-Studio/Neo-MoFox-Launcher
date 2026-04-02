// ═══ April Fool — Ransomware UI Script ═══

// ── 日期显示 ──
function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── Countdown 1：照片上传截止（1小时） ──
const DURATION_MS = 60 * 60 * 1000;
const endTime = Date.now() + DURATION_MS;

// ── Countdown 2：脑前叶切除（3小时） ──
const endTime2 = Date.now() + 3 * 60 * 60 * 1000;

// 设置日期显示
document.getElementById('deadline-date') && (document.getElementById('deadline-date').textContent = fmtDate(endTime));
document.getElementById('op-date') && (document.getElementById('op-date').textContent = fmtDate(endTime2));

const elH = document.getElementById('cd-h');
const elM = document.getElementById('cd-m');
const elS = document.getElementById('cd-s');
const el2H = document.getElementById('cd2-h');
const el2M = document.getElementById('cd2-m');
const el2S = document.getElementById('cd2-s');

function pad(n) { return String(n).padStart(2, '0'); }

function updateCd() {
  const left = Math.max(0, endTime - Date.now());
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  if (elS && elS.textContent !== pad(s)) flipNum(elS, pad(s));
  if (elM && elM.textContent !== pad(m)) flipNum(elM, pad(m));
  if (elH && elH.textContent !== pad(h)) flipNum(elH, pad(h));

  const left2 = Math.max(0, endTime2 - Date.now());
  const h2 = Math.floor(left2 / 3600000);
  const m2 = Math.floor((left2 % 3600000) / 60000);
  const s2 = Math.floor((left2 % 60000) / 1000);
  if (el2S && el2S.textContent !== pad(s2)) flipNum(el2S, pad(s2));
  if (el2M && el2M.textContent !== pad(m2)) flipNum(el2M, pad(m2));
  if (el2H && el2H.textContent !== pad(h2)) flipNum(el2H, pad(h2));

  if (left === 0) {
    clearInterval(cdInterval);
    triggerKillEffect();
  }
}

function flipNum(el, val) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.textContent = val;
  el.style.animation = 'cd-flip 0.25s cubic-bezier(0.2,0,0,1)';
}

const cdInterval = setInterval(updateCd, 1000);
updateCd();

// ── File input label ──
document.getElementById('photo-input').addEventListener('change', function () {
  const hint = document.getElementById('file-name');
  if (this.files.length > 0) {
    hint.textContent = this.files[0].name;
    hint.style.color = '#333';
    setTimeout(() => {
      hint.textContent = '✓ 审核中... 请等待密钥';
      hint.style.color = '#b71c1c';
    }, 1200);
  }
});

// ── Upload button ──
const uploadBtn = document.getElementById('upload-btn');
if (uploadBtn) {
  uploadBtn.addEventListener('click', function () {
    document.getElementById('photo-input').click();
  });
}

// ── Unlock button ──
document.getElementById('unlock-btn').addEventListener('click', function () {
  const val = document.getElementById('key-input').value.trim();
  if (!val) {
    shakeInput();
    return;
  }
  document.getElementById('success-dialog').classList.remove('hidden');
});

document.getElementById('key-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') document.getElementById('unlock-btn').click();
});

function shakeInput() {
  const el = document.getElementById('key-input');
  el.style.outline = '2px solid #b71c1c';
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake-x 0.4s ease';
  setTimeout(() => { el.style.outline = ''; el.style.animation = ''; }, 500);
}

// ── Kill effect ──
function triggerKillEffect() {
  showToast('⚠️ 正在对后端进程执行「脑前叶切除手术」... 请勿关闭页面');
  const flash = document.createElement('div');
  flash.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(183,28,28,0.6);animation:fade-in 0.3s ease,fade-out 0.8s 0.3s ease forwards;pointer-events:none;`;
  document.body.appendChild(flash);
}

// ── wc-link chaos ──
const chaosMessages = [
  '错误：菜单索引失联，正在...尝试...重建...',
  '提示：此功能已被「高阶加密」，请先缴纳女装照片',
  '警告：WatchDog 拒绝响应，情绪不稳定',
  '系统：找不到功能，但是找到了「混乱」',
  '日志系统：Lorem ipsum dolor sit amet... 啊不对',
];
let chaosIdx = 0;

document.querySelectorAll('.wc-link').forEach(link => {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    return;
  }
  // Any non-empty key "works" — it's a joke
  document.getElementById('success-dialog').classList.remove('hidden');
});

document.getElementById('key-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') document.getElementById('unlock-btn').click();
});

function shakeInput() {
  const el = document.getElementById('key-input');
  el.style.borderColor = 'var(--color-error)';
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake-x 0.4s ease';
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.animation = '';
  }, 500);
}

// ── Kill effect (countdown zero) ──
function triggerKillEffect() {
  const footer = document.querySelector('.warning-footer p');
  footer.innerHTML = '⚠️ 正在对后端进程执行「脑前叶切除手术」... <strong>请勿关闭页面</strong>';
  document.body.style.animation = 'none';
  // red flash
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(186,26,26,0.6);
    animation:fade-in 0.3s ease,fade-out 0.8s 0.3s ease forwards;
    pointer-events:none;
  `;
  document.body.appendChild(flash);
}

// ── Nav chaos: click any nav button shows a confused toast ──
const chaosMessages = [
  '错误：菜单索引失联，正在...尝试...重建...',
  '提示：此功能已被「高阶加密」，请先缴纳女装照片',
  '警告：WatchDog 拒绝响应，情绪不稳定',
  '系统：找不到「设置」，但是找到了「混乱」',
  '日志系统：Lorem ipsum dolor sit amet... 啊不对',
];
let chaosIdx = 0;

document.querySelectorAll('.wc-link').forEach(link => {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    showToast(chaosMessages[chaosIdx % chaosMessages.length]);
    chaosIdx++;
  });
});

function showToast(msg) {
  let toast = document.getElementById('chaos-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'chaos-toast';
    toast.style.cssText = `
      position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(0);
      background:#2b2930;border:1px solid rgba(208,188,255,0.2);
      color:#cac4d0;border-radius:28px;padding:12px 22px;font-size:13px;
      z-index:9000;max-width:480px;text-align:center;
      box-shadow:0 4px 24px rgba(0,0,0,0.5);
      transition:opacity 0.3s,transform 0.3s;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(8px)';
  }, 3000);
}

// ── Background canvas: floating binary/lock particles ──
(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  const chars = ['0','1','🔒','?','!','#','$','%'];
  const particles = [];
  const COUNT = 60;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vy: 0.3 + Math.random() * 0.5,
      char: chars[Math.floor(Math.random() * chars.length)],
      size: 10 + Math.random() * 10,
      alpha: 0.1 + Math.random() * 0.25,
      color: Math.random() > 0.5 ? '#ffb4ab' : '#d0bcff',
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.font = `${p.size}px monospace`;
      ctx.fillText(p.char, p.x, p.y);
      p.y += p.vy;
      if (p.y > canvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
      }
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── Extra CSS keyframes injected via JS (shake-x, fade-out) ──
const extraStyles = document.createElement('style');
extraStyles.textContent = `
  @keyframes shake-x {
    0%,100% { transform: translateX(0); }
    20%      { transform: translateX(-6px); }
    40%      { transform: translateX(6px); }
    60%      { transform: translateX(-4px); }
    80%      { transform: translateX(4px); }
  }
  @keyframes fade-out {
    to { opacity: 0; }
  }
`;
document.head.appendChild(extraStyles);
