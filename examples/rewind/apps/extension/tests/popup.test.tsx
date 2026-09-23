import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import App from "../entrypoints/popup/App";

it("shows the product name", () => {
  expect(renderToStaticMarkup(<App />)).toContain("<h1>rewind</h1>");
});
