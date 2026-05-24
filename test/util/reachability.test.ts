import { beforeEach, describe, expect, it } from "bun:test";
import {
  getMisses,
  isOffline,
  recordHit,
  recordMiss,
} from "../../src/util/reachability";

// Reachability uses module-level state keyed by MAC. Tests use a unique MAC
// each so they don't cross-contaminate, and reset that MAC in beforeEach.
const macFor = (test: string) => `MAC-${test}-${Math.random().toString(36).slice(2, 8)}`;

describe("reachability", () => {
  it("recordMiss increments per call and returns the new count", () => {
    const mac = macFor("inc");
    expect(recordMiss(mac)).toBe(1);
    expect(recordMiss(mac)).toBe(2);
    expect(recordMiss(mac)).toBe(3);
    expect(getMisses(mac)).toBe(3);
  });

  it("recordHit clears miss count back to zero", () => {
    const mac = macFor("hit");
    recordMiss(mac);
    recordMiss(mac);
    expect(getMisses(mac)).toBe(2);
    recordHit(mac);
    expect(getMisses(mac)).toBe(0);
  });

  it("recordHit on an unseen mac is a no-op", () => {
    const mac = macFor("noop");
    recordHit(mac);
    expect(getMisses(mac)).toBe(0);
  });

  it("isOffline returns true once threshold is met", () => {
    const mac = macFor("threshold");
    expect(isOffline(mac, 3)).toBe(false);
    recordMiss(mac);
    expect(isOffline(mac, 3)).toBe(false);
    recordMiss(mac);
    expect(isOffline(mac, 3)).toBe(false);
    recordMiss(mac);
    expect(isOffline(mac, 3)).toBe(true);
  });

  it("isOffline honors threshold of 1 (any miss is offline)", () => {
    const mac = macFor("t1");
    recordMiss(mac);
    expect(isOffline(mac, 1)).toBe(true);
  });

  it("getMisses returns 0 for unknown macs", () => {
    expect(getMisses(macFor("unknown"))).toBe(0);
  });
});
