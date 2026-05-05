'use strict';

/**
 * 轻量级 TUI 工具（无外部依赖）
 *
 * 提供：
 *   - selectMenu({ title, items, footer })       上下方向键 + Enter
 *   - confirm({ title, message, defaultYes })    左右方向键 + Enter（确定/取消）
 *   - inputBox({ title, prompt, defaultValue, validator, mask })
 *                                                单行文本输入（支持密码 mask）
 *   - form({ title, fields })                    多字段表单：上下切换字段，Enter 编辑
 *
 * 所有交互均使用 ANSI 转义在备用屏幕缓冲区内绘制，退出时还原终端。
 */

// ─── ANSI 与终端控制 ─────────────────────────────────────────────────────

const ESC = '\x1b';
const CSI = ESC + '[';

const ANSI = {
  reset: CSI + '0m',
  bold: CSI + '1m',
  dim: CSI + '2m',
  invert: CSI + '7m',
  fgRed: CSI + '31m',
  fgGreen: CSI + '32m',
  fgYellow: CSI + '33m',
  fgBlue: CSI + '34m',
  fgMagenta: CSI + '35m',
  fgCyan: CSI + '36m',
  fgWhite: CSI + '37m',
  bgBlue: CSI + '44m',
  bgCyan: CSI + '46m',
  hideCursor: CSI + '?25l',
  showCursor: CSI + '?25h',
  altScreenOn: CSI + '?1049h',
  altScreenOff: CSI + '?1049l',
  clear: CSI + '2J',
  home: CSI + 'H',
  saveCursor: ESC + '7',
  restoreCursor: ESC + '8',
};

function moveCursor(row, col) {
  return `${CSI}${row};${col}H`;
}

function isTTY() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** 简单地估计字符显示宽度（中文/全角占 2，其他占 1） */
function strWidth(s) {
  if (!s) return 0;
  let w = 0;
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    if (code >= 0x1100 && (
      code <= 0x115f ||
      (code >= 0x2e80 && code <= 0x303e) ||
      (code >= 0x3041 && code <= 0x33ff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xa000 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff)
    )) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function padToWidth(s, width, ch = ' ') {
  const w = strWidth(s);
  if (w >= width) return s;
  return s + ch.repeat(width - w);
}

// ─── 屏幕管理 ────────────────────────────────────────────────────────────

class Screen {
  constructor() {
    this._active = false;
    this._keyHandler = null;
  }

  enter() {
    if (this._active) return;
    if (!isTTY()) {
      throw new Error('TUI 需要交互式终端 (TTY)');
    }
    this._active = true;
    process.stdout.write(ANSI.altScreenOn + ANSI.hideCursor + ANSI.clear + ANSI.home);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', this._onData.bind(this));
  }

  leave() {
    if (!this._active) return;
    this._active = false;
    process.stdin.removeAllListeners('data');
    try { process.stdin.setRawMode(false); } catch (_) { /* ignore */ }
    process.stdin.pause();
    process.stdout.write(ANSI.showCursor + ANSI.altScreenOff);
  }

  _onData(chunk) {
    const keys = parseKeys(chunk);
    for (const k of keys) {
      if (k === 'C-c') {
        this.leave();
        process.exit(130);
      }
      if (this._keyHandler) this._keyHandler(k);
    }
  }

  setKeyHandler(fn) { this._keyHandler = fn; }

  size() {
    return {
      rows: process.stdout.rows || 24,
      cols: process.stdout.columns || 80,
    };
  }
}

const screen = new Screen();

/** 解析终端输入序列为按键字符串 */
function parseKeys(chunk) {
  const out = [];
  let i = 0;
  const s = chunk.toString();
  while (i < s.length) {
    const c = s[i];
    if (c === '\x03') { out.push('C-c'); i++; continue; }
    if (c === '\x04') { out.push('C-d'); i++; continue; }
    if (c === '\r' || c === '\n') { out.push('enter'); i++; continue; }
    if (c === '\t') { out.push('tab'); i++; continue; }
    if (c === '\x7f' || c === '\b') { out.push('backspace'); i++; continue; }
    if (c === '\x1b') {
      // ESC 序列
      if (s[i + 1] === '[' || s[i + 1] === 'O') {
        const seq = s.slice(i, i + 3);
        if (seq.endsWith('A')) { out.push('up'); i += 3; continue; }
        if (seq.endsWith('B')) { out.push('down'); i += 3; continue; }
        if (seq.endsWith('C')) { out.push('right'); i += 3; continue; }
        if (seq.endsWith('D')) { out.push('left'); i += 3; continue; }
        if (seq.endsWith('H')) { out.push('home'); i += 3; continue; }
        if (seq.endsWith('F')) { out.push('end'); i += 3; continue; }
        // 其他 CSI，吃完到字母为止
        let j = i + 2;
        while (j < s.length && !/[A-Za-z~]/.test(s[j])) j++;
        i = j + 1;
        continue;
      }
      // 单独 ESC
      out.push('esc'); i++; continue;
    }
    out.push(c); i++;
  }
  return out;
}

// ─── 绘制工具 ────────────────────────────────────────────────────────────

const BORDER = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
  ml: '├', mr: '┤',
};

