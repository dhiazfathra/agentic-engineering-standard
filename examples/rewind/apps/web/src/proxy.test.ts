import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

const call = (method: string, headers: Record<string, string>) =>
  proxy(
    new NextRequest("http://app.test/api/rewinds", {
      method,
      headers: { host: "app.test", ...headers },
    }),
  );
const allowed = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy CSRF guard", () => {
  it("matches only /api", () => {
    expect(config.matcher).toBe("/api/:path*");
  });
  it("lets safe methods through", () => {
    expect(allowed(call("GET", { origin: "https://evil.test" }))).toBe(true);
  });
  it("lets requests without Origin through", () => {
    expect(allowed(call("POST", {}))).toBe(true);
  });
  it("lets same-origin writes through", () => {
    expect(allowed(call("PATCH", { origin: "http://app.test" }))).toBe(true);
  });
  it("lets Bearer requests through", () => {
    const h = { origin: "https://evil.test", authorization: "Bearer x" };
    expect(allowed(call("POST", h))).toBe(true);
  });
  it("lets extension origins through", () => {
    expect(allowed(call("POST", { origin: "chrome-extension://abc" }))).toBe(true);
    expect(allowed(call("DELETE", { origin: "moz-extension://abc" }))).toBe(true);
  });
  it("403s a foreign origin", async () => {
    const res = call("POST", { origin: "https://evil.test" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
  it("403s an unparseable origin", () => {
    expect(call("PUT", { origin: "null" }).status).toBe(403);
  });
  it("403s a non-Bearer Authorization with a foreign origin", () => {
    const h = { origin: "https://evil.test", authorization: "Basic x" };
    expect(call("POST", h).status).toBe(403);
  });
});
