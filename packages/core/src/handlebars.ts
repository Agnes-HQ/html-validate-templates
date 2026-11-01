import { until, type Syntax } from "./mask";

/** Handlebars (and Mustache-style templates): `{{ }}`, `{{{ }}}`, `{{!-- --}}`, `{{#block}}…{{else}}…{{/block}}`. */
export const handlebars: Syntax = {
  match(src, i) {
    if (src[i] !== "{" || src[i + 1] !== "{") return null;
    if (src.startsWith("{{!--", i)) return { end: until(src, i + 5, "--}}"), kind: "comment" };
    if (src[i + 2] === "!") return { end: until(src, i + 3, "}}"), kind: "comment" };
    if (src[i + 2] === "{") return { end: until(src, i + 3, "}}}"), kind: "output" };
    const end = until(src, i + 2, "}}");
    const inner = src.slice(i + 2, end - 2).replace(/^~/, "").replace(/~$/, "").trim();
    if (inner === "^" || /^else\b/.test(inner)) return { end, kind: "control", name: "else" };
    // `{{#if}}`, `{{^unless}}`, `{{#*inline "x"}}`, `{{#> layout}}` and their `{{/…}}`
    const m = /^([#/^])\s*[*>]?\s*([\w-]+)/.exec(inner);
    if (m) return { end, kind: "control", name: m[1] === "/" ? `/${m[2]}` : m[2] };
    return { end, kind: "output" };
  },
  opens: (name) => !name.startsWith("/") && name !== "else",
  isBranch: (name) => name === "else",
  closes: (name, open) => name === `/${open}`,
};
