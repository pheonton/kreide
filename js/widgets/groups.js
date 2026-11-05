import { el, icon, clamp } from '../util.js';

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deal students round-robin so group sizes differ by at most one.
function makeGroups(students, groupCount) {
  const groups = Array.from({ length: groupCount }, () => []);
  shuffle(students).forEach((s, i) => groups[i % groupCount].push(s.id));
  return groups;
}

export default {
  type: 'groups',
  title: 'Group maker',
  icon: 'grid',
  defaultSize: { w: 0.56, h: 0.62 },

  create(body, ctx) {
    const st = ctx.state;
    st.mode ??= 'size'; // 'size' = max students per group, 'count' = number of groups
    st.size ??= 4;
    st.count ??= 4;
    st.groups ??= {}; // classId -> [[studentId]]

    const stage = el('div', { class: 'groups-stage' });
    const controls = el('div', { class: 'groups-controls' });
    body.append(el('div', { class: 'groups' }, stage, controls));

    const groupCount = (n) => (st.mode === 'count' ? clamp(st.count, 1, n) : Math.ceil(n / st.size));

    function generate() {
      const cls = ctx.store.activeClass();
      if (!cls) return ctx.openClassManager();
      if (!cls.students.length) return;
      st.groups[cls.id] = makeGroups(cls.students, groupCount(cls.students.length));
      ctx.save();
      render(true);
    }

    function step(delta) {
      const key = st.mode;
      st[key] = clamp(st[key] + delta, 2, key === 'size' ? 15 : 20);
      ctx.save();
      renderControls();
    }

    function renderControls() {
      const cls = ctx.store.activeClass();
      const n = cls?.students.length ?? 0;
      const value = st.mode === 'size' ? st.size : st.count;
      const hint = n
        ? st.mode === 'size'
          ? `${groupCount(n)} groups`
          : `${Math.floor(n / groupCount(n))}–${Math.ceil(n / groupCount(n))} per group`
        : '';
      controls.replaceChildren(
        el(
          'div',
          { class: 'segmented' },
          el('button', { class: st.mode === 'size' ? 'on' : '', onclick: () => ((st.mode = 'size'), ctx.save(), renderControls()) }, 'Per group'),
          el('button', { class: st.mode === 'count' ? 'on' : '', onclick: () => ((st.mode = 'count'), ctx.save(), renderControls()) }, 'Groups'),
        ),
        el(
          'div',
          { class: 'stepper' },
          el('button', { class: 'icon-btn small', title: 'Fewer', onclick: () => step(-1) }, icon('minus')),
          el('span', { class: 'stepper-value' }, String(value)),
          el('button', { class: 'icon-btn small', title: 'More', onclick: () => step(1) }, icon('plus')),
        ),
        el('span', { class: 'groups-hint' }, hint),
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn primary', disabled: !!cls && !n, onclick: generate }, icon('shuffle'), 'Make groups'),
      );
    }

    function render(animate = false) {
      const cls = ctx.store.activeClass();
      renderControls();
      if (!cls) return stage.replaceChildren(el('p', { class: 'groups-empty' }, 'Choose a class'));
      if (!cls.students.length) return stage.replaceChildren(el('p', { class: 'groups-empty' }, 'No students yet'));

      // Resolve ids to current names; students removed since are dropped.
      const byId = new Map(cls.students.map((s) => [s.id, s.name]));
      const groups = (st.groups[cls.id] ?? []).map((g) => g.filter((id) => byId.has(id))).filter((g) => g.length);
      if (!groups.length) {
        return stage.replaceChildren(el('p', { class: 'groups-empty' }, `${cls.students.length} students – press “Make groups”`));
      }
      const chars = Math.max(8, ...cls.students.map((s) => s.name.length));
      layout = { count: groups.length, longest: Math.max(...groups.map((g) => g.length)), chars };
      stage.replaceChildren(
        el(
          'div',
          { class: 'group-grid' + (animate ? ' animate' : '') },
          groups.map((g, i) =>
            el(
              'section',
              { class: 'group-card', style: { '--i': String(i), '--hue': `var(--group-${i % 12})` } },
              el('h4', {}, `Group ${i + 1}`),
              el('ul', {}, g.map((id) => el('li', {}, byId.get(id)))),
            ),
          ),
        ),
      );
      fit();
    }

    // Pick the column count that allows the largest text with every name on one line.
    let layout = null;
    function fit() {
      const grid = stage.querySelector('.group-grid');
      if (!grid || !layout) return;
      const { count, longest, chars } = layout;
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      let best = { cols: 1, size: 0 };
      for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const byHeight = (height - 8 * (rows - 1)) / (rows * (longest * 1.25 + 1.9));
        const byWidth = (width - 8 * (cols - 1)) / cols / (chars * 0.6 + 1.4);
        const size = Math.min(byHeight, byWidth);
        if (size > best.size) best = { cols, size };
      }
      grid.style.setProperty('--cols', String(best.cols));
      grid.style.fontSize = `${Math.max(12, Math.min(40, best.size))}px`;
    }

    render();
    const unsubscribe = ctx.store.subscribe(() => render());
    const resize = new ResizeObserver(fit);
    resize.observe(stage);
    return {
      destroy() {
        unsubscribe();
        resize.disconnect();
      },
    };
  },
};
