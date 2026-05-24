import { describe, expect, it } from "bun:test";
import { transformDimming } from "../../../../src/accessories/WizLight/characteristics/dimming";
import { transformOnOff } from "../../../../src/accessories/WizLight/characteristics/onOff";
import { transformTemperature } from "../../../../src/accessories/WizLight/characteristics/temperature";
import {
  transformHue,
  transformSaturation,
} from "../../../../src/accessories/WizLight/characteristics/color";
import { transformEffectId } from "../../../../src/accessories/WizLight/characteristics/scenes";
import { kelvinToMired } from "../../../../src/util/color";
import { makeLightPilot } from "../../../__helpers__/factories";

describe("transformDimming (#99/#159 fix surface)", () => {
  it("maps device 10 -> HomeKit 1 (the lower clamp)", () => {
    // max(0, floor(10 * 1.1) - 10) = max(0, 1) = 1
    expect(transformDimming(makeLightPilot({ dimming: 10 }))).toBe(1);
  });

  it("maps device 100 -> HomeKit 100 (the upper clamp)", () => {
    // max(0, floor(100 * 1.1) - 10) = max(0, 100) = 100
    expect(transformDimming(makeLightPilot({ dimming: 100 }))).toBe(100);
  });

  it("maps device 55 -> HomeKit ~50", () => {
    // max(0, floor(55 * 1.1) - 10) = max(0, 50) = 50
    expect(transformDimming(makeLightPilot({ dimming: 55 }))).toBe(50);
  });

  it("never goes negative even for sub-10 dimming values", () => {
    // The max(0, ...) clamp prevents negative HomeKit brightness if a bulb
    // sends a sub-spec dimming value (which it shouldn't, but has).
    expect(transformDimming(makeLightPilot({ dimming: 5 }))).toBe(0);
    expect(transformDimming(makeLightPilot({ dimming: 0 }))).toBe(0);
  });
});

describe("transformOnOff", () => {
  it("returns 1 when state is true", () => {
    expect(transformOnOff(makeLightPilot({ state: true }))).toBe(1);
  });

  it("returns 0 when state is false", () => {
    expect(transformOnOff(makeLightPilot({ state: false }))).toBe(0);
  });
});

describe("transformTemperature", () => {
  it("composes via kelvinToMired through pilotToColor", () => {
    const pilot = makeLightPilot({ temp: 4000 });
    expect(transformTemperature(pilot)).toBe(kelvinToMired(4000));
  });

  it("falls through pilotToColor's rgb path when no temp", () => {
    const pilot = makeLightPilot({ r: 255, g: 128, b: 0 });
    const out = transformTemperature(pilot);
    // pilotToColor for RGB returns clamped kelvin in [2200,6500]
    expect(out).toBeGreaterThanOrEqual(kelvinToMired(6500));
    expect(out).toBeLessThanOrEqual(kelvinToMired(2200));
  });
});

describe("transformHue / transformSaturation", () => {
  it("returns 0 hue when the pilot has no color info", () => {
    // No r/g/b and no temp -> pilotToColor returns rgb fallback {0,0,0}
    // -> rgbToHsv -> hue 0
    const pilot = makeLightPilot();
    delete (pilot as any).temp;
    expect(transformHue(pilot)).toBe(0);
  });

  it("returns the recovered hue for an RGB pilot", () => {
    // pure red
    const pilot = makeLightPilot({ r: 255, g: 0, b: 0 });
    expect(transformHue(pilot)).toBe(0);
    expect(transformSaturation(pilot)).toBe(100);
  });
});

describe("transformEffectId (scenes)", () => {
  it("returns the sceneId when present", () => {
    expect(transformEffectId(makeLightPilot({ sceneId: 4 } as any))).toBe(4);
  });

  it("returns 0 when sceneId is undefined", () => {
    expect(transformEffectId(makeLightPilot())).toBe(0);
  });

  it("returns 0 when sceneId is 0 (No Scene)", () => {
    expect(transformEffectId(makeLightPilot({ sceneId: 0 } as any))).toBe(0);
  });
});
