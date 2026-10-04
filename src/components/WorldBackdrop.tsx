'use client';

// Landing backdrop: a dot-matrix world, attack arcs pinging between cities, and falling code.
// One canvas, one requestAnimationFrame loop, capped near 60fps. It pauses when the tab is hidden and draws a single
// still frame when reduced motion is on. Continent outlines are coarse hand-drawn polygons, not survey data.

import { useEffect, useRef } from 'react';

type Pt = [number, number]; // [longitude, latitude]

// Coarse continent outlines, longitude then latitude.
const LAND: Pt[][] = [
  // North America
  [[-168, 66], [-156, 71], [-140, 70], [-125, 70], [-110, 73], [-95, 72], [-82, 68], [-78, 62], [-64, 60], [-56, 52], [-66, 45], [-76, 38], [-81, 31], [-80, 25], [-83, 29], [-90, 30], [-97, 27], [-97, 21], [-90, 19], [-86, 21], [-88, 16], [-83, 10], [-77, 8], [-80, 7], [-86, 12], [-92, 15], [-105, 20], [-112, 30], [-118, 34], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-152, 58], [-165, 62]],
  // Greenland
  [[-55, 60], [-44, 60], [-20, 70], [-20, 82], [-60, 82], [-72, 77]],
  // South America
  [[-78, 10], [-72, 12], [-62, 11], [-50, 0], [-35, -5], [-39, -15], [-48, -26], [-58, -35], [-65, -42], [-68, -52], [-74, -50], [-74, -40], [-71, -25], [-70, -18], [-81, -5], [-80, 0]],
  // Eurasia
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [10, 57], [5, 60], [8, 63], [15, 68], [25, 71], [40, 68], [60, 70], [75, 73], [90, 77], [110, 76], [140, 72], [160, 70], [180, 66], [178, 62], [160, 58], [163, 53], [155, 58], [140, 50], [135, 43], [128, 38], [126, 34], [121, 30], [118, 24], [108, 21], [106, 10], [100, 13], [100, 4], [104, 1], [98, 8], [97, 16], [92, 22], [85, 21], [80, 15], [77, 8], [72, 20], [66, 25], [58, 26], [52, 28], [48, 30], [40, 28], [36, 35], [28, 37], [26, 40], [20, 40], [16, 38], [12, 44], [8, 44], [3, 42], [-2, 37], [-5, 36]],
  // Africa
  [[-17, 21], [-10, 30], [-6, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 12], [40, -3], [40, -15], [35, -25], [27, -34], [18, -34], [12, -18], [13, -5], [9, 4], [-8, 4], [-17, 14]],
  // Australia
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -18], [153, -27], [150, -37], [141, -38], [131, -31], [116, -35]],
];

const CITIES: { name: string; lon: number; lat: number }[] = [
  { name: 'new york', lon: -74, lat: 40.7 },
  { name: 'mexico city', lon: -99.1, lat: 19.4 },
  { name: 'sao paulo', lon: -46.6, lat: -23.5 },
  { name: 'london', lon: -0.1, lat: 51.5 },
  { name: 'lagos', lon: 3.4, lat: 6.5 },
  { name: 'cairo', lon: 31.2, lat: 30 },
  { name: 'moscow', lon: 37.6, lat: 55.7 },
  { name: 'mumbai', lon: 72.9, lat: 19.1 },
  { name: 'beijing', lon: 116.4, lat: 39.9 },
  { name: 'seoul', lon: 127, lat: 37.6 },
  { name: 'tokyo', lon: 139.7, lat: 35.7 },
  { name: 'sydney', lon: 151.2, lat: -33.9 },
];

const LAT_TOP = 78;
const LAT_BOTTOM = -58;
const CODE_CHARS = '01ABCDEF<>/{}[]=';

