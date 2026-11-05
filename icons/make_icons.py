# Draws the Kreide logo (a chalk "K" on a small chalkboard) and renders the app icons.
# The K is a hand-drawn chalk outline filled with diagonal chalk hatching.
# Usage: python3 icons/make_icons.py   (needs Inkscape for the PNGs)
import random
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
BOARD = '#2f4a3c'
BOARD_DARK = '#243a2f'
CHALK = '#f3f0e6'

# Outline of a wide, almost square K (clockwise from the top left of the stem).
K_SHAPE = [
    (118, 110), (204, 110), (204, 232), (318, 110), (414, 110),   # stem top, arm top
    (266, 258),                                                  # notch between arm and leg
    (418, 402), (318, 402), (204, 290), (204, 402), (118, 402),  # leg, stem bottom
]

# Chalk texture: noise roughens the edges, a second noise punches fine grain into the lines.
CHALK_FILTER = (
    '<filter id="chalk" x="-10%" y="-10%" width="120%" height="120%">'
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="edge"/>'
    '<feDisplacementMap in="SourceGraphic" in2="edge" scale="5" xChannelSelector="R" yChannelSelector="G" result="rough"/>'
    '<feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="2" seed="8" result="grain"/>'
    '<feColorMatrix in="grain" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -3.2 0 0 0 2.75" result="mask"/>'
    '<feComposite in="rough" in2="mask" operator="in"/>'
    '</filter>'
)


def chalk_k(seed=5):
    rng = random.Random(seed)
    shape = [(x + rng.uniform(-3, 3), y + rng.uniform(-3, 3)) for x, y in K_SHAPE]  # hand-drawn wobble
    outline = 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in shape) + 'Z'

    # Diagonal hatching ("/" direction), drawn in short, slightly uneven chalk strokes.
    hatch = []
    for c in range(-420, 940, 15):
        t = 0
        while t < 560:
            length = rng.uniform(60, 180)
            gap = rng.choice([0, 0, 0, rng.uniform(4, 14)])
            wobble = rng.uniform(-2.5, 2.5)
            x0, y0 = c + t * 0.7071, 520 - t * 0.7071
            x1, y1 = c + (t + length) * 0.7071 + wobble, 520 - (t + length) * 0.7071 + wobble
            hatch.append(f'M{x0:.0f} {y0:.0f}L{x1:.0f} {y1:.0f}')
            t += length + gap
    # The outline is one separate stroke per edge, like drawing with chalk: strokes overshoot
    # or stop short at the corners and sit slightly off, and some edges get a second pass.
    edges = []
    for i, (ax, ay) in enumerate(shape):
        bx, by = shape[(i + 1) % len(shape)]
        dx, dy = bx - ax, by - ay
        length = (dx * dx + dy * dy) ** 0.5
        ux, uy = dx / length, dy / length
        for second_pass in (False, True):
            if second_pass and rng.random() < 0.55:
                continue
            start, end = rng.uniform(-12, 6), rng.uniform(-12, 6)  # positive = overshoot
            shift = rng.uniform(-4, 4) + (3 if second_pass else 0)
            x0, y0 = ax - ux * start - uy * shift, ay - uy * start + ux * shift
            x1, y1 = bx + ux * end - uy * shift, by + uy * end + ux * shift
            width = 6 if second_pass else 9.5
            edges.append(f'<path d="M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}" stroke-width="{width}"/>')
    return (
        f'<clipPath id="k"><path d="{outline}"/></clipPath>'
        f'<g clip-path="url(#k)"><path d="{"".join(hatch)}" fill="none" stroke="{CHALK}" stroke-width="5.5" '
        f'stroke-linecap="round" opacity="0.85" filter="url(#chalk)"/></g>'
        f'<g fill="none" stroke="{CHALK}" stroke-linecap="round" filter="url(#chalk)">{"".join(edges)}</g>'
    )


def icon(rounded=True, scale=1.0):
    radius = 112 if rounded else 0
    zoom = f'translate({256 * (1 - scale):.1f} {256 * (1 - scale):.1f}) scale({scale})'
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        '<defs><radialGradient id="b" cx="0.35" cy="0.3" r="0.9">'
        f'<stop offset="0" stop-color="{BOARD}"/><stop offset="1" stop-color="{BOARD_DARK}"/></radialGradient>{CHALK_FILTER}</defs>'
        f'<rect width="512" height="512" rx="{radius}" fill="url(#b)"/>'
        f'<g transform="{zoom}">{chalk_k()}</g></svg>\n'
    )


(HERE / 'icon.svg').write_text(icon())
maskable = HERE / 'icon-maskable.svg'
maskable.write_text(icon(rounded=False, scale=0.78))  # K inside the maskable safe zone

for src, size, out in [('icon.svg', 192, 'icon-192.png'), ('icon.svg', 512, 'icon-512.png'), ('icon-maskable.svg', 512, 'icon-maskable-512.png')]:
    subprocess.run(['inkscape', str(HERE / src), '--export-type=png', f'--export-filename={HERE / out}', f'--export-width={size}'], check=True, capture_output=True)
maskable.unlink()  # only needed to render the PNG
print('icons written')
