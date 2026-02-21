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

export function updateQuotes() {
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  el.quoteText.textContent = quote.text;
  el.quoteAuthor.textContent = `— ${quote.author}`;
}
