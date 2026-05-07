import { describe, it, expect } from "bun:test";
import {
  charts,
  scatter,
  line,
  bar,
  pie,
  donut,
  sparkline,
  // helpers
  escapeXml,
  normalizePadding,
  computeDomain,
  niceStep,
  extendDomainToNice,
  mapRange,
  linePathD,
  smoothPathD,
  arcPathD,
  svgRoot,
} from "./charts";

// Counts non-overlapping occurrences of `needle` in `haystack`.
const count = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

// =====================================================================
// helpers — pure functions
// =====================================================================

describe("escapeXml", () => {
  it("escapes & < > and quotes", () => {
    expect(escapeXml(`<a href="x">foo & 'bar'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;foo &amp; &#39;bar&#39;&lt;/a&gt;",
    );
  });

  it("returns unchanged text without specials", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });

  it("escapes ampersand first to avoid double-escaping", () => {
    expect(escapeXml("&amp;")).toBe("&amp;amp;");
  });
});

describe("normalizePadding", () => {
  it("returns defaults for undefined", () => {
    const p = normalizePadding(undefined);
    expect(p).toEqual({ top: 16, right: 16, bottom: 32, left: 40 });
  });

  it("applies a single number to all four sides", () => {
    expect(normalizePadding(8)).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
  });

  it("merges partial objects with defaults", () => {
    expect(normalizePadding({ top: 4, left: 4 })).toEqual({
      top: 4,
      right: 16,
      bottom: 32,
      left: 4,
    });
  });
});

describe("computeDomain", () => {
  it("returns [0, 1] for empty input", () => {
    expect(computeDomain([])).toEqual([0, 1]);
  });

  it("returns [0, 1] when all values are non-finite", () => {
    expect(computeDomain([NaN, Infinity, -Infinity])).toEqual([0, 1]);
  });

  it("filters non-finite values", () => {
    expect(computeDomain([1, NaN, 5, Infinity, 3])).toEqual([1, 5]);
  });

  it("pads ±1 around a single finite value", () => {
    expect(computeDomain([42])).toEqual([41, 43]);
  });

  it("returns min and max for a normal list", () => {
    expect(computeDomain([3, -2, 5, 1])).toEqual([-2, 5]);
  });
});

describe("niceStep", () => {
  it("returns 1 for non-positive range", () => {
    expect(niceStep(0, 5)).toBe(1);
    expect(niceStep(-10, 5)).toBe(1);
  });

  it("picks 1, 2, 5, or 10 within the magnitude band", () => {
    expect(niceStep(10, 5)).toBe(2); // rough = 2 → norm 2 → 2
    expect(niceStep(50, 5)).toBe(10); // rough = 10
    expect(niceStep(100, 5)).toBe(20); // rough = 20 → norm 2 → 2*10
    expect(niceStep(7, 5)).toBe(1); // rough = 1.4 → norm 1.4 (< 1.5) → 1
    expect(niceStep(15, 5)).toBe(5); // rough = 3 → norm 3 (< 7) → 5
  });

  it("scales with magnitude for large ranges", () => {
    // range 1_000_000, target 5 → rough 200_000 → mag 100_000 → norm 2 → 2*100_000
    expect(niceStep(1_000_000, 5)).toBe(200_000);
  });

  it("scales for small ranges", () => {
    // range 0.05, target 5 → rough 0.01 → mag 0.01 → norm 1 → 0.01
    expect(niceStep(0.05, 5)).toBeCloseTo(0.01, 5);
  });
});

describe("extendDomainToNice", () => {
  it("rounds outward to step boundaries", () => {
    const r = extendDomainToNice(3, 17, 5);
    expect(r.domain).toEqual([0, 20]);
    expect(r.ticks).toEqual([0, 5, 10, 15, 20]);
  });

  it("handles negatives", () => {
    const r = extendDomainToNice(-7, 12, 5);
    expect(r.domain).toEqual([-10, 15]);
    expect(r.ticks).toEqual([-10, -5, 0, 5, 10, 15]);
  });

  it("preserves boundaries that already align", () => {
    const r = extendDomainToNice(0, 10, 2);
    expect(r.domain).toEqual([0, 10]);
    expect(r.ticks).toEqual([0, 2, 4, 6, 8, 10]);
  });
});

describe("mapRange", () => {
  it("performs linear mapping", () => {
    expect(mapRange(5, [0, 10], [0, 100])).toBe(50);
    expect(mapRange(0, [0, 10], [0, 100])).toBe(0);
    expect(mapRange(10, [0, 10], [0, 100])).toBe(100);
  });

  it("handles inverted output range (svg y-flip)", () => {
    expect(mapRange(5, [0, 10], [100, 0])).toBe(50);
    expect(mapRange(10, [0, 10], [100, 0])).toBe(0);
    expect(mapRange(0, [0, 10], [100, 0])).toBe(100);
  });

  it("returns midpoint for zero-width input domain", () => {
    expect(mapRange(5, [10, 10], [0, 100])).toBe(50);
  });
});

describe("linePathD", () => {
  it("returns empty string for no points", () => {
    expect(linePathD([])).toBe("");
  });

  it("starts with M and continues with L", () => {
    expect(linePathD([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 10 }])).toBe(
      "M 0 0 L 10 5 L 20 10",
    );
  });

  it("formats fractional coordinates", () => {
    expect(linePathD([{ x: 1.234, y: 5.678 }, { x: 2.0, y: 3.0 }])).toBe(
      "M 1.23 5.68 L 2 3",
    );
  });
});

describe("arcPathD", () => {
  it("emits a single sector for partial arcs (no inner)", () => {
    const d = arcPathD(50, 50, 40, 0, Math.PI / 2);
    expect(d).toMatch(/^M 50 50 L /);
    expect(count(d, "A")).toBe(1);
  });

  it("emits donut sector with two arcs (outer + inner)", () => {
    const d = arcPathD(50, 50, 40, 0, Math.PI / 2, 20);
    expect(count(d, "A")).toBe(2);
    expect(d).not.toMatch(/^M 50 50 L /);
  });

  it("splits full circle into two 180° arcs", () => {
    const d = arcPathD(50, 50, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
    expect(count(d, "A")).toBe(2);
  });

  it("splits full donut into two outer + two inner arcs", () => {
    const d = arcPathD(50, 50, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 20);
    expect(count(d, "A")).toBe(4);
  });

  it("uses large-arc-flag 1 when sweep > 180°", () => {
    const d = arcPathD(50, 50, 40, 0, Math.PI * 1.2);
    // Pattern: "A r r 0 1 1 ..." → flag is 1
    expect(d).toMatch(/A 40 40 0 1 1/);
  });

  it("uses large-arc-flag 0 when sweep < 180°", () => {
    const d = arcPathD(50, 50, 40, 0, Math.PI * 0.5);
    expect(d).toMatch(/A 40 40 0 0 1/);
  });
});

// =====================================================================
// svgRoot
// =====================================================================

describe("svgRoot", () => {
  it("emits root svg with viewBox and stdlib-chart class", () => {
    const out = svgRoot({ width: 400, height: 240 }, "<g/>");
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('viewBox="0 0 400 240"');
    expect(out).toContain('class="stdlib-chart"');
    expect(out).toContain("<style>");
    expect(out).toContain("<g/>");
  });

  it("appends user className to root class", () => {
    const out = svgRoot({ width: 1, height: 1, className: "my-chart" }, "");
    expect(out).toContain('class="stdlib-chart my-chart"');
  });

  it("escapes user className", () => {
    const out = svgRoot({ width: 1, height: 1, className: '"x" onload=' }, "");
    expect(out).not.toContain('"x" onload=');
    expect(out).toContain("&quot;x&quot;");
  });

  it("embeds default stylesheet with all 8 series colors", () => {
    const out = svgRoot({ width: 1, height: 1 }, "");
    for (let i = 0; i < 8; i++) {
      expect(out).toContain(`.stdlib-chart-series-${i}`);
      expect(out).toContain(`--stdlib-chart-c${i + 1}`);
    }
  });
});

// =====================================================================
// scatter
// =====================================================================

describe("charts.scatter", () => {
  it("returns valid SVG with correct viewBox", () => {
    const svg = scatter({ series: [{ data: [{ x: 1, y: 2 }] }] });
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('viewBox="0 0 400 240"');
    expect(svg).toContain('class="stdlib-chart"');
  });

  it("respects custom width and height", () => {
    const svg = scatter({
      series: [{ data: [{ x: 0, y: 0 }] }],
      width: 800,
      height: 400,
    });
    expect(svg).toContain('viewBox="0 0 800 400"');
  });

  it("renders one circle per finite point", () => {
    const svg = scatter({
      series: [{ data: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] }],
    });
    expect(count(svg, "<circle")).toBe(3);
  });

  it("filters out non-finite points", () => {
    const svg = scatter({
      series: [
        {
          data: [
            { x: 1, y: 1 },
            { x: NaN, y: 2 },
            { x: 3, y: Infinity },
            { x: 4, y: 4 },
          ],
        },
      ],
    });
    expect(count(svg, "<circle")).toBe(2);
  });

  it("returns empty-state SVG for empty series array", () => {
    const svg = scatter({ series: [] });
    expect(svg).toContain("no data");
    expect(svg).not.toContain("<circle");
  });

  it("returns empty-state SVG when no finite points exist", () => {
    const svg = scatter({ series: [{ data: [{ x: NaN, y: NaN }] }] });
    expect(svg).toContain("no data");
  });

  it("assigns distinct series classes for multi-series", () => {
    const svg = scatter({
      series: [
        { data: [{ x: 1, y: 1 }] },
        { data: [{ x: 2, y: 2 }] },
        { data: [{ x: 3, y: 3 }] },
      ],
    });
    expect(svg).toContain('class="stdlib-chart-series-0"');
    expect(svg).toContain('class="stdlib-chart-series-1"');
    expect(svg).toContain('class="stdlib-chart-series-2"');
  });

  it("applies xAxis.format to tick labels", () => {
    const svg = scatter({
      series: [{ data: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }],
      xAxis: { format: (v) => `${v}px` },
    });
    expect(svg).toContain("0px");
    expect(svg).toContain("100px");
  });

  it("applies yAxis.format to tick labels", () => {
    const svg = scatter({
      series: [{ data: [{ x: 0, y: 0 }, { x: 0, y: 50 }] }],
      yAxis: { format: (v) => `$${v}` },
    });
    expect(svg).toContain("$0");
    expect(svg).toContain("$50");
  });

  it("renders xAxis label when provided", () => {
    const svg = scatter({
      series: [{ data: [{ x: 0, y: 0 }] }],
      xAxis: { label: "Time" },
    });
    expect(svg).toContain(">Time<");
  });

  it("renders yAxis label when provided", () => {
    const svg = scatter({
      series: [{ data: [{ x: 0, y: 0 }] }],
      yAxis: { label: "Value" },
    });
    expect(svg).toContain(">Value<");
  });

  it("appends className to root svg", () => {
    const svg = scatter({
      series: [{ data: [{ x: 0, y: 0 }] }],
      className: "revenue",
    });
    expect(svg).toContain('class="stdlib-chart revenue"');
  });
});

// =====================================================================
// line
// =====================================================================

describe("charts.line", () => {
  it("renders one path per series", () => {
    const svg = line({
      series: [
        { data: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }] },
        { data: [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }] },
      ],
    });
    expect(count(svg, '<path class="stdlib-chart-line')).toBe(2);
  });

  it("skips a series with fewer than 2 finite points", () => {
    const svg = line({
      series: [
        { data: [{ x: 0, y: 0 }] },
        { data: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      ],
    });
    expect(count(svg, '<path class="stdlib-chart-line')).toBe(1);
  });

  it("returns empty-state SVG when no series have finite data", () => {
    const svg = line({ series: [{ data: [] }] });
    expect(svg).toContain("no data");
  });

  it("sorts points by x before drawing the path", () => {
    const svg = line({
      series: [{ data: [{ x: 5, y: 1 }, { x: 1, y: 1 }, { x: 3, y: 1 }] }],
      smooth: false, // assert via straight-segment count
    });
    const path = /<path class="stdlib-chart-line[^"]*" d="(M[^"]+)"\/>/.exec(svg);
    expect(path).not.toBeNull();
    expect(count(path![1]!, "M")).toBe(1);
    expect(count(path![1]!, "L")).toBe(2);
  });

  it("filters non-finite points within a series", () => {
    const svg = line({
      series: [
        {
          data: [
            { x: 0, y: 0 },
            { x: 1, y: NaN },
            { x: 2, y: 4 },
            { x: 3, y: 9 },
          ],
        },
      ],
      smooth: false,
    });
    // 4 points → 1 NaN filtered → 3 finite → path has M + 2 Ls.
    const path = /<path class="stdlib-chart-line[^"]*" d="(M[^"]+)"\/>/.exec(svg);
    expect(path).not.toBeNull();
    expect(count(path![1]!, "L")).toBe(2);
  });

  it("uses series classes 0..7 cyclically", () => {
    const svg = line({
      series: Array.from({ length: 9 }, (_, i) => ({
        data: [{ x: 0, y: i }, { x: 1, y: i + 1 }],
      })),
    });
    // Series 0 and 8 share class -series-0 (modulo 8)
    expect(count(svg, "stdlib-chart-series-0")).toBeGreaterThanOrEqual(2);
  });

  it("includes axis tick labels", () => {
    const svg = line({
      series: [{ data: [{ x: 0, y: 0 }, { x: 10, y: 100 }] }],
    });
    expect(svg).toContain('<text class="stdlib-chart-tick-label"');
  });

  it("renders grid lines for y-axis", () => {
    const svg = line({
      series: [{ data: [{ x: 0, y: 0 }, { x: 10, y: 100 }] }],
    });
    expect(svg).toContain('<line class="stdlib-chart-grid"');
  });
});

// =====================================================================
// bar
// =====================================================================

describe("charts.bar", () => {
  it("renders one rect per data item", () => {
    const svg = bar({
      data: [
        { label: "A", value: 10 },
        { label: "B", value: 25 },
        { label: "C", value: 15 },
      ],
    });
    expect(count(svg, '<rect class="stdlib-chart-bar')).toBe(3);
  });

  it("renders an x-axis label per bar", () => {
    const svg = bar({
      data: [
        { label: "Q1", value: 120 },
        { label: "Q2", value: 180 },
      ],
    });
    expect(svg).toContain(">Q1<");
    expect(svg).toContain(">Q2<");
  });

  it("includes zero in the y-domain even when all values are positive", () => {
    const svg = bar({
      data: [
        { label: "A", value: 50 },
        { label: "B", value: 80 },
      ],
    });
    // Y-axis tick labels should include 0
    expect(svg).toMatch(/>0</);
  });

  it("includes zero in the y-domain even when all values are negative", () => {
    const svg = bar({
      data: [
        { label: "A", value: -50 },
        { label: "B", value: -80 },
      ],
    });
    expect(svg).toMatch(/>0</);
  });

  it("draws a zero baseline when domain spans positive and negative", () => {
    const svg = bar({
      data: [
        { label: "Profit", value: 50 },
        { label: "Loss", value: -30 },
      ],
    });
    // Two horizontal axis-class lines: x-axis (bottom) and zero baseline.
    expect(count(svg, 'class="stdlib-chart-axis"')).toBeGreaterThanOrEqual(2);
  });

  it("does not crash on empty input", () => {
    const svg = bar({ data: [] });
    expect(svg).toContain("no data");
    expect(svg).not.toContain("<rect class=\"stdlib-chart-bar");
  });

  it("filters non-finite values", () => {
    const svg = bar({
      data: [
        { label: "A", value: 10 },
        { label: "B", value: NaN },
        { label: "C", value: Infinity },
        { label: "D", value: 20 },
      ],
    });
    expect(count(svg, '<rect class="stdlib-chart-bar')).toBe(2);
  });

  it("centers a single bar within plot area", () => {
    const svg = bar({ data: [{ label: "only", value: 10 }] });
    expect(count(svg, '<rect class="stdlib-chart-bar')).toBe(1);
  });

  it("escapes labels", () => {
    const svg = bar({ data: [{ label: '<script>alert("x")</script>', value: 1 }] });
    expect(svg).not.toContain("<script>alert");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("applies yAxis.format to tick labels", () => {
    const svg = bar({
      data: [{ label: "A", value: 100 }],
      yAxis: { format: (v) => `${v}%` },
    });
    expect(svg).toContain("100%");
    expect(svg).toContain("0%");
  });

  it("renders yAxis label when provided", () => {
    const svg = bar({
      data: [{ label: "A", value: 1 }],
      yAxis: { label: "Revenue" },
    });
    expect(svg).toContain(">Revenue<");
  });
});

// =====================================================================
// pie / donut
// =====================================================================

describe("charts.pie", () => {
  it("renders one path per slice", () => {
    const svg = pie({
      data: [
        { label: "A", value: 30 },
        { label: "B", value: 50 },
        { label: "C", value: 20 },
      ],
    });
    expect(count(svg, '<path class="stdlib-chart-slice')).toBe(3);
  });

  it("uses series classes 0..N for slices", () => {
    const svg = pie({
      data: [
        { label: "A", value: 1 },
        { label: "B", value: 1 },
        { label: "C", value: 1 },
      ],
    });
    expect(svg).toContain("stdlib-chart-series-0");
    expect(svg).toContain("stdlib-chart-series-1");
    expect(svg).toContain("stdlib-chart-series-2");
  });

  it("renders empty-state for empty data", () => {
    const svg = pie({ data: [] });
    expect(svg).toContain("no data");
    expect(svg).not.toContain("<path");
  });

  it("renders empty-state when all values are non-positive", () => {
    const svg = pie({ data: [{ label: "A", value: 0 }, { label: "B", value: -5 }] });
    expect(svg).toContain("no data");
  });

  it("filters non-finite slices", () => {
    const svg = pie({
      data: [
        { label: "A", value: 50 },
        { label: "B", value: NaN },
        { label: "C", value: Infinity },
        { label: "D", value: 25 },
      ],
    });
    expect(count(svg, '<path class="stdlib-chart-slice')).toBe(2);
  });

  it("renders a single 100% slice as a full circle (two arcs)", () => {
    const svg = pie({ data: [{ label: "only", value: 100 }] });
    // One slice path; the path itself contains 2 'A' commands for a full circle.
    const pathMatch = /<path class="stdlib-chart-slice[^"]*" d="([^"]+)"\/>/.exec(svg);
    expect(pathMatch).not.toBeNull();
    expect(count(pathMatch![1]!, "A")).toBe(2);
  });

  it("does not render labels by default", () => {
    const svg = pie({ data: [{ label: "A", value: 1 }] });
    expect(svg).not.toContain('<text class="stdlib-chart-label"');
  });

  it("renders one label per slice when showLabels is true", () => {
    const svg = pie({
      data: [
        { label: "Foo", value: 30 },
        { label: "Bar", value: 70 },
      ],
      showLabels: true,
    });
    expect(count(svg, '<text class="stdlib-chart-label"')).toBe(2);
    expect(svg).toContain("Foo (30%)");
    expect(svg).toContain("Bar (70%)");
  });

  it("escapes label content in XML", () => {
    const svg = pie({
      data: [{ label: '<img onerror=alert(1)>', value: 50 }, { label: "B", value: 50 }],
      showLabels: true,
    });
    expect(svg).not.toContain("<img onerror");
    expect(svg).toContain("&lt;img onerror=alert(1)&gt;");
  });

  it("formats sub-10% percentages with 1 decimal", () => {
    const svg = pie({
      data: [
        { label: "A", value: 5 },
        { label: "B", value: 95 },
      ],
      showLabels: true,
    });
    expect(svg).toContain("(5.0%)");
    expect(svg).toContain("(95%)");
  });

  it("respects custom innerRadius for pie (donut effect)", () => {
    const svg = pie({
      data: [{ label: "A", value: 50 }, { label: "B", value: 50 }],
      innerRadius: 0.5,
    });
    // With innerRadius > 0 each sector path has 2 'A' commands (outer + inner arc).
    const path = /<path class="stdlib-chart-slice[^"]*" d="([^"]+)"\/>/.exec(svg);
    expect(path).not.toBeNull();
    expect(count(path![1]!, "A")).toBe(2);
  });

  it("clamps innerRadius into [0, 0.95]", () => {
    const a = pie({ data: [{ label: "A", value: 1 }], innerRadius: -10 });
    const b = pie({ data: [{ label: "A", value: 1 }], innerRadius: 5 });
    // Both should still render.
    expect(a).toContain("<path class=\"stdlib-chart-slice");
    expect(b).toContain("<path class=\"stdlib-chart-slice");
  });
});

describe("charts.donut", () => {
  it("renders donut sectors with both outer and inner arcs", () => {
    const svg = donut({
      data: [
        { label: "A", value: 30 },
        { label: "B", value: 70 },
      ],
    });
    const path = /<path class="stdlib-chart-slice[^"]*" d="([^"]+)"\/>/.exec(svg);
    expect(path).not.toBeNull();
    // Donut sector: outer arc + inner arc reverse → 2 'A' commands per slice.
    expect(count(path![1]!, "A")).toBe(2);
  });

  it("uses pie() with innerRadius 0.6 by default", () => {
    const a = donut({ data: [{ label: "A", value: 1 }] });
    const b = pie({ data: [{ label: "A", value: 1 }], innerRadius: 0.6 });
    expect(a).toBe(b);
  });

  it("respects explicit innerRadius override", () => {
    const a = donut({ data: [{ label: "A", value: 1 }], innerRadius: 0.3 });
    const b = pie({ data: [{ label: "A", value: 1 }], innerRadius: 0.3 });
    expect(a).toBe(b);
  });
});

// =====================================================================
// CSS specificity: line fill bug regression
// =====================================================================

describe("CSS rule order — series before shape", () => {
  it("line stroke-only — series-N rules emit before shape rules so line's fill: none wins", () => {
    const svg = line({ series: [{ data: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] });
    // The order is: series-0 first, then -line. With same specificity, -line
    // overrides fill since it's later. We assert the lexical order of these
    // selectors in the embedded stylesheet so the regression is caught.
    const seriesIdx = svg.indexOf(".stdlib-chart-series-0 ");
    const lineIdx = svg.indexOf(".stdlib-chart-line ");
    expect(seriesIdx).toBeGreaterThan(0);
    expect(lineIdx).toBeGreaterThan(0);
    expect(seriesIdx).toBeLessThan(lineIdx);
  });

  it("slice/point shape rules also emit after series-N", () => {
    const svg = pie({ data: [{ label: "A", value: 1 }] });
    const seriesIdx = svg.indexOf(".stdlib-chart-series-0 ");
    const sliceIdx = svg.indexOf(".stdlib-chart-slice ");
    expect(seriesIdx).toBeLessThan(sliceIdx);
  });
});

// =====================================================================
// smoothPathD
// =====================================================================

describe("smoothPathD", () => {
  it("returns empty for no points", () => {
    expect(smoothPathD([])).toBe("");
  });

  it("returns just M for a single point", () => {
    expect(smoothPathD([{ x: 1, y: 2 }])).toBe("M 1 2");
  });

  it("falls back to straight line for two points", () => {
    expect(smoothPathD([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("M 0 0 L 10 5");
  });

  it("emits cubic C commands for 3+ points", () => {
    const d = smoothPathD([{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }]);
    expect(d).toMatch(/^M /);
    expect(d).toContain(" C ");
    // n-1 segments → n-1 C commands.
    expect(d.match(/ C /g)?.length).toBe(2);
  });
});

// =====================================================================
// line — smooth option
// =====================================================================

describe("charts.line — smooth", () => {
  it("uses smooth Catmull-Rom curves by default", () => {
    const svg = line({ series: [{ data: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }] }] });
    const path = /<path class="stdlib-chart-line[^"]*" d="([^"]+)"\/>/.exec(svg)![1]!;
    expect(path).toContain(" C ");
    expect(path).not.toMatch(/ L /);
  });

  it("uses straight segments when smooth: false", () => {
    const svg = line({
      series: [{ data: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }] }],
      smooth: false,
    });
    const path = /<path class="stdlib-chart-line[^"]*" d="([^"]+)"\/>/.exec(svg)![1]!;
    expect(path).toMatch(/ L /);
    expect(path).not.toContain(" C ");
  });

  it("explicit smooth: true also produces curves", () => {
    const svg = line({
      series: [{ data: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }] }],
      smooth: true,
    });
    expect(svg).toContain(" C ");
  });
});

// =====================================================================
// scatter — size dimension
// =====================================================================

describe("charts.scatter — size dimension", () => {
  it("uses default radius (3) when no point has a size", () => {
    const svg = scatter({ series: [{ data: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] });
    expect(svg).toMatch(/<circle [^>]*r="3"/);
  });

  it("scales radius with size when provided", () => {
    const svg = scatter({
      series: [
        {
          data: [
            { x: 1, y: 1, size: 10 },
            { x: 2, y: 2, size: 50 },
            { x: 3, y: 3, size: 100 },
          ],
        },
      ],
    });
    // With default sizeRange [3, 12], the smallest size maps to 3 and the
    // largest to 12. Assert both extremes appear.
    expect(svg).toMatch(/<circle [^>]*r="3"/);
    expect(svg).toMatch(/<circle [^>]*r="12"/);
  });

  it("respects custom sizeRange", () => {
    const svg = scatter({
      series: [
        {
          data: [
            { x: 1, y: 1, size: 10 },
            { x: 2, y: 2, size: 100 },
          ],
        },
      ],
      sizeRange: [5, 25],
    });
    expect(svg).toMatch(/<circle [^>]*r="5"/);
    expect(svg).toMatch(/<circle [^>]*r="25"/);
  });

  it("falls back to mid-range radius for points without size when others have it", () => {
    const svg = scatter({
      series: [
        {
          data: [
            { x: 1, y: 1, size: 10 },
            { x: 2, y: 2 }, // no size
            { x: 3, y: 3, size: 100 },
          ],
        },
      ],
      sizeRange: [4, 20],
    });
    // Fallback midpoint = 12.
    expect(svg).toMatch(/<circle [^>]*r="12"/);
  });
});

// =====================================================================
// bar — colorByBar
// =====================================================================

describe("charts.bar — colorByBar", () => {
  it("defaults to single color (all bars use series-0)", () => {
    const svg = bar({
      data: [
        { label: "A", value: 1 },
        { label: "B", value: 2 },
        { label: "C", value: 3 },
      ],
    });
    expect(count(svg, 'class="stdlib-chart-bar stdlib-chart-series-0"')).toBe(3);
    // No bar uses any series class other than -0. Check element-level only,
    // not the embedded stylesheet (which always lists all 8 series rules).
    expect(svg).not.toContain('class="stdlib-chart-bar stdlib-chart-series-1"');
    expect(svg).not.toContain('class="stdlib-chart-bar stdlib-chart-series-2"');
  });

  it("assigns distinct series classes when colorByBar is true", () => {
    const svg = bar({
      data: [
        { label: "A", value: 1 },
        { label: "B", value: 2 },
        { label: "C", value: 3 },
      ],
      colorByBar: true,
    });
    expect(svg).toContain("stdlib-chart-bar stdlib-chart-series-0");
    expect(svg).toContain("stdlib-chart-bar stdlib-chart-series-1");
    expect(svg).toContain("stdlib-chart-bar stdlib-chart-series-2");
  });

  it("cycles series colors mod 8 when colorByBar with > 8 bars", () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      label: String(i),
      value: i + 1,
    }));
    const svg = bar({ data, colorByBar: true });
    // Bar 0 and bar 8 share series-0 (modulo 8).
    expect(count(svg, "stdlib-chart-bar stdlib-chart-series-0")).toBe(2);
  });
});

// =====================================================================
// sparkline
// =====================================================================

describe("charts.sparkline", () => {
  it("renders an svg with the default 80x20 viewBox", () => {
    const svg = sparkline({ data: [1, 2, 3, 4] });
    expect(svg).toContain('viewBox="0 0 80 20"');
  });

  it("respects custom width and height", () => {
    const svg = sparkline({ data: [1, 2, 3], width: 200, height: 40 });
    expect(svg).toContain('viewBox="0 0 200 40"');
  });

  it("renders a stdlib-chart-sparkline path", () => {
    const svg = sparkline({ data: [1, 2, 3, 4, 5] });
    expect(svg).toContain('<path class="stdlib-chart-sparkline"');
  });

  it("auto-x bare numbers to their index", () => {
    const svg = sparkline({ data: [10, 20, 10], smooth: false });
    const path = /<path class="stdlib-chart-sparkline" d="([^"]+)"\/>/.exec(svg)![1]!;
    expect(path).toMatch(/^M /);
    expect(path).toContain(" L ");
  });

  it("accepts Point[] input as well", () => {
    const a = sparkline({ data: [10, 20, 30] });
    const b = sparkline({
      data: [
        { x: 0, y: 10 },
        { x: 1, y: 20 },
        { x: 2, y: 30 },
      ],
    });
    expect(a).toBe(b);
  });

  it("filters non-finite values", () => {
    const svg = sparkline({ data: [10, NaN, 30, Infinity, 50], smooth: false });
    // 5 entries, 2 dropped → 3 valid → path has M + 2 L
    const path = /<path class="stdlib-chart-sparkline" d="([^"]+)"\/>/.exec(svg)![1]!;
    expect(count(path, "L")).toBe(2);
  });

  it("renders empty svg with stable size for too-few-points", () => {
    const svg = sparkline({ data: [] });
    expect(svg).toContain('viewBox="0 0 80 20"');
    expect(svg).not.toContain("<path");
  });

  it("uses smooth curves by default", () => {
    const svg = sparkline({ data: [1, 5, 3, 7, 2] });
    const path = /<path class="stdlib-chart-sparkline" d="([^"]+)"\/>/.exec(svg)![1]!;
    expect(path).toContain(" C ");
  });

  it("uses straight segments when smooth: false", () => {
    const svg = sparkline({ data: [1, 5, 3, 7, 2], smooth: false });
    const path = /<path class="stdlib-chart-sparkline" d="([^"]+)"\/>/.exec(svg)![1]!;
    expect(path).toMatch(/ L /);
    expect(path).not.toContain(" C ");
  });

  it("renders last-point dot when showLast: true", () => {
    const svg = sparkline({ data: [1, 2, 3], showLast: true });
    expect(svg).toContain('<circle class="stdlib-chart-sparkline-last"');
  });

  it("does not render last-point dot by default", () => {
    const svg = sparkline({ data: [1, 2, 3] });
    // Check for the element, not the CSS rule (which always exists in styles).
    expect(svg).not.toContain('<circle class="stdlib-chart-sparkline-last"');
  });

  it("appends className to root svg", () => {
    const svg = sparkline({ data: [1, 2], className: "trend-up" });
    expect(svg).toContain('class="stdlib-chart trend-up"');
  });
});

// =====================================================================
// namespace
// =====================================================================

describe("charts namespace", () => {
  it("exposes all six chart functions", () => {
    expect(charts.scatter).toBe(scatter);
    expect(charts.line).toBe(line);
    expect(charts.bar).toBe(bar);
    expect(charts.pie).toBe(pie);
    expect(charts.donut).toBe(donut);
    expect(charts.sparkline).toBe(sparkline);
  });
});
