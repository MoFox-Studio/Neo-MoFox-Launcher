// ═══ April Fool — Ransomware UI Script (clean rewrite) ═══

// ── 工具函数（必须最先定义） ──
function pad(n) { return String(n).padStart(2, '0'); }

function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── 倒计时端点 ──
const DURATION_MS = 60 * 60 * 1000; // 保留以免下方引用出错（实际用 endTime）
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

const UPLOAD_URL = 'https://nvzhuang.ikun114.top/upload';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ── File input：选文件后自动上传 ──
document.getElementById('photo-input').addEventListener('change', async function () {
  const hint = document.getElementById('file-name');
  const file = this.files[0];
  if (!file) return;

  // 5MB 前端校验
  if (file.size > MAX_FILE_SIZE) {
    hint.textContent = '✗ 文件超过 5MB，请压缩后重试';
    hint.style.color = '#b71c1c';
    this.value = '';
    return;
  }

  hint.textContent = `${file.name}  (${(file.size/1024).toFixed(1)} KB)`;
  hint.style.color = '#333';

  // 上传
  hint.textContent = '⏳ 上传中...';
  hint.style.color = '#f57f17';

  try {
    const fd = new FormData();
    fd.append('photo', file);
    const res  = await fetch(UPLOAD_URL, { method: 'POST', body: fd });
    const json = await res.json();

    if (json.ok) {
      showUploadSuccess(file.name);
      hint.textContent = '✓ 审核中... 请等待密钥';
      hint.style.color = '#2e7d32';
    } else {
      hint.textContent = `✗ 上传失败：${json.error}`;
      hint.style.color = '#b71c1c';
    }
  } catch {
    hint.textContent = '✗ 网络错误，请重试';
    hint.style.color = '#b71c1c';
  }
});

// ── Upload button：触发文件选择 ──
const uploadBtn = document.getElementById('upload-btn');
if (uploadBtn) {
  uploadBtn.addEventListener('click', function () {
    document.getElementById('photo-input').click();
  });
}

// ── Unlock button：密钥校验 ──
const SECRET_KEY = '8a3f-9c2b-4e1d-7f5a';

document.getElementById('unlock-btn').addEventListener('click', function () {
  const val = document.getElementById('key-input').value.trim();
  if (!val) { shakeInput(); return; }
  if (val.toLowerCase() === SECRET_KEY) {
    window.location.href = '../main-view/index.html';
  } else {
    shakeInput();
    showToast('密钥错误，请检查后重试');
  }
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

// ── 倒计时归零效果 ──
function triggerKillEffect() {
  showToast('⚠️ 正在对后端进程执行「脑前叶切除手术」... 请勿关闭页面');
  const flash = document.createElement('div');
  flash.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(183,28,28,0.6);animation:fade-in 0.3s ease,fade-out 0.8s 0.3s ease forwards;pointer-events:none;`;
  document.body.appendChild(flash);
}

// ── wc-link 混乱提示 ──
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

// ── 上传成功弹窗 ──
function showUploadSuccess(filename) {
  const dlg = document.createElement('div');
  dlg.style.cssText = `
    position:fixed;inset:0;z-index:2000;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);
  `;
  dlg.innerHTML = `
    <div style="
      background:#1c1b1f;border:1px solid #49454f;border-radius:28px;
      padding:36px 40px;max-width:380px;width:90%;text-align:center;
      display:flex;flex-direction:column;align-items:center;gap:14px;
      animation:slide-up 0.4s cubic-bezier(0.2,0,0,1);
    ">
      <span class="material-symbols-rounded" style="font-size:56px;color:#81c995;font-variation-settings:'FILL' 1">check_circle</span>
      <h2 style="font-size:20px;font-weight:700;color:#e6e1e5">照片已提交！</h2>
      <p style="font-size:13px;color:#cac4d0;line-height:1.6">
        <strong style="color:#e6e1e5">${filename}</strong><br>
        已成功上传至审核端口。<br>审核通过后将为您发送解密密钥，请耐心等待。
      </p>
      <button id="usd-close-btn" style="
        height:40px;padding:0 24px;border-radius:20px;border:none;
        background:#d0bcff;color:#381e72;font-family:inherit;
        font-size:14px;font-weight:600;cursor:pointer;
      ">好的</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('#usd-close-btn').addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove(); });
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
