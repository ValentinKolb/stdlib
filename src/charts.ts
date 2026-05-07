// ==========================
// SVG Chart Generation
// ==========================
//
// Pure-native SVG generation for the four basic chart types: scatter, line,
// bar, and pie/donut. Returns SVG strings — inject directly into the DOM,
// write to disk, or send over the wire. No peer dependencies.
//
// Charts ship with embedded default CSS using semantic class names and CSS
// custom properties for colors. Consumers override styles via class selectors
// (their CSS wins on specificity) or CSS variables (`--stdlib-chart-c1` ...
// `--stdlib-chart-c8`). Axes and labels use `currentColor` so parent `color`
// drives theming (dark mode "just works").

// ==========================
// PUBLIC TYPES
// ==========================

export type Point = {
  x: number;
  y: number;
  /** Optional third dimension. Honored by `scatter` (controls dot radius);
   *  ignored by `line` and `sparkline`. */
  size?: number;
};

export type Series = {
  /** Optional label for this series. Currently used by `bar` rendering only;
   *  `scatter`/`line` ignore it (no inline legend in v1). */
  label?: string;
  data: Point[];
};

export type BarItem = { label: string; value: number };

export type SliceItem = { label: string; value: number };

export type AxisOptions = {
  /** Suggested tick count. Actual count may differ to keep ticks "nice". */
  ticks?: number;
  /** Format a tick value into a label string. Default: `String(v)`. */
  format?: (value: number) => string;
  /** Optional axis title rendered alongside the axis. */
  label?: string;
};

export type Padding = { top: number; right: number; bottom: number; left: number };

export type ChartOptions = {
  /** Default 400. */
  width?: number;
  /** Default 240. */
  height?: number;
  /** Default `{ top: 16, right: 16, bottom: 32, left: 40 }`. A single number
   *  is applied to all four sides. */
  padding?: number | Partial<Padding>;
  /** Appended to the root `<svg>`'s class attribute (after `stdlib-chart`). */
  className?: string;
};

// ==========================
// CONSTANTS
// ==========================

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 240;
const DEFAULT_PADDING: Padding = { top: 16, right: 16, bottom: 32, left: 40 };
const DEFAULT_TICKS = 5;

// CSS rule order is significant. Series-N rules emit first so shape-specific
// rules below can override (e.g. line's `fill: none` beats series fill, and
// slice/point's `stroke: white` beats series stroke).
const DEFAULT_STYLES = `
.stdlib-chart {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #1f2937;
  --stdlib-chart-c1: #3b82f6; --stdlib-chart-c2: #10b981;
  --stdlib-chart-c3: #f59e0b; --stdlib-chart-c4: #ef4444;
  --stdlib-chart-c5: #8b5cf6; --stdlib-chart-c6: #ec4899;
  --stdlib-chart-c7: #14b8a6; --stdlib-chart-c8: #f97316;
}
.stdlib-chart-series-0 { fill: var(--stdlib-chart-c1); stroke: var(--stdlib-chart-c1); }
.stdlib-chart-series-1 { fill: var(--stdlib-chart-c2); stroke: var(--stdlib-chart-c2); }
.stdlib-chart-series-2 { fill: var(--stdlib-chart-c3); stroke: var(--stdlib-chart-c3); }
.stdlib-chart-series-3 { fill: var(--stdlib-chart-c4); stroke: var(--stdlib-chart-c4); }
.stdlib-chart-series-4 { fill: var(--stdlib-chart-c5); stroke: var(--stdlib-chart-c5); }
.stdlib-chart-series-5 { fill: var(--stdlib-chart-c6); stroke: var(--stdlib-chart-c6); }
.stdlib-chart-series-6 { fill: var(--stdlib-chart-c7); stroke: var(--stdlib-chart-c7); }
.stdlib-chart-series-7 { fill: var(--stdlib-chart-c8); stroke: var(--stdlib-chart-c8); }
.stdlib-chart-axis { stroke: currentColor; opacity: 0.4; fill: none; }
.stdlib-chart-tick-label { font-size: 10px; fill: currentColor; opacity: 0.6; }
.stdlib-chart-axis-label { font-size: 11px; fill: currentColor; opacity: 0.85; }
.stdlib-chart-grid { stroke: currentColor; opacity: 0.08; stroke-dasharray: 2 2; fill: none; }
.stdlib-chart-line { fill: none; stroke-width: 2; }
.stdlib-chart-sparkline { fill: none; stroke-width: 1.5; stroke: currentColor; }
.stdlib-chart-sparkline-last { fill: currentColor; stroke: none; }
.stdlib-chart-point { stroke: white; stroke-width: 1.5; }
.stdlib-chart-slice { stroke: white; stroke-width: 2; }
.stdlib-chart-label { font-size: 11px; fill: currentColor; }
.stdlib-chart-empty-text { font-size: 11px; fill: currentColor; opacity: 0.5; }
`.trim();

