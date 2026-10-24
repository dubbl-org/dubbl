import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/shared/markdown";

const render = (md: string) => renderToStaticMarkup(React.createElement(Markdown, { content: md }));

describe("Markdown component", () => {
  it("renders basic markdown", () => {
    const html = render("**bold** and _italic_");
    assert.match(html, /<strong/);
    assert.match(html, /<em/);
  });
  it("renders gfm tables and task lists", () => {
    assert.match(render("| a | b |\n| - | - |\n| 1 | 2 |"), /<table/);
    assert.match(render("- [x] done"), /<input/);
  });
  it("strips raw HTML (user content must not inject markup)", () => {
    const html = render("hello <script>alert(1)</script> and <img src=x onerror=alert(1)>");
    assert.ok(!html.includes("<script"));
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("hello"));
  });
  it("opens links in a new tab safely", () => {
    const html = render("[x](https://example.com)");
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="[^"]*noopener/);
  });
});
