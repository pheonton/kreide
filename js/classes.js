import { store, cloneBoard } from './store.js';
import { el, icon, uid } from './util.js';
import { readSpreadsheet, guessColumns, guessClassName, columnLetter } from './importer.js';

// One dialog with two screens: "classes" (add/rename/delete classes, backups)
// and "students" (the student list of one class).
const dialog = document.getElementById('manager');

let view = 'classes';
let studentsClassId = null; // class shown on the students screen
let importing = null; // { sheets, sheetIndex, hasHeader, col1, col2, target: 'new' | classId, newName }
let creating = false; // new-class form visible
let confirmDeleteId = null; // class whose delete button asks for confirmation
let pasting = false;
let focusSelector = null; // element to focus after the next render
let error = '';

function show(nextView, classId = null) {
  view = nextView;
  studentsClassId = classId;
  importing = null;
  creating = false;
  confirmDeleteId = null;
  pasting = false;
  error = '';
  render();
  if (!dialog.open) dialog.showModal();
}

export function openClassManager() {
  show('classes');
}

export function openStudents(classId = store.get().activeClassId) {
  if (!findClass(classId)) return openClassManager();
  show('students', classId);
}

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close(); // backdrop click
});

store.subscribe(() => dialog.open && render());

// ---------- Actions ----------

const findClass = (id) => store.get().classes.find((c) => c.id === id);

function createClass(name, students = []) {
  const id = uid();
  store.update((s) => {
    // A new class starts with a copy of the board currently on screen.
    s.classes.push({ id, name, students: students.map((n) => ({ id: uid(), name: n })), board: cloneBoard(store.board()) });
    s.activeClassId ??= id;
  });
  return id;
}

function addStudents(classId, names) {
  store.update(() => findClass(classId).students.push(...names.map((n) => ({ id: uid(), name: n }))));
}

function deleteClass(id) {
  confirmDeleteId = null;
  store.update((s) => {
    const deleted = s.classes.find((c) => c.id === id);
    s.classes = s.classes.filter((c) => c.id !== id);
    if (s.activeClassId !== id) return;
    s.activeClassId = s.classes[0]?.id ?? null;
    // Deleting the last class keeps its board on screen instead of bringing back an older one.
    if (!s.activeClassId) s.board = deleted.board;
  });
}

async function pickFile(accept) {
  const input = el('input', { type: 'file', accept });
  const file = await new Promise((resolve) => {
    input.addEventListener('change', () => resolve(input.files[0]));
    input.click();
  });
  return file ?? null;
}

async function startImport(target) {
  const file = await pickFile('.xlsx,.xlsm,.xls,.csv,.tsv,.txt,.xml,.htm,.html');
  if (!file) return;
  error = '';
  try {
    const sheets = (await readSpreadsheet(file)).filter((s) => s.rows.length);
    if (!sheets.length) throw new Error('The file is empty.');
    importing = {
      sheets,
      target,
      newName: guessClassName(sheets[0].rows) ?? (sheets.length > 1 ? sheets[0].name : file.name.replace(/\.[^.]+$/, '')),
      sheetIndex: 0,
      format: 'first',
      ...guessColumns(sheets[0].rows),
    };
  } catch (err) {
    console.error(err);
    error = err.message;
  }
  render();
}

const NAME_FORMATS = [
  { id: 'first', label: 'First name' },
  { id: 'initial', label: 'First name + initial' },
  { id: 'full', label: 'Full name' },
];

// Without a surname column, split one name cell: "Müller, Anna" or "Anna Müller".
function splitName(value) {
  if (value.includes(',')) {
    const [last, first] = value.split(',', 2).map((v) => v.trim());
    return [first, last];
  }
  const space = value.indexOf(' ');
  return space < 0 ? [value, ''] : [value.slice(0, space), value.slice(space + 1).trim()];
}

