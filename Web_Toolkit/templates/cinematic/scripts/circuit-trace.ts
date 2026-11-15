// ./src/scripts/circuit-trace.ts
// Cursor-driven circuit board: faint traces, pads and chip footprints that light up around the pointer, with small
// pulses travelling along the nearest traces. Replaces the old spotlight.
//
// Cost control: nothing is built until the first real mouse move; the drawing loop runs only while the pointer is
// moving or a pulse is alive, then stops (zero idle cost); the canvas never exists on touch devices, with reduced
// motion or with data saver. The pattern is generated once per viewport size from a fixed seed, so it looks the same
// on every visit and costs a few milliseconds.

type Point = { x: number; y: number };
type Trace = { points: Point[]; length: number; cumulative: number[] };
type Pulse = { trace: Trace; at: number; speed: number; born: number; life: number };
type Stamp = Point & { t: number };

const GRID = 26;
const REVEAL_RADIUS = 330;
const TRAIL_MS = 900;
const MAX_PULSES = 7;
/** Overall strength of the reveal. This is the one number to turn for a quieter (lower) or stronger (higher) effect. */
const INTENSITY = 1;

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const readAccent = (): [number, number, number] => {
  const cs = getComputedStyle(document.documentElement);
  const raw = (cs.getPropertyValue('--accent-contrast') || cs.getPropertyValue('--accent')).trim();
  const m = raw.match(/hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i);
  const [h, s, l] = m ? [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100] : [38, 0.5, 0.68];
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
};

