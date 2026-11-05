// All app data lives in this browser's localStorage. Nothing is sent anywhere.

import { uid } from './util.js';

const KEY = 'kreide:v1';
const OLD_KEY = 'classboard:v1'; // the app's earlier name; read once so nothing is lost

// A board is what the screen shows: { background, widgets: [{ id, type, x, y, w, h, state }] }
// with x/y/w/h as fractions of the board. Each class has its own; `board` is used without a class.
const emptyBoard = () => ({ background: 'waves', widgets: [] });

const defaults = () => ({
  classes: [], // { id, name, students: [{ id, name }], board }
  activeClassId: null,
  board: emptyBoard(),
});

// Same layout and background with fresh widgets (new ids, no timer or picker state).
export const cloneBoard = (board) => ({
  background: board.background,
  widgets: board.widgets.map(({ type, x, y, w, h }) => ({ id: uid(), type, x, y, w, h, state: {} })),
});

// Older data had one board for everything: keep it as the default and give every class a copy.
// Runs on raw saved data, before defaults are filled in.
function migrate(data) {
  const legacy = !data.board;
  data = { ...defaults(), ...data, board: data.board ?? { background: data.settings?.background ?? 'waves', widgets: data.widgets ?? [] } };
  delete data.widgets;
  delete data.settings;
  for (const c of data.classes) {
    // the class on screen keeps the old board exactly (incl. timer settings), the others get a copy
    c.board ??= legacy && c.id === data.activeClassId ? structuredClone(data.board) : cloneBoard(data.board);
  }
  return data;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (err) {
    console.error('Could not read saved data', err);
  }
  return defaults();
}

let state = load();
const listeners = new Set();
let saveTimer = null;

function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save data', err);
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}

addEventListener('pagehide', () => saveTimer && flush());

export const store = {
  get: () => state,

  // Mutate state in place. `silent` saves without notifying subscribers
  // (used for high-frequency changes like dragging or widget-internal state).
  update(fn = () => {}, { silent = false } = {}) {
    fn(state);
    persist();
    if (!silent) listeners.forEach((l) => l(state));
  },

  replace(next) {
    state = migrate(next);
    flush();
    listeners.forEach((l) => l(state, { replaced: true }));
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  activeClass() {
    return state.classes.find((c) => c.id === state.activeClassId) ?? null;
  },

  // The board on screen: the active class's, or the default one when no class is chosen.
  board() {
    return this.activeClass()?.board ?? state.board;
  },
};
