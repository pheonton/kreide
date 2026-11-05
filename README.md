# Kreide

A private classroom screen for the big display: timer/stopwatch, random student picker,
group maker, traffic light, pen and class lists imported from Excel. No accounts, no server,
no tracking — all data stays in the browser on the computer you use it on.

**Open it:** <https://pheonton.github.io/kreide/> — in Chrome or Edge, click the install icon
in the address bar to install it as an app. After that it also works offline.

> Student data is never stored in this repository or sent to GitHub. GitHub only serves the
> empty app; classes, names and boards live in each browser's local storage. Never commit
> exported backups (`kreide-backup-*.json`) or class lists — `.gitignore` blocks the usual ones.

## Run locally (development only)

```bash
python3 serve.py
```

Serves the folder on <http://localhost:8642> (this computer only), for testing changes before
they are pushed. Opening `index.html` directly does not work: the app uses JavaScript modules,
which browsers block on `file://`. Every push to `main` is published by
`.github/workflows/pages.yml`.

## Using it

- **Classes** (top left): create classes, import a class list or paste a column from Excel. Accepts `.xlsx`, `.xls` (also HTML/XML tables saved as `.xls`) and `.csv`. Name columns like *Vorname*/*Nachname*
  are detected automatically; workbooks with one sheet per class are supported.
- **Each class has its own board**: background and widgets switch with the class. A new class starts with a copy of the board on screen.
- **Dock** (bottom): add widgets. Drag them by the title bar, resize from the bottom-right corner.
- **Group maker**: choose students per group or number of groups, then *Make groups*. Group sizes differ by at most one.
- **Traffic light**: tap a light to switch it on, tap it again to switch it off. Turns horizontal when the widget is wide.
- **Pen** (dock): draw on the board with seven colours, thin or thick lines, eraser, undo and clear. Drawings are saved with the class. *Done* or Esc leaves pen mode and ends the undo history.
- **Pop out** (Chrome/Edge, button in a widget's title bar): the widget moves into a small window that stays on top of other programs, e.g. over a presentation. Click the button again or close the window to bring it back. One widget at a time.
- **Clock**: current time and date, in the browser's language and format.
- **Timer**: click the time to type a duration (`5`, `5:30`, `1:00:00`).
- **F** toggles fullscreen.
- **Export backup** in the class manager saves everything as JSON — use it to move your
  classes to another computer (e.g. the classroom PC) or as a safety copy. Data does not
  sync between computers or between the online and the local version.

## Adding widgets

Create `js/widgets/<name>.js` (see `timer.js` / `picker.js` for the shape), register it in
`js/widgets/index.js`, and add the file to `ASSETS` in `sw.js` (bump `VERSION`).
