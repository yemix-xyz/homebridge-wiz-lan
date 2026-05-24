import { describe, expect, it } from "bun:test";
import {
  clampRgb,
  colorTemperature2rgb,
  hsvToColor,
  kelvinToMired,
  miredToKelvin,
  rgb2colorTemperature,
  rgbToHsv,
} from "../../src/util/color";
import { makeFakeWiz } from "../__helpers__/factories";

describe("color: mired/kelvin", () => {
  it("kelvinToMired and miredToKelvin round-trip within rounding error", () => {
    for (const k of [2200, 2700, 4000, 6500]) {
      const mired = kelvinToMired(k);
      const back = miredToKelvin(mired);
      // Both directions round to nearest int; at 6500K the mired step
      // (1/154) is ~42K wide, so a single-int rounding round-trip can drift
      // up to ~10K.
      expect(Math.abs(back - k)).toBeLessThanOrEqual(10);
    }
  });

  it("matches the 1_000_000 / x identity", () => {
    expect(kelvinToMired(5000)).toBe(200);
    expect(miredToKelvin(200)).toBe(5000);
  });
});

describe("color: colorTemperature2rgb", () => {
  it("returns warm tones at low kelvin (1000K) — red dominant, blue zero", () => {
    const c = colorTemperature2rgb(1000);
    expect(c.r).toBe(255);
    expect(c.b).toBe(0);
  });

  it("returns near-white at ~6500K — all channels near 255", () => {
    const c = colorTemperature2rgb(6500);
    expect(c.r).toBeGreaterThan(240);
    expect(c.g).toBeGreaterThan(240);
    expect(c.b).toBeGreaterThan(240);
  });

  it("returns cool tones at high kelvin (10000K) — blue saturated", () => {
    const c = colorTemperature2rgb(10000);
    expect(c.b).toBe(255);
    expect(c.r).toBeLessThan(c.b);
  });

  it("clamps channels into [0,255]", () => {
    const c = colorTemperature2rgb(40000);
    for (const v of [c.r, c.g, c.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe("color: rgb2colorTemperature", () => {
  it("recovers kelvin within bulb-supported clamp (2200-6500)", () => {
    for (const k of [2700, 4000, 5000, 6500]) {
      const rgb = colorTemperature2rgb(k);
      const back = rgb2colorTemperature(rgb);
      expect(back).toBeGreaterThanOrEqual(2200);
      expect(back).toBeLessThanOrEqual(6500);
    }
  });

  it("clamps below-range temperatures up to 2200K", () => {
    // very warm rgb (incandescent) should clamp to floor
    const rgb = colorTemperature2rgb(1500);
    expect(rgb2colorTemperature(rgb)).toBe(2200);
  });

  it("clamps above-range temperatures down to 6500K", () => {
    const rgb = colorTemperature2rgb(12000);
    expect(rgb2colorTemperature(rgb)).toBe(6500);
  });
});

describe("color: rgbToHsv", () => {
  const table: { rgb: any; hue: number; saturation: number }[] = [
    { rgb: { r: 255, g: 0, b: 0 }, hue: 0, saturation: 100 },
    { rgb: { r: 0, g: 255, b: 0 }, hue: 120, saturation: 100 },
    { rgb: { r: 0, g: 0, b: 255 }, hue: 240, saturation: 100 },
    { rgb: { r: 128, g: 128, b: 128 }, hue: 0, saturation: 0 },
    { rgb: { r: 255, g: 255, b: 255 }, hue: 0, saturation: 0 },
    { rgb: { r: 0, g: 0, b: 0 }, hue: 0, saturation: 0 },
  ];
  for (const row of table) {
    it(`rgb(${row.rgb.r},${row.rgb.g},${row.rgb.b}) -> hue=${row.hue} sat=${row.saturation}`, () => {
      const out = rgbToHsv(row.rgb);
      expect(out.hue).toBe(row.hue);
      expect(out.saturation).toBe(row.saturation);
    });
  }
});

describe("color: clampRgb", () => {
  it("clamps each channel into [0,255]", () => {
    expect(clampRgb({ r: -10, g: 300, b: 128 })).toEqual({
      r: 0,
      g: 255,
      b: 128,
    });
  });

  it("passes through in-range values untouched", () => {
    expect(clampRgb({ r: 10, g: 20, b: 30 })).toEqual({ r: 10, g: 20, b: 30 });
  });
});

describe("color: hsvToColor", () => {
  const wiz = makeFakeWiz();

  it("returns rgb for vivid saturation outside the kelvin range", () => {
    // pure green: h=120/360, s=1.0 — far outside any kelvin heuristic
    const out = hsvToColor(120 / 360, 1, wiz) as any;
    expect(out.r).toBeDefined();
    expect(out.g).toBeDefined();
    expect(out.b).toBeDefined();
    expect(out.r).toBe(0);
    expect(out.g).toBe(255);
    expect(out.b).toBe(0);
  });

  it("returns a kelvin temp for warm, low-saturation hues in the white range", () => {
    // hue ~ 30 (warm yellow), low saturation -> kelvin path
    const out = hsvToColor(30 / 360, 0.3, wiz) as any;
    expect(out.temp).toBeDefined();
    expect(out.temp).toBeGreaterThanOrEqual(2200);
    expect(out.temp).toBeLessThanOrEqual(6500);
  });

  it("logs through the injected wiz.log when considering kelvin path", () => {
    hsvToColor(20 / 360, 0.2, wiz);
    expect(wiz.log.debug).toHaveBeenCalled();
  });

  it("returns vivid rgb (no kelvin path) for fully saturated red", () => {
    const out = hsvToColor(0, 1, wiz) as any;
    // Should be vivid red; kelvin path only triggers if conversion lands
    // in 2200..6500, which pure red won't.
    expect(out.r).toBe(255);
  });
});
