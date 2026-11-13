# Generates the abstract SVG backgrounds (deterministic, seeded).
import math, random, sys, os
OUT = sys.argv[1]
W, H = 1920, 1080

def svg(name, body, defs=''):
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">'
         f'<defs>{defs}</defs>{body}</svg>\n')
    open(os.path.join(OUT, name), 'w').write(s)
    print(name, len(s))

def smooth_path(pts, closed=False):
    # Catmull-Rom -> cubic Bezier
    n = len(pts)
    get = (lambda i: pts[i % n]) if closed else (lambda i: pts[max(0, min(n - 1, i))])
    d = f'M{pts[0][0]:.0f} {pts[0][1]:.0f}'
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = get(i - 1), get(i), get(i + 1), get(i + 2)
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{c1[0]:.0f} {c1[1]:.0f} {c2[0]:.0f} {c2[1]:.0f} {p2[0]:.0f} {p2[1]:.0f}'
    return d + ('Z' if closed else '')

def lerp(a, b, t): return a + (b - a) * t
def hexrgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
def mix(c1, c2, t):
    a, b = hexrgb(c1), hexrgb(c2)
    return '#%02x%02x%02x' % tuple(round(lerp(a[i], b[i], t)) for i in range(3))
def shade(c, f):
    r = hexrgb(c)
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(v * f))) for v in r)

# 1. Waves
random.seed(1)
defs = '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2a5b"/><stop offset="1" stop-color="#0e6f86"/></linearGradient>'
body = f'<rect width="{W}" height="{H}" fill="url(#bg)"/>'
for i in range(6):
    base = 430 + i * 120
    a1, a2 = random.uniform(30, 70), random.uniform(15, 35)
    k1, k2 = random.uniform(1.2, 2.2), random.uniform(2.5, 4.5)
    p1, p2 = random.uniform(0, 6.3), random.uniform(0, 6.3)
    pts = [(x, base + a1 * math.sin(k1 * x / W * 2 * math.pi + p1) + a2 * math.sin(k2 * x / W * 2 * math.pi + p2)) for x in range(-80, W + 161, 80)]
    color = mix('#38bdf8', '#0f172a', i / 6)
    body += f'<path d="{smooth_path(pts)}L{W + 80} {H}L-80 {H}Z" fill="{color}" fill-opacity="{0.22 + i * 0.1:.2f}"/>'
svg('waves.svg', body, defs)

# 2. Aurora: soft colour clouds from radial gradients
random.seed(4)
blobs = [('#7c3aed', 380, 260, 760), ('#db2777', 1500, 220, 680), ('#06b6d4', 1150, 820, 820), ('#2563eb', 300, 900, 700), ('#a855f7', 900, 450, 520)]
defs = ''.join(f'<radialGradient id="g{i}"><stop offset="0" stop-color="{c}" stop-opacity="0.62"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>' for i, (c, *_ ) in enumerate(blobs))
body = f'<rect width="{W}" height="{H}" fill="#0b1026"/>' + ''.join(
    f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r * 0.72:.0f}" fill="url(#g{i})"/>' for i, (c, x, y, r) in enumerate(blobs))
svg('aurora.svg', body, defs)

# 3. Low-poly mesh
random.seed(7)
cols, rows = 16, 10
pts = [[(c * W / cols + (random.uniform(-0.38, 0.38) * W / cols if 0 < c < cols else 0),
         r * H / rows + (random.uniform(-0.38, 0.38) * H / rows if 0 < r < rows else 0)) for c in range(cols + 1)] for r in range(rows + 1)]
body = ''
for r in range(rows):
    for c in range(cols):
        a, b, d, e = pts[r][c], pts[r][c + 1], pts[r + 1][c], pts[r + 1][c + 1]
        for tri in ((a, b, e), (a, e, d)) if random.random() < 0.5 else ((a, b, d), (b, e, d)):
            cx = sum(p[0] for p in tri) / 3 / W
            cy = sum(p[1] for p in tri) / 3 / H
            t = (cx * 0.65 + cy * 0.35)
            col = mix('#312e81', '#0e7490', t) if t < 0.6 else mix('#0e7490', '#0f766e', (t - 0.6) / 0.4)
            col = shade(col, random.uniform(0.86, 1.14))
            body += f'<path d="M{tri[0][0]:.0f} {tri[0][1]:.0f}L{tri[1][0]:.0f} {tri[1][1]:.0f}L{tri[2][0]:.0f} {tri[2][1]:.0f}Z" fill="{col}" stroke="{col}" stroke-width="1"/>'
svg('lowpoly.svg', body)

# 4. Topography: contour lines of one height map (marching squares), so lines never cross
random.seed(11)
peaks = [(420, 300, 330, 1.0), (1500, 780, 380, 1.1), (1250, 180, 220, 0.6), (300, 950, 250, 0.55), (980, 620, 300, -0.45)]
waves = [(random.uniform(0.002, 0.005), random.uniform(0.002, 0.005), random.uniform(0, 6.3), random.uniform(0.05, 0.1)) for _ in range(4)]
def height(x, y):
    h = sum(a * math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * r * r)) for px, py, r, a in peaks)
    return h + sum(a * math.sin(fx * x + p) * math.cos(fy * y + p * 0.7) for fx, fy, p, a in waves)

