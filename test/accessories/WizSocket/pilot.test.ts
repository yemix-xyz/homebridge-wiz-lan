import { beforeEach, describe, expect, it, mock } from "bun:test";

const pendingGet: ((e: Error | null, p: any) => void)[] = [];
const pendingSet: ((e: Error | null) => void)[] = [];
const getPilotMock = mock(
  (_w: any, _d: any, cb: (e: Error | null, p: any) => void) => {
    pendingGet.push(cb);
  },
);
const setPilotMock = mock(
  (_w: any, _d: any, _p: any, cb: (e: Error | null) => void) => {
    pendingSet.push(cb);
  },
);

mock.module("../../../src/util/network", () => ({
  getPilot: getPilotMock,
  setPilot: setPilotMock,
}));

import {
  cachedPilot,
  getPilot,
  setPilot,
} from "../../../src/accessories/WizSocket/pilot";
import { recordSuccess as _recordSuccess } from "../../../src/util/offline";
import {
  makeDevice,
  makeFakeWiz,
  makeSocketPilot,
} from "../../__helpers__/factories";
import { FakePlatformAccessory, FakeServiceCtors } from "../../__mocks__/homebridge";

const TEST_MAC = "SOCKETMAC1";

const makeOutletAccessory = () => {
  const acc = new FakePlatformAccessory("Test Outlet", "uuid-socket");
  acc.addService(FakeServiceCtors.Outlet, "Test Outlet");
  return acc;
};

beforeEach(() => {
  for (const k of Object.keys(cachedPilot)) delete cachedPilot[k];
  pendingGet.length = 0;
  pendingSet.length = 0;
  getPilotMock.mockClear();
  setPilotMock.mockClear();
  // Reset offline state for any MAC a test might use
  _recordSuccess(TEST_MAC);
  _recordSuccess(`${TEST_MAC}_T1`);
  _recordSuccess(`${TEST_MAC}_T2`);
});

describe("WizSocket/pilot: getPilot", () => {
  it("populates cachedPilot and onSuccess on a successful reply", () => {
    const wiz = makeFakeWiz();
    const accessory = makeOutletAccessory();
    const device = makeDevice({ mac: TEST_MAC, model: "ESP10_SOCKET_06" });
    let received: any = null;
    getPilot(
      wiz,
      accessory as any,
      device,
      (p) => (received = p),
      () => {},
    );
    pendingGet[0](null, makeSocketPilot({ mac: TEST_MAC, state: true }));
    expect(received).not.toBeNull();
    expect(cachedPilot[TEST_MAC]).toBeDefined();
    expect(cachedPilot[TEST_MAC].state).toBe(true);
  });

  it("falls back to cached state when the network errors and a cache exists", () => {
    const wiz = makeFakeWiz();
    const accessory = makeOutletAccessory();
    const device = makeDevice({ mac: `${TEST_MAC}_T1`, model: "ESP10_SOCKET_06" });
    cachedPilot[device.mac] = makeSocketPilot({ mac: device.mac, state: true });
    let received: any = null;
    getPilot(
      wiz,
      accessory as any,
      device,
      (p) => (received = p),
      () => {},
    );
    pendingGet[0](new Error("timeout"), null);
    expect(received?.state).toBe(true);
  });

  it("calls onError when the network errors and no cache exists", () => {
    const wiz = makeFakeWiz();
    const accessory = makeOutletAccessory();
    const device = makeDevice({ mac: `${TEST_MAC}_T2`, model: "ESP10_SOCKET_06" });
    let err: Error | null = null;
    getPilot(
      wiz,
      accessory as any,
      device,
      () => {},
      (e) => (err = e),
    );
    pendingGet[0](new Error("timeout"), null);
    expect(err).not.toBeNull();
  });
});

describe("WizSocket/pilot: setPilot", () => {
  it("calls callback with an error when there is no cached state", () => {
    const wiz = makeFakeWiz();
    const accessory = makeOutletAccessory();
    const device = makeDevice({ mac: TEST_MAC, model: "ESP10_SOCKET_06" });
    let err: Error | null = null;
    setPilot(wiz, accessory as any, device, { state: false }, (e) => (err = e));
    expect(err).not.toBeNull();
    expect((err as any).message).toMatch(/No cached state/);
    expect(setPilotMock).not.toHaveBeenCalled();
  });

  it("merges new state into cache and sends to network", () => {
    const wiz = makeFakeWiz();
    const accessory = makeOutletAccessory();
    const device = makeDevice({ mac: TEST_MAC, model: "ESP10_SOCKET_06" });
    cachedPilot[TEST_MAC] = makeSocketPilot({ mac: TEST_MAC, state: true });
    setPilot(wiz, accessory as any, device, { state: false }, () => {});
    expect(setPilotMock).toHaveBeenCalledTimes(1);
    const sent = setPilotMock.mock.calls[0][2];
    expect(sent.state).toBe(false);
    // sockets have no scene support — sceneId is always undefined
    expect(sent.sceneId).toBeUndefined();
    expect(cachedPilot[TEST_MAC].state).toBe(false);
  });

  it("reverts the cache when the network call fails", () => {
    const wiz = makeFakeWiz();
    const accessory = makeOutletAccessory();
    const device = makeDevice({ mac: TEST_MAC, model: "ESP10_SOCKET_06" });
    const oldPilot = makeSocketPilot({ mac: TEST_MAC, state: true });
    cachedPilot[TEST_MAC] = oldPilot;
    setPilot(wiz, accessory as any, device, { state: false }, () => {});
    expect(cachedPilot[TEST_MAC].state).toBe(false); // optimistic
    pendingSet[0](new Error("oops"));
    expect(cachedPilot[TEST_MAC]).toBe(oldPilot);
  });
});