function drawBox({ row, col, width, height, title }) {
  const out = [];
  // 顶部
  let top = BORDER.tl + BORDER.h.repeat(width - 2) + BORDER.tr;
  if (title) {
    const t = ` ${title} `;
    const tw = strWidth(t);
    if (tw < width - 2) {
      const left = Math.floor((width - 2 - tw) / 2);
      top = BORDER.tl + BORDER.h.repeat(left) + t + BORDER.h.repeat(width - 2 - left - tw) + BORDER.tr;
    }
  }
  out.push(moveCursor(row, col) + ANSI.fgCyan + top + ANSI.reset);
  for (let i = 1; i < height - 1; i++) {
    out.push(moveCursor(row + i, col) + ANSI.fgCyan + BORDER.v + ANSI.reset
      + ' '.repeat(width - 2)
      + ANSI.fgCyan + BORDER.v + ANSI.reset);
  }
  out.push(moveCursor(row + height - 1, col)
    + ANSI.fgCyan + BORDER.bl + BORDER.h.repeat(width - 2) + BORDER.br + ANSI.reset);
  process.stdout.write(out.join(''));
}

function writeAt(row, col, text) {
  process.stdout.write(moveCursor(row, col) + text);
}

function clearScreen() {
  process.stdout.write(ANSI.clear + ANSI.home);
}

// ─── selectMenu ─────────────────────────────────────────────────────────