function inside(lon: number, lat: number, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Dots that fall on land, as 0..1 coordinates so they scale with the canvas. */
function landDots(stepX: number, stepY: number): [number, number][] {
  const dots: [number, number][] = [];
  for (let lat = LAT_TOP; lat >= LAT_BOTTOM; lat -= stepY) {
    for (let lon = -180; lon < 180; lon += stepX) {
      if (LAND.some((poly) => inside(lon, lat, poly))) {
        dots.push([(lon + 180) / 360, (LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)]);
      }
    }
  }
  return dots;
}

interface Arc {
  from: number;
  to: number;
  t: number;
  speed: number;
}

export default function WorldBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let dots: [number, number][] = [];
    let columns: { x: number; y: number; speed: number }[] = [];
    let arcs: Arc[] = [];
    let colour = '#33ff66';
    let raf = 0;
    let last = 0;
    let frame = 0;

    const cityPoint = (i: number): [number, number] => {
      const c = CITIES[i];
      return [(c.lon + 180) / 360, (LAT_TOP - c.lat) / (LAT_TOP - LAT_BOTTOM)];
    };

    const newArc = (): Arc => {
      const from = Math.floor(Math.random() * CITIES.length);
      let to = Math.floor(Math.random() * CITIES.length);
      if (to === from) to = (to + 1) % CITIES.length;
      return { from, to, t: 0, speed: 0.25 + Math.random() * 0.25 };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Fewer dots on narrow screens keeps the frame cheap on mid-range phones.
      const narrow = width < 640;
      dots = landDots(narrow ? 7 : 5, narrow ? 6 : 5);
      const colsCount = Math.ceil(width / 16);
      columns = Array.from({ length: colsCount }, (_, i) => ({ x: i * 16, y: Math.random() * height, speed: 20 + Math.random() * 60 }));
      arcs = Array.from({ length: 3 }, newArc);
      colour = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || colour;
    };

    const project = ([x, y]: [number, number]): [number, number] => [x * width, y * height];

    const draw = (dt: number) => {
      frame++;
      if (frame % 60 === 0) colour = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || colour;
      ctx.clearRect(0, 0, width, height);

      // Land dots.
      ctx.fillStyle = colour;
      ctx.globalAlpha = 0.24;
      for (const d of dots) {
        const [x, y] = project(d);
        ctx.fillRect(x, y, 2, 2);
      }

      // Falling code.
      ctx.globalAlpha = 0.14;
      ctx.font = '12px ui-monospace, Consolas, monospace';
      for (const col of columns) {
        if (!reduce) col.y += (col.speed * dt) / 1000;
        if (col.y > height + 20) col.y = -20;
        ctx.fillText(CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)], col.x, col.y);
      }

      // Attack arcs with a bright head and a ping where each one lands.
      for (let i = 0; i < arcs.length; i++) {
        const arc = arcs[i];
        if (!reduce) arc.t += (arc.speed * dt) / 1000;
        if (arc.t >= 1) {
          arcs[i] = newArc();
          continue;
        }
        const [x0, y0] = project(cityPoint(arc.from));
        const [x1, y1] = project(cityPoint(arc.to));
        const cx = (x0 + x1) / 2;
        const cy = Math.min(y0, y1) - Math.hypot(x1 - x0, y1 - y0) * 0.35;
        const steps = 28;
        const headAt = Math.min(1, arc.t);
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const u = (s / steps) * headAt;
          const px = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1;
          const py = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        const hu = headAt;
        const hx = (1 - hu) * (1 - hu) * x0 + 2 * (1 - hu) * hu * cx + hu * hu * x1;
        const hy = (1 - hu) * (1 - hu) * y0 + 2 * (1 - hu) * hu * cy + hu * hu * y1;
        ctx.fillRect(hx - 1.5, hy - 1.5, 3, 3);
        if (arc.t > 0.9) {
          ctx.globalAlpha = (1 - arc.t) * 3;
          ctx.beginPath();
          ctx.arc(x1, y1, 4 + (arc.t - 0.9) * 120, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      const dt = Math.min(64, now - last || 16);
      last = now;
      draw(dt);
      raf = window.requestAnimationFrame(loop);
    };

    const start = () => {
      if (reduce) {
        draw(0);
        return;
      }
      last = performance.now();
      raf = window.requestAnimationFrame(loop);
    };
    const stop = () => window.cancelAnimationFrame(raf);
    const onVisibility = () => (document.hidden ? stop() : start());

    resize();
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-0 opacity-90" />;
}
