import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import RootLayout, { metadata } from "./layout";

// next/font is a compile-time transform; outside Next each loader just
// echoes its CSS variable name.
vi.mock("next/font/google", () => {
  const loader = ({ variable }: { variable: string }) => ({ variable });
  return { Inter: loader, Poppins: loader, Instrument_Serif: loader };
});

it("wraps children in an English document carrying the font variables", () => {
  const html = renderToStaticMarkup(<RootLayout>{<p>child</p>}</RootLayout>);
  expect(html).toBe(
    '<html lang="en" class="--font-inter --font-poppins --font-instrument-serif">' +
      "<head></head><body>" +
      `<script>${THEME_INIT_SCRIPT}</script>` +
      "<p>child</p></body></html>",
  );
});

it("runs the theme script before any other body content", () => {
  const html = renderToStaticMarkup(<RootLayout>{<p>child</p>}</RootLayout>);
  expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("<p>child</p>"));
});

it("titles the app Rewind", () => {
  expect(metadata.title).toBe("Rewind");
});