function selectMenu({ title = '请选择', items, footer = '↑/↓ 选择   Enter 确定   Esc 取消' }) {
  if (!Array.isArray(items) || items.length === 0) {
    return Promise.resolve(null);
  }
  const normalized = items.map((it, idx) => {
    if (typeof it === 'string') return { label: it, value: it, disabled: false };
    return {
      label: String(it.label ?? it.value ?? `选项 ${idx + 1}`),
      value: it.value !== undefined ? it.value : it.label,
      description: it.description || '',
      disabled: !!it.disabled,
    };
  });

  return new Promise((resolve) => {
    let cursor = normalized.findIndex(i => !i.disabled);
    if (cursor < 0) cursor = 0;

    screen.enter();

    const render = () => {
      const { rows, cols } = screen.size();
      const maxLabelW = Math.max(...normalized.map(i => strWidth(i.label)));
      const width = Math.min(cols - 2, Math.max(strWidth(title) + 8, maxLabelW + 10, 50));
      const height = Math.min(rows - 2, normalized.length + 6);
      const row0 = Math.max(1, Math.floor((rows - height) / 2));
      const col0 = Math.max(1, Math.floor((cols - width) / 2));

      clearScreen();
      drawBox({ row: row0, col: col0, width, height, title });

      for (let i = 0; i < normalized.length; i++) {
        const it = normalized[i];
        const lineRow = row0 + 2 + i;
        if (lineRow >= row0 + height - 2) break;
        const prefix = ` ${String(i + 1).padStart(2)}. `;
        const text = padToWidth(prefix + it.label, width - 4);
        const styled = i === cursor
          ? (ANSI.bgBlue + ANSI.fgWhite + ANSI.bold + text + ANSI.reset)
          : (it.disabled ? ANSI.dim + text + ANSI.reset : text);
        writeAt(lineRow, col0 + 2, styled);
      }

      // 底部提示
      const tip = padToWidth(footer, width - 4);
      writeAt(row0 + height - 2, col0 + 2, ANSI.dim + tip + ANSI.reset);
    };

    const cleanup = (val) => {
      screen.setKeyHandler(null);
      screen.leave();
      resolve(val);
    };

    screen.setKeyHandler((key) => {
      if (key === 'esc') return cleanup(null);
      if (key === 'up') {
        do { cursor = (cursor - 1 + normalized.length) % normalized.length; }
        while (normalized[cursor].disabled);
        return render();
      }
      if (key === 'down') {
        do { cursor = (cursor + 1) % normalized.length; }
        while (normalized[cursor].disabled);
        return render();
      }
      if (/^[1-9]$/.test(key)) {
        const idx = parseInt(key, 10) - 1;
        if (idx < normalized.length && !normalized[idx].disabled) {
          cursor = idx; render();
        }
        return;
      }
      if (key === 'enter') {
        if (!normalized[cursor].disabled) cleanup(normalized[cursor].value);
      }
    });

    render();
  });
}

// ─── confirm ────────────────────────────────────────────────────────────

function confirm({ title = '确认', message = '', defaultYes = true, yesLabel = '确定', noLabel = '取消' }) {
  return new Promise((resolve) => {
    let selectedYes = defaultYes;
    screen.enter();

    const render = () => {
      const { rows, cols } = screen.size();
      const lines = String(message).split('\n');
      const msgW = Math.max(...lines.map(strWidth));
      const width = Math.min(cols - 2, Math.max(strWidth(title) + 8, msgW + 8, 40));
      const height = Math.min(rows - 2, lines.length + 6);
      const row0 = Math.max(1, Math.floor((rows - height) / 2));
      const col0 = Math.max(1, Math.floor((cols - width) / 2));

      clearScreen();
      drawBox({ row: row0, col: col0, width, height, title });
      for (let i = 0; i < lines.length; i++) {
        writeAt(row0 + 1 + i, col0 + 2, lines[i]);
      }

      const yesText = ` < ${yesLabel} > `;
      const noText = ` < ${noLabel} > `;
      const totalW = strWidth(yesText) + strWidth(noText) + 4;
      const startCol = col0 + Math.floor((width - totalW) / 2);
      const btnRow = row0 + height - 2;

      writeAt(btnRow, startCol,
        (selectedYes ? ANSI.bgBlue + ANSI.fgWhite + ANSI.bold : '') + yesText + ANSI.reset);
      writeAt(btnRow, startCol + strWidth(yesText) + 4,
        (!selectedYes ? ANSI.bgBlue + ANSI.fgWhite + ANSI.bold : '') + noText + ANSI.reset);
    };

    const cleanup = (val) => {
      screen.setKeyHandler(null);
      screen.leave();
      resolve(val);
    };

    screen.setKeyHandler((key) => {
      if (key === 'esc') return cleanup(false);
      if (key === 'left' || key === 'right' || key === 'tab') {
        selectedYes = !selectedYes; return render();
      }
      if (key === 'y' || key === 'Y') return cleanup(true);
      if (key === 'n' || key === 'N') return cleanup(false);
      if (key === 'enter') return cleanup(selectedYes);
    });

    render();
  });
}

