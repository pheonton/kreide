import { store } from './store.js';
import { el, icon, uid, clamp } from './util.js';
import { widgetTypes } from './widgets/index.js';
import { openClassManager, openStudents } from './classes.js';
import { togglePen } from './ink.js';

// Backgrounds live in backgrounds/<id>.svg; the colour shows while the image loads.
// The first one is the default (also for boards saved with a background that no longer exists).
const image = (id, label, color, tone = 'dark') => ({
  id,
  label,
  tone,
  color,
  css: `url("${new URL(`backgrounds/${id}.svg`, document.baseURI)}") center / cover no-repeat ${color}`,
});

const BACKGROUNDS = [
  image('waves', 'Waves', '#0b2a5b'),
  image('aurora', 'Aurora', '#0b1026'),
  image('lowpoly', 'Low poly', '#1e3a8a'),
  image('topo', 'Topography', '#163a35'),
  image('dusk', 'Dusk', '#3b1a46'),
  image('honeycomb', 'Honeycomb', '#1c1c1c'),
  image('beach', 'Beach', '#e3f2f7', 'light'),
  image('silk', 'Silk', '#dff1fb', 'light'),
  image('petals', 'Petals', '#f3d6d2', 'light'),
  image('paper', 'Grid paper', '#f8f7f0', 'light'),
  image('pastel', 'Pastel', '#f9f4ec', 'light'),
  image('animals', 'Animals', '#eef3ec', 'light'),
];

const MIN_W = 220;
const MIN_H = 170;

const board = document.getElementById('board');
const emptyHint = document.getElementById('boardEmpty');
const mounted = new Map(); // widget id -> { root, instance }

// ---------- Top bar ----------

const firstClassBtn = document.getElementById('firstClassBtn');
const manageBtn = document.getElementById('manageBtn');
firstClassBtn.append(icon('plus'), el('span', {}, 'Add your first class'));
firstClassBtn.addEventListener('click', () => openClassManager());

const classBtn = document.getElementById('classBtn');
const classMenu = document.getElementById('classMenu');

function renderClassMenu() {
  const { classes } = store.get();
  const active = store.activeClass();
  firstClassBtn.hidden = classes.length > 0;
  classBtn.hidden = classes.length === 0;
  manageBtn.hidden = !active;

  classBtn.replaceChildren(
    el('span', { class: 'class-btn-label' + (active ? '' : ' placeholder') }, active?.name ?? 'Choose class'),
    icon('chevronDown'),
  );
  classBtn.title = active?.name ?? '';

  const choose = (id) => {
    classMenu.hidePopover();
    store.update((s) => (s.activeClassId = id));
  };
  classMenu.replaceChildren(
    el('p', { class: 'popover-title' }, 'Show on board'),
    ...classes.map((c) =>
      el(
        'button',
        { class: 'menu-item' + (c.id === active?.id ? ' active' : ''), title: c.name, onclick: () => choose(c.id) },
        el('span', { class: 'menu-check' }, c.id === active?.id && icon('check')),
        el('span', { class: 'class-name' }, c.name),
        el('span', { class: 'count' }, String(c.students.length)),
      ),
    ),
    el('div', { class: 'menu-sep' }),
    el(
      'button',
      {
        class: 'menu-item',
        onclick: () => {
          classMenu.hidePopover();
          openClassManager();
        },
      },
      el('span', { class: 'menu-check' }, icon('users')),
      el('span', { class: 'class-name' }, 'Manage classes…'),
    ),
  );
}

// Show a popover just below its button, kept inside the window.
function anchorBelow(popover, button) {
  popover.addEventListener('beforetoggle', (e) => {
    button.classList.toggle('open', e.newState === 'open');
    if (e.newState !== 'open') return;
    const rect = button.getBoundingClientRect();
    Object.assign(popover.style, { top: `${rect.bottom + 8}px`, left: `${rect.left}px`, right: 'auto' });
  });
  popover.addEventListener('toggle', (e) => {
    if (e.newState !== 'open') return;
    const overflow = popover.getBoundingClientRect().right - (innerWidth - 8);
    if (overflow > 0) popover.style.left = `${Math.max(8, parseFloat(popover.style.left) - overflow)}px`;
  });
}
anchorBelow(classMenu, classBtn);