// ==========================
// HELPERS (pure)
// ==========================

/** XML-escape a string for safe inclusion in attribute values or text content. */
export const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Normalize a `Padding` input (number or partial object) to a full `Padding`. */
export const normalizePadding = (p: number | Partial<Padding> | undefined): Padding => {
  if (p === undefined) return { ...DEFAULT_PADDING };
  if (typeof p === "number") return { top: p, right: p, bottom: p, left: p };
  return {
    top: p.top ?? DEFAULT_PADDING.top,
    right: p.right ?? DEFAULT_PADDING.right,
    bottom: p.bottom ?? DEFAULT_PADDING.bottom,
    left: p.left ?? DEFAULT_PADDING.left,
  };
};

/**
 * Compute `[min, max]` from a list of numeric values, ignoring non-finite
 * entries. Returns `[0, 1]` for an empty/all-non-finite list and pads ±1
 * around a single finite value.
 */
export const computeDomain = (values: readonly number[]): [number, number] => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  return [min, max];
};

/**
 * Pick a "nice" axis step (1, 2, 5, 10, 20, 50, ...) that splits `range`
 * into roughly `target` intervals. Avoids ugly tick labels like 0.473.
 */
export const niceStep = (range: number, target: number): number => {
  if (range <= 0 || target <= 0) return 1;
  const rough = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * mag;
};

/**
 * Round `min` down and `max` up to the nearest multiples of `step`, so the
 * domain edges fall on tick boundaries. Returns the extended domain plus the
 * tick values within it (inclusive of both ends).
 */
export const extendDomainToNice = (
  min: number,
  max: number,
  step: number,
): { domain: [number, number]; ticks: number[] } => {
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // Use rounding to avoid floating-point drift at tick positions.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const round = (v: number): number =>
    Number(v.toFixed(Math.min(decimals + 2, 12)));
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round(v));
  return { domain: [lo, hi], ticks };
};

/** Linear map of `value` from input domain `[d0, d1]` to output range `[r0, r1]`. */
export const mapRange = (
  value: number,
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): number => {
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
};

// ==========================
// SVG SKELETON
// ==========================

type PlotArea = { x0: number; y0: number; x1: number; y1: number };

const computePlotArea = (
  width: number,
  height: number,
  padding: Padding,
  hasXAxisLabel: boolean,
  hasYAxisLabel: boolean,
): PlotArea => {
  // Reserve extra space when axis labels are present.
  const extraBottom = hasXAxisLabel ? 14 : 0;
  const extraLeft = hasYAxisLabel ? 14 : 0;
  return {
    x0: padding.left + extraLeft,
    y0: padding.top,
    x1: width - padding.right,
    y1: height - padding.bottom - extraBottom,
  };
};

/** Wrap chart body in a root `<svg>` with embedded default styles. */
export const svgRoot = (
  opts: { width: number; height: number; className?: string },
  body: string,
): string => {
  const cls = opts.className
    ? `stdlib-chart ${escapeXml(opts.className)}`
    : "stdlib-chart";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.width} ${opts.height}" class="${cls}"><style>${DEFAULT_STYLES}</style>${body}</svg>`;
};

// ==========================
// GEOMETRY HELPERS
// ==========================

/** Format an SVG path `d` attribute for a polyline through `points`. */
export const linePathD = (points: ReadonlyArray<{ x: number; y: number }>): string => {
  if (points.length === 0) return "";
  let d = `M ${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${fmt(points[i]!.x)} ${fmt(points[i]!.y)}`;
  }
  return d;
};