/** Build the board: orthogonal traces with 45-degree chamfers, pads, vias, parallel buses and chip footprints. */
function buildBoard(width: number, height: number, scale: number, rgb: [number, number, number]) {
  const rand = mulberry32(20261115);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // A touch of blur makes the traces read as light coming through the background rather than as drawn lines.
  if ('filter' in ctx) ctx.filter = 'blur(0.6px)';
  const color = (alpha: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  const cols = Math.floor(width / GRID);
  const rows = Math.floor(height / GRID);
  const traces: Trace[] = [];
  const dirs: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

  const addTrace = (points: Point[]) => {
    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    traces.push({ points, length: cumulative[cumulative.length - 1], cumulative });
  };

  const drawPad = (p: Point, kind: number) => {
    ctx.fillStyle = color(0.95);
    ctx.strokeStyle = color(0.95);
    if (kind === 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
    else if (kind === 1) { ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
  };

  const walk = (startCol: number, startRow: number, offset = 0) => {
    let col = startCol;
    let row = startRow;
    let dir = Math.floor(rand() * 4);
    const pts: Point[] = [{ x: col * GRID + offset, y: row * GRID + offset }];
    const legs = 3 + Math.floor(rand() * 5);
    for (let leg = 0; leg < legs; leg += 1) {
      const run = 2 + Math.floor(rand() * 7);
      for (let step = 0; step < run; step += 1) {
        const nc = col + dirs[dir].x;
        const nr = row + dirs[dir].y;
        if (nc < 0 || nr < 0 || nc > cols || nr > rows) break;
        col = nc; row = nr;
      }
      pts.push({ x: col * GRID + offset, y: row * GRID + offset });
      // Turn, with an occasional chamfered corner.
      const turn = rand() < 0.5 ? 1 : 3;
      const nextDir = (dir + turn) % 4;
      if (rand() < 0.55) {
        const cx = col + dirs[nextDir].x;
        const cy = row + dirs[nextDir].y;
        const bx = col * GRID + offset + dirs[dir].x * 0;
        pts.push({ x: bx + dirs[nextDir].x * GRID * 0.5, y: row * GRID + offset + dirs[nextDir].y * GRID * 0.5 });
        col = cx; row = cy;
        pts.push({ x: col * GRID + offset, y: row * GRID + offset });
      }
      dir = nextDir;
    }
    return pts;
  };

  const strokePath = (pts: Point[], alpha: number, widthPx: number) => {
    ctx.strokeStyle = color(alpha);
    ctx.lineWidth = widthPx;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  };

  const count = Math.round((cols * rows) / 11);
  for (let i = 0; i < count; i += 1) {
    const sc = Math.floor(rand() * cols);
    const sr = Math.floor(rand() * rows);
    const bus = rand() < 0.2 ? 3 : 1;
    const base = walk(sc, sr);
    if (base.length < 3) continue;
    for (let lane = 0; lane < bus; lane += 1) {
      const lanePts = bus === 1 ? base : base.map((p) => ({ x: p.x + lane * 6, y: p.y + lane * 6 }));
      strokePath(lanePts, 0.8, bus === 1 ? 1.05 : 0.9);
      drawPad(lanePts[0], Math.floor(rand() * 3));
      drawPad(lanePts[lanePts.length - 1], Math.floor(rand() * 3));
      if (lane === 0) addTrace(lanePts);
    }
  }

  // Chip footprints with pin ticks.
  const chips = Math.max(3, Math.round((cols * rows) / 260));
  for (let i = 0; i < chips; i += 1) {
    const w = (3 + Math.floor(rand() * 3)) * GRID;
    const h = (2 + Math.floor(rand() * 3)) * GRID;
    const x = Math.floor(rand() * Math.max(1, cols - 6)) * GRID;
    const y = Math.floor(rand() * Math.max(1, rows - 5)) * GRID;
    ctx.strokeStyle = color(0.9);
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = color(0.9);
    ctx.beginPath(); ctx.arc(x + 8, y + 8, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.1;
    for (let p = GRID * 0.5; p < w; p += GRID * 0.5) {
      ctx.beginPath(); ctx.moveTo(x + p, y); ctx.lineTo(x + p, y - 7); ctx.moveTo(x + p, y + h); ctx.lineTo(x + p, y + h + 7); ctx.stroke();
    }
    for (let p = GRID * 0.5; p < h; p += GRID * 0.5) {
      ctx.beginPath(); ctx.moveTo(x, y + p); ctx.lineTo(x - 7, y + p); ctx.moveTo(x + w, y + p); ctx.lineTo(x + w + 7, y + p); ctx.stroke();
    }
  }
  return { canvas, traces };
}

const pointAt = (trace: Trace, distance: number): Point => {
  const target = Math.max(0, Math.min(trace.length, distance));
  let i = 1;
  while (i < trace.cumulative.length - 1 && trace.cumulative[i] < target) i += 1;
  const span = trace.cumulative[i] - trace.cumulative[i - 1] || 1;
  const t = (target - trace.cumulative[i - 1]) / span;
  return { x: trace.points[i - 1].x + (trace.points[i].x - trace.points[i - 1].x) * t, y: trace.points[i - 1].y + (trace.points[i].y - trace.points[i - 1].y) * t };
};

export function mountCircuit(): () => void {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let reveal: HTMLCanvasElement | null = null;
  let rctx: CanvasRenderingContext2D | null = null;
  let board: ReturnType<typeof buildBoard> | null = null;
  let rgb = readAccent();
  let width = 0;
  let height = 0;
  let raf = 0;
  let destroyed = false;
  const trail: Stamp[] = [];
  const pulses: Pulse[] = [];
  let lastSpawn = 0;
  let last = { x: -9999, y: -9999 };

  const build = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'circuit-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      reveal = document.createElement('canvas');
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
      rctx = reveal.getContext('2d');
    }
    canvas.width = reveal!.width = Math.round(width * dpr);
    canvas.height = reveal!.height = Math.round(height * dpr);
    board = buildBoard(width, height, dpr, rgb);
  };

  const frame = (now: number) => {
    raf = 0;
    if (destroyed || !ctx || !rctx || !canvas || !reveal || !board) return;
    while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
    for (let i = pulses.length - 1; i >= 0; i -= 1) if (now - pulses[i].born > pulses[i].life || pulses[i].at > pulses[i].trace.length) pulses.splice(i, 1);

    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, reveal.width, reveal.height);
    rctx.globalCompositeOperation = 'source-over';
    rctx.scale(dpr, dpr);
    // Soft, eased falloff so the reveal has no visible edge.
    for (const stamp of trail) {
      const strength = 1 - (now - stamp.t) / TRAIL_MS;
      const gradient = rctx.createRadialGradient(stamp.x, stamp.y, 0, stamp.x, stamp.y, REVEAL_RADIUS);
      const a = strength * strength * 0.09;
      gradient.addColorStop(0, `rgba(255,255,255,${a})`);
      gradient.addColorStop(0.18, `rgba(255,255,255,${a * 0.85})`);
      gradient.addColorStop(0.4, `rgba(255,255,255,${a * 0.5})`);
      gradient.addColorStop(0.62, `rgba(255,255,255,${a * 0.2})`);
      gradient.addColorStop(0.82, `rgba(255,255,255,${a * 0.05})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      rctx.fillStyle = gradient;
      rctx.fillRect(stamp.x - REVEAL_RADIUS, stamp.y - REVEAL_RADIUS, REVEAL_RADIUS * 2, REVEAL_RADIUS * 2);
    }
    rctx.globalCompositeOperation = 'source-in';
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.drawImage(board.canvas, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.025; // a hint of the board is always present once the pointer has moved
    ctx.drawImage(board.canvas, 0, 0);
    ctx.globalAlpha = INTENSITY;
    ctx.drawImage(reveal, 0, 0);
    ctx.globalAlpha = 1;

    // Pulses: small packets running along traces, brightest near the pointer.
    ctx.scale(dpr, dpr);
    for (const pulse of pulses) {
      pulse.at += pulse.speed * 0.016;
      const p = pointAt(pulse.trace, pulse.at);
      const near = Math.max(0, 1 - Math.hypot(p.x - last.x, p.y - last.y) / (REVEAL_RADIUS * 1.25));
      const fade = Math.min(1, (pulse.life - (now - pulse.born)) / 400);
      const alpha = Math.min(1, 0.15 + near * 0.6) * Math.max(0, fade) * 0.55;
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
      glow.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.75 * alpha})`);
      glow.addColorStop(0.35, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.25 * alpha})`);
      glow.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - 16, p.y - 16, 32, 32);
      ctx.fillStyle = `rgba(255,255,255,${0.9 * alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (trail.length || pulses.length) raf = requestAnimationFrame(frame);
  };

  const kick = () => { if (!raf && !destroyed) raf = requestAnimationFrame(frame); };

  const spawnPulses = (x: number, y: number, now: number) => {
    if (!board || now - lastSpawn < 140 || pulses.length >= MAX_PULSES) return;
    lastSpawn = now;
    // Pick a trace passing near the pointer and start the packet at its closest point.
    let best: { trace: Trace; at: number; d: number } | null = null;
    for (let tries = 0; tries < 60; tries += 1) {
      const trace = board.traces[Math.floor(Math.random() * board.traces.length)];
      for (let i = 0; i < trace.points.length; i += 1) {
        const d = Math.hypot(trace.points[i].x - x, trace.points[i].y - y);
        if (d < REVEAL_RADIUS * 0.8 && (!best || d < best.d)) best = { trace, at: trace.cumulative[i], d };
      }
      if (best && best.d < 90) break;
    }
    if (best) pulses.push({ trace: best.trace, at: best.at, speed: 120 + Math.random() * 120, born: now, life: 1800 + Math.random() * 1200 });
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || destroyed) return;
    if (!board) build();
    const now = performance.now();
    if (Math.hypot(event.clientX - last.x, event.clientY - last.y) > 22) {
      trail.push({ x: event.clientX, y: event.clientY, t: now });
      if (trail.length > 16) trail.shift();
      last = { x: event.clientX, y: event.clientY };
      spawnPulses(event.clientX, event.clientY, now);
    }
    kick();
  };

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { if (board) build(); }, 250);
  };
  const themeObserver = new MutationObserver(() => { rgb = readAccent(); if (board) build(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  document.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  const stopOnReduce = (event: MediaQueryListEvent) => { if (event.matches) destroy(); };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change', stopOnReduce);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('pointermove', onMove);
    window.removeEventListener('resize', onResize);
    reduced.removeEventListener('change', stopOnReduce);
    themeObserver.disconnect();
    canvas?.remove();
  }
  window.addEventListener('pagehide', destroy, { once: true });
  return destroy;
}