manageBtn.append(icon('users'));
manageBtn.addEventListener('click', () => openStudents());

const bgPopover = document.getElementById('bgPopover');
const bgBtn = document.getElementById('bgBtn');
bgBtn.append(icon('palette'));
anchorBelow(bgPopover, bgBtn);

function renderBackground() {
  const current = store.board().background;
  const bg = BACKGROUNDS.find((b) => b.id === current) ?? BACKGROUNDS[0];
  document.body.style.setProperty('--board-bg', bg.css);
  document.body.dataset.tone = bg.tone;
  if (popped) popped.win.document.body.dataset.tone = bg.tone;
  // Title bar and window buttons of the installed app take the background's colour.
  document.querySelector('meta[name="theme-color"]').content = bg.color;
  bgPopover.replaceChildren(
    el('p', { class: 'popover-title' }, 'Background'),
    el(
      'div',
      { class: 'swatches' },
      BACKGROUNDS.map((b, i) =>
        el('button', {
          // light backgrounds always start on a new row, after the dark ones
          class: 'swatch' + (b.id === bg.id ? ' active' : '') + (b.tone !== BACKGROUNDS[i - 1]?.tone ? ' new-row' : ''),
          style: { background: b.css },
          title: b.label,
          'aria-label': b.label,
          onclick: () => store.update(() => (store.board().background = b.id)),
        }),
      ),
    ),
  );
}

// Fullscreen has no button (the browser and window already offer it); F still toggles it.
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});

// ---------- Dock ----------

const dock = document.getElementById('dock');
for (const type of Object.values(widgetTypes)) {
  dock.append(
    el('button', { class: 'dock-btn', onclick: () => addWidget(type.type), title: `Add ${type.title}` }, icon(type.icon), el('span', {}, type.title)),
  );
}
dock.append(el('div', { class: 'dock-sep' }), el('button', { class: 'dock-btn', onclick: togglePen, title: 'Draw on the board' }, icon('pen'), el('span', {}, 'Pen')));

// ---------- Board ----------

function addWidget(typeName) {
  const type = widgetTypes[typeName];
  const { widgets } = store.board();
  const { w, h } = type.defaultSize;
  // Use the first quadrant whose top-left area is free, otherwise cascade.
  const slots = [
    [0.04, 0.04],
    [0.52, 0.04],
    [0.04, 0.52],
    [0.52, 0.52],
  ];
  const free = slots.find(([sx, sy]) => !widgets.some((o) => Math.abs(o.x - sx) < 0.15 && Math.abs(o.y - sy) < 0.15));
  const offset = (widgets.length % 6) * 0.03;
  const [x, y] = free ?? [0.3 + offset, 0.2 + offset];
  store.update(() =>
    widgets.push({ id: uid(), type: typeName, x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h, state: {} }),
  );
}

function removeWidget(id) {
  store.update(() => {
    const board = store.board();
    board.widgets = board.widgets.filter((w) => w.id !== id);
  });
}

function bringToFront(id) {
  const { widgets } = store.board();
  const i = widgets.findIndex((w) => w.id === id);
  if (i < 0 || i === widgets.length - 1) return;
  store.update(() => widgets.push(...widgets.splice(i, 1)), { silent: true });
  syncBoard();
}

function place(root, w, z) {
  Object.assign(root.style, {
    left: `${w.x * 100}%`,
    top: `${w.y * 100}%`,
    width: `${w.w * 100}%`,
    height: `${w.h * 100}%`,
    zIndex: String(z + 1),
  });
}

// Pointer-drag helper: calls onMove with the delta as a fraction of the board size.
function dragHandle(handle, w, root, onMove) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, input, select') || root.classList.contains('popped')) return;
    e.preventDefault();
    const rect = board.getBoundingClientRect();
    const start = { px: e.clientX, py: e.clientY, x: w.x, y: w.y, w: w.w, h: w.h };
    handle.setPointerCapture(e.pointerId);
    root.classList.add('dragging');
    const move = (ev) => {
      onMove(start, (ev.clientX - start.px) / rect.width, (ev.clientY - start.py) / rect.height, rect);
      place(root, w, store.board().widgets.indexOf(w));
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      root.classList.remove('dragging');
      store.update(undefined, { silent: true });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}

