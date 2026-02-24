// ─── 🎉 节日专属问候语彩蛋 ──────────────────────────────────────────────

/**
 * 节日问候语表：按月-日匹配
 * 每个条目可包含 title（主标题）和 subtitle（副标题）
 */
const holidayGreetings = [
  // 元旦
  { month: 1, day: 1,  title: '新年快乐！', subtitle: '新的一年，新的代码！' },
  // 情人节
  { month: 2, day: 14, title: '情人节快乐', subtitle: '愿你和你的代码永远甜蜜。' },
  // 妇女节
  { month: 3, day: 8,  title: '女神节快乐', subtitle: '致每一位了不起的她。' },
  // 愚人节
  { month: 4, day: 1,  title: '今天的 Bug 都是 Feature', subtitle: '愚人节快乐！不信你看 console。' },
  // 劳动节
  { month: 5, day: 1,  title: '劳动节快乐', subtitle: '今天，连代码都该放个假。' },
  // 儿童节
  { month: 6, day: 1,  title: '六一快乐', subtitle: '写代码的你，依然是个孩子。' },
  // 程序员节（1024）
  { month: 10, day: 24, title: '1024 程序员节快乐', subtitle: '今天你就是世界的主角。' },
  // 万圣节
  { month: 10, day: 31, title: 'Happy Halloween', subtitle: 'Bug 比鬼还可怕。' },
  // 平安夜
  { month: 12, day: 24, title: '平安夜快乐', subtitle: '愿你的代码零 Warning。' },
  // 圣诞节
  { month: 12, day: 25, title: 'Merry Christmas', subtitle: '圣诞老人给你带来了零 Bug 的礼物。' },
  // 跨年夜
  { month: 12, day: 31, title: '跨年倒计时', subtitle: '感谢这一年的陪伴。' },
];

/**
 * 时段问候语（非节日时根据当前时间段展示）
 */
const timeGreetings = [
  { start: 5,  end: 8,  title: '早上好',       subtitle: '新的一天，从一杯咖啡开始。' },
  { start: 8,  end: 12, title: '上午好',       subtitle: '准备好创造什么了吗？' },
  { start: 12, end: 14, title: '中午好',       subtitle: '吃饱了才有力气写代码。' },
  { start: 14, end: 18, title: '下午好',       subtitle: '准备好创造什么了吗？' },
  { start: 18, end: 22, title: '晚上好',       subtitle: '夜间模式已就绪。' },
  { start: 22, end: 24, title: '夜深了',       subtitle: '早点休息，明天继续。' },
  { start: 0,  end: 5,  title: '夜猫子你好',   subtitle: '这么晚了还在肝？' },
];

/**
 * 获取当前的问候语
 * 节日优先，否则按时间段返回
 */
export function getGreeting() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hour = now.getHours();

  // 检查是否匹配节日
  const holiday = holidayGreetings.find(h => h.month === month && h.day === day);
  if (holiday) {
    return { title: holiday.title, subtitle: holiday.subtitle };
  }

  // 按时间段匹配
  const timeSlot = timeGreetings.find(t => hour >= t.start && hour < t.end);
  if (timeSlot) {
    return { title: timeSlot.title, subtitle: timeSlot.subtitle };
  }

  // 兜底
  return { title: '欢迎回来', subtitle: '准备好创造什么了吗？' };
}

/**
 * 应用问候语到 Hero 区域
 */
export function applyGreeting() {
  const { title, subtitle } = getGreeting();
  const h1 = document.querySelector('.hero-greeting h1');
  const p = document.querySelector('.hero-greeting p');
  if (h1) h1.textContent = title;
  if (p) p.textContent = subtitle;
}
