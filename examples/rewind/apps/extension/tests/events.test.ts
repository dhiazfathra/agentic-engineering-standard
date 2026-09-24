// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  clickText,
  describeElement,
  event,
  formatArgs,
  formatDuration,
  formatRequest,
  inputText,
  isFormField,
  navText,
} from "../lib/events";

describe("formatDuration", () => {
  it("shows milliseconds under a second", () => {
    expect(formatDuration(92)).toBe("92ms");
  });

  it("shows seconds at or above 1000ms", () => {
    expect(formatDuration(1200)).toBe("1.2s");
  });
});

describe("formatRequest", () => {
  it("shows the path for a same-origin URL", () => {
    expect(
      formatRequest(
        "GET",
        "https://shop.acme.co/api/cart",
        200,
        92,
        "https://shop.acme.co",
      ),
    ).toBe("GET /api/cart · 200 · 92ms");
  });

  it("shows the full URL for a cross-origin request", () => {
    expect(
      formatRequest(
        "GET",
        "https://cdn.example.com/x.js",
        200,
        50,
        "https://shop.acme.co",
      ),
    ).toBe("GET https://cdn.example.com/x.js · 200 · 50ms");
  });

  it("shows failed for a null status", () => {
    expect(
      formatRequest(
        "POST",
        "https://shop.acme.co/api/checkout",
        null,
        1200,
        "https://shop.acme.co",
      ),
    ).toBe("POST /api/checkout · failed · 1.2s");
  });
});

describe("formatArgs", () => {
  it("joins strings with spaces", () => {
    expect(formatArgs(["a", "b"])).toBe("a b");
  });

  it("stringifies objects", () => {
    expect(formatArgs([{ a: 1 }])).toBe('{"a":1}');
  });

  it("falls back to String() when JSON.stringify throws", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatArgs([circular])).toBe(String(circular));
  });

  it("falls back to String() when JSON.stringify returns undefined", () => {
    expect(formatArgs([undefined])).toBe(String(undefined));
  });

  it("formats an Error by its stack, not JSON.stringify's '{}'", () => {
    const err = new Error("boom");
    expect(formatArgs([err])).toBe(err.stack);
  });

  it("falls back to name: message when an Error has no stack", () => {
    const err = new Error("boom");
    err.stack = undefined;
    expect(formatArgs([err])).toBe("Error: boom");
  });
});

describe("describeElement", () => {
  it("prefers aria-label", () => {
    const el = document.createElement("button");
    el.setAttribute("aria-label", "Submit");
    document.body.append(el);
    expect(describeElement(el)).toBe("Submit");
    el.remove();
  });

  it("uses an associated label's text", () => {
    document.body.innerHTML =
      '<label for="email">Email address</label><input id="email">';
    const input = document.getElementById("email")!;
    expect(describeElement(input)).toBe("Email address");
    document.body.innerHTML = "";
  });

  it("uses a wrapping label's text", () => {
    document.body.innerHTML = '<label>Name<input id="name-field"></label>';
    const input = document.getElementById("name-field")!;
    expect(describeElement(input)).toBe("Name");
    document.body.innerHTML = "";
  });

  it("falls back to innerText", () => {
    const el = document.createElement("button");
    el.innerText = "Save";
    document.body.append(el);
    expect(describeElement(el)).toBe("Save");
    el.remove();
  });

  it("falls back to placeholder", () => {
    const el = document.createElement("input");
    el.setAttribute("placeholder", "Search");
    document.body.append(el);
    expect(describeElement(el)).toBe("Search");
    el.remove();
  });

  it("falls back to name", () => {
    const el = document.createElement("input");
    el.setAttribute("name", "email");
    document.body.append(el);
    expect(describeElement(el)).toBe("email");
    el.remove();
  });

  it("falls back to the tag name", () => {
    const el = document.createElement("div");
    document.body.append(el);
    expect(describeElement(el)).toBe("div");
    el.remove();
  });

  it("cuts labels at 60 characters", () => {
    const el = document.createElement("button");
    el.setAttribute("aria-label", "x".repeat(80));
    document.body.append(el);
    expect(describeElement(el)).toBe(`${"x".repeat(60)}…`);
    el.remove();
  });
});

describe("isFormField", () => {
  it("is true for input, textarea, select, contenteditable", () => {
    expect(isFormField(document.createElement("input"))).toBe(true);
    expect(isFormField(document.createElement("textarea"))).toBe(true);
    expect(isFormField(document.createElement("select"))).toBe(true);
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isFormField(div)).toBe(true);
  });

  it("is false for a plain element", () => {
    expect(isFormField(document.createElement("div"))).toBe(false);
  });
});

describe("clickText", () => {
  it("names a form field", () => {
    const el = document.createElement("input");
    el.setAttribute("name", "email");
    expect(clickText(el)).toBe("Clicked “email” field");
  });

  it("names a plain element", () => {
    const el = document.createElement("button");
    el.setAttribute("aria-label", "Submit");
    expect(clickText(el)).toBe("Clicked “Submit”");
  });
});

describe("inputText", () => {
  it("names the field", () => {
    const el = document.createElement("input");
    el.setAttribute("name", "email");
    expect(inputText(el)).toBe("Typed in “email” field");
  });
});

describe("navText", () => {
  it("shows host and path", () => {
    expect(navText("https://shop.acme.co/cart?x=1")).toBe(
      "Navigated to shop.acme.co/cart?x=1",
    );
  });
});

describe("event", () => {
  it("stamps at, defaults isError to false", () => {
    const e = event("log", "hello");
    expect(e.kind).toBe("log");
    expect(e.text).toBe("hello");
    expect(e.isError).toBe(false);
    expect(typeof e.at).toBe("number");
  });

  it("accepts isError", () => {
    expect(event("err", "boom", true).isError).toBe(true);
  });
});
