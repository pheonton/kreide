import { el } from '../util.js';

// Time and date in the browser's language and format (e.g. 24-hour clock in German).
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export default {
  type: 'clock',
  title: 'Clock',
  icon: 'clock',
  defaultSize: { w: 0.3, h: 0.32 },

  create(body) {
    const time = el('div', { class: 'clock-time' });
    const date = el('div', { class: 'clock-date' });
    body.append(el('div', { class: 'clock' }, time, date));

    let timeout;
    function tick() {
      const now = new Date();
      time.textContent = timeFormat.format(now);
      date.textContent = dateFormat.format(now);
      timeout = setTimeout(tick, 1000 - now.getMilliseconds()); // update right on the second
    }
    tick();

    return { destroy: () => clearTimeout(timeout) };
  },
};
