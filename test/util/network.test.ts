import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import {
  getPilot,
  registerDiscoveryHandler,
  sendDiscoveryBroadcast,
  setPilot,
} from "../../src/util/network";
import {
  FakeSocket,
  makeDevice,
  makeFakeWiz,
} from "../__helpers__/factories";

// The util/network module keeps per-mac/per-ip callback queues at module
// scope. Tests use unique MACs/IPs to avoid cross-pollination.
let uid = 0;
const uniqueDevice = (overrides: any = {}) =>
  makeDevice({
    mac: `NETMAC${++uid}`,
    ip: `10.99.0.${(uid % 250) + 1}`,
    ...overrides,
  });

const baseConfig = () =>
  ({
    mac: "PHONEMAC",
    address: "10.0.0.1",
    broadcast: "10.0.0.255",
    port: 38900,
  }) as any;

describe("network: getPilot in-flight dedup", () => {
  it("first call sends immediately; concurrent calls piggyback on it (one UDP send total)", async () => {
    const wiz = makeFakeWiz(baseConfig());
    const device = uniqueDevice();
    const cb1 = mock(() => {});
    const cb2 = mock(() => {});
    const cb3 = mock(() => {});
    getPilot(wiz, device, cb1);
    // First call sends right away — no debounce delay
    expect(
      (wiz.socket as FakeSocket).sent.filter((s) => s.msg.includes('"getPilot"'))
        .length,
    ).toBe(1);
    getPilot(wiz, device, cb2);
    getPilot(wiz, device, cb3);
    // Still only one in-flight packet
    expect(
      (wiz.socket as FakeSocket).sent.filter((s) => s.msg.includes('"getPilot"'))
        .length,
    ).toBe(1);
  });

  it("sends to the device IP on port 38899", () => {
    const wiz = makeFakeWiz(baseConfig());
    const device = uniqueDevice({ ip: "10.5.5.5" });
    getPilot(wiz, device, () => {});
    const sent = (wiz.socket as FakeSocket).sent[0];
    expect(sent.ip).toBe("10.5.5.5");
    expect(sent.port).toBe(38899);
    expect(JSON.parse(sent.msg)).toEqual({
      method: "getPilot",
      params: {},
    });
  });

  it("fires all queued callbacks with an error after 1s if no reply arrives", async () => {
    const wiz = makeFakeWiz(baseConfig());
    const device = uniqueDevice();
    const errors: (Error | null)[] = [];
    getPilot(wiz, device, (e) => errors.push(e));
    getPilot(wiz, device, (e) => errors.push(e));
    await new Promise((r) => setTimeout(r, 1050));
    expect(errors.length).toBe(2);
    expect(errors[0]).not.toBeNull();
    expect(errors[1]).not.toBeNull();
    expect(errors[0]!.message).toMatch(/No response/);
  }, 5000);
});

describe("network: setPilot payload composition", () => {
  it("emits {method:setPilot, env:pro, params:{mac, src:udp, ...pilot}}", () => {
    const wiz = makeFakeWiz(baseConfig());
    const device = uniqueDevice({ ip: "10.6.6.6" });
    setPilot(
      wiz,
      device,
      { state: true, dimming: 75 } as any,
      () => {},
    );
    const sent = (wiz.socket as FakeSocket).sent[0];
    expect(sent.ip).toBe("10.6.6.6");
    expect(sent.port).toBe(38899);
    const parsed = JSON.parse(sent.msg);
    expect(parsed.method).toBe("setPilot");
    expect(parsed.env).toBe("pro");
    expect(parsed.params.mac).toBe(device.mac);
    expect(parsed.params.src).toBe("udp");
    expect(parsed.params.state).toBe(true);
    expect(parsed.params.dimming).toBe(75);
  });

  it("a second setPilot to the same device while one is in-flight is coalesced", () => {
    const wiz = makeFakeWiz(baseConfig());
    const device = uniqueDevice({ ip: "10.6.6.7" });
    setPilot(wiz, device, { state: true } as any, () => {});
    setPilot(wiz, device, { state: false } as any, () => {});
    setPilot(wiz, device, { dimming: 80 } as any, () => {});
    const sends = (wiz.socket as FakeSocket).sent.filter((s) =>
      s.msg.includes('"setPilot"'),
    );
    // First one fires; rest stay in setPilotPending until the first completes
    expect(sends.length).toBe(1);
  });
});