STEP = 8
gw, gh = W // STEP + 2, H // STEP + 2
grid = [[height(i * STEP - STEP / 2, j * STEP - STEP / 2) for i in range(gw)] for j in range(gh)]
lo = min(min(r) for r in grid); hi = max(max(r) for r in grid)

def contour(level):
    segs = []
    def pt(i0, j0, i1, j1):
        a, b = grid[j0][i0], grid[j1][i1]
        t = (level - a) / (b - a)
        return (round((i0 + (i1 - i0) * t) * STEP - STEP / 2, 1), round((j0 + (j1 - j0) * t) * STEP - STEP / 2, 1))
    for j in range(gh - 1):
        for i in range(gw - 1):
            corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            inside = [grid[cj][ci] > level for ci, cj in corners]
            edges = [k for k in range(4) if inside[k] != inside[(k + 1) % 4]]
            pts = [pt(*corners[k], *corners[(k + 1) % 4]) for k in edges]
            if len(pts) == 2:
                segs.append((pts[0], pts[1]))
            elif len(pts) == 4:  # saddle: pair edges using the cell centre value
                centre = sum(grid[cj][ci] for ci, cj in corners) / 4 > level
                if centre == inside[0]:
                    segs += [(pts[0], pts[3]), (pts[1], pts[2])]
                else:
                    segs += [(pts[0], pts[1]), (pts[2], pts[3])]
    # Chain segments into polylines.
    ends = {}
    for k, (a, b) in enumerate(segs):
        ends.setdefault(a, []).append(k); ends.setdefault(b, []).append(k)
    used = [False] * len(segs)
    lines = []
    for k in range(len(segs)):
        if used[k]: continue
        used[k] = True
        line = list(segs[k])
        for direction in (0, 1):
            while True:
                tip = line[-1]
                nxt = next((m for m in ends.get(tip, []) if not used[m]), None)
                if nxt is None: break
                used[nxt] = True
                a, b = segs[nxt]
                line.append(b if a == tip else a)
            line.reverse()
        lines.append(line)
    return lines

def simplify(pts, tol=0.6):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1
    dmax, idx = 0, 0
    for k in range(1, len(pts) - 1):
        d = abs(dy * pts[k][0] - dx * pts[k][1] + x2 * y1 - y2 * x1) / norm
        if d > dmax: dmax, idx = d, k
    if dmax <= tol: return [pts[0], pts[-1]]
    return simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)

