import { describe, expect, it } from "vitest";
import { bucketDeIp, hashIp } from "./ip";

describe("bucketDeIp", () => {
  it("IPv4 queda igual", () => expect(bucketDeIp("203.0.113.7")).toBe("203.0.113.7"));
  it("IPv4 mapeada a IPv6 se reduce a IPv4", () => expect(bucketDeIp("::ffff:203.0.113.7")).toBe("203.0.113.7"));
  it("IPv6 se agrupa por /64", () => {
    expect(bucketDeIp("2800:810:1:2:aaaa:bbbb:cccc:dddd")).toBe("2800:0810:0001:0002::/64");
    expect(bucketDeIp("2800:810:1:2::1")).toBe("2800:0810:0001:0002::/64");
  });
  it("IPv6 con :: al principio / loopback", () => {
    expect(bucketDeIp("::1")).toBe("0000:0000:0000:0000::/64");
    expect(bucketDeIp("2001:db8::")).toBe("2001:0db8:0000:0000::/64");
  });
  it("mayúsculas y espacios se normalizan", () => expect(bucketDeIp(" 2800:810:1:2::1 ")).toBe(bucketDeIp("2800:0810:0001:0002:0:0:0:1")));
  it("basura no rompe (se hashea tal cual)", () => {
    expect(bucketDeIp("no-es-ip")).toBe("no-es-ip");
    expect(bucketDeIp("1::2::3")).toBe("1::2::3");
  });
});

describe("hashIp", () => {
  it("es HMAC-SHA256 hex de 64 caracteres, determinístico y depende del pepper", async () => {
    const a = await hashIp("203.0.113.7", "p1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp("203.0.113.7", "p1")).toBe(a);
    expect(await hashIp("203.0.113.7", "p2")).not.toBe(a);
    expect(a).not.toContain("203");
  });
});