function mountWidget(w) {
  const type = widgetTypes[w.type];
  if (!type) return null;
  w.state ??= {};

  const body = el('div', { class: 'widget-body' });
  const header = el(
    'header',
    { class: 'widget-header' },
    icon(type.icon),
    el('span', { class: 'widget-title' }, type.title),
    canPopOut && el('button', { class: 'icon-btn small pop-btn', title: 'Pop out: keep on top of other windows', onclick: () => togglePopOut(w.id, type.title) }, icon('popout')),
    el('button', { class: 'icon-btn small', title: 'Close widget', onclick: () => removeWidget(w.id) }, icon('x')),
  );
  const handle = el('div', { class: 'resize-handle', title: 'Resize' }, icon('grip'));
  const root = el('section', { class: `widget widget-${w.type}` }, header, body, handle);
  root.addEventListener('pointerdown', () => bringToFront(w.id), true);

  dragHandle(header, w, root, (start, dx, dy) => {
    w.x = clamp(start.x + dx, 0, 1 - w.w);
    w.y = clamp(start.y + dy, 0, 1 - w.h);
  });
  dragHandle(handle, w, root, (start, dx, dy, rect) => {
    w.w = clamp(start.w + dx, MIN_W / rect.width, 1 - w.x);
    w.h = clamp(start.h + dy, MIN_H / rect.height, 1 - w.y);
  });

  board.append(root);
  const instance = type.create(body, {
    state: w.state,
    save: () => store.update(undefined, { silent: true }),
    store,
    openClassManager,
  });
  return { root, instance };
}

function unmount(id) {
  const m = mounted.get(id);
  m.instance?.destroy?.();
  m.root.remove();
  mounted.delete(id);
  if (popped?.id === id) popped.win.close();
}

// ---------- Pop-out ----------
// Chrome and Edge can show one small always-on-top window (Document Picture-in-Picture).
// One widget moves into it with its live state and returns to the board when the window closes.

const canPopOut = 'documentPictureInPicture' in window;
let popped = null; // { id, root, win }

async function togglePopOut(id, title) {
  if (popped?.id === id) return popped.win.close(); // second click: back to the board
  const { root } = mounted.get(id);
  const { width, height } = root.getBoundingClientRect();
  // Opening a window closes any previous one; its widget returns to the board via pagehide.
  let win;
  try {
    win = await documentPictureInPicture.requestWindow({ width: Math.round(width), height: Math.round(height) });
  } catch (err) {
    console.warn('Pop-out window not available here', err);
    return;
  }
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) win.document.head.append(el('link', { rel: 'stylesheet', href: link.href }));
  win.document.title = title;
  win.document.body.className = 'pip';
  win.document.body.dataset.tone = document.body.dataset.tone;
  root.classList.add('popped');
  win.document.body.append(root);
  const entry = { id, root, win };
  popped = entry;
  win.addEventListener('pagehide', () => {
    if (popped === entry) popped = null;
    root.classList.remove('popped');
    if (mounted.get(id)?.root === root) board.append(root); // still on the board (not removed / class switched)
    syncBoard();
  });
}

function syncBoard() {
  const { widgets } = store.board();
  const ids = new Set(widgets.map((w) => w.id));
  for (const id of [...mounted.keys()]) if (!ids.has(id)) unmount(id);
  widgets.forEach((w, i) => {
    let m = mounted.get(w.id);
    if (!m) {
      m = mountWidget(w);
      if (!m) return;
      mounted.set(w.id, m);
    }
    place(m.root, w, i);
  });
  emptyHint.hidden = widgets.length > 0;
}

// ---------- Wiring ----------

function render() {
  renderClassMenu();
  renderBackground();
  syncBoard();
}

store.subscribe((_, info) => {
  if (info?.replaced) for (const id of [...mounted.keys()]) unmount(id);
  render();
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker not registered', err));
}