body = f'<rect width="{W}" height="{H}" fill="#163a35"/>'
count = 23
for n in range(1, count):
    level = lo + (hi - lo) * n / count
    major = n % 5 == 0
    d = ''
    for line in contour(level):
        if len(line) < 6: continue
        line = simplify(line)
        d += 'M' + 'L'.join(f'{x:.0f} {y:.0f}' for x, y in line)
    if d:
        body += f'<path d="{d}" fill="none" stroke="#a7f3d0" stroke-opacity="{0.38 if major else 0.2}" stroke-width="{2.6 if major else 1.5}" stroke-linejoin="round"/>'
svg('topo.svg', body)


# 5. Dusk: layered abstract hills under a warm sky
random.seed(5)
defs = '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#312e81"/><stop offset="0.55" stop-color="#be185d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>'
body = f'<rect width="{W}" height="{H}" fill="url(#sky)"/><circle cx="1380" cy="560" r="150" fill="#fde68a" fill-opacity="0.85"/>'
layers = ['#7c2d5e', '#5b2150', '#3b1a46', '#24123a', '#150b26']
for i, col in enumerate(layers):
    base = 560 + i * 110
    a, k, p = random.uniform(50, 110), random.uniform(1.0, 2.0), random.uniform(0, 6.3)
    pts = [(x, base + a * math.sin(k * x / W * 2 * math.pi + p) + 25 * math.sin(5 * x / W * 2 * math.pi + p * 2)) for x in range(-80, W + 161, 80)]
    body += f'<path d="{smooth_path(pts)}L{W + 80} {H}L-80 {H}Z" fill="{col}"/>'
svg('dusk.svg', body, defs)

# 6. Beach: pale sky (no sun), soft sea bands with foam lines, sand with a wavy shoreline
random.seed(21)
defs = ('<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3f2f7"/><stop offset="1" stop-color="#f7f3ea"/></linearGradient>'
        '<linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e4c6"/><stop offset="1" stop-color="#ead2a6"/></linearGradient>')
body = f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
sea = ['#cfe9ef', '#b7dfe7', '#9fd3dd', '#8ccad6']
for i, col in enumerate(sea):
    base = 600 + i * 55
    a, k, p = 6 + i * 3, random.uniform(2, 3.5), random.uniform(0, 6.3)
    pts = [(x, base + a * math.sin(k * x / W * 2 * math.pi + p)) for x in range(-80, W + 161, 80)]
    body += f'<path d="{smooth_path(pts)}L{W + 80} {H}L-80 {H}Z" fill="{col}"/>'
    if i:
        body += f'<path d="{smooth_path(pts)}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3"/>'
shore = [(x, 860 + 28 * math.sin(1.6 * x / W * 2 * math.pi + 0.8) + 10 * math.sin(4.3 * x / W * 2 * math.pi)) for x in range(-80, W + 161, 80)]
body += f'<path d="{smooth_path([(x, y - 14) for x, y in shore])}L{W + 80} {H}L-80 {H}Z" fill="#ffffff" fill-opacity="0.7"/>'
body += f'<path d="{smooth_path(shore)}L{W + 80} {H}L-80 {H}Z" fill="url(#sand)"/>'
svg('beach.svg', body, defs)

# 7. Silk: twisting ribbons made of many thin lines on a pale blue sky
def catmull_rom(pts, samples):
    out = []
    n = len(pts)
    for k in range(samples):
        u = k / (samples - 1) * (n - 1)
        i = min(int(u), n - 2)
        t = u - i
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)]
        out.append(tuple(0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t
                                + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t ** 3) for d in (0, 1)))
    return out