/**
 * Format an SVG path `d` for a smooth curve through `points` using
 * Catmull-Rom interpolation converted to cubic Bezier segments.
 *
 * For each segment from `points[i]` to `points[i+1]`, control points are
 * derived from neighboring `points[i-1]` and `points[i+2]` (reflecting the
 * end points at boundaries). Tension is fixed at the standard Catmull-Rom
 * value (factor 1/6) which produces pleasant curves for typical UI data
 * without overshoots.
 */
export const smoothPathD = (points: ReadonlyArray<{ x: number; y: number }>): string => {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`;
  if (n === 2) return linePathD(points);

  let d = `M ${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? points[i - 1]! : points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = i + 2 < n ? points[i + 2]! : points[i + 1]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${fmt(cp1x)} ${fmt(cp1y)} ${fmt(cp2x)} ${fmt(cp2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
};

/**
 * Build an SVG path `d` attribute for a pie slice (or donut sector).
 *
 * Angles are in radians, measured from the +X axis. Slices grow clockwise,
 * which in SVG's y-down coordinate space means `a1 > a0` produces a clockwise
 * arc when drawn with the large-arc and sweep flags set appropriately.
 *
 * Full-circle (a1 - a0 ≈ 2π) is split into two 180° arcs because a single
 * `A` command can't draw a complete circle unambiguously.
 */
export const arcPathD = (
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  innerR = 0,
): string => {
  const sweep = a1 - a0;
  // Full circle: split into two halves to avoid degenerate `A` command.
  if (sweep >= Math.PI * 2 - 1e-9) {
    const aMid = a0 + Math.PI;
    if (innerR <= 0) {
      const ox0 = cx + r * Math.cos(a0), oy0 = cy + r * Math.sin(a0);
      const oxM = cx + r * Math.cos(aMid), oyM = cy + r * Math.sin(aMid);
      return `M ${fmt(ox0)} ${fmt(oy0)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(oxM)} ${fmt(oyM)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(ox0)} ${fmt(oy0)} Z`;
    }
    const ox0 = cx + r * Math.cos(a0), oy0 = cy + r * Math.sin(a0);
    const oxM = cx + r * Math.cos(aMid), oyM = cy + r * Math.sin(aMid);
    const ix0 = cx + innerR * Math.cos(a0), iy0 = cy + innerR * Math.sin(a0);
    const ixM = cx + innerR * Math.cos(aMid), iyM = cy + innerR * Math.sin(aMid);
    // Outer ring CW, inner ring CCW (using even-odd fill rule via SVG default).
    return (
      `M ${fmt(ox0)} ${fmt(oy0)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(oxM)} ${fmt(oyM)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(ox0)} ${fmt(oy0)} Z` +
      ` M ${fmt(ix0)} ${fmt(iy0)} A ${fmt(innerR)} ${fmt(innerR)} 0 0 0 ${fmt(ixM)} ${fmt(iyM)} A ${fmt(innerR)} ${fmt(innerR)} 0 0 0 ${fmt(ix0)} ${fmt(iy0)} Z`
    );
  }
  const large = sweep > Math.PI ? 1 : 0;
  const ox0 = cx + r * Math.cos(a0), oy0 = cy + r * Math.sin(a0);
  const ox1 = cx + r * Math.cos(a1), oy1 = cy + r * Math.sin(a1);
  if (innerR <= 0) {
    return `M ${fmt(cx)} ${fmt(cy)} L ${fmt(ox0)} ${fmt(oy0)} A ${fmt(r)} ${fmt(r)} 0 ${large} 1 ${fmt(ox1)} ${fmt(oy1)} Z`;
  }
  const ix0 = cx + innerR * Math.cos(a0), iy0 = cy + innerR * Math.sin(a0);
  const ix1 = cx + innerR * Math.cos(a1), iy1 = cy + innerR * Math.sin(a1);
  return `M ${fmt(ox0)} ${fmt(oy0)} A ${fmt(r)} ${fmt(r)} 0 ${large} 1 ${fmt(ox1)} ${fmt(oy1)} L ${fmt(ix1)} ${fmt(iy1)} A ${fmt(innerR)} ${fmt(innerR)} 0 ${large} 0 ${fmt(ix0)} ${fmt(iy0)} Z`;
};

/** Format a number for SVG attributes — short, no scientific notation. */
const fmt = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  // 2 decimals is enough for sub-pixel precision at typical sizes.
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
};

// ==========================
// AXIS RENDERERS
// ==========================

const renderYAxis = (
  domain: [number, number],
  ticks: number[],
  area: PlotArea,
  opts: AxisOptions | undefined,
): string => {
  const format = opts?.format ?? ((v: number) => String(v));
  const parts: string[] = [];
  // Grid lines + tick labels
  for (const t of ticks) {
    const y = mapRange(t, domain, [area.y1, area.y0]);
    parts.push(
      `<line class="stdlib-chart-grid" x1="${fmt(area.x0)}" y1="${fmt(y)}" x2="${fmt(area.x1)}" y2="${fmt(y)}"/>`,
    );
    parts.push(
      `<text class="stdlib-chart-tick-label" x="${fmt(area.x0 - 6)}" y="${fmt(y + 3)}" text-anchor="end">${escapeXml(format(t))}</text>`,
    );
  }
  // Axis line
  parts.push(
    `<line class="stdlib-chart-axis" x1="${fmt(area.x0)}" y1="${fmt(area.y0)}" x2="${fmt(area.x0)}" y2="${fmt(area.y1)}"/>`,
  );
  if (opts?.label) {
    const cx = 12;
    const cy = (area.y0 + area.y1) / 2;
    parts.push(
      `<text class="stdlib-chart-axis-label" x="${fmt(cx)}" y="${fmt(cy)}" text-anchor="middle" transform="rotate(-90 ${fmt(cx)} ${fmt(cy)})">${escapeXml(opts.label)}</text>`,
    );
  }
  return parts.join("");
};

const renderXAxisNumeric = (
  domain: [number, number],
  ticks: number[],
  area: PlotArea,
  height: number,
  opts: AxisOptions | undefined,
): string => {
  const format = opts?.format ?? ((v: number) => String(v));
  const parts: string[] = [];
  for (const t of ticks) {
    const x = mapRange(t, domain, [area.x0, area.x1]);
    parts.push(
      `<text class="stdlib-chart-tick-label" x="${fmt(x)}" y="${fmt(area.y1 + 14)}" text-anchor="middle">${escapeXml(format(t))}</text>`,
    );
  }
  parts.push(
    `<line class="stdlib-chart-axis" x1="${fmt(area.x0)}" y1="${fmt(area.y1)}" x2="${fmt(area.x1)}" y2="${fmt(area.y1)}"/>`,
  );
  if (opts?.label) {
    parts.push(
      `<text class="stdlib-chart-axis-label" x="${fmt((area.x0 + area.x1) / 2)}" y="${fmt(height - 4)}" text-anchor="middle">${escapeXml(opts.label)}</text>`,
    );
  }
  return parts.join("");
};

const renderXAxisCategorical = (
  labels: readonly string[],
  area: PlotArea,
  height: number,
  axisLabel?: string,
): string => {
  const parts: string[] = [];
  if (labels.length > 0) {
    const step = (area.x1 - area.x0) / labels.length;
    for (let i = 0; i < labels.length; i++) {
      const cx = area.x0 + step * (i + 0.5);
      parts.push(
        `<text class="stdlib-chart-tick-label" x="${fmt(cx)}" y="${fmt(area.y1 + 14)}" text-anchor="middle">${escapeXml(labels[i]!)}</text>`,
      );
    }
  }
  parts.push(
    `<line class="stdlib-chart-axis" x1="${fmt(area.x0)}" y1="${fmt(area.y1)}" x2="${fmt(area.x1)}" y2="${fmt(area.y1)}"/>`,
  );
  if (axisLabel) {
    parts.push(
      `<text class="stdlib-chart-axis-label" x="${fmt((area.x0 + area.x1) / 2)}" y="${fmt(height - 4)}" text-anchor="middle">${escapeXml(axisLabel)}</text>`,
    );
  }
  return parts.join("");
};

const emptyChart = (
  width: number,
  height: number,
  className: string | undefined,
  message = "no data",
): string =>
  svgRoot(
    { width, height, className },
    `<text class="stdlib-chart-empty-text" x="${fmt(width / 2)}" y="${fmt(height / 2)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(message)}</text>`,
  );

// ==========================
// CHART FUNCTIONS
// ==========================

type SeriesChartOptions = ChartOptions & {
  series: Series[];
  xAxis?: AxisOptions;
  yAxis?: AxisOptions;
};

type ScatterOptions = SeriesChartOptions & {
  /** Pixel-radius range for the optional `size` dimension on points.
   *  Default `[3, 12]`. Only applied when at least one point has a finite
   *  `size`; otherwise all points use the default radius (3px). */
  sizeRange?: [number, number];
};

type LineOptions = SeriesChartOptions & {
  /** Render smooth Catmull-Rom curves. Default `true`. Pass `false` for
   *  straight segments between points. */
  smooth?: boolean;
};

/**
 * Render a scatter plot. Each series produces a group of circles, one per
 * data point, classed `stdlib-chart-series-N` so series colors stay
 * consistent across charts.
 *
 * Non-finite x or y values are filtered out. An empty `series` (or one with
 * no finite points) renders an empty-state SVG with a "no data" label.
 *
 * @example
 * charts.scatter({ series: [{ data: [{x:1,y:2},{x:2,y:5},{x:3,y:3}] }] });
 *
 * @example
 * charts.scatter({
 *   series: [
 *     { label: "Group A", data: [...] },
 *     { label: "Group B", data: [...] },
 *   ],
 *   xAxis: { label: "Time (s)" },
 *   yAxis: { label: "Value", format: v => `${v}k` },
 * });
 */
export const scatter = (opts: ScatterOptions): string => {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const padding = normalizePadding(opts.padding);

  const allPoints = opts.series
    .flatMap((s) => s.data)
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (allPoints.length === 0) return emptyChart(width, height, opts.className);

  const area = computePlotArea(width, height, padding, !!opts.xAxis?.label, !!opts.yAxis?.label);
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);

  const [xMinRaw, xMaxRaw] = computeDomain(xs);
  const xStep = niceStep(xMaxRaw - xMinRaw, opts.xAxis?.ticks ?? DEFAULT_TICKS);
  const xExt = extendDomainToNice(xMinRaw, xMaxRaw, xStep);
  const [yMinRaw, yMaxRaw] = computeDomain(ys);
  const yStep = niceStep(yMaxRaw - yMinRaw, opts.yAxis?.ticks ?? DEFAULT_TICKS);
  const yExt = extendDomainToNice(yMinRaw, yMaxRaw, yStep);

  // Size dimension: if any point has a finite `size`, normalize across all
  // points to the configured pixel range; points without size fall back to
  // the midpoint so they remain visible.
  const sizes = allPoints
    .map((p) => p.size)
    .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  const sizeRange = opts.sizeRange ?? [3, 12];
  const useSizes = sizes.length > 0;
  const sizeDomain = useSizes ? computeDomain(sizes) : ([0, 1] as [number, number]);
  const fallbackR = (sizeRange[0] + sizeRange[1]) / 2;

  const body: string[] = [];
  body.push(renderYAxis(yExt.domain, yExt.ticks, area, opts.yAxis));
  body.push(renderXAxisNumeric(xExt.domain, xExt.ticks, area, height, opts.xAxis));

  opts.series.forEach((s, i) => {
    const cls = `stdlib-chart-series-${i % 8}`;
    const circles = s.data
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => {
        const cx = mapRange(p.x, xExt.domain, [area.x0, area.x1]);
        const cy = mapRange(p.y, yExt.domain, [area.y1, area.y0]);
        const r = useSizes
          ? typeof p.size === "number" && Number.isFinite(p.size)
            ? mapRange(p.size, sizeDomain, sizeRange)
            : fallbackR
          : 3;
        return `<circle class="stdlib-chart-point" cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}"/>`;
      })
      .join("");
    if (circles) body.push(`<g class="${cls}">${circles}</g>`);
  });

  return svgRoot({ width, height, className: opts.className }, body.join(""));
};

