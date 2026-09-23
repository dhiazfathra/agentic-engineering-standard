import { expect, it } from "vitest";
import background from "../entrypoints/background";

it("starts without throwing", () => {
  expect(() => background.main()).not.toThrow();
});
