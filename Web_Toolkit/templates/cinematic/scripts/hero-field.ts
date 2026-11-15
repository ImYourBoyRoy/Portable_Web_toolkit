// ./templates/cinematic/scripts/hero-field.ts
// Hero "contour field": a single full-screen WebGL2 fragment shader that draws slowly drifting
// isolines in the accent color, brightened around the pointer. Loaded with a dynamic import only on
// desktop + fine pointer + no reduced motion, after `load` and idle, so it never touches the
// critical path. The CSS poster in hero.css is the first (and, elsewhere, only) state.
//
// Cost control: renders at <= ~0.7x CSS resolution, caps at 30fps, pauses when offscreen or the tab
// is hidden, and tears itself down on context loss, reduced-motion changes or navigation.

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision mediump float;
uniform vec2 u_res;
uniform vec2 u_ptr;
uniform float u_time;
uniform float u_energy;
uniform vec3 u_col;
out vec4 o;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 pp = (u_ptr - 0.5 * u_res) / u_res.y;
  float d = length(p - pp);
  float t = u_time * 0.04;

  vec2 q = p * 1.7;
  q += (p - pp) * exp(-d * 2.6) * 0.38 * u_energy;
  vec2 w = vec2(fbm(q + vec2(0.0, t)), fbm(q + vec2(5.2, 1.3) - t));
  float h = fbm(q + 2.4 * w + vec2(t * 1.3, -t));

  float hv = h * 11.0;
  float fw = fwidth(hv);
  float edge = 0.5 - abs(fract(hv) - 0.5);
  float line = 1.0 - smoothstep(0.0, fw * 1.5, edge);

  float glow = exp(-d * d * 7.0) * u_energy;
  float mask = mix(0.22, 1.0, smoothstep(0.1, 0.9, uv.x)) * mix(0.3, 1.0, smoothstep(0.0, 0.62, uv.y));
  float a = line * (0.09 + 0.62 * glow) * mask;
  a += glow * 0.05 * mask;
  o = vec4(u_col * a, a);
}`;

type Rgb = [number, number, number];

const hslToRgb = (h: number, s: number, l: number): Rgb => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

const readAccent = (): Rgb => {
  const cs = getComputedStyle(document.documentElement);
  const raw = cs.getPropertyValue('--accent-contrast').trim() || cs.getPropertyValue('--accent').trim();
  const m = raw.match(/hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i);
  if (!m) return [0.85, 0.72, 0.5];
  return hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);
};

export function mountField(host: HTMLElement, events: HTMLElement = host): () => void {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-field-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return () => {};

  // Software rasterizers (SwiftShader, llvmpipe) would burn CPU that the page needs. Keep the poster.
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return () => {};
  }

  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return () => {};
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return () => {};
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, 'u_res');
  const uPtr = gl.getUniformLocation(program, 'u_ptr');
  const uTime = gl.getUniformLocation(program, 'u_time');
  const uEnergy = gl.getUniformLocation(program, 'u_energy');
  const uCol = gl.getUniformLocation(program, 'u_col');

  host.appendChild(canvas);

  let width = 1;
  let height = 1;
  const resize = () => {
    const rect = host.getBoundingClientRect();
    const scale = Math.min(0.7, 1100 / Math.max(rect.width, 1));
    width = Math.max(2, Math.round(rect.width * scale));
    height = Math.max(2, Math.round(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };
  resize();

  let color = readAccent();
  const themeObserver = new MutationObserver(() => { color = readAccent(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });

  // Pointer state, smoothed in the render loop. u_ptr is in canvas pixels with y flipped for GL.
  let targetX = 0.62;
  let targetY = 0.42;
  let ptrX = targetX;
  let ptrY = targetY;
  let energy = 0;
  let energyTarget = 0;
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const rect = host.getBoundingClientRect();
    targetX = (event.clientX - rect.left) / rect.width;
    targetY = 1 - (event.clientY - rect.top) / rect.height;
    energyTarget = 1;
  };
  const onLeave = () => { energyTarget = 0; };
  events.addEventListener('pointermove', onMove, { passive: true });
  events.addEventListener('pointerleave', onLeave);

  let raf = 0;
  let running = false;
  let visible = true;
  let last = 0;
  let clock = 0;
  const FRAME = 1000 / 30;

  const frame = (now: number) => {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = now - last;
    if (dt < FRAME) return;
    last = now;
    clock += Math.min(dt, 100) / 1000;
    ptrX += (targetX - ptrX) * 0.07;
    ptrY += (targetY - ptrY) * 0.07;
    energy += (energyTarget - energy) * 0.06;
    gl.uniform2f(uRes, width, height);
    gl.uniform2f(uPtr, ptrX * width, ptrY * height);
    gl.uniform1f(uTime, clock);
    gl.uniform1f(uEnergy, energy);
    gl.uniform3f(uCol, color[0], color[1], color[2]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!canvas.classList.contains('is-live')) canvas.classList.add('is-live');
  };

  const sync = () => {
    const shouldRun = visible && !document.hidden;
    if (shouldRun && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    sync();
  });
  io.observe(host);
  document.addEventListener('visibilitychange', sync);
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    themeObserver.disconnect();
    document.removeEventListener('visibilitychange', sync);
    events.removeEventListener('pointermove', onMove);
    events.removeEventListener('pointerleave', onLeave);
    canvas.remove();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); destroy(); });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
    if (event.matches) destroy();
  });
  window.addEventListener('pagehide', destroy, { once: true });
  sync();
  return destroy;
}
