import { el } from '../util.js';

const LIGHTS = [
  { id: 'red', label: 'Red' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'green', label: 'Green' },
];

export default {
  type: 'traffic',
  title: 'Traffic light',
  icon: 'traffic',
  defaultSize: { w: 0.18, h: 0.55 },

  create(body, ctx) {
    const st = ctx.state;
    st.on ??= null; // id of the lit light, or null

    const buttons = LIGHTS.map((light) =>
      el('button', {
        class: `light light-${light.id}`,
        title: light.label,
        'aria-label': light.label,
        onclick: () => {
          st.on = st.on === light.id ? null : light.id; // tap the lit light again to switch it off
          ctx.save();
          render();
        },
      }),
    );
    body.append(el('div', { class: 'traffic' }, el('div', { class: 'traffic-housing' }, buttons)));

    function render() {
      buttons.forEach((b, i) => {
        const on = st.on === LIGHTS[i].id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }

    render();
  },
};
