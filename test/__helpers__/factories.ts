import { EventEmitter } from "events";
import { mock } from "bun:test";
import type { Device, Config } from "../../src/types";
import type { Pilot as LightPilot } from "../../src/accessories/WizLight/pilot";
import type { Pilot as SocketPilot } from "../../src/accessories/WizSocket/pilot";
import {
  FakeCharacteristicCtors,
  FakePlatformAccessory,
  FakeServiceCtors,
  makeFakeAPI,
  makeFakeLogger,
} from "../__mocks__/homebridge";

export const makeDevice = (overrides: Partial<Device> = {}): Device => ({
  ip: "10.0.0.42",
  mac: "AABBCCDDEEFF",
  model: "ESP01_SHRGB_03",
  ...overrides,
});

export const makeLightPilot = (
  overrides: Partial<LightPilot> = {},
): LightPilot => ({
  mac: "AABBCCDDEEFF",
  rssi: -50,
  src: "udp",
  state: true,
  dimming: 100,
  ...overrides,
});

export const makeSocketPilot = (
  overrides: Partial<SocketPilot> = {},
): SocketPilot => ({
  mac: "AABBCCDDEEFF",
  rssi: -50,
  src: "udp",
  state: true,
  ...overrides,
});

export class FakeSocket extends EventEmitter {
  public sent: { msg: string; port: number; ip: string }[] = [];
  public send = mock(
    (
      msg: string | Buffer,
      port: number,
      ip: string,
      cb?: (err: Error | null) => void,
    ) => {
      this.sent.push({ msg: msg.toString(), port, ip });
      cb?.(null);
    },
  );
  public bind = mock(
    (_port: number, _addr: string, cb?: () => void) => cb?.(),
  );
  public close = mock(() => {});
  public setBroadcast = mock((_: boolean) => {});
  public address = () => ({
    family: "IPv4",
    address: "127.0.0.1",
    port: 38900,
  });
}

export const makeFakeWiz = (config: Config = {} as Config) => {
  const api = makeFakeAPI();
  const log = makeFakeLogger();
  const socket = new FakeSocket();
  const wiz: any = {
    log,
    config,
    api,
    socket,
    Service: FakeServiceCtors,
    Characteristic: FakeCharacteristicCtors,
    accessories: [],
    initializedAccessories: {},
  };
  return wiz;
};

export const makeAccessoryWithService = (
  serviceKey: "Lightbulb" | "Outlet" | "Television",
  displayName = "Test Accessory",
  uuid = "uuid-AABBCCDDEEFF",
) => {
  const acc = new FakePlatformAccessory(displayName, uuid);
  acc.addService(FakeServiceCtors[serviceKey], displayName);
  return acc;
};
