import { describe, expect, it } from "vitest";
import { errorSignature } from "./signature";

describe("errorSignature", () => {
  it("returns null when there is no error event", () => {
    expect(errorSignature([{ text: "clicked button", isError: false }])).toBe(
      null,
    );
  });

  it.each([
    {
      name: "strips leading Uncaught",
      text: "Uncaught TypeError: boom",
      want: "typeerror: boom",
    },
    {
      name: "replaces quoted strings",
      text: 'Error: missing field "email"',
      want: 'error: missing field "…"',
    },
    {
      name: "replaces quoted strings with single quotes",
      text: "Error: missing field 'email'",
      want: 'error: missing field "…"',
    },
    {
      name: "replaces numbers",
      text: "Error: index 42 out of bounds",
      want: "error: index n out of bounds",
    },
    {
      name: "replaces hex ids",
      text: "Error loading object 5f3759df",
      want: "error loading object id",
    },
    {
      name: "replaces uuids",
      text: "Error: user 123e4567-e89b-12d3-a456-426614174000 not found",
      want: "error: user id not found",
    },
    {
      name: "replaces urls with their path",
      text: "Failed to fetch https://api.example.com/v1/users?id=9",
      want: "failed to fetch /v1/users?id=n",
    },
    {
      name: "keeps a malformed URL as-is when it fails to parse",
      text: "Failed to fetch https://[::not-valid",
      want: "failed to fetch https://[::not-valid",
    },
    {
      name: "collapses whitespace and lower-cases",
      text: "  Error:   Something    BROKE  ",
      want: "error: something broke",
    },
  ])("$name", ({ text, want }) => {
    expect(errorSignature([{ text, isError: true }])).toBe(want);
  });

  it("uses the first event with isError, ignoring later text", () => {
    expect(
      errorSignature([
        { text: "clicked button", isError: false },
        { text: "Uncaught Error: first", isError: true },
        { text: "Uncaught Error: second", isError: true },
      ]),
    ).toBe("error: first");
  });

  it("uses only the first line for normalization", () => {
    expect(
      errorSignature([
        { text: "Error: boom\nsome other detail line", isError: true },
      ]),
    ).toBe("error: boom");
  });

  it.each([
    {
      name: "appends fn and file from an `at fn (file:line:col)` frame",
      text: "Error: boom\n    at handleClick (app.js:42:13)",
      want: "error: boom @ handleclick app.js",
    },
    {
      name: "appends fn and file from an `fn@file:line:col` frame",
      text: "Error: boom\nonClick@app.js:10:5",
      want: "error: boom @ onclick app.js",
    },
    {
      name: "ignores a non-stack-frame second line with no frame anywhere",
      text: "Error: boom\nnot a stack frame",
      want: "error: boom",
    },
  ])("$name", ({ text, want }) => {
    expect(errorSignature([{ text, isError: true }])).toBe(want);
  });
});
