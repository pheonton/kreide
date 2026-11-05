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


# 6. Dusk: layered abstract hills under a warm sky
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

# 7. Beach: pale sky (no sun), soft sea bands with foam lines, sand with a wavy shoreline
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

# 8. Dunes: warm pastel sky (no sun) and layered dunes with a lit and a shaded side
random.seed(33)
defs = '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf1e6"/><stop offset="1" stop-color="#f8e2cc"/></linearGradient>'
body = f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
layers = [('#f4dcc0', '#ead0b1', 560), ('#f0cfaa', '#e2bd94', 660), ('#ebc297', '#d9ab7d', 770), ('#e4b386', '#cf9a6b', 890)]
for i, (lit, shade, base) in enumerate(layers):
    defs += f'<linearGradient id="d{i}" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0" stop-color="{lit}"/><stop offset="0.55" stop-color="{lit}"/><stop offset="1" stop-color="{shade}"/></linearGradient>'
    a, k, p = 70 - i * 8, random.uniform(0.8, 1.4), random.uniform(0, 6.3)
    # asymmetric ridges: gentle windward slope, steeper lee side
    pts = []
    for x in range(-80, W + 161, 40):
        t = k * x / W * 2 * math.pi + p
        pts.append((x, base - a * (math.sin(t) + 0.35 * math.sin(2 * t + 0.6))))
    body += f'<path d="{smooth_path(pts)}L{W + 80} {H}L-80 {H}Z" fill="url(#d{i})"/>'
svg('dunes.svg', body, defs)

# 9. Silk: twisting ribbons made of many thin lines on a pale blue sky
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

# 10. Petals: soft, overlapping translucent discs in rose and sand, like scattered rose petals
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
