import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "file:local.db",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "rewind",
  S3_ACCESS_KEY: "rewind",
  S3_SECRET_KEY: "secret",
};

describe("parseEnv", () => {
  it("accepts a local env without a database token", () => {
    expect(parseEnv(valid)).toEqual(valid);
  });

  it("keeps the Turso token when set", () => {
    expect(
      parseEnv({ ...valid, DATABASE_AUTH_TOKEN: "t" }).DATABASE_AUTH_TOKEN,
    ).toBe("t");
  });

  it("treats an empty token as unset", () => {
    expect(
      parseEnv({ ...valid, DATABASE_AUTH_TOKEN: "" }).DATABASE_AUTH_TOKEN,
    ).toBeUndefined();
  });

  it.each(Object.keys(valid))("names %s when it is missing", (key) => {
    const source: Record<string, string> = { ...valid };
    delete source[key];
    expect(() => parseEnv(source)).toThrow(key);
  });

  it("rejects an S3_ENDPOINT that is not a URL", () => {
    expect(() => parseEnv({ ...valid, S3_ENDPOINT: "localhost:9000" })).toThrow(
      "S3_ENDPOINT",
    );
  });
});
