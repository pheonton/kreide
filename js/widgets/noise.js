import { el, icon, clamp } from '../util.js';

// Noise board: a quiet-class game. The lesson phase is split into squares; each square turns
// green when the class was quiet enough during its slice of time, red when it was too loud.
// The microphone is only measured for loudness in the browser — nothing is recorded or sent.

const SQUARE_SECONDS = 20; // every square is a fixed slice of time
const DURATIONS = [5, 10, 15, 20]; // minutes; longer phases get more squares
const LOUD_SHARE = 0.25; // a square turns red when more than this share of its time was too loud

export default {
  type: 'noise',
  title: 'Noise board',
  icon: 'mic',
  defaultSize: { w: 0.42, h: 0.6 },

  create(body, ctx) {
    const st = ctx.state;
    st.duration ??= 10;
    st.threshold ??= 0.55; // allowed volume, 0..1 on the meter
    st.tiles ??= []; // finished squares: 'g' or 'r'

    let running = false;
    let mic = null; // { stream, audio, analyser, buffer }
    let level = 0; // smoothed loudness 0..1
    let elapsed = 0; // ms in the current square
    let loud = 0; // ms too loud in the current square
    let last = 0;
    let timer = null;
    let error = '';

    const grid = el('div', { class: 'noise-grid' });
    const message = el('div', { class: 'noise-message' });
    const meterFill = el('div', { class: 'noise-meter-fill' });
    const meterMark = el('div', { class: 'noise-meter-mark' });
    const controls = el('div', { class: 'noise-controls' });
    const slider = el('input', {
      type: 'range',
      min: '0.15',
      max: '0.95',
      step: '0.01',
      value: String(st.threshold),
      'aria-label': 'Allowed volume',
      oninput: (e) => {
        st.threshold = Number(e.target.value);
        ctx.save();
        meterMark.style.left = `${st.threshold * 100}%`;
      },
    });
    body.append(
      el(
        'div',
        { class: 'noise' },
        controls,
        el('div', { class: 'noise-board' }, grid, message),
        el(
          'div',
          { class: 'noise-footer' },
          el('div', { class: 'noise-meter', title: 'Current volume' }, meterFill, meterMark),
          el('label', { class: 'noise-allowed' }, 'Allowed volume', slider),
          el('button', { class: 'btn small', title: 'Listen briefly and set the limit just above the current volume', onclick: useCurrentLevel }, 'Use current level'),
        ),
      ),
    );

    const tileCount = () => (st.duration * 60) / SQUARE_SECONDS;
    const tileMs = () => SQUARE_SECONDS * 1000;
    const finished = () => st.tiles.length >= tileCount();

    async function startMic() {
      if (mic) return true;
      try {
        // Raw signal: the browser's voice processing would even out loud and quiet.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const audio = new AudioContext();
        const analyser = audio.createAnalyser();
        analyser.fftSize = 1024;
        audio.createMediaStreamSource(stream).connect(analyser);
        mic = { stream, audio, analyser, buffer: new Float32Array(analyser.fftSize) };
        error = '';
        return true;
      } catch (err) {
        console.warn('Microphone not available', err);
        error = 'No microphone access. Allow the microphone for this site and try again.';
        return false;
      }
    }

    function stopMic() {
      mic?.stream.getTracks().forEach((t) => t.stop());
      mic?.audio.close();
      mic = null;
      level = 0;
    }

    // Loudness as 0..1: RMS in decibels, mapped from -60 dB (silence) to 0 dB (very loud).
    function measure() {
      mic.analyser.getFloatTimeDomainData(mic.buffer);
      let sum = 0;
      for (const v of mic.buffer) sum += v * v;
      const db = 20 * Math.log10(Math.sqrt(sum / mic.buffer.length) || 1e-6);
      const now = clamp((db + 60) / 60, 0, 1);
      level += (now - level) * (now > level ? 0.35 : 0.08); // rises quickly, falls slowly
    }

    function tick() {
      const now = performance.now();
      const dt = now - last;
      last = now;
      measure();
      if (level > st.threshold) loud += dt;
      elapsed += dt;
      if (elapsed >= tileMs()) {
        st.tiles.push(loud / elapsed > LOUD_SHARE ? 'r' : 'g');
        elapsed = 0;
        loud = 0;
        ctx.save();
        if (finished()) return stop(true);
        renderGrid();
      }
      renderLive();
    }

    async function start() {
      grid.classList.remove('celebrate'); // a new round starts without the last celebration
      if (finished()) reset();
      if (!(await startMic())) return render();
      running = true;
      last = performance.now();
      timer = setInterval(tick, 100);
      render();
    }

    function stop(done = false) {
      running = false;
      clearInterval(timer);
      stopMic();
      render();
      if (done && st.tiles.every((t) => t === 'g')) celebrate(); // a fully green board
    }

    function reset() {
      stop();
      st.tiles = [];
      grid.classList.remove('celebrate');
      elapsed = 0;
      loud = 0;
      ctx.save();
      render();
    }

    // Listens for a moment and sets the limit just above the current volume.
    async function useCurrentLevel() {
      const wasRunning = running;
      if (!(await startMic())) return render();
      level = 0;
      let peak = 0;
      const until = performance.now() + 1500;
      const sample = setInterval(() => {
        if (!wasRunning) measure(); // while playing, tick() already measures
        peak = Math.max(peak, level);
        if (performance.now() < until) return;
        clearInterval(sample);
        st.threshold = clamp(peak + 0.05, 0.15, 0.95);
        slider.value = String(st.threshold);
        ctx.save();
        if (!wasRunning && !running) stopMic();
        renderLive();
      }, 100);
    }

    function celebrate() {
      grid.classList.remove('celebrate');
      void grid.offsetWidth; // restart the animation
      grid.classList.add('celebrate');
    }

    // ---------- Rendering ----------

    function renderControls() {
      controls.replaceChildren(
        el(
          'div',
          { class: 'segmented' },
          DURATIONS.map((m) =>
            el(
              'button',
              {
                class: st.duration === m ? 'on' : '',
                disabled: running,
                title: `${(m * 60) / SQUARE_SECONDS} squares of ${SQUARE_SECONDS} seconds`,
                onclick: () => {
                  st.duration = m;
                  ctx.save();
                  render();
                },
              },
              `${m} min`,
            ),
          ),
        ),
        el('span', { class: 'spacer' }),
        el(
          'button',
          { class: 'btn primary', onclick: () => (running ? stop() : start()) },
          icon(running ? 'pause' : 'play'),
          running ? 'Pause' : finished() ? 'Play again' : st.tiles.length ? 'Continue' : 'Start',
        ),
        el('button', { class: 'btn', title: 'Clear the board', onclick: reset, disabled: !st.tiles.length && !elapsed }, icon('reset')),
      );
    }

    function renderGrid() {
      const cells = [];
      const count = tileCount();
      for (let i = 0; i < count; i++) {
        const result = st.tiles[i];
        const current = i === st.tiles.length && !finished();
        cells.push(el('div', { class: 'noise-cell' + (result === 'g' ? ' green' : result === 'r' ? ' red' : '') + (current ? ' current' : '') }));
      }
      grid.replaceChildren(...cells);
      fitGrid();
      renderLive();

      message.textContent = error; // only problems are shown; judging the result is up to the teacher
      message.hidden = !error;
    }

    // The square being played fills up and shows whether it is currently quiet or loud.
    function renderLive() {
      const cell = grid.querySelector('.noise-cell.current');
      if (cell) {
        cell.style.setProperty('--p', String(clamp(elapsed / tileMs(), 0, 1)));
        cell.classList.toggle('loud', running && elapsed > 0 && loud / elapsed > LOUD_SHARE);
      }
      meterFill.style.width = `${level * 100}%`;
      meterFill.classList.toggle('over', level > st.threshold);
      meterMark.style.left = `${st.threshold * 100}%`;
    }

    // Square cells: pick the column count that best matches the widget's shape.
    function fitGrid() {
      const { clientWidth: w, clientHeight: h } = grid.parentElement;
      if (!w || !h) return;
      let best = { cols: 6, size: 0 };
      const count = tileCount();
      for (let cols = 3; cols <= 15; cols++) {
        const rows = Math.ceil(count / cols);
        const size = Math.min(w / cols, h / rows);
        if (size > best.size) best = { cols, size };
      }
      grid.style.gridTemplateColumns = `repeat(${best.cols}, ${Math.floor(best.size) - 6}px)`;
    }

    function render() {
      renderControls();
      renderGrid();
    }

    render();
    const resize = new ResizeObserver(fitGrid);
    resize.observe(grid.parentElement);
    return {
      destroy() {
        if (running) stop(); // switching class pauses the game and turns the microphone off
        resize.disconnect();
      },
    };
  },
};
