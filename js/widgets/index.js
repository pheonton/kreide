// Widget registry. To add a widget: create a module exporting
// { type, title, icon, defaultSize: { w, h }, create(body, ctx) } and list it here.
//
// create() receives the widget's body element and a context:
//   ctx.state             – plain object persisted with the widget (mutate, then call ctx.save())
//   ctx.save()            – persist ctx.state
//   ctx.store             – app store (store.get(), store.subscribe(fn), store.activeClass())
//   ctx.openClassManager()
// It may return { destroy() } to clean up timers and subscriptions.

import timer from './timer.js';
import picker from './picker.js';
import groups from './groups.js';
import traffic from './traffic.js';

export const widgetTypes = Object.fromEntries([timer, picker, groups, traffic].map((w) => [w.type, w]));
