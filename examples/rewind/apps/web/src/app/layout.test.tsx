import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import RootLayout, { metadata } from "./layout";

it("wraps children in an English document", () => {
  const html = renderToStaticMarkup(<RootLayout>{<p>child</p>}</RootLayout>);
  expect(html).toBe(
    '<html lang="en"><head></head><body><p>child</p></body></html>',
  );
});

it("titles the app Rewind", () => {
  expect(metadata.title).toBe("Rewind");
});