/**
 * Render a line chart. Each series becomes a `<path class="stdlib-chart-line">`
 * connecting its points (sorted by `x`). Multi-series charts get distinct
 * `stdlib-chart-series-N` classes.
 *
 * Non-finite points are filtered. A series with fewer than 2 finite points
 * is skipped (no path can be drawn). An empty/all-non-finite chart renders
 * an empty-state SVG.
 *
 * @example
 * charts.line({ series: [{ data: [{x:1,y:10},{x:2,y:25},{x:3,y:18}] }] });
 *
 * @example
 * charts.line({
 *   series: [
 *     { label: "Revenue", data: [...] },
 *     { label: "Costs",   data: [...] },
 *   ],
 *   yAxis: { format: v => `$${v}k` },
 * });
 */
export const line = (opts: LineOptions): string => {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const padding = normalizePadding(opts.padding);

  const allPoints = opts.series
    .flatMap((s) => s.data)
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (allPoints.length === 0) return emptyChart(width, height, opts.className);

  const area = computePlotArea(width, height, padding, !!opts.xAxis?.label, !!opts.yAxis?.label);
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);

  const [xMinRaw, xMaxRaw] = computeDomain(xs);
  const xStep = niceStep(xMaxRaw - xMinRaw, opts.xAxis?.ticks ?? DEFAULT_TICKS);
  const xExt = extendDomainToNice(xMinRaw, xMaxRaw, xStep);
  const [yMinRaw, yMaxRaw] = computeDomain(ys);
  const yStep = niceStep(yMaxRaw - yMinRaw, opts.yAxis?.ticks ?? DEFAULT_TICKS);
  const yExt = extendDomainToNice(yMinRaw, yMaxRaw, yStep);

  const body: string[] = [];
  body.push(renderYAxis(yExt.domain, yExt.ticks, area, opts.yAxis));
  body.push(renderXAxisNumeric(xExt.domain, xExt.ticks, area, height, opts.xAxis));

  const pathFn = opts.smooth === false ? linePathD : smoothPathD;
  opts.series.forEach((s, i) => {
    const finite = s.data.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    if (finite.length < 2) return;
    const sorted = [...finite].sort((a, b) => a.x - b.x);
    const mapped = sorted.map((p) => ({
      x: mapRange(p.x, xExt.domain, [area.x0, area.x1]),
      y: mapRange(p.y, yExt.domain, [area.y1, area.y0]),
    }));
    const cls = `stdlib-chart-line stdlib-chart-series-${i % 8}`;
    body.push(`<path class="${cls}" d="${pathFn(mapped)}"/>`);
  });

  return svgRoot({ width, height, className: opts.className }, body.join(""));
};

