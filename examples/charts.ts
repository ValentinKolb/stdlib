/**
 * Visual review for src/charts.ts.
 *
 * Run with `bun run examples/charts.ts`. Generates SVG files plus an
 * `index.html` in `examples/out/` so all chart variants can be reviewed at
 * once in a browser. SVGs are inlined into the HTML so the demo theme
 * sections actually exhibit `currentColor` and `--stdlib-chart-c*` overrides.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { charts } from "../src/charts";

const OUT_DIR = join(import.meta.dir, "out");

// Sample datasets ---------------------------------------------------------

const linearSeries = Array.from({ length: 12 }, (_, i) => ({
  x: i,
  y: Math.round(10 + i * 4 + Math.sin(i * 0.7) * 8),
}));

const noisySeriesA = Array.from({ length: 30 }, (_, i) => ({
  x: i,
  y: Math.round(50 + Math.sin(i * 0.3) * 20 + (Math.random() - 0.5) * 10),
}));
const noisySeriesB = Array.from({ length: 30 }, (_, i) => ({
  x: i,
  y: Math.round(40 + Math.cos(i * 0.4) * 15 + (Math.random() - 0.5) * 8),
}));

const scatterCloud = Array.from({ length: 60 }, () => ({
  x: Math.round(Math.random() * 100),
  y: Math.round(Math.random() * 100),
}));

const scatterCloud2 = Array.from({ length: 40 }, () => ({
  x: Math.round(50 + Math.random() * 60),
  y: Math.round(20 + Math.random() * 50),
}));

const manyPointsLine = Array.from({ length: 200 }, (_, i) => ({
  x: i,
  y: Math.round(100 + Math.sin(i * 0.05) * 40 + Math.cos(i * 0.13) * 20),
}));

const quarterlyRevenue = [
  { label: "Q1", value: 124 },
  { label: "Q2", value: 187 },
  { label: "Q3", value: 162 },
  { label: "Q4", value: 215 },
];

const monthlyMix = [
  { label: "Jan", value: 30 },
  { label: "Feb", value: -10 },
  { label: "Mar", value: 22 },
  { label: "Apr", value: -18 },
  { label: "May", value: 45 },
  { label: "Jun", value: 12 },
];

const manyBars = Array.from({ length: 20 }, (_, i) => ({
  label: String(i + 1),
  value: Math.round(20 + Math.sin(i * 0.4) * 30 + Math.random() * 10),
}));

const fiveSlices = [
  { label: "Engineering", value: 42 },
  { label: "Sales", value: 23 },
  { label: "Marketing", value: 18 },
  { label: "Support", value: 11 },
  { label: "Other", value: 6 },
];

// Cases -------------------------------------------------------------------

type Case = { name: string; title: string; svg: string };

const cases: Case[] = [
  {
    name: "scatter-basic",
    title: "scatter — single cloud",
    svg: charts.scatter({
      series: [{ data: scatterCloud }],
      xAxis: { label: "X" },
      yAxis: { label: "Y" },
    }),
  },
  {
    name: "scatter-multi",
    title: "scatter — two groups",
    svg: charts.scatter({
      series: [
        { data: scatterCloud },
        { data: scatterCloud2 },
      ],
    }),
  },
  {
    name: "line-single",
    title: "line — single series",
    svg: charts.line({
      series: [{ data: linearSeries }],
    }),
  },
  {
    name: "line-multi",
    title: "line — two series",
    svg: charts.line({
      series: [
        { label: "Sample A", data: noisySeriesA },
        { label: "Sample B", data: noisySeriesB },
      ],
    }),
  },
  {
    name: "line-formatted-axis",
    title: "line — formatted y axis ($Xk)",
    svg: charts.line({
      series: [{ data: linearSeries }],
      yAxis: { format: (v) => `$${v}k`, label: "Revenue" },
      xAxis: { label: "Month" },
    }),
  },
  {
    name: "line-many-points",
    title: "line — 200 points",
    svg: charts.line({
      series: [{ data: manyPointsLine }],
      width: 720,
    }),
  },
  {
    name: "line-smooth",
    title: "line — smooth Catmull-Rom curves",
    svg: charts.line({
      series: [
        { label: "Sample A", data: noisySeriesA },
        { label: "Sample B", data: noisySeriesB },
      ],
      smooth: true,
    }),
  },
  {
    name: "line-smooth-single",
    title: "line — smooth single series",
    svg: charts.line({
      series: [{ data: linearSeries }],
      smooth: true,
      yAxis: { format: (v) => `$${v}k`, label: "Revenue" },
      xAxis: { label: "Month" },
    }),
  },
  {
    name: "bar-basic",
    title: "bar — quarterly revenue",
    svg: charts.bar({ data: quarterlyRevenue }),
  },
  {
    name: "bar-multicolor",
    title: "bar — colorByBar (each bar a different color)",
    svg: charts.bar({ data: quarterlyRevenue, colorByBar: true }),
  },
  {
    name: "bar-multicolor-many",
    title: "bar — multicolor cycling through 8 colors",
    svg: charts.bar({ data: manyBars, width: 720, colorByBar: true }),
  },
  {
    name: "bar-many",
    title: "bar — 20 bars",
    svg: charts.bar({ data: manyBars, width: 720 }),
  },
  {
    name: "bar-negative",
    title: "bar — pos/neg with zero baseline",
    svg: charts.bar({ data: monthlyMix }),
  },
  {
    name: "bar-formatted",
    title: "bar — formatted % axis",
    svg: charts.bar({
      data: [
        { label: "Mon", value: 78 },
        { label: "Tue", value: 84 },
        { label: "Wed", value: 91 },
        { label: "Thu", value: 88 },
        { label: "Fri", value: 73 },
      ],
      yAxis: { format: (v) => `${v}%`, label: "Uptime" },
    }),
  },
  {
    name: "pie-basic",
    title: "pie — five slices",
    svg: charts.pie({ data: fiveSlices }),
  },
  {
    name: "pie-with-labels",
    title: "pie — with labels",
    svg: charts.pie({
      data: fiveSlices,
      showLabels: true,
      width: 480,
      height: 320,
    }),
  },
  {
    name: "pie-single-slice",
    title: "pie — 100% (full circle)",
    svg: charts.pie({ data: [{ label: "All", value: 1 }] }),
  },
  {
    name: "donut-basic",
    title: "donut — default ratio",
    svg: charts.donut({
      data: [
        { label: "Used", value: 67 },
        { label: "Free", value: 33 },
      ],
    }),
  },
  {
    name: "donut-thick",
    title: "donut — innerRadius 0.3",
    svg: charts.donut({
      data: fiveSlices,
      innerRadius: 0.3,
      showLabels: true,
      width: 480,
      height: 320,
    }),
  },
  {
    name: "scatter-bubbles",
    title: "scatter — bubble chart (size dimension)",
    svg: charts.scatter({
      series: [
        {
          data: Array.from({ length: 30 }, () => ({
            x: Math.round(Math.random() * 100),
            y: Math.round(Math.random() * 100),
            size: Math.round(5 + Math.random() * 95),
          })),
        },
      ],
      sizeRange: [4, 22],
    }),
  },
  {
    name: "scatter-bubbles-multi",
    title: "scatter — bubbles, two groups",
    svg: charts.scatter({
      series: [
        {
          data: Array.from({ length: 20 }, () => ({
            x: Math.round(Math.random() * 50),
            y: Math.round(Math.random() * 100),
            size: Math.round(10 + Math.random() * 90),
          })),
        },
        {
          data: Array.from({ length: 20 }, () => ({
            x: Math.round(50 + Math.random() * 50),
            y: Math.round(Math.random() * 100),
            size: Math.round(10 + Math.random() * 90),
          })),
        },
      ],
      sizeRange: [3, 18],
    }),
  },
  {
    name: "sparkline-basic",
    title: "sparkline — bare numbers",
    svg: charts.sparkline({
      data: [4, 7, 2, 9, 5, 12, 8, 15, 11, 18, 14, 20],
    }),
  },
  {
    name: "sparkline-smooth",
    title: "sparkline — smooth + last-point dot",
    svg: charts.sparkline({
      data: [4, 7, 2, 9, 5, 12, 8, 15, 11, 18, 14, 20],
      smooth: true,
      showLast: true,
      width: 120,
      height: 30,
    }),
  },
  {
    name: "sparkline-many",
    title: "sparkline — 100 points wide",
    svg: charts.sparkline({
      data: Array.from({ length: 100 }, (_, i) =>
        Math.round(50 + Math.sin(i * 0.2) * 30 + Math.cos(i * 0.5) * 10),
      ),
      width: 240,
      height: 36,
      smooth: true,
    }),
  },
  {
    name: "edge-empty-line",
    title: "edge — empty line",
    svg: charts.line({ series: [] }),
  },
  {
    name: "edge-empty-pie",
    title: "edge — empty pie",
    svg: charts.pie({ data: [] }),
  },
  {
    name: "edge-single-bar",
    title: "edge — single bar",
    svg: charts.bar({ data: [{ label: "only", value: 42 }] }),
  },
];

await mkdir(OUT_DIR, { recursive: true });
for (const c of cases) {
  await writeFile(join(OUT_DIR, `${c.name}.svg`), c.svg);
}

// Build index.html with the SVGs inlined so theme overrides actually apply.

const card = (c: Case): string => `
  <figure>
    <figcaption>${c.title}</figcaption>
    <div class="svg-wrap">${c.svg}</div>
  </figure>`.trim();

const themeDarkSubset: Case[] = cases.filter((c) =>
  ["line-multi", "bar-basic", "donut-basic", "scatter-multi"].includes(c.name),
);
const themeCustomSubset: Case[] = cases.filter((c) =>
  ["line-multi", "bar-many", "pie-with-labels"].includes(c.name),
);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>stdlib charts — visual review</title>
  <style>
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      margin: 0;
      padding: 24px;
      background: #f9fafb;
      color: #111827;
    }
    h1 { margin: 0 0 4px; font-size: 22px; }
    h2 { margin: 32px 0 12px; font-size: 16px; opacity: 0.8; font-weight: 600; }
    p.lead { color: #6b7280; margin: 0 0 16px; max-width: 720px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
      gap: 16px;
    }
    figure {
      background: white;
      border-radius: 8px;
      padding: 14px 14px 18px;
      margin: 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    figcaption {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 8px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .svg-wrap svg { display: block; width: 100%; height: auto; }
    section.theme-dark {
      background: #111827;
      color: #f3f4f6;
      padding: 24px;
      border-radius: 12px;
      margin-top: 32px;
    }
    section.theme-dark figure { background: #1f2937; box-shadow: none; }
    section.theme-dark figcaption { color: #9ca3af; }
    section.theme-custom {
      padding: 24px;
      border-radius: 12px;
      margin-top: 32px;
      background: #fff7ed;
      --stdlib-chart-c1: #f43f5e;
      --stdlib-chart-c2: #f97316;
      --stdlib-chart-c3: #eab308;
      --stdlib-chart-c4: #22c55e;
      --stdlib-chart-c5: #06b6d4;
      --stdlib-chart-c6: #6366f1;
      --stdlib-chart-c7: #a855f7;
      --stdlib-chart-c8: #ec4899;
    }
  </style>
</head>
<body>
  <h1>stdlib charts</h1>
  <p class="lead">All chart variants generated by <code>examples/charts.ts</code>. SVGs are inlined so theme overrides (currentColor, custom-property colors) apply.</p>

  <h2>Default theme</h2>
  <div class="grid">
${cases.map(card).join("\n")}
  </div>

  <section class="theme-dark">
    <h2>Dark theme — parent sets <code>color: #f3f4f6</code></h2>
    <p class="lead" style="color: #9ca3af">Axes and tick labels use <code>currentColor</code>, so they pick up the parent's color.</p>
    <div class="grid">
${themeDarkSubset.map(card).join("\n")}
    </div>
  </section>

  <section class="theme-custom">
    <h2>Custom palette — overridden <code>--stdlib-chart-c1</code> through <code>-c8</code></h2>
    <p class="lead">Sunset palette via CSS custom properties. No JS, no rebuild.</p>
    <div class="grid">
${themeCustomSubset.map(card).join("\n")}
    </div>
  </section>
</body>
</html>`;

await writeFile(join(OUT_DIR, "index.html"), html);

console.log(`Wrote ${cases.length} SVGs + index.html to ${OUT_DIR}`);
console.log(`Open: file://${join(OUT_DIR, "index.html")}`);
