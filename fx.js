/* ==========================================================================
   SVOLTS · FX — motor de animación compartido (versión 4)
   Se carga en las tres páginas. Sin dependencias.

   1. Escenas WebGL a pantalla completa (un triángulo + shader de fragmentos):
      - SOL: superficie de plasma con ruido fractal (fbm) y oscurecimiento
        hacia el borde, corona con serpentinas, estrellas, destellos de lente
        y una "ignición" al cargar.
      - AURORA: cortinas de luz con los colores del espectro visible.
      Calidad adaptable (baja la resolución si los cuadros tardan), pausa
      fuera de pantalla y en pestañas ocultas, y respaldo sin WebGL.
   2. Transición entre páginas: un sol se expande desde el punto de clic y la
      página nueva se abre con un anillo de luz (CSS puro en la llegada).
   3. Luz que sigue al cursor en tarjetas, botones magnéticos, titulares que
      se materializan palabra por palabra y valores que brillan al cambiar.
   4. Botón global "Pausar animaciones" (se recuerda entre páginas).
   Con prefers-reduced-motion: un cuadro estático, sin transiciones ni
   movimientos.
   ========================================================================== */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const $$ = (s, c = doc) => Array.from(c.querySelectorAll(s));
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  const FINE = window.matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
  };

  /* ------------------------------------------------------------------------
     0. ESTADO GLOBAL DE MOVIMIENTO
     ------------------------------------------------------------------------ */
  let paused = store.get('svfx-paused') === '1';
  const motionOK = () => !RM.matches && !paused;
  root.classList.toggle('fx-paused', paused);

  /* ------------------------------------------------------------------------
     1. WEBGL
     ------------------------------------------------------------------------ */
  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';

  // Funciones comunes: ruido de valor 3D, fbm, cielo, estrellas y mezcla.
  const COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform vec3 uSkyTop;
uniform vec3 uSkyBot;
uniform float uStars;
uniform float uGlow;
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm5(vec3 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v / 0.96875;
}
float fbm3(vec3 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec3(5.1, 1.3, 7.7); a *= 0.5; }
  return v / 0.875;
}
vec3 sky(vec2 fc) {
  float y = fc.y / uRes.y;
  return mix(uSkyBot, uSkyTop, smoothstep(0.0, 1.0, y));
}
vec3 stars(vec2 fc) {
  if (uStars <= 0.0) return vec3(0.0);
  float cs = max(uRes.y, 300.0) / 34.0;
  vec2 g = fc / cs;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash2(cell);
  if (h < 0.84) return vec3(0.0);
  vec2 o = vec2(hash2(cell + 7.13), hash2(cell + 3.71)) - 0.5;
  float d = length(f - o * 0.7);
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + h * 2.4) + h * 63.0);
  float size = 0.035 + 0.05 * hash2(cell + 1.9);
  return vec3(0.82, 0.9, 1.0) * smoothstep(size, 0.0, d) * tw * uStars * (h - 0.84) * 6.25;
}
// Suma de luz que satura con suavidad: con luz cero queda el color base exacto.
vec3 screenAdd(vec3 base, vec3 light) { return 1.0 - (1.0 - base) * exp(-light); }
`;

  const SUN_FRAG = COMMON + `
