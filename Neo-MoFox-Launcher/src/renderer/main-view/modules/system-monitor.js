// ─── System Resource Monitor (CPU / Memory) ─────────────────────────
// 每 2 秒轮询主进程获取 CPU 与内存使用率，通过环形进度条实时展示。

const POLL_INTERVAL = 2000; // ms

const cpuRing   = document.getElementById('cpu-ring');
const cpuValue  = document.getElementById('cpu-value');
const memRing   = document.getElementById('mem-ring');
const memValue  = document.getElementById('mem-value');
const memDetail = document.getElementById('mem-detail');

// SVG 圆环周长 = 2 * π * r (r = 15.9 ≈ 100)
const CIRCUMFERENCE = 100;

function setRing(circle, percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  circle.setAttribute('stroke-dasharray', `${clamped}, ${CIRCUMFERENCE}`);

  // 根据使用率动态着色
  circle.classList.remove('level-low', 'level-mid', 'level-high');
  if (clamped >= 85) {
    circle.classList.add('level-high');
  } else if (clamped >= 60) {
    circle.classList.add('level-mid');
  } else {
    circle.classList.add('level-low');
  }
}

async function refresh() {
  try {
    const data = await window.mofoxAPI.getResourceUsage();
    if (!data) return;

    setRing(cpuRing, data.cpuPercent);
    cpuValue.textContent = `${data.cpuPercent}%`;

    setRing(memRing, data.memPercent);
    memValue.textContent = `${data.memPercent}%`;
    memDetail.textContent = `内存 ${data.memUsedGB}/${data.memTotalGB} GB`;
  } catch (err) {
    console.warn('[SystemMonitor] 获取资源使用失败:', err);
  }
}

let _timer = null;

export function startSystemMonitor() {
  // 立即执行一次（首次 CPU 差值为 0，第二次才有意义）
  refresh();
  _timer = setInterval(refresh, POLL_INTERVAL);
}

export function stopSystemMonitor() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
