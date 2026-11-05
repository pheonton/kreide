import { el, icon } from '../util.js';

const PRESETS = [2, 5, 10, 15];

function format(ms, roundUp) {
  const total = roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// "5" → 5 min, "5:30" → 5 min 30 s, "1:00:00" → 1 h
function parseDuration(text) {
  const parts = text.trim().split(/[:.,\s]+/).map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [a, b = 0, c = 0] = parts;
  const seconds = parts.length === 3 ? a * 3600 + b * 60 + c : a * 60 + b;
  return seconds > 0 ? Math.min(seconds, 24 * 3600) * 1000 : null;
}

let audio;
function chime() {
  audio ??= new AudioContext();
  const t0 = audio.currentTime;
  [0, 0.35, 0.7].forEach((offset, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = i === 2 ? 1046.5 : 784;
    gain.gain.setValueAtTime(0.0001, t0 + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.6);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + 0.65);
  });
}

export default {
  type: 'timer',
  title: 'Timer',
  icon: 'timer',
  defaultSize: { w: 0.34, h: 0.5 },

  create(body, ctx) {
    const st = ctx.state;
    st.mode ??= 'timer';
    st.duration ??= 5 * 60_000;
    st.remaining ??= st.duration;
    st.endAt ??= null; // timer running until this timestamp
    st.elapsed ??= 0; // stopwatch time banked before the current run
    st.startAt ??= null; // stopwatch running since this timestamp
    st.sound ??= true;

    let done = false;
    let editing = false;
    if (st.endAt && st.endAt <= Date.now()) {
      st.endAt = null;
      st.remaining = 0;
      done = true;
    }

    const remaining = () => (st.endAt ? Math.max(0, st.endAt - Date.now()) : st.remaining);
    const elapsed = () => st.elapsed + (st.startAt ? Date.now() - st.startAt : 0);
    const running = () => (st.mode === 'timer' ? !!st.endAt : !!st.startAt);

    const root = el('div', { class: 'timer' });
    body.append(root);

    function start() {
      // Create the audio context during a click so browsers allow the end chime.
      audio ??= new AudioContext();
      if (audio.state === 'suspended') audio.resume();
      if (st.mode === 'timer') {
        if (remaining() <= 0) st.remaining = st.duration;
        st.endAt = Date.now() + st.remaining;
      } else {
        st.startAt = Date.now();
      }
      done = false;
      ctx.save();
      render();
    }

    function pause() {
      if (st.mode === 'timer') {
        st.remaining = remaining();
        st.endAt = null;
      } else {
        st.elapsed = elapsed();
        st.startAt = null;
      }
      ctx.save();
      render();
    }

    function reset() {
      st.endAt = null;
      st.remaining = st.duration;
      st.startAt = null;
      st.elapsed = 0;
      done = false;
      ctx.save();
      render();
    }

    function setDuration(ms) {
      st.duration = ms;
      reset();
    }

    function setMode(mode) {
      if (mode === st.mode) return;
      if (running()) pause();
      st.mode = mode;
      ctx.save();
      render();
    }

    function startEditing() {
      if (st.mode !== 'timer' || running()) return;
      editing = true;
      render();
    }

    function commitEdit(text) {
      if (!editing) return;
      editing = false;
      const ms = parseDuration(text);
      ms ? setDuration(ms) : render();
    }

    // Static layout is rebuilt on state changes; the clock text is updated by tick().
    let display, bar;
    function render() {
      const isTimer = st.mode === 'timer';
      const isRunning = running();
      root.classList.toggle('done', done);
      root.classList.toggle('running', isRunning);

      if (editing) {
        display = el('input', {
          class: 'timer-display timer-input',
          value: format(st.duration, true),
          inputmode: 'numeric',
          'aria-label': 'Timer duration (minutes or mm:ss)',
          placeholder: 'min or mm:ss',
          onkeydown: (e) => {
            if (e.key === 'Enter') commitEdit(e.target.value);
            if (e.key === 'Escape') (editing = false), render();
          },
          onblur: (e) => commitEdit(e.target.value),
        });
      } else {
        display = el(
          'button',
          {
            class: 'timer-display',
            title: isTimer && !isRunning ? 'Click to set time' : '',
            onclick: startEditing,
          },
          '',
        );
      }
      bar = el('div', { class: 'timer-bar' });

      root.replaceChildren(
        el(
          'div',
          { class: 'segmented timer-modes' },
          el('button', { class: isTimer ? 'on' : '', onclick: () => setMode('timer') }, 'Timer'),
          el('button', { class: !isTimer ? 'on' : '', onclick: () => setMode('stopwatch') }, 'Stopwatch'),
        ),
        display,
        isTimer && el('div', { class: 'timer-progress' }, bar),
        isTimer &&
          el(
            'div',
            { class: 'timer-presets' },
            PRESETS.map((m) => el('button', { class: 'chip', onclick: () => setDuration(m * 60_000) }, `${m} min`)),
            el(
              'button',
              {
                class: 'chip',
                title: 'Type any time, e.g. 7 or 7:30',
                onclick: () => {
                  if (running()) pause();
                  startEditing();
                },
              },
              'Custom…',
            ),
          ),
        el(
          'div',
          { class: 'timer-controls' },
          el(
            'button',
            { class: 'btn primary big', onclick: isRunning ? pause : start },
            icon(isRunning ? 'pause' : 'play'),
            isRunning ? 'Pause' : 'Start',
          ),
          el('button', { class: 'btn big', onclick: reset, title: 'Reset' }, icon('reset')),
          el(
            'button',
            {
              class: 'btn big',
              title: st.sound ? 'Sound on' : 'Sound off',
              onclick: () => {
                st.sound = !st.sound;
                ctx.save();
                render();
              },
            },
            icon(st.sound ? 'bell' : 'bellOff'),
          ),
        ),
      );
      if (editing) {
        display.focus();
        display.select();
      }
      tick();
    }

    function tick() {
      if (st.mode === 'timer' && st.endAt && remaining() <= 0) {
        st.endAt = null;
        st.remaining = 0;
        done = true;
        ctx.save();
        if (st.sound) chime();
        render();
        return;
      }
      if (editing) return;
      if (st.mode === 'timer') {
        const left = remaining();
        display.textContent = format(left, true);
        const fraction = st.duration ? left / st.duration : 0;
        bar.style.width = `${fraction * 100}%`;
        root.dataset.level = left <= 10_000 ? 'end' : fraction <= 0.2 ? 'low' : 'ok';
      } else {
        display.textContent = format(elapsed(), false);
        delete root.dataset.level;
      }
    }

    render();
    const interval = setInterval(tick, 200);
    return {
      // Called when the board changes (e.g. switching class): pause so the time is kept, not run down.
      // A page reload doesn't call this, so a running timer keeps going across reloads.
      destroy() {
        clearInterval(interval);
        if (running()) pause();
      },
    };
  },
};
