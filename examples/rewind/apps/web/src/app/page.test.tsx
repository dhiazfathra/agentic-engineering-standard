import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Home from "./page";

it("renders the product name as the page heading", () => {
  expect(renderToStaticMarkup(<Home />)).toContain("<h1>Rewind</h1>");
});