// ─── inputBox ───────────────────────────────────────────────────────────

function inputBox({
  title = '输入',
  prompt = '',
  defaultValue = '',
  mask = false,
  validator,
}) {
  return new Promise((resolve) => {
    let value = String(defaultValue || '');
    let cursorPos = value.length;
    let errorMsg = '';

    screen.enter();
    process.stdout.write(ANSI.showCursor);

    const render = () => {
      const { rows, cols } = screen.size();
      const width = Math.min(cols - 2, Math.max(strWidth(title) + 8, strWidth(prompt) + 8, 60));
      const height = 9;
      const row0 = Math.max(1, Math.floor((rows - height) / 2));
      const col0 = Math.max(1, Math.floor((cols - width) / 2));

      clearScreen();
      drawBox({ row: row0, col: col0, width, height, title });
      if (prompt) writeAt(row0 + 1, col0 + 2, prompt);

      const inputRow = row0 + 3;
      const inputCol = col0 + 3;
      const inputW = width - 6;
      const display = mask ? '*'.repeat(value.length) : value;
      const visible = display.length > inputW ? display.slice(display.length - inputW) : display;
      writeAt(inputRow, inputCol - 1, ANSI.dim + '[' + ANSI.reset);
      writeAt(inputRow, inputCol, padToWidth(visible, inputW));
      writeAt(inputRow, inputCol + inputW, ANSI.dim + ']' + ANSI.reset);

      if (errorMsg) {
        writeAt(row0 + 5, col0 + 2,
          ANSI.fgRed + padToWidth('! ' + errorMsg, width - 4) + ANSI.reset);
      }
      writeAt(row0 + height - 2, col0 + 2,
        ANSI.dim + padToWidth('Enter 确定   Esc 取消', width - 4) + ANSI.reset);

      // 把光标放回输入位置
      const visibleCursor = Math.min(cursorPos, inputW);
      process.stdout.write(moveCursor(inputRow, inputCol + visibleCursor));
    };

    const cleanup = (val) => {
      screen.setKeyHandler(null);
      process.stdout.write(ANSI.hideCursor);
      screen.leave();
      resolve(val);
    };

    screen.setKeyHandler((key) => {
      if (key === 'esc') return cleanup(null);
      if (key === 'enter') {
        if (validator) {
          const e = validator(value);
          if (e) { errorMsg = e; return render(); }
        }
        return cleanup(value);
      }
      if (key === 'backspace') {
        if (cursorPos > 0) {
          value = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
          cursorPos--;
          errorMsg = '';
        }
        return render();
      }
      if (key === 'left') { if (cursorPos > 0) cursorPos--; return render(); }
      if (key === 'right') { if (cursorPos < value.length) cursorPos++; return render(); }
      if (key === 'home') { cursorPos = 0; return render(); }
      if (key === 'end') { cursorPos = value.length; return render(); }
      if (typeof key === 'string' && key.length === 1 && key >= ' ') {
        value = value.slice(0, cursorPos) + key + value.slice(cursorPos);
        cursorPos++;
        errorMsg = '';
        return render();
      }
    });

    render();
  });
}

// ─── 简单消息框 ────────────────────────────────────────────────────────

function messageBox({ title = '提示', message = '', okLabel = '确定' }) {
  return confirm({ title, message, defaultYes: true, yesLabel: okLabel, noLabel: '关闭' })
    .then(() => undefined);
}

// ─── 处理意外退出 ───────────────────────────────────────────────────────

process.on('exit', () => { try { screen.leave(); } catch (_) { /* ignore */ } });
process.on('SIGTERM', () => { try { screen.leave(); } catch (_) {} process.exit(143); });

module.exports = {
  isTTY,
  selectMenu,
  confirm,
  inputBox,
  messageBox,
  ANSI,
};
