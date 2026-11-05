import { el, icon } from '../util.js';

const randomItem = (list) => list[Math.floor(Math.random() * list.length)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export default {
  type: 'picker',
  title: 'Random student',
  icon: 'shuffle',
  defaultSize: { w: 0.36, h: 0.4 },

  create(body, ctx) {
    const st = ctx.state;
    st.noRepeat ??= true;
    st.picked ??= {}; // classId -> ids already picked this round
    st.last ??= null; // { classId, studentId }

    let animation = null;
    const nameEl = el('div', { class: 'picker-name' });
    const stage = el('button', { class: 'picker-stage', title: 'Pick a student', onclick: () => pick() }, nameEl);
    const info = el('span', { class: 'picker-info' });
    const pickBtn = el('button', { class: 'btn primary big', onclick: () => pick() }, icon('shuffle'), 'Pick');
    const resetBtn = el('button', { class: 'btn ghost small', onclick: resetRound }, 'Start over');
    const repeatToggle = el('input', {
      type: 'checkbox',
      checked: st.noRepeat,
      onchange: (e) => {
        st.noRepeat = e.target.checked;
        ctx.save();
        refresh();
      },
    });

    body.append(
      el(
        'div',
        { class: 'picker' },
        stage,
        el(
          'div',
          { class: 'picker-footer' },
          pickBtn,
          el('label', { class: 'toggle' }, repeatToggle, 'Everyone once'),
          el('span', { class: 'spacer' }),
          info,
          resetBtn,
        ),
      ),
    );

    const eligible = (cls) => cls.students;

    function showName(text, extraClass = '') {
      nameEl.textContent = text;
      nameEl.className = 'picker-name ' + extraClass;
      nameEl.style.setProperty('--len', String(Math.max(text.length, 6)));
    }

    function resetRound() {
      const cls = ctx.store.activeClass();
      if (cls) delete st.picked[cls.id];
      st.last = null;
      ctx.save();
      refresh();
    }

    function pick() {
      if (animation) return;
      const cls = ctx.store.activeClass();
      if (!cls) return ctx.openClassManager();
      const pool = eligible(cls);
      if (!pool.length) return;

      let candidates = pool;
      if (st.noRepeat) {
        const done = new Set(st.picked[cls.id] ?? []);
        candidates = pool.filter((s) => !done.has(s.id));
        if (!candidates.length) {
          st.picked[cls.id] = [];
          candidates = pool;
        }
      }
      const winner = randomItem(candidates);
      if (st.noRepeat) (st.picked[cls.id] ??= []).push(winner.id);
      st.last = { classId: cls.id, studentId: winner.id };
      ctx.save();

      const reveal = () => {
        animation = null;
        showName(winner.name, 'reveal');
        updateInfo();
      };
      if (reducedMotion.matches || pool.length < 2) return reveal();

      // Slot-machine style shuffle that slows down before landing on the winner.
      let delay = 40;
      let previous = null;
      const step = () => {
        if (delay > 300) return reveal();
        let next;
        do next = randomItem(pool);
        while (next === previous && pool.length > 1);
        previous = next;
        showName(next.name, 'rolling');
        delay *= 1.15;
        animation = setTimeout(step, delay);
      };
      step();
    }

    function updateInfo() {
      const cls = ctx.store.activeClass();
      const pool = cls ? eligible(cls) : [];
      const ids = new Set(pool.map((s) => s.id));
      const picked = (st.picked[cls?.id] ?? []).filter((id) => ids.has(id)).length;
      info.textContent = !cls ? '' : st.noRepeat ? `${picked} of ${pool.length} picked` : `${pool.length} students`;
      resetBtn.hidden = !st.noRepeat || picked === 0;
      pickBtn.disabled = !!cls && pool.length === 0;
    }

    function refresh() {
      if (animation) return;
      const cls = ctx.store.activeClass();
      if (!cls) showName('Choose a class', 'placeholder');
      else if (!cls.students.length) showName('No students yet', 'placeholder');
      else {
        const last = st.last?.classId === cls.id && cls.students.find((s) => s.id === st.last.studentId);
        if (last) showName(last.name);
        else showName(cls.name, 'placeholder');
      }
      updateInfo();
    }

    refresh();
    const unsubscribe = ctx.store.subscribe(refresh);
    return {
      destroy() {
        clearTimeout(animation);
        unsubscribe();
      },
    };
  },
};
