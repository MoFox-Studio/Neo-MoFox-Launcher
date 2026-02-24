import { el } from './elements.js';

// ─── Quotes ───────────────────────────────────────────────────────────

export const quotes = [
  { text: "代码是写给人看的，附带能在机器上运行。", author: "Harold Abelson" },
  { text: "任何足够先进的技术都与魔法无异。", author: "Arthur C. Clarke" },
  { text: "Simple is better than complex.", author: "The Zen of Python" },
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { text: "Don't repeat yourself.", author: "Pragmatic Programmer" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Code never lies, comments sometimes do.", author: "Ron Jeffries" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "The best error message is the one that never shows up.", author: "Thomas Fuchs" },
];

// ─── 🌙 午夜彩蛋名言（凌晨 0:00 ~ 5:00 专属） ──────────────────────────
const midnightQuotes = [
  { text: "该睡觉了，别卷了。", author: "MoFox" },
  { text: "凌晨写代码，Bug 翻倍。", author: "古训" },
  { text: "你的眼袋比你的代码还重。", author: "镜子" },
  { text: "现在关电脑，明天多写十行。", author: "生物钟" },
  { text: "夜深了，连 CPU 都想休息了。", author: "你的电脑" },
  { text: "最好的代码是睡饱后写的代码。", author: "MoFox 夜间广播" },
  { text: "凌晨的灵感 90% 是幻觉。", author: "经验之谈" },
  { text: "别熬了，头发比 Feature 更重要。", author: "过来人" },
];

/**
 * 判断当前是否处于午夜时段（0:00 ~ 4:59）
 */
function isMidnight() {
  const hour = new Date().getHours();
  return hour >= 0 && hour < 5;
}

export function updateQuotes() {
  // 午夜时段有 40% 概率从彩蛋名言池中选取
  const useMidnight = isMidnight() && Math.random() < 0.4;
  const pool = useMidnight ? midnightQuotes : quotes;
  const quote = pool[Math.floor(Math.random() * pool.length)];
  el.quoteText.textContent = quote.text;
  el.quoteAuthor.textContent = `— ${quote.author}`;
}
