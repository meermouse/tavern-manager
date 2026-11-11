export type Point = [number, number];
export type Polygon = Point[];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Keep the part of `poly` where a·p ≤ b (Sutherland–Hodgman against one half-plane). */
function clipHalfPlane(poly: Polygon, a: Point, b: number): Polygon {
  const out: Polygon = [];
  const side = (p: Point) => a[0] * p[0] + a[1] * p[1] - b;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const sc = side(cur);
    const sp = side(prev);
    if (sc <= 0) {
      if (sp > 0) out.push(intersect(prev, cur, sp, sc));
      out.push(cur);
    } else if (sp <= 0) {
      out.push(intersect(prev, cur, sp, sc));
    }
  }
  return out;
}

function intersect(p: Point, q: Point, sp: number, sq: number): Point {
  const t = sp / (sp - sq);
  return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
}

export interface Site {
  at: Point;
  /** Power-diagram weight: bigger values claim more ground. */
  weight: number;
}

/**
 * The region of `bounds` closer (in power distance) to `sites[index]` than to any other site.
 * Gives organic-looking zone borders from a handful of hand-placed seed points.
 */
export function powerCell(bounds: Polygon, sites: Site[], index: number): Polygon {
  const { at: [px, py], weight: wi } = sites[index];
  let poly = bounds;
  sites.forEach((s, j) => {
    if (j === index || poly.length === 0) return;
    const [qx, qy] = s.at;
    const a: Point = [2 * (qx - px), 2 * (qy - py)];
    const b = qx * qx + qy * qy - (px * px + py * py) - s.weight + wi;
    poly = clipHalfPlane(poly, a, b);
  });
  return poly;
}

export function rectPolygon(box: Box): Polygon {
  return [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x + box.w, box.y + box.h],
    [box.x, box.y + box.h],
  ];
}

export function bbox(points: Polygon): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function pad(box: Box, amount: number): Box {
  return { x: box.x - amount, y: box.y - amount, w: box.w + amount * 2, h: box.h + amount * 2 };
}

/** Grow a box around its centre so it matches `aspect` (width / height). */
export function fitAspect(box: Box, aspect: number): Box {
  let { w, h } = box;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

export function pointInPolygon([x, y]: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonPath(poly: Polygon): string {
  return poly.length ? `M${poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z` : '';
}

/** Closed Catmull-Rom spline through the points, as cubic Béziers: turns a rough outline into a coastline. */
export function smoothPath(poly: Polygon): string {
  const n = poly.length;
  const p = (i: number) => poly[(i + n) % n];
  let d = `M${p(0)[0]},${p(0)[1]}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return `${d}Z`;
}

export function lerpBox(a: Box, b: Box, t: number): Box {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
}

/**
 * Deterministically roughen a polygon: split each edge and nudge the new points sideways,
 * so a hand-drawn outline reads as a coastline rather than a blob.
 */
export function roughen(poly: Polygon, seed: number, amount = 0.09, splits = 2): Polygon {
  let state = seed >>> 0 || 1;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32 - 0.5;
  };
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / (len || 1);
    const ny = (bx - ax) / (len || 1);
    out.push(poly[i]);
    for (let k = 1; k <= splits; k++) {
      const t = k / (splits + 1);
      const off = rand() * len * amount * 2;
      out.push([ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off]);
    }
  }
  return out;
}