// ==========================
// BAR
// ==========================

type BarChartOptions = ChartOptions & {
  data: BarItem[];
  yAxis?: AxisOptions;
  /** When true, each bar gets its own series color (`series-0` ... `series-7`,
   *  cyclic). When false (default), all bars share `series-0`. */
  colorByBar?: boolean;
};

/**
 * Render a categorical bar chart. The y-domain always includes zero so bars
 * rest on a visible baseline. Negative values produce bars below the zero
 * line; mixed positive/negative inputs render the zero line as the X axis.
 *
 * Bars use class `stdlib-chart-bar stdlib-chart-series-0` (single-series
 * only in v1 — grouped/stacked bars are out of scope).
 *
 * Non-finite values are filtered. Empty input renders an empty-state SVG.
 *
 * @example
 * charts.bar({ data: [{label:"Q1",value:120},{label:"Q2",value:180}] });
 *
 * @example
 * charts.bar({
 *   data: [{label:"Profit",value:50},{label:"Loss",value:-20}],
 *   yAxis: { format: v => `${v}k` },
 * });
 */
export const bar = (opts: BarChartOptions): string => {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const padding = normalizePadding(opts.padding);

  const finite = opts.data.filter((d) => Number.isFinite(d.value));
  if (finite.length === 0) return emptyChart(width, height, opts.className);

  const area = computePlotArea(width, height, padding, false, !!opts.yAxis?.label);
  const values = finite.map((d) => d.value);

  // Domain must include zero so bars sit on a baseline.
  const [minRaw, maxRaw] = computeDomain(values);
  const yMin = Math.min(0, minRaw);
  const yMax = Math.max(0, maxRaw);
  const yStep = niceStep(yMax - yMin, opts.yAxis?.ticks ?? DEFAULT_TICKS);
  const yExt = extendDomainToNice(yMin, yMax, yStep);

  const body: string[] = [];
  body.push(renderYAxis(yExt.domain, yExt.ticks, area, opts.yAxis));
  body.push(renderXAxisCategorical(finite.map((d) => d.label), area, height, undefined));

  // If domain spans negative and positive, draw the zero baseline as a
  // dedicated line on top of the gridlines so bars rest on it visually.
  if (yExt.domain[0] < 0 && yExt.domain[1] > 0) {
    const zeroY = mapRange(0, yExt.domain, [area.y1, area.y0]);
    body.push(
      `<line class="stdlib-chart-axis" x1="${fmt(area.x0)}" y1="${fmt(zeroY)}" x2="${fmt(area.x1)}" y2="${fmt(zeroY)}"/>`,
    );
  }

  const slot = (area.x1 - area.x0) / finite.length;
  const barWidth = slot * 0.8;
  const barOffset = slot * 0.1;
  const zeroPx = mapRange(0, yExt.domain, [area.y1, area.y0]);

  for (let i = 0; i < finite.length; i++) {
    const d = finite[i]!;
    const x = area.x0 + slot * i + barOffset;
    const valuePx = mapRange(d.value, yExt.domain, [area.y1, area.y0]);
    const top = Math.min(valuePx, zeroPx);
    const h = Math.abs(valuePx - zeroPx);
    const seriesIdx = opts.colorByBar ? i % 8 : 0;
    body.push(
      `<rect class="stdlib-chart-bar stdlib-chart-series-${seriesIdx}" x="${fmt(x)}" y="${fmt(top)}" width="${fmt(barWidth)}" height="${fmt(h)}"/>`,
    );
  }

  return svgRoot({ width, height, className: opts.className }, body.join(""));
};