function formatName(first, last, format) {
  if (format === 'first') return first || last;
  if (format === 'initial') return last ? `${first} ${last[0].toUpperCase()}.`.trim() : first;
  return [first, last].filter(Boolean).join(' ');
}

function importedNames() {
  const { sheets, sheetIndex, hasHeader, col1, col2, format } = importing;
  const cell = (row, c) => String(row[c] ?? '').trim();
  return sheets[sheetIndex].rows
    .slice(hasHeader ? 1 : 0)
    .map((row) => {
      const [first, last] = col2 >= 0 ? [cell(row, col1), cell(row, col2)] : splitName(cell(row, col1));
      return formatName(first, last, format);
    })
    .filter(Boolean);
}

function finishImport() {
  const names = importedNames();
  const { target, newName } = importing;
  importing = null;
  if (target === 'new') createClass(newName.trim() || 'New class', names);
  else addStudents(target, names);
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `kreide-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function restoreBackup() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.classes)) throw new Error('Not a Kreide backup file.');
    if (!confirm('Replace all current classes and widgets with this backup?')) return;
    error = '';
    store.replace(data);
  } catch (err) {
    error = err.message;
    render();
  }
}

// ---------- Rendering ----------

function render() {
  if (view === 'students' && !findClass(studentsClassId)) view = 'classes';
  const cls = findClass(studentsClassId);
  const onClasses = view === 'classes';

  dialog.replaceChildren(
    el(
      'header',
      { class: 'manager-header' },
      !onClasses && el('button', { class: 'icon-btn', title: 'All classes', onclick: () => show('classes') }, icon('chevronLeft')),
      el('h2', {}, importing ? (importing.target === 'new' ? 'New class' : 'Add students') : onClasses ? 'Classes' : 'Students'),
      !onClasses && el('span', { class: 'manager-subtitle', title: cls.name }, cls.name),
      el('span', { class: 'privacy-note' }, icon('lock'), 'Stored only on this computer'),
      el('button', { class: 'icon-btn', title: 'Close', onclick: () => dialog.close() }, icon('x')),
    ),
    el(
      'section',
      { class: 'manager-detail' },
      error && el('p', { class: 'error' }, error),
      importing ? renderImport() : onClasses ? renderClasses() : renderStudents(cls),
    ),
  );
  if (onClasses && !importing) { // backups only on the class overview, not during an import
    dialog.append(
      el(
        'footer',
        { class: 'manager-footer' },
        store.get().classes.length > 0 && el('button', { class: 'btn ghost', onclick: exportBackup }, icon('download'), 'Export backup'),
        el('button', { class: 'btn ghost', onclick: restoreBackup }, icon('upload'), 'Restore backup'),
      ),
    );
  }

  if (focusSelector) {
    dialog.querySelector(focusSelector)?.focus();
    focusSelector = null;
  }
}

function renderNewClassForm() {
  return el(
    'form',
    {
      class: 'inline-form',
      onsubmit: (e) => {
        e.preventDefault();
        const name = e.target.elements.name.value.trim();
        if (!name) return;
        const id = createClass(name);
        focusSelector = '.inline-form input';
        show('students', id);
      },
    },
    el('input', { name: 'name', placeholder: 'Class name, e.g. 7b Maths', autocomplete: 'off' }),
    el('button', { class: 'btn primary', type: 'submit' }, 'Create'),
    el('button', { class: 'btn ghost', type: 'button', onclick: () => ((creating = false), render()) }, 'Cancel'),
  );
}

function renderClasses() {
  const { classes, activeClassId } = store.get();
  const openCreate = () => {
    creating = true;
    focusSelector = '.inline-form input';
    render();
  };

  if (!classes.length && !creating) {
    return el(
      'div',
      { class: 'empty-state' },
      el('h3', {}, 'No classes yet'),
      el('p', {}, 'Import a class list from Excel or CSV, or create a class and type the names.'),
      el(
        'div',
        { class: 'empty-actions' },
        el('button', { class: 'btn primary', onclick: () => startImport('new') }, icon('upload'), 'Import from Excel'),
        el('button', { class: 'btn', onclick: openCreate }, icon('plus'), 'Create class manually'),
      ),
    );
  }

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'toolbar' },
      el('button', { class: 'btn' + (creating ? ' pressed' : ''), onclick: openCreate }, icon('plus'), 'New class'),
      el('button', { class: 'btn', onclick: () => startImport('new') }, icon('upload'), 'Import from Excel'),
    ),
    creating && renderNewClassForm(),
    el(
      'ul',
      { class: 'class-rows' },
      classes.map((c) =>
        el(
          'li',
          { class: 'class-row' + (c.id === activeClassId ? ' active' : '') },
          el('input', {
            class: 'class-row-name',
            value: c.name,
            title: 'Rename class',
            'aria-label': 'Class name',
            onchange: (e) => e.target.value.trim() && store.update(() => (c.name = e.target.value.trim())),
          }),
          el('button', { class: 'btn ghost small', title: 'Edit students', onclick: () => show('students', c.id) }, icon('users'), `${c.students.length} students`),
          c.id === activeClassId
            ? el('span', { class: 'badge' }, 'On board')
            : el('button', { class: 'btn small', onclick: () => store.update((s) => (s.activeClassId = c.id)) }, 'Show on board'),
          c.id === confirmDeleteId
            ? el(
                'button',
                { class: 'btn small danger', title: `Delete ${c.name} and its ${c.students.length} students`, onclick: () => deleteClass(c.id), onblur: () => ((confirmDeleteId = null), render()) },
                icon('trash'),
                'Delete?',
              )
            : el(
                'button',
                {
                  class: 'icon-btn small',
                  title: 'Delete class',
                  onclick: () => {
                    confirmDeleteId = c.id;
                    focusSelector = '.class-row .btn.danger';
                    render();
                  },
                },
                icon('trash'),
              ),
        ),
      ),
    ),
  );
}

function renderStudents(cls) {
  return el(
    'div',
    {},
    el(
      'form',
      {
        class: 'inline-form',
        onsubmit: (e) => {
          e.preventDefault();
          const input = e.target.elements.name;
          if (!input.value.trim()) return;
          focusSelector = '.inline-form input';
          addStudents(cls.id, [input.value.trim()]);
        },
      },
      el('input', { name: 'name', placeholder: 'Add a student…', autocomplete: 'off' }),
      el('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Add'),
    ),
    el(
      'div',
      { class: 'toolbar' },
      el('button', { class: 'btn' + (pasting ? ' pressed' : ''), onclick: () => ((pasting = !pasting), render()) }, icon('clipboard'), 'Paste list'),
      el('button', { class: 'btn', onclick: () => startImport(cls.id) }, icon('upload'), 'Import from Excel'),
    ),
    pasting && renderPaste(cls),
    el('p', { class: 'list-meta' }, `${cls.students.length} students`),
    el(
      'ul',
      { class: 'student-list' },
      cls.students.map((st) =>
        el(
          'li',
          {},
          el('input', {
            class: 'student-name',
            value: st.name,
            'aria-label': 'Student name',
            onchange: (e) => e.target.value.trim() && store.update(() => (st.name = e.target.value.trim())),
          }),
          el(
            'button',
            {
              class: 'icon-btn small',
              title: 'Remove student',
              onclick: () => store.update(() => (cls.students = cls.students.filter((x) => x !== st))),
            },
            icon('trash'),
          ),
        ),
      ),
    ),
  );
}

function renderPaste(cls) {
  const area = el('textarea', { rows: 6, placeholder: 'One name per line (you can paste a column straight from Excel)' });
  return el(
    'div',
    { class: 'paste-box' },
    area,
    el(
      'div',
      { class: 'row-end' },
      el('button', { class: 'btn ghost', onclick: () => ((pasting = false), render()) }, 'Cancel'),
      el('button', {
        class: 'btn primary',
        onclick: () => {
          const names = area.value.split(/\r?\n/).map((l) => l.replace(/\t+/g, ' ').trim()).filter(Boolean);
          pasting = false;
          if (names.length) addStudents(cls.id, names);
          else render();
        },
      }, 'Add names'),
    ),
  );
}

function duplicateHint(names) {
  const seen = new Set();
  const dupes = new Set(names.filter((n) => seen.has(n) || !seen.add(n)));
  if (!dupes.size) return null;
  return el('span', { class: 'warn' }, ` · appears more than once: ${[...dupes].join(', ')}`);
}

function renderImport() {
  const imp = importing;
  const toNewClass = imp.target === 'new';
  const sheet = imp.sheets[imp.sheetIndex];
  const width = Math.max(1, ...sheet.rows.map((r) => r.length));
  const sample = (c) => sheet.rows.slice(imp.hasHeader ? 1 : 0).find((r) => r[c])?.[c] ?? '';
  const columnLabel = (c) =>
    imp.hasHeader && sheet.rows[0][c] ? `${columnLetter(c)} – ${sheet.rows[0][c]}` : `${columnLetter(c)} (e.g. ${sample(c) || 'empty'})`;
  const columnOptions = (selected, allowNone) => [
    allowNone && el('option', { value: '-1', selected: selected === -1 }, '— none —'),
    ...Array.from({ length: width }, (_, c) => el('option', { value: String(c), selected: selected === c }, columnLabel(c))),
  ];
  const set = (patch) => {
    Object.assign(importing, patch);
    render();
  };
  const names = importedNames();

  return el(
    'div',
    { class: 'import' },
    el(
      'div',
      { class: 'import-grid' },
      toNewClass &&
        el(
          'label',
          { class: 'wide' },
          'Class name',
          el('input', { value: imp.newName, oninput: (e) => (importing.newName = e.target.value) }),
        ),
      imp.sheets.length > 1 &&
        el(
          'label',
          {},
          'Worksheet',
          el(
            'select',
            {
              onchange: (e) => {
                const i = Number(e.target.value);
                set({ sheetIndex: i, ...guessColumns(imp.sheets[i].rows), newName: guessClassName(imp.sheets[i].rows) ?? imp.sheets[i].name });
              },
            },
            imp.sheets.map((s, i) => el('option', { value: String(i), selected: i === imp.sheetIndex }, `${s.name} (${s.rows.length} rows)`)),
          ),
        ),
      el('label', {}, 'First name column', el('select', { onchange: (e) => set({ col1: Number(e.target.value) }) }, columnOptions(imp.col1, false))),
      el(
        'label',
        {},
        'Surname column',
        el('select', { onchange: (e) => set({ col2: Number(e.target.value) }) }, columnOptions(imp.col2, true)),
      ),
      el(
        'div',
        { class: 'wide name-format' },
        el('span', {}, 'Show names as'),
        el(
          'div',
          { class: 'segmented' },
          NAME_FORMATS.map((f) => el('button', { class: imp.format === f.id ? 'on' : '', onclick: () => set({ format: f.id }) }, f.label)),
        ),
      ),
      el(
        'label',
        { class: 'check' },
        el('input', { type: 'checkbox', checked: imp.hasHeader, onchange: (e) => set({ hasHeader: e.target.checked }) }),
        'First row contains column headings',
      ),
    ),
    el('p', { class: 'list-meta' }, `${names.length} students found`, duplicateHint(names)),
    el(
      'ol',
      { class: 'import-preview' },
      names.slice(0, 12).map((n) => el('li', {}, n)),
      names.length > 12 && el('li', { class: 'more' }, `… and ${names.length - 12} more`),
    ),
    el(
      'div',
      { class: 'row-end' },
      el('button', { class: 'btn ghost', onclick: () => ((importing = null), render()) }, 'Cancel'),
      el('button', { class: 'btn primary', disabled: !names.length, onclick: finishImport }, `Import ${names.length} students`),
    ),
  );
}