def ribbon(ctrl, width, twists, phase, lines, color, opacity, stroke=1.0, samples=90, edge=0.0, levels=8):
    spine = catmull_rom(ctrl, samples)
    paths = [[] for _ in range(lines)]
    spread = []  # ribbon width at each sample
    for j, (x, y) in enumerate(spine):
        a, b = spine[max(j - 1, 0)], spine[min(j + 1, samples - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        norm = math.hypot(dx, dy) or 1
        nx, ny = -dy / norm, dx / norm
        t = j / (samples - 1)
        swell = 0.55 + 0.45 * math.sin(math.pi * t)  # wider in the middle, narrower at the ends
        w = width * swell * math.cos(twists * math.pi * t + phase)  # sign change = the ribbon twists over
        spread.append(abs(w))
        for i in range(lines):
            off = (i / (lines - 1) - 0.5) * w
            paths[i].append((x + nx * off, y + ny * off))

    # Fade where the lines spread apart, keep them strong where the ribbon pinches.
    # Segments are grouped into a few opacity levels to keep the file small.
    widest = max(spread) or 1
    level_of = [round((1 - 0.8 * ((spread[j] + spread[j + 1]) / 2 / widest)) * (levels - 1)) for j in range(samples - 1)]

    def faded(polylines, alpha, sw):
        buckets = {}
        for line in polylines:
            j = 0
            while j < samples - 1:
                k = j
                while k + 1 < samples - 1 and level_of[k + 1] == level_of[j]:
                    k += 1
                buckets.setdefault(level_of[j], []).append(line[j:k + 2])
                j = k + 1
        out = ''
        for lvl, segs in sorted(buckets.items()):
            d = ''.join('M' + 'L'.join(f'{px:.0f} {py:.0f}' for px, py in seg) for seg in segs)
            out += f'<path d="{d}" fill="none" stroke="{color}" stroke-opacity="{alpha * (lvl + 1) / levels:.3f}" stroke-width="{sw}"/>'
        return out

    out = faded(paths, opacity, stroke)
    if edge:  # crisper outer edges, like the rim of a silk band
        out += faded([paths[0], paths[-1]], edge, 2.4)
    return out

# Change SILK_SEED to get a different arrangement of the same style.
SILK_SEED = 13

def sweep(rng, x0, x1, y_lo, y_hi, points):
    # control points across the screen with big alternating swings
    xs = [x0 + (x1 - x0) * k / (points - 1) for k in range(points)]
    up = rng.random() < 0.5
    ys = []
    for k in range(points):
        band = (y_lo, (y_lo + y_hi) / 2) if (k % 2 == 0) == up else ((y_lo + y_hi) / 2, y_hi)
        ys.append(rng.uniform(*band))
    return list(zip(xs, ys))

rng = random.Random(SILK_SEED)
defs = ('<linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d4ecf9"/><stop offset="1" stop-color="#e9f6fd"/></linearGradient>'
        '<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>')
body = f'<rect width="{W}" height="{H}" fill="url(#sky)"/><ellipse cx="960" cy="560" rx="900" ry="520" fill="url(#glow)"/>'
# white ribbons skimming the top and bottom edges; both ends lie off-screen so no ribbon
# visibly starts or stops (the rng calls stay, so the seed still gives the same layout)
off_left = lambda v: min(v, -260)
off_right = lambda v: max(v, 2180)
body += ribbon(sweep(rng, off_left(rng.uniform(-200, 300)), off_right(rng.uniform(1300, 2100)), -100, 200, 4), rng.uniform(130, 170), rng.uniform(1, 1.6), rng.uniform(0, 3), 28, '#ffffff', 0.85, edge=1)
body += ribbon(sweep(rng, off_left(rng.uniform(-200, 600)), off_right(rng.uniform(1300, 2100)), 880, 1180, 4), rng.uniform(120, 160), rng.uniform(1, 1.6), rng.uniform(0, 3), 26, '#ffffff', 0.85, edge=1)
# faint ribbon falling down one side
side_x = rng.choice([(1990, 1700), (-70, 220)])
body += ribbon([(side_x[0], -40), (side_x[1], 300), ((side_x[0] + side_x[1]) / 2, 700), (side_x[1], 1130)], 170, rng.uniform(1.2, 2), rng.uniform(0, 3), 28, '#8fd0ef', 0.6)
# two big sweeping ribbons across the screen
body += ribbon(sweep(rng, -160, 2100, 260, 980, rng.randint(4, 5)), rng.uniform(300, 360), rng.uniform(1.8, 2.8), rng.uniform(0, 3), 36, '#7cc6ec', 0.5, edge=0.7)
body += ribbon(sweep(rng, -160, 2100, 300, 960, rng.randint(4, 5)), rng.uniform(260, 320), rng.uniform(2.2, 3.2), rng.uniform(0, 3), 36, '#4aa8dd', 0.48, edge=0.65)
svg('silk.svg', body, defs)

# 8. Petals: soft, overlapping translucent discs in rose and sand, like scattered rose petals
random.seed(41)
defs = ('<linearGradient id="pbg" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#f6e9dc"/><stop offset="0.55" stop-color="#f3d6d2"/><stop offset="1" stop-color="#eec3c4"/></linearGradient>'
        '<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>')
PETAL_TONES = ['#f4b8be', '#f7cdd0', '#fbe3e2', '#f2d2b8', '#fff6f2', '#eeaab3']
for i, tone in enumerate(PETAL_TONES):  # each disc is a little deeper in the middle, like a petal
    defs += (f'<radialGradient id="pt{i}" cx="0.45" cy="0.42" r="0.6">'
             f'<stop offset="0" stop-color="{tone}" stop-opacity="0.75"/>'
             f'<stop offset="1" stop-color="{tone}" stop-opacity="0.35"/></radialGradient>')


def discs(count, r_lo, r_hi, edge):
    out = ''
    for _ in range(count):
        x, y = random.uniform(-100, W + 100), random.uniform(-100, H + 100)
        r = random.uniform(r_lo, r_hi)
        tone = random.randrange(len(PETAL_TONES))
        out += (f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.0f}" fill="url(#pt{tone})" opacity="{random.uniform(0.35, 0.8):.2f}"'
                + (f' stroke="#ffffff" stroke-opacity="{random.uniform(0.35, 0.7):.2f}" stroke-width="2"' if edge else '') + '/>')
    return out


body = f'<rect width="{W}" height="{H}" fill="url(#pbg)"/>'
body += f'<g filter="url(#soft)">{discs(45, 90, 220, False)}</g>'  # blurred discs further back
body += discs(70, 70, 170, True)                                   # crisp discs with a fine bright rim
svg('petals.svg', body, defs)

# 9. Grid paper: squared exercise paper with a soft light in the middle
defs = ('<pattern id="sq" width="40" height="40" patternUnits="userSpaceOnUse">'
        '<path d="M40 0H0V40" fill="none" stroke="#8fb6d6" stroke-opacity="0.45" stroke-width="1.4"/></pattern>'
        '<radialGradient id="pl" cx="0.5" cy="0.45" r="0.7"><stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>')
body = (f'<rect width="{W}" height="{H}" fill="#f8f7f0"/><rect width="{W}" height="{H}" fill="url(#sq)"/>'
        f'<rect width="{W}" height="{H}" fill="url(#pl)"/>')
svg('paper.svg', body, defs)

# 10. Pastel: a light version of the aurora, soft clouds of mint, lavender, peach and sky blue
blobs = [('#bfe8d6', 330, 250, 820), ('#d9cdf3', 1520, 260, 760), ('#fcd3bd', 1300, 880, 820),
         ('#c6e1f5', 280, 940, 720), ('#f6e7b0', 900, 520, 560)]
defs = ''.join(f'<radialGradient id="pa{i}"><stop offset="0" stop-color="{c}" stop-opacity="0.95"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>' for i, (c, *_ ) in enumerate(blobs))
body = f'<rect width="{W}" height="{H}" fill="#f9f4ec"/>' + ''.join(
    f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r * 0.72:.0f}" fill="url(#pa{i})"/>' for i, (c, x, y, r) in enumerate(blobs))
svg('pastel.svg', body, defs)

# 11. Honeycomb: dark grey hexagon tiles, lighter in soft drifting patches
random.seed(61)
R = 24                       # hexagon radius (pointy top)
HX, HY = math.sqrt(3) * R, 1.5 * R
GAP = 2.2                    # dark seam between tiles
fields = [(random.uniform(0.002, 0.006), random.uniform(0.002, 0.006), random.uniform(0, 6.3), random.uniform(0, 6.3)) for _ in range(5)]
def patch(x, y):  # smooth value in about -1..1, gives clusters of lighter tiles
    return sum(math.sin(fx * x + px) * math.cos(fy * y + py) for fx, fy, px, py in fields) / 2.2
r = R - GAP / 2
corner = [(r * math.cos(math.radians(60 * k - 30)), r * math.sin(math.radians(60 * k - 30))) for k in range(6)]
steps = [(corner[(k + 1) % 6][0] - corner[k][0], corner[(k + 1) % 6][1] - corner[k][1]) for k in range(5)]
rel = 'l' + ' '.join(f'{dx:.1f} {dy:.1f}' for dx, dy in steps) + 'z'
LEVELS = ['#141414', '#181818', '#1d1d1d', '#222222', '#282828', '#2e2e2e', '#353535', '#3d3d3d', '#454545']
buckets = [[] for _ in LEVELS]
for row in range(-1, int(H / HY) + 2):
    for col in range(-1, int(W / HX) + 2):
        cx = col * HX + (HX / 2 if row % 2 else 0)
        cy = row * HY
        v = patch(cx, cy) * 0.6 + random.uniform(-0.55, 0.55)   # patches plus per-tile jitter
        v -= 0.35 * abs(cy - H * 0.55) / (H * 0.55)             # a little darker towards top and bottom
        lvl = max(0, min(len(LEVELS) - 1, round((v + 1) / 2 * (len(LEVELS) - 1))))
        buckets[lvl].append(f'M{cx + corner[0][0]:.1f} {cy + corner[0][1]:.1f}{rel}')
defs = '<radialGradient id="hv" cx="0.5" cy="0.55" r="0.75"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>'
body = f'<rect width="{W}" height="{H}" fill="#0c0c0c"/>'
body += ''.join(f'<path d="{"".join(b)}" fill="{LEVELS[i]}"/>' for i, b in enumerate(buckets) if b)
body += f'<rect width="{W}" height="{H}" fill="url(#hv)"/>'
svg('honeycomb.svg', body, defs)

# 12. Animals: friendly animals peeking over a meadow in the bottom corners (centre stays calm)
random.seed(71)
INK = '#3b2f2a'
CHEEK = '<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{ry}" fill="#f29a9a" fill-opacity="0.55"/>'
def face(eye_dx, eye_y, nose_y, eye_r=7, nose='#3b2f2a', cheeks=True, cheek_dx=None, cheek_y=None):
    s = ''.join(f'<circle cx="{sx * eye_dx}" cy="{eye_y}" r="{eye_r}" fill="{INK}"/><circle cx="{sx * eye_dx + 2.2}" cy="{eye_y - 2.4}" r="{eye_r * 0.32:.1f}" fill="#fff"/>' for sx in (-1, 1))
    s += f'<ellipse cx="0" cy="{nose_y}" rx="11" ry="8" fill="{nose}"/>'
    s += f'<path d="M-12 {nose_y + 12}q6 8 12 0q6 8 12 0" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>'
    if cheeks:
        cdx, cy = cheek_dx or eye_dx + 14, cheek_y or eye_y + 26
        s += ''.join(CHEEK.format(x=sx * cdx, y=cy, r=15, ry=10) for sx in (-1, 1))
    return s

def place(x, y, s, inner, tilt=0):
    return f'<g transform="translate({x} {y}) rotate({tilt}) scale({s})">{inner}</g>'

def bear():
    fur, light = '#b07a52', '#f1dcc2'
    g = f'<ellipse cx="0" cy="190" rx="130" ry="140" fill="{fur}"/><ellipse cx="0" cy="215" rx="78" ry="95" fill="{light}"/>'
    g += ''.join(f'<circle cx="{sx * 70}" cy="-68" r="32" fill="{fur}"/><circle cx="{sx * 70}" cy="-68" r="17" fill="{light}"/>' for sx in (-1, 1))
    g += f'<ellipse cx="0" cy="0" rx="100" ry="90" fill="{fur}"/><ellipse cx="0" cy="34" rx="44" ry="34" fill="{light}"/>'
    # one paw waving, flipped around its own centre line (x ≈ 117)
    g += f'<g transform="translate(234 0) scale(-1 1) rotate(-18 120 120)"><rect x="96" y="40" width="54" height="120" rx="27" fill="{fur}"/><ellipse cx="123" cy="62" rx="17" ry="15" fill="{light}"/></g>'
    return g + face(36, -10, 20)

def fox():
    fur, white = '#e8874a', '#fdf6ee'
    g = f'<ellipse cx="0" cy="170" rx="100" ry="125" fill="{fur}"/><path d="M-50 90Q0 260 50 90Z" fill="{white}"/>'
    g += ''.join(f'<path d="M{sx * 30} -50L{sx * 78} -140L{sx * 92} -30Z" fill="{fur}"/><path d="M{sx * 48} -52L{sx * 76} -112L{sx * 82} -46Z" fill="{INK}" fill-opacity="0.75"/>' for sx in (-1, 1))
    g += f'<path d="M-98 -10Q-96 -78 0 -80Q96 -78 98 -10Q92 60 0 82Q-92 60 -98 -10Z" fill="{fur}"/>'
    g += f'<path d="M-96 0Q-60 10 -20 40Q-8 76 0 80Q8 76 20 40Q60 10 96 0Q90 58 0 82Q-90 58 -96 0Z" fill="{white}"/>'
    return g + face(38, -14, 46, cheek_dx=56, cheek_y=20)

def panda():
    white, black = '#faf8f4', '#2f2d2c'
    g = f'<ellipse cx="0" cy="180" rx="125" ry="135" fill="{black}"/><ellipse cx="0" cy="200" rx="88" ry="110" fill="{white}"/>'
    g += ''.join(f'<circle cx="{sx * 72}" cy="-66" r="31" fill="{black}"/>' for sx in (-1, 1))
    g += f'<ellipse cx="0" cy="0" rx="102" ry="90" fill="{white}"/>'
    g += ''.join(f'<ellipse cx="{sx * 38}" cy="-4" rx="24" ry="31" transform="rotate({sx * -28} {sx * 38} -4)" fill="{black}"/>' for sx in (-1, 1))
    g += ''.join(f'<circle cx="{sx * 38}" cy="-8" r="8" fill="#fff"/><circle cx="{sx * 38 + 1}" cy="-7" r="4.5" fill="{INK}"/>' for sx in (-1, 1))
    g += f'<ellipse cx="0" cy="30" rx="12" ry="8.5" fill="{black}"/><path d="M-12 42q6 8 12 0q6 8 12 0" fill="none" stroke="{black}" stroke-width="3.2" stroke-linecap="round"/>'
    g += ''.join(CHEEK.format(x=sx * 66, y=36, r=14, ry=9) for sx in (-1, 1))
    return g

def rabbit():
    fur, pink, light = '#e3d6c8', '#f5b9b9', '#f8f1e8'
    g = f'<ellipse cx="0" cy="175" rx="95" ry="125" fill="{fur}"/><ellipse cx="0" cy="195" rx="58" ry="85" fill="{light}"/>'
    g += f'<g transform="rotate(-10 -34 -60)"><ellipse cx="-34" cy="-140" rx="26" ry="86" fill="{fur}"/><ellipse cx="-34" cy="-136" rx="13" ry="64" fill="{pink}"/></g>'
    g += f'<g transform="rotate(22 34 -60)"><ellipse cx="34" cy="-140" rx="26" ry="86" fill="{fur}"/><ellipse cx="34" cy="-136" rx="13" ry="64" fill="{pink}"/></g>'
    g += f'<ellipse cx="0" cy="0" rx="86" ry="78" fill="{fur}"/><ellipse cx="0" cy="30" rx="36" ry="26" fill="{light}"/>'
    return g + face(32, -10, 20, nose='#e58c8c')

def cloud(x, y, s):
    return (f'<g transform="translate({x} {y}) scale({s})" fill="#ffffff" fill-opacity="0.85">'
            '<path d="M-90 0Q-92 -30 -60 -34Q-52 -70 -16 -66Q4 -100 40 -82Q76 -86 76 -48Q100 -40 96 0Z"/></g>')

defs = ('<linearGradient id="asky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf4ef"/><stop offset="1" stop-color="#f8f1e4"/></linearGradient>')
body = f'<rect width="{W}" height="{H}" fill="url(#asky)"/>'
body += cloud(330, 230, 1.0) + cloud(1560, 180, 1.2) + cloud(980, 130, 0.7) + cloud(1220, 330, 0.55) + cloud(640, 370, 0.5)
for _ in range(16):  # leaves drifting in the wind
    x, y = random.uniform(80, W - 80), random.uniform(120, 760)
    col = random.choice(['#a9c78f', '#c9b16f', '#e6b47c', '#bcd6a2'])
    body += f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="13" ry="6" transform="rotate({random.uniform(-60, 60):.0f} {x:.0f} {y:.0f})" fill="{col}"/>'
back = [(x, 830 + 50 * math.sin(1.4 * x / W * 2 * math.pi + 1.2) + 18 * math.sin(3.7 * x / W * 2 * math.pi)) for x in range(-80, W + 161, 80)]
body += f'<path d="{smooth_path(back)}L{W + 80} {H}L-80 {H}Z" fill="#d4e6cf"/>'
body += place(250, 790, 0.95, bear(), -3) + place(500, 850, 0.75, fox(), 4)
body += place(1420, 840, 0.78, rabbit(), -4) + place(1680, 790, 0.92, panda(), 3)
front = [(x, 975 - 50 * math.cos(x / W * 2 * math.pi) + 10 * math.sin(5 * x / W * 2 * math.pi)) for x in range(-80, W + 161, 80)]
body += f'<path d="{smooth_path(front)}L{W + 80} {H}L-80 {H}Z" fill="#bcd8b4"/>'
for _ in range(40):  # small tufts and flowers on the meadow
    x = random.uniform(0, W)
    y = 975 - 50 * math.cos(x / W * 2 * math.pi) + random.uniform(20, 90)
    if random.random() < 0.4:
        c = random.choice(['#fff7ef', '#f6c9c9', '#f6dd94'])
        body += ''.join(f'<circle cx="{x + 7 * math.cos(a):.0f}" cy="{y + 7 * math.sin(a):.0f}" r="5" fill="{c}"/>' for a in (0, 1.26, 2.51, 3.77, 5.03)) + f'<circle cx="{x:.0f}" cy="{y:.0f}" r="4" fill="#e7b25a"/>'
    else:
        body += f'<path d="M{x - 8:.0f} {y:.0f}q2 -14 4 -18M{x:.0f} {y:.0f}v-20M{x + 8:.0f} {y:.0f}q-2 -14 -4 -18" fill="none" stroke="#9cc28f" stroke-width="3" stroke-linecap="round"/>'
svg('animals.svg', body, defs)