// ==========================
// PIE / DONUT
// ==========================

type PieChartOptions = ChartOptions & {
  data: SliceItem[];
  /** Render slice labels with percentages outside the chart area. Default false. */
  showLabels?: boolean;
  /** Inner radius as a fraction of outer radius (0..1). 0 = pie, 0.6 = donut.
   *  Values outside `[0, 0.95]` are clamped. */
  innerRadius?: number;
};

const renderPie = (opts: PieChartOptions, defaultInnerRadius: number): string => {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;

  const finite = opts.data.filter(
    (d) => Number.isFinite(d.value) && d.value > 0,
  );
  const total = finite.reduce((sum, d) => sum + d.value, 0);
  if (finite.length === 0 || total <= 0) {
    return emptyChart(width, height, opts.className);
  }

  const innerRatio = Math.max(0, Math.min(0.95, opts.innerRadius ?? defaultInnerRadius));
  // Reserve outer margin for labels if requested.
  const baseMargin = 8;
  const labelMargin = opts.showLabels ? 60 : 0;
  const margin = baseMargin + labelMargin;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.max(0, Math.min(width, height) / 2 - margin);
  const innerR = r * innerRatio;

  const body: string[] = [];
  // Slices clockwise from 12 o'clock (-π/2).
  let a = -Math.PI / 2;
  finite.forEach((d, i) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const a1 = a + sweep;
    const cls = `stdlib-chart-slice stdlib-chart-series-${i % 8}`;
    body.push(`<path class="${cls}" d="${arcPathD(cx, cy, r, a, a1, innerR)}"/>`);
    if (opts.showLabels) {
      const mid = a + sweep / 2;
      // Place label slightly outside the outer radius.
      const lr = r + 14;
      const lx = cx + lr * Math.cos(mid);
      const ly = cy + lr * Math.sin(mid);
      const pct = ((d.value / total) * 100).toFixed(d.value / total < 0.1 ? 1 : 0);
      const anchor =
        Math.cos(mid) > 0.2 ? "start" : Math.cos(mid) < -0.2 ? "end" : "middle";
      body.push(
        `<text class="stdlib-chart-label" x="${fmt(lx)}" y="${fmt(ly + 3)}" text-anchor="${anchor}">${escapeXml(d.label)} (${pct}%)</text>`,
      );
    }
    a = a1;
  });

  return svgRoot({ width, height, className: opts.className }, body.join(""));
};

