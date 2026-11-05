// Pen: draw freely on the board. Lines are stored per class in board.ink as
// { color, size, points: [[x, y], ...] } with coordinates and size as fractions of the board,
// so drawings keep their place on any screen size.

import { store } from './store.js';
import { el, icon } from './util.js';

const COLORS = ['#111827', '#ffffff', '#ef4444', '#2563eb', '#16a34a', '#f59e0b'];
const SIZES = { thin: 0.0025, thick: 0.007 }; // fraction of the board width
const ERASER_RADIUS = 14; // px

const board = document.getElementById('board');
const bar = document.getElementById('penBar');
const canvas = el('canvas', { class: 'ink', 'aria-hidden': 'true' });
board.append(canvas);
const ctx2d = canvas.getContext('2d');

let active = false;
let tool = 'pen'; // 'pen' | 'eraser'
let color = null; // null = follow the background (white on dark, black on light)
let size = 'thin';
let current = null; // stroke being drawn
let confirmClear = false;

const strokes = () => (store.board().ink ??= []);
const penColor = () => color ?? (document.body.dataset.tone === 'light' ? COLORS[0] : COLORS[1]);
const save = () => store.update(undefined, { silent: true });

// Undo history per board while the pen is open: the list of lines before each change
// (drawing a line, one eraser gesture, or clearing). "Done" forgets it.
let history = new WeakMap();
function undoStack() {
  const b = store.board();
  if (!history.has(b)) history.set(b, []);
  return history.get(b);
}
function remember(before = [...strokes()]) {
  undoStack().push(before);
  renderBar(); // enables Undo
}
let eraseSnapshot = null; // taken when an eraser gesture starts, stored once it removes something

// ---------- Drawing ----------

function resize() {
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(board.clientWidth * dpr);
  canvas.height = Math.round(board.clientHeight * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

function drawStroke(stroke) {
  const w = board.clientWidth;
  const h = board.clientHeight;
  const pts = stroke.points.map(([x, y]) => [x * w, y * h]);
  ctx2d.strokeStyle = ctx2d.fillStyle = stroke.color;
  ctx2d.lineWidth = Math.max(1.5, stroke.size * w);
  if (pts.length === 1) {
    ctx2d.beginPath();
    ctx2d.arc(pts[0][0], pts[0][1], ctx2d.lineWidth / 2, 0, Math.PI * 2);
    ctx2d.fill();
    return;
  }
  // Smooth the line by curving through the midpoints between samples.
  ctx2d.beginPath();
  ctx2d.moveTo(...pts[0]);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx2d.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  }
  ctx2d.lineTo(...pts.at(-1));
  ctx2d.stroke();
}

let frame = 0;
function redraw() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';
    strokes().forEach(drawStroke);
  });
}

// ---------- Input ----------

const toBoard = (e) => {
  const r = board.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
};

// Distance from point p to the segment a–b (all in px).
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Removes every line the eraser touches. Checks the whole path since the last
// event (every few px), so a fast swipe doesn't skip lines in between.
let lastErase = null;
function eraseAt(e) {
  const r = board.getBoundingClientRect();
  const to = [e.clientX - r.left, e.clientY - r.top];
  const from = lastErase ?? to;
  lastErase = to;
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 4));
  const probes = Array.from({ length: steps + 1 }, (_, k) => [from[0] + ((to[0] - from[0]) * k) / steps, from[1] + ((to[1] - from[1]) * k) / steps]);
  const touches = (s) => {
    const pts = s.points.map(([x, y]) => [x * r.width, y * r.height]);
    const reach = ERASER_RADIUS + (s.size * r.width) / 2;
    return probes.some((p) =>
      pts.length === 1 ? Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) < reach : pts.slice(1).some((b, i) => segmentDistance(p, pts[i], b) < reach),
    );
  };
  const list = strokes();
  const keep = list.filter((s) => !touches(s));
  if (keep.length === list.length) return;
  if (eraseSnapshot) {
    remember(eraseSnapshot);
    eraseSnapshot = null;
  }
  store.board().ink = keep;
  save();
  redraw();
}

canvas.addEventListener('pointerdown', (e) => {
  if (!active || !e.isPrimary) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  confirmClear = false;
  if (tool === 'eraser') {
    eraseSnapshot = [...strokes()];
    lastErase = null;
    return eraseAt(e);
  }
  remember();
  current = { color: penColor(), size: SIZES[size], points: [toBoard(e)] };
  strokes().push(current);
  redraw();
});

canvas.addEventListener('pointermove', (e) => {
  if (!active || !e.isPrimary || !(e.buttons & 1)) return;
  if (tool === 'eraser') return eraseAt(e);
  if (!current) return;
  const r = board.getBoundingClientRect();
  for (const ev of e.getCoalescedEvents?.() ?? [e]) {
    const p = toBoard(ev);
    const last = current.points.at(-1);
    if (Math.hypot((p[0] - last[0]) * r.width, (p[1] - last[1]) * r.height) >= 1.5) current.points.push(p);
  }
  redraw();
});

function endStroke() {
  if (!current) return;
  current.points = current.points.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
  current = null;
  save();
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

addEventListener('keydown', (e) => {
  if (active && e.key === 'Escape') setActive(false);
});

// ---------- Toolbar ----------

function setActive(on) {
  active = on;
  if (!on) history = new WeakMap();
  tool = 'pen';
  confirmClear = false;
  document.body.classList.toggle('pen-mode', on);
  bar.hidden = !on;
  renderBar();
}

export const togglePen = () => setActive(!active);

function renderBar() {
  if (!active) return;
  const toolBtn = (id, label, iconName, onclick, extra = '', disabled = false) =>
    el('button', { class: 'dock-btn' + extra, onclick, disabled, 'aria-pressed': String(tool === id) }, icon(iconName), el('span', {}, label));
  bar.replaceChildren(
    el(
      'div',
      { class: 'pen-colors' },
      COLORS.map((c) =>
        el('button', {
          class: 'pen-swatch' + (tool === 'pen' && penColor() === c ? ' on' : ''),
          style: { background: c },
          title: 'Pen colour',
          'aria-label': 'Pen colour',
          onclick: () => {
            color = c;
            tool = 'pen';
            renderBar();
          },
        }),
      ),
    ),
    toolBtn('size', size === 'thin' ? 'Thin' : 'Thick', 'pen', () => {
      size = size === 'thin' ? 'thick' : 'thin';
      tool = 'pen';
      renderBar();
    }, size === 'thick' ? ' thick' : ''),
    toolBtn('eraser', 'Eraser', 'eraser', () => {
      tool = tool === 'eraser' ? 'pen' : 'eraser';
      renderBar();
    }, tool === 'eraser' ? ' on' : ''),
    toolBtn('undo', 'Undo', 'undo', () => {
      const before = undoStack().pop();
      if (!before) return;
      store.board().ink = before;
      save();
      redraw();
      renderBar();
    }, '', undoStack().length === 0),
    toolBtn('clear', confirmClear ? 'Clear all?' : 'Clear', 'trash', () => {
      if (!confirmClear) {
        confirmClear = true;
        return renderBar();
      }
      remember();
      store.board().ink = [];
      confirmClear = false;
      save();
      redraw();
      renderBar();
    }, confirmClear ? ' danger' : ''),
    toolBtn('done', 'Done', 'check', () => setActive(false), ' done'),
  );
}

new ResizeObserver(resize).observe(board);
store.subscribe(() => {
  redraw(); // class switch, background change, restored backup
  renderBar();
});
