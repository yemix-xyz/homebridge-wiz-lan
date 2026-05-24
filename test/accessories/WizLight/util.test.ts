import { describe, expect, it, mock } from "bun:test";
import { isRGB, isTW, turnOffIfNeeded } from "../../../src/accessories/WizLight/util";
import { makeDevice } from "../../__helpers__/factories";
import {
  FakeService,
  FakeCharacteristic,
} from "../../__mocks__/homebridge";

describe("WizLight/util: isRGB", () => {
  it.each([
    "ESP01_SHRGB_03",
    "ESP06_DHRGB_01",
    "ESP15_MHWRGB_01",
    "ESP17_MHORGB_01",
  ])("returns true for RGB-family model %s", (model) => {
    expect(isRGB(makeDevice({ model }))).toBe(true);
  });

  it.each(["ESP10_SHTW_03", "ESP06_SHDW_01", "ESP10_SOCKET_06"])(
    "returns false for non-RGB model %s",
    (model) => {
      expect(isRGB(makeDevice({ model }))).toBe(false);
    },
  );
});

describe("WizLight/util: isTW", () => {
  it("returns true for SHTW models (tunable white)", () => {
    expect(isTW(makeDevice({ model: "ESP10_SHTW_01" }))).toBe(true);
  });

  it("returns false for SHRGB / SHDW / sockets", () => {
    expect(isTW(makeDevice({ model: "ESP01_SHRGB_03" }))).toBe(false);
    expect(isTW(makeDevice({ model: "ESP06_SHDW_01" }))).toBe(false);
    expect(isTW(makeDevice({ model: "ESP10_SOCKET_06" }))).toBe(false);
  });
});

describe("WizLight/util: turnOffIfNeeded", () => {
  it("calls updateValue(0) by default when characteristic is non-zero", () => {
    const service = new FakeService("Lightbulb");
    const ch = service.getCharacteristic("Hue") as FakeCharacteristic;
    ch.value = 50;
    turnOffIfNeeded("Hue" as any, service as any);
    expect(ch.value).toBe(0);
    expect(ch.updateValue).toHaveBeenCalledWith(0);
    expect(ch.setValue).not.toHaveBeenCalled();
  });

  it("calls setValue(0) when useSetValue=true", () => {
    const service = new FakeService("Lightbulb");
    const ch = service.getCharacteristic("Saturation") as FakeCharacteristic;
    ch.value = 50;
    turnOffIfNeeded("Saturation" as any, service as any, true);
    expect(ch.value).toBe(0);
    expect(ch.setValue).toHaveBeenCalledWith(0);
    expect(ch.updateValue).not.toHaveBeenCalled();
  });

  it("does not write when value is already 0", () => {
    const service = new FakeService("Lightbulb");
    const ch = service.getCharacteristic("Hue") as FakeCharacteristic;
    ch.value = 0;
    turnOffIfNeeded("Hue" as any, service as any);
    expect(ch.updateValue).not.toHaveBeenCalled();
    expect(ch.setValue).not.toHaveBeenCalled();
  });
});