/**
 * Render a pie chart. Slices are drawn clockwise starting at 12 o'clock,
 * proportional to each item's `value`. Pass `showLabels: true` to render
 * `Label (XX%)` outside each slice.
 *
 * Non-positive and non-finite values are filtered. A 100%-single-slice draws
 * a complete circle. Empty/all-zero input renders an empty-state SVG.
 *
 * @example
 * charts.pie({ data: [{label:"A",value:30},{label:"B",value:50},{label:"C",value:20}] });
 *
 * @example
 * charts.pie({ data: [...], showLabels: true });
 */
export const pie = (opts: PieChartOptions): string => renderPie(opts, 0);

/**
 * Render a donut chart. Identical to {@link pie} but with a hollow center
 * (default `innerRadius: 0.6`). Override `innerRadius` for a thicker or
 * thinner ring.
 *
 * @example
 * charts.donut({ data: [{label:"Used",value:67},{label:"Free",value:33}] });
 *
 * @example
 * charts.donut({ data: [...], innerRadius: 0.4, showLabels: true });
 */
export const donut = (opts: PieChartOptions): string => renderPie(opts, 0.6);

// ==========================
// SPARKLINE
// ==========================

type SparklineOptions = {
  /** Series of values. Bare numbers auto-x to their array index. */
  data: number[] | Point[];
  /** Default 80. */
  width?: number;
  /** Default 20. */
  height?: number;
  /** Render with smooth Catmull-Rom curves. Default `true`. */
  smooth?: boolean;
  /** Render a small dot at the last data point. Default false. */
  showLast?: boolean;
  /** Appended to the root `<svg>`'s class attribute. */
  className?: string;
};