uniform vec3 uSun;      // centro (px, origen abajo-izquierda) y radio (px)
uniform float uIgnite;  // 0 = chispa, 1 = sol completo
uniform float uFlare;   // destellos de lente
uniform float uCor;     // escala de la corona en px (limita el halo de soles grandes)
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec3 base = sky(fc);
  vec3 L = stars(fc);
  float ig = clamp(uIgnite, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - ig, 3.0);
  float R = max(uSun.z * (0.06 + 0.94 * e), 1.0);
  vec2 p = (fc - uSun.xy) / R;
  float r = length(p);
  float d = max(length(fc - uSun.xy) - R, 0.0) / max(uCor, 1.0);
  float ang = atan(p.y, p.x);
  // Corona: halo radial y serpentinas que se desplazan hacia afuera
  // Las serpentinas solo se calculan donde todavía se ven (ahorra GPU)
  float streams = 0.0;
  if (d < 5.0) {
    float s = fbm3(vec3(cos(ang) * 2.2, sin(ang) * 2.2, uTime * 0.05 - d * 0.55));
    streams = pow(smoothstep(0.42, 0.9, s), 1.6) * exp(-d * 1.25);
  }
  float halo = exp(-d * 3.2) * 0.9 + exp(-d * 0.9) * 0.32 + exp(-d * 0.22) * 0.09;
  vec3 warm = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.82, 0.5), exp(-d * 2.4));
  L += warm * (halo + streams * 0.85) * uGlow * e;
  // Onda de ignición
  if (ig < 1.0) {
    float ring = abs(max(r - 1.0, 0.0) - ig * 5.0);
    L += vec3(1.0, 0.78, 0.42) * exp(-ring * 5.0) * (1.0 - ig) * 1.4;
  }
  // Destellos de lente sobre el eje sol → centro de la pantalla
  if (uFlare > 0.0) {
    vec2 axis = uRes * 0.5 - uSun.xy;
    for (int k = 0; k < 4; k++) {
      float kk = float(k);
      vec2 gp = uSun.xy + axis * (0.7 + kk * 0.42);
      float gr = uSun.z * (0.16 + 0.05 * kk + 0.08 * fract(kk * 1.7));
      float dd = length(fc - gp) / gr;
      float disc = smoothstep(1.0, 0.6, dd) * 0.06 + smoothstep(1.06, 1.0, dd) * smoothstep(0.86, 1.0, dd) * 0.08;
      vec3 tint = mod(kk, 2.0) < 0.5 ? vec3(1.0, 0.7, 0.3) : vec3(0.35, 0.65, 1.0);
      L += tint * disc * uFlare * e;
    }
  }
  vec3 col = screenAdd(base, L);
  // Superficie: plasma con deformación de dominio, granulación y limbo
  if (r < 1.0) {
    float z = sqrt(1.0 - r * r);
    vec3 n = vec3(p, z);
    float a = uTime * 0.02 + uMouse.x * 0.35;
    float ca = cos(a); float sa = sin(a);
    n = vec3(ca * n.x + sa * n.z, n.y, -sa * n.x + ca * n.z);
    float b = uMouse.y * 0.25;
    float cb = cos(b); float sb = sin(b);
    n = vec3(n.x, cb * n.y - sb * n.z, sb * n.y + cb * n.z);
    vec3 q = n * 2.3 + vec3(0.0, 0.0, uTime * 0.035);
    float w = fbm5(q);
    float h = fbm5(q * 1.8 + vec3(w * 1.7, w * 1.3, uTime * 0.07));
    float gr = fbm3(n * 16.0 + vec3(uTime * 0.22));
    float heat = clamp(0.66 * h + 0.22 * w + 0.24 * gr - 0.08, 0.0, 1.0);
    vec3 c = mix(vec3(0.55, 0.13, 0.02), vec3(0.97, 0.52, 0.1), smoothstep(0.18, 0.5, heat));
    c = mix(c, vec3(1.0, 0.8, 0.42), smoothstep(0.42, 0.7, heat));
    c = mix(c, vec3(1.0, 0.96, 0.82), smoothstep(0.66, 0.92, heat));
    c *= 0.42 + 0.58 * pow(z, 0.5);
    c = mix(c * vec3(1.0, 0.6, 0.32), c, smoothstep(0.0, 0.42, z));
    c = 1.0 - exp(-c * 1.6);
    float edge = smoothstep(1.0, 1.0 - 2.0 / R, r);
    col = mix(col, c, edge);
  }
  col += (hash2(fc + fract(uTime * 7.0)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

  const AURORA_FRAG = COMMON + `
// Color de una posición del espectro visible: 0 = violeta, 1 = rojo
vec3 spectral(float x) {
  float h = (1.0 - clamp(x, 0.0, 1.0)) * 0.75;
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  float asp = uRes.x / uRes.y;
  vec3 base = sky(fc);
  vec3 L = stars(fc);
  float t = uTime;
  for (int k = 0; k < 3; k++) {
    float kk = float(k);
    float x = uv.x * asp + kk * 1.37 + uMouse.x * 0.06 * (kk + 1.0);
    float wave = fbm3(vec3(x * 0.55 + t * (0.035 + kk * 0.01), kk * 4.1, t * 0.04));
    float baseY = 0.68 - kk * 0.14 + (wave - 0.5) * 0.36 + uMouse.y * 0.03;
    float dy = uv.y - baseY;
    // Cortina: borde inferior nítido y rayos verticales que se desvanecen hacia arriba
    float curtain = smoothstep(-0.02, 0.008, dy) * exp(-max(dy, 0.0) * (8.0 + kk * 3.0));
    float rays = pow(noise(vec3(x * 26.0, t * 0.5 + kk * 7.0, kk)), 1.6);
    rays *= 0.5 + 0.5 * noise(vec3(x * 6.0, t * 0.22, kk + 3.0));
    float hue = 0.5 + 0.5 * sin(uv.x * 3.1 + kk * 1.3 + t * 0.12);
    L += spectral(hue) * curtain * (0.25 + 1.6 * rays) * (0.8 - kk * 0.2) * uGlow;
  }
  // Más tenue del lado del texto (izquierda) para conservar el contraste
  L *= 0.3 + 0.7 * smoothstep(0.1, 0.65, uv.x);
  vec3 col = screenAdd(base, L);
  col += (hash2(fc + fract(uTime * 7.0)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

  const UNIFORMS = ['uRes', 'uTime', 'uMouse', 'uSkyTop', 'uSkyBot', 'uStars', 'uGlow', 'uSun', 'uIgnite', 'uFlare', 'uCor'];
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  function makeGL(canvas, frag) {
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' };
    let gl = null;
    try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const fs = sh(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    UNIFORMS.forEach((n) => { u[n] = gl.getUniformLocation(prog, n); });
    return { gl, u };
  }

  /* ------------------------------------------------------------------------
     Bucle único para todas las escenas
     ------------------------------------------------------------------------ */
  const scenes = new Set();
  let raf = 0, last = 0;
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    let running = false;
    scenes.forEach((s) => {
      if (s.running()) { s.step(dt); running = true; } else if (s.dirty && s.visible) s.render();
    });
    if (running) raf = requestAnimationFrame(frame); else last = 0;
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };
  doc.addEventListener('visibilitychange', wake);

  /* ------------------------------------------------------------------------
     createScene(canvas, cfg)
       cfg.kind      'sun' | 'aurora'
       cfg.host      elemento que recibe la clase fx-gl-on y el puntero
       cfg.place(w,h) → { x, y, r } en px CSS desde arriba a la izquierda
       cfg.sky       [arriba, abajo] en hex; cfg.stars, cfg.glow, cfg.flare
       cfg.scale     fracción de la resolución (calidad), cfg.ignite (bool)
       cfg.manual    true: otro módulo decide cuándo dibujar (setEnabled)
     ------------------------------------------------------------------------ */
  function createScene(canvas, cfg) {
    if (!canvas) return null;
    const g = makeGL(canvas, cfg.kind === 'aurora' ? AURORA_FRAG : SUN_FRAG);
    if (!g) { canvas.hidden = true; return null; }
    const { gl, u } = g;
    const host = cfg.host || canvas.parentElement;
    const top = hex(cfg.sky ? cfg.sky[0] : '#050E1C');
    const bot = hex(cfg.sky ? cfg.sky[1] : '#0B1F3A');
    const S = {
      visible: true, enabled: !cfg.manual, dirty: true, lost: false,
      time: cfg.time0 != null ? cfg.time0 : 6 + Math.random() * 20,
      ignite: cfg.ignite && motionOK() ? 0 : 1,
      quality: cfg.scale || 0.6, slow: 0,
      cw: 0, ch: 0, k: 1,
      mouse: [0, 0], mouseT: [0, 0],
      sun: { x: 0, y: 0, r: 0 }, extra: { glow: cfg.glow != null ? cfg.glow : 1, stars: cfg.stars != null ? cfg.stars : 1 },
      running() { return this.visible && this.enabled && !this.lost && motionOK() && !doc.hidden; },
      resize() {
        const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        let k = dpr * this.quality;
        const maxPx = 1.6e6;
        if (w * h * k * k > maxPx) k = Math.sqrt(maxPx / (w * h));
        const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
        if (W !== canvas.width || H !== canvas.height) { canvas.width = W; canvas.height = H; }
        this.cw = w; this.ch = h; this.k = W / w;
        gl.viewport(0, 0, W, H);
        this.place();
        this.dirty = true;
        wake();
      },
      place() {
        if (!cfg.place) return;
        const p = cfg.place(this.cw, this.ch, this);
        if (p) this.sun = p;
      },
      set(p) { Object.assign(this.sun, p); if (p.glow != null) this.extra.glow = p.glow; if (p.stars != null) this.extra.stars = p.stars; this.dirty = true; wake(); },
      setEnabled(on) { this.enabled = !!on; this.dirty = true; wake(); },
      render() {
        if (this.lost) return;
        const k = this.k;
        gl.uniform2f(u.uRes, canvas.width, canvas.height);
        gl.uniform1f(u.uTime, this.time % 3600);
        gl.uniform2f(u.uMouse, this.mouse[0], this.mouse[1]);
        gl.uniform3f(u.uSkyTop, top[0], top[1], top[2]);
        gl.uniform3f(u.uSkyBot, bot[0], bot[1], bot[2]);
        gl.uniform1f(u.uStars, this.extra.stars);
        gl.uniform1f(u.uGlow, this.extra.glow);
        if (u.uSun) gl.uniform3f(u.uSun, (this.sun.x + this.mouse[0] * 14) * k, (this.ch - this.sun.y + this.mouse[1] * 10) * k, this.sun.r * k);
        if (u.uIgnite) gl.uniform1f(u.uIgnite, this.ignite);
        if (u.uFlare) gl.uniform1f(u.uFlare, cfg.flare || 0);
        if (u.uCor) gl.uniform1f(u.uCor, Math.min(this.sun.r || 1, cfg.corona || 150) * k);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.dirty = false;
      },
      step(dt) {
        this.time += dt;
        if (this.ignite < 1) {
          const now = performance.now();
          if (!this.t0) this.t0 = now;
          this.ignite = Math.min(1, (now - this.t0) / 1800);
        }
        this.mouse[0] += (this.mouseT[0] - this.mouse[0]) * Math.min(1, dt * 3);
        this.mouse[1] += (this.mouseT[1] - this.mouse[1]) * Math.min(1, dt * 3);
        if (cfg.onStep) cfg.onStep(this, dt);
        // Calidad adaptable: si los cuadros tardan, se baja la resolución.
        if (dt > 0.034) this.slow++; else this.slow = Math.max(0, this.slow - 1);
        if (this.slow > 40 && this.quality > 0.32) { this.quality *= 0.8; this.slow = 0; this.resize(); }
        this.render();
      },
    };
    if (!S.running()) S.ignite = 1;

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S.lost = true; host.classList.remove('fx-gl-on'); canvas.hidden = true; });

    if (cfg.interactive !== false && host) {
      host.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = host.getBoundingClientRect();
        S.mouseT[0] = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
        S.mouseT[1] = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1, 1);
      }, { passive: true });
      host.addEventListener('pointerleave', () => { S.mouseT = [0, 0]; });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { S.visible = es[0].isIntersecting; if (S.visible) { S.dirty = true; wake(); } }, { rootMargin: '80px' }).observe(canvas);
    }
    if ('ResizeObserver' in window) new ResizeObserver(() => S.resize()).observe(canvas);
    else window.addEventListener('resize', () => S.resize());

    scenes.add(S);
    host.classList.add('fx-gl-on');
    S.resize();
    S.render();
    wake();
    return S;
  }

  /* ------------------------------------------------------------------------
     Escenas declaradas en el HTML: <canvas data-fx="sol-hero"> etc.
     ------------------------------------------------------------------------ */
  const rectIn = (el, host) => {
    const a = el.getBoundingClientRect(), b = host.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
  };
  const PRESETS = {
    // Portada: el sol se coloca donde estaba el sol de la ilustración 3D
    'sol-hero': (cv) => {
      const host = cv.closest('.hero');
      const scene = host && host.querySelector('.scene');
      return {
        kind: 'sun', host, sky: ['#040B17', '#123059'], stars: 1, flare: 1, glow: 1.05, scale: 0.55, ignite: true,
        place(w, h) {
          if (scene) {
            const r = rectIn(scene, host);
            const big = w >= 1081;
            return { x: r.x + r.w * (big ? 0.74 : 0.72), y: r.y + r.h * (big ? 0.2 : 0.18), r: clamp(r.w * 0.16, 52, 118) };
          }
          return { x: w * 0.78, y: h * 0.28, r: clamp(w * 0.08, 50, 110) };
        },
      };
    },
    // Cierre: un amanecer que sube conforme la sección entra en pantalla
    'sol-amanecer': (cv) => {
      const host = cv.closest('section');
      let rise = 0;
      return {
        kind: 'sun', host, sky: ['#0B1F3A', '#16365E'], stars: 0.8, flare: 0, glow: 1, corona: 120, scale: 0.5, interactive: true,
        place(w, h) {
          // El borde superior del disco sube hasta ~150 px sobre el fondo
          const R = clamp(w * 0.26, 170, 420);
          return { x: w / 2, y: h + R - (30 + 120 * rise), r: R };
        },
        onStep(S) {
          const r = host.getBoundingClientRect();
          const vh = window.innerHeight || 800;
          const target = clamp((vh - r.top) / (vh + r.height * 0.4), 0, 1);
          if (Math.abs(target - rise) > 0.001) { rise += (target - rise) * 0.08; S.place(); }
        },
      };
    },
    // Simulador: sol en la esquina superior derecha del encabezado
    'sol-sim': (cv) => {
      const host = cv.closest('section');
      return {
        kind: 'sun', host, sky: ['#08182E', '#123059'], stars: 0.7, flare: 0, glow: 1, scale: 0.55,
        place(w, h) {
          const R = clamp(w * 0.11, 70, 190);
          return w < 700 ? { x: w * 0.86, y: h * 0.16, r: R * 0.85 } : { x: w * 0.84, y: h * 0.32, r: R };
        },
      };
    },
    // Laboratorio: aurora con los colores del espectro visible
    'aurora': (cv) => ({ kind: 'aurora', host: cv.closest('section'), sky: ['#040B17', '#0B1F3A'], stars: 0.9, glow: 0.85, scale: 0.5 }),
  };
  function initDeclared() {
    $$('canvas[data-fx]').forEach((cv) => {
      const preset = PRESETS[cv.dataset.fx];
      if (!preset || cv.dataset.fxReady) return;
      cv.dataset.fxReady = '1';
      createScene(cv, preset(cv));
    });
  }

  /* ------------------------------------------------------------------------
     2. TRANSICIÓN ENTRE PÁGINAS
     La llegada la hace CSS (clase fx-arrive puesta en el <head>), así la
     página nunca queda tapada aunque este archivo no cargue.
     ------------------------------------------------------------------------ */
  function isOtherPage(a) {
    if (!a || !a.href || (a.target && a.target !== '_self') || a.hasAttribute('download')) return false;
    let url;
    try { url = new URL(a.href, window.location.href); } catch (e) { return false; }
    if (url.origin !== window.location.origin) return false;
    const here = window.location.pathname.replace(/index\.html$/, '');
    const there = url.pathname.replace(/index\.html$/, '');
    return here !== there && /(\.html|\/)$/.test(url.pathname);
  }
  doc.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!isOtherPage(a) || !motionOK()) return;
    e.preventDefault();
    let x = e.clientX, y = e.clientY;
    if (!e.detail || (x === 0 && y === 0)) { const r = a.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
    const W = window.innerWidth, H = window.innerHeight;
    const R = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 40;
    const veil = doc.createElement('div');
    veil.className = 'fx-iris';
    veil.setAttribute('aria-hidden', 'true');
    veil.style.setProperty('--x', x + 'px');
    veil.style.setProperty('--y', y + 'px');
    doc.body.appendChild(veil);
    const go = () => {
      try { window.sessionStorage.setItem('svfx-nav', JSON.stringify({ x: x / W, y: y / H, t: Date.now() })); } catch (err) { /* sin almacenamiento */ }
      window.location.href = a.href;
    };
    if (veil.animate) {
      const anim = veil.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }], { duration: 560, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' });
      anim.onfinish = go;
      setTimeout(go, 900);
    } else go();
  });
  window.addEventListener('pageshow', (e) => {
    $$('.fx-iris').forEach((v) => v.remove());
    if (e.persisted) root.classList.remove('fx-arrive');
  });
  // Limpieza de la llegada cuando termina
  if (root.classList.contains('fx-arrive')) setTimeout(() => root.classList.remove('fx-arrive'), 1100);

  /* ------------------------------------------------------------------------
     3a. LUZ QUE SIGUE AL CURSOR (tarjetas)
     ------------------------------------------------------------------------ */
  const SPOT = '.tile, .qcard, .hubcard, .bitem, .tile-s, .ro, .labtab, .compare__card, .jch__card';
  let hot = null;
  doc.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest ? e.target.closest(SPOT) : null;
    if (hot && hot !== el) hot.classList.remove('fx-hot');
    hot = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
    el.classList.add('fx-hot', 'fx-spot');
  }, { passive: true });
  doc.addEventListener('pointerleave', () => { if (hot) hot.classList.remove('fx-hot'); hot = null; });

  /* ------------------------------------------------------------------------
     3b. BOTONES MAGNÉTICOS (propiedad translate: no choca con transform)
     ------------------------------------------------------------------------ */
  const MAG = '.btn--lg, .nav__sim, [data-fx-magnet]';
  let magEl = null;
  doc.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !motionOK() || !FINE.matches) return;
    const el = e.target.closest ? e.target.closest(MAG) : null;
    if (magEl && magEl !== el) { magEl.style.translate = ''; magEl.classList.remove('fx-mag'); }
    magEl = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    el.classList.add('fx-mag');
    el.style.translate = (dx * 0.16).toFixed(1) + 'px ' + (dy * 0.28).toFixed(1) + 'px';
  }, { passive: true });

  /* ------------------------------------------------------------------------
     3c. TITULARES QUE SE MATERIALIZAN PALABRA POR PALABRA
     ------------------------------------------------------------------------ */
  const WORDS = '.hero__title, .simhero__title, .labhero__title, .section .h2, .closing__title, .journey__title';
  function splitWords(el) {
    if (el.dataset.fxWords) return;
    el.dataset.fxWords = '1';
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          if (!n.textContent.trim()) return;
          const frag = doc.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(part)); return; }
            const w = doc.createElement('span');
            w.className = 'fx-w';
            const inner = doc.createElement('span');
            inner.className = 'fx-wi';
            inner.style.setProperty('--wi', i++);
            inner.textContent = part;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          if (node !== el) node.classList.add('fx-has-words');
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && !n.matches('br, svg, img, sub, sup')) walk(n);
      });
    };
    walk(el);
    el.classList.add('fx-words');
  }
  function initWords() {
    if (RM.matches) return;
    const els = $$(WORDS);
    els.forEach(splitWords);
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('fx-in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('fx-in'); io.unobserve(en.target); }
    }), { threshold: 0.2 });
    els.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------------
     3d. VALORES QUE BRILLAN AL CAMBIAR (simulador y laboratorio)
     ------------------------------------------------------------------------ */
  function initLive() {
    $$('[data-fx-live]').forEach((box) => {
      const seen = new Map();
      const scan = () => {
        $$('.tile-s, .ro', box).forEach((it) => {
          const k = it.firstElementChild ? it.firstElementChild.textContent : '';
          const vEl = it.querySelector('.tile-s__v, strong');
          const v = vEl ? vEl.textContent : '';
          if (seen.has(k) && seen.get(k) !== v) it.classList.add('fx-pulse');
          seen.set(k, v);
        });
      };
      scan();
      new MutationObserver(scan).observe(box, { childList: true, subtree: true });
    });
  }

  /* ------------------------------------------------------------------------
     4. BOTÓN "PAUSAR ANIMACIONES"
     ------------------------------------------------------------------------ */
  function paintToggles() {
    $$('[data-fx-toggle]').forEach((b) => {
      b.setAttribute('aria-pressed', String(paused));
      const t = b.querySelector('.fx-toggle__t');
      if (t) t.textContent = paused ? 'Reanudar animaciones' : 'Pausar animaciones';
    });
  }
  function setPaused(p) {
    paused = p;
    store.set('svfx-paused', p ? '1' : '0');
    root.classList.toggle('fx-paused', p);
    paintToggles();
    scenes.forEach((s) => { s.dirty = true; if (s.ignite < 1) s.ignite = 1; });
    wake();
    doc.dispatchEvent(new CustomEvent('svfx:pause', { detail: { paused: p } }));
  }
  doc.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fx-toggle]');
    if (b) setPaused(!paused);
  });
  RM.addEventListener('change', () => { scenes.forEach((s) => { s.dirty = true; s.ignite = 1; }); wake(); });

  /* ------------------------------------------------------------------------
     API pública y arranque
     ------------------------------------------------------------------------ */
  window.SVFX = {
    createScene,
    motionOK,
    get paused() { return paused; },
    reduced: () => RM.matches,
  };
  const start = () => { initDeclared(); initWords(); initLive(); paintToggles(); };
  window.addEventListener('load', () => scenes.forEach((s) => s.resize()));
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