describe("network: discovery message routing", () => {
  it("on registration response, sends getSystemConfig back to the device", () => {
    const wiz = makeFakeWiz(baseConfig());
    const added: any[] = [];
    registerDiscoveryHandler(wiz, (d) => added.push(d));

    wiz.socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          method: "registration",
          result: { mac: "BULBMAC1" },
        }),
      ),
      { address: "10.0.0.50", port: 38899 },
    );

    const sysConfig = (wiz.socket as FakeSocket).sent.find((s) =>
      s.msg.includes("getSystemConfig"),
    );
    expect(sysConfig).toBeDefined();
    expect(sysConfig!.ip).toBe("10.0.0.50");
  });

  it("on getSystemConfig response, calls addDevice with model+mac+ip", () => {
    const wiz = makeFakeWiz(baseConfig());
    const added: any[] = [];
    registerDiscoveryHandler(wiz, (d) => added.push(d));

    wiz.socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          method: "getSystemConfig",
          result: { mac: "BULBMAC2", moduleName: "ESP01_SHRGB_03" },
        }),
      ),
      { address: "10.0.0.51", port: 38899 },
    );

    expect(added.length).toBe(1);
    expect(added[0]).toEqual({
      ip: "10.0.0.51",
      mac: "BULBMAC2",
      model: "ESP01_SHRGB_03",
    });
  });

  it("on getPilot response, fires the queued getPilot callback for that mac", () => {
    const wiz = makeFakeWiz(baseConfig());
    registerDiscoveryHandler(wiz, () => {});
    const device = uniqueDevice({ mac: "GETBULB1", ip: "10.0.0.52" });

    let received: any = null;
    getPilot(wiz, device, (_err, p) => (received = p));

    wiz.socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          method: "getPilot",
          result: { mac: "GETBULB1", state: true, dimming: 80 },
        }),
      ),
      { address: "10.0.0.52", port: 38899 },
    );
    expect(received).not.toBeNull();
    expect(received.state).toBe(true);
    expect(received.dimming).toBe(80);
  });

  it("on setPilot response, fires the queued setPilot callback for that ip", () => {
    const wiz = makeFakeWiz(baseConfig());
    registerDiscoveryHandler(wiz, () => {});
    const device = uniqueDevice({ ip: "10.0.0.53" });

    let err: Error | null | undefined = undefined;
    setPilot(wiz, device, { state: true } as any, (e) => (err = e));

    wiz.socket.emit(
      "message",
      Buffer.from(JSON.stringify({ method: "setPilot", result: {} })),
      { address: "10.0.0.53", port: 38899 },
    );
    expect(err).toBeNull();
  });

  it("ignores malformed JSON without throwing", () => {
    const wiz = makeFakeWiz(baseConfig());
    registerDiscoveryHandler(wiz, () => {});
    expect(() => {
      wiz.socket.emit("message", Buffer.from("not json {"), {
        address: "10.0.0.99",
        port: 38899,
      });
    }).not.toThrow();
  });
});

describe("network: sendDiscoveryBroadcast", () => {
  it("broadcasts a registration UDP to the configured broadcast IP", () => {
    const wiz = makeFakeWiz(baseConfig());
    sendDiscoveryBroadcast(wiz);
    const sent = (wiz.socket as FakeSocket).sent[0];
    expect(sent.ip).toBe("10.0.0.255");
    expect(sent.port).toBe(38899);
    const parsed = JSON.parse(sent.msg);
    expect(parsed.method).toBe("registration");
    expect(parsed.params.phoneMac).toBe("PHONEMAC");
    expect(parsed.params.phoneIp).toBe("10.0.0.1");
    expect(parsed.params.register).toBe(false);
  });

  it("also sends per-device-host unicast registrations when configured", () => {
    const wiz = makeFakeWiz({
      ...baseConfig(),
      devices: [{ host: "10.0.0.77" }, { host: "10.0.0.78" }],
    });
    sendDiscoveryBroadcast(wiz);
    const targets = (wiz.socket as FakeSocket).sent.map((s) => s.ip).sort();
    expect(targets).toContain("10.0.0.77");
    expect(targets).toContain("10.0.0.78");
  });
});