const normalizeSparklineData = (data: number[] | Point[]): Point[] => {
  if (data.length === 0) return [];
  if (typeof data[0] === "number") {
    return (data as number[])
      .filter((y) => Number.isFinite(y))
      .map((y, x) => ({ x, y }));
  }
  return (data as Point[]).filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
};

/**
 * Render a minimalist sparkline — a tiny inline chart with no axes, no
 * labels, and minimal padding. Designed to fit alongside text or in dense
 * tables.
 *
 * Stroke uses `currentColor` by default, so it adopts the surrounding text
 * color. Pass `className` to scope a different color.
 *
 * @example
 * charts.sparkline({ data: [3, 7, 5, 9, 12, 10, 14] });
 *
 * @example
 * charts.sparkline({
 *   data: [3, 7, 5, 9, 12, 10, 14],
 *   smooth: true,
 *   showLast: true,
 *   width: 120,
 * });
 */
export const sparkline = (opts: SparklineOptions): string => {
  const width = opts.width ?? 80;
  const height = opts.height ?? 20;
  const points = normalizeSparklineData(opts.data);

  if (points.length < 2) {
    // Empty spark — return a same-sized invisible svg so layout stays stable.
    return svgRoot({ width, height, className: opts.className }, "");
  }

  // Reserve a 1.5px inset so stroke isn't clipped at edges.
  const inset = 1.5;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xDomain = computeDomain(xs);
  const yDomain = computeDomain(ys);

  const sorted = [...points].sort((a, b) => a.x - b.x);
  const mapped = sorted.map((p) => ({
    x: mapRange(p.x, xDomain, [inset, width - inset]),
    y: mapRange(p.y, yDomain, [height - inset, inset]),
  }));

  const pathFn = opts.smooth === false ? linePathD : smoothPathD;
  const body: string[] = [
    `<path class="stdlib-chart-sparkline" d="${pathFn(mapped)}"/>`,
  ];

  if (opts.showLast && mapped.length > 0) {
    const last = mapped[mapped.length - 1]!;
    body.push(
      `<circle class="stdlib-chart-sparkline-last" cx="${fmt(last.x)}" cy="${fmt(last.y)}" r="2"/>`,
    );
  }

  return svgRoot({ width, height, className: opts.className }, body.join(""));
};

// ==========================
// NAMESPACE
// ==========================

export const charts = {
  scatter,
  line,
  bar,
  pie,
  donut,
  sparkline,
} as const;
