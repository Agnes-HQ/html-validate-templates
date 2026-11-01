import { until, type Syntax } from "./mask";

const BRANCHED = new Set(["if", "for"]);
const endTag = (name: string) => new RegExp(`\\{%[-~]?\\s*end${name}\\s*[-~]?%\\}`, "g");

/** Twig and Nunjucks (and Jinja-style templates): `{{ }}`, `{% %}`, `{# #}`. */
export const twig: Syntax = {
  // Symfony UX components are PascalCase (`<twig:Alert />`); html-validate wants lowercase element names
  componentChar: (tagName, ch) => (/^\/?twig:/.test(tagName) ? ch.toLowerCase() : ch),
  match(src, i) {
    if (src[i] !== "{") return null;
    const n = src[i + 1];
    if (n === "#") return { end: until(src, i + 2, "#}"), kind: "comment" };
    if (n === "{") return { end: until(src, i + 2, "}}"), kind: "output" };
    if (n !== "%") return null;
    const end = until(src, i + 2, "%}");
    const name = /^\{%[-~]?\s*(\w+)/.exec(src.slice(i, end))?.[1]?.toLowerCase();
    if (name === "verbatim" || name === "raw") {
      const re = endTag(name);
      re.lastIndex = end;
      const close = re.exec(src);
      if (close) return { end, kind: "control", verbatimEnd: { start: close.index, end: close.index + close[0].length } };
    }
    // `{% set x %}…{% endset %}` captures markup that is printed somewhere else, out of its context here: left out
    if (name === "set" && !src.slice(i, end).includes("=")) {
      const re = endTag("set");
      re.lastIndex = end;
      const close = re.exec(src);
      if (close) return { end: close.index + close[0].length, kind: "comment" };
    }
    return { end, kind: "control", name };
  },
  opens: (name) => BRANCHED.has(name),
  isBranch: (name, open) => (open === "for" ? name === "else" : name === "else" || name === "elseif" || name === "elif"),
  closes: (name, open) => name === `end${open}`,
};
