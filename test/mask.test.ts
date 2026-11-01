import { describe, expect, test } from "vitest";
import { blade, handlebars, mask, SENTINEL, twig } from "@html-validate-templates/core";

describe("mask", () => {
  test("keeps the length and every newline, so lines and columns stay where they were", () => {
    for (const [syntax, src] of [
      [blade, "<p>{{ $a }}\n@if($x)\n<b>{!! $html !!}</b>\n@else\n<i>no</i>\n@endif</p>"],
      [twig, "<p>{{ a }}\n{% if x %}\n<b>{{ b|raw }}</b>\n{% else %}\n<i>no</i>\n{% endif %}</p>"],
      [handlebars, "<p>{{a}}\n{{#if x}}\n<b>{{{b}}}</b>\n{{else}}\n<i>no</i>\n{{/if}}</p>"],
    ] as const) {
      const { data } = mask(src, syntax);
      expect(data).toHaveLength(src.length);
      expect(data.split("\n").map((l) => l.length)).toEqual(src.split("\n").map((l) => l.length));
    }
  });

  test("output becomes text, attribute values become dynamic, control tags disappear", () => {
    const src = '<a href="{{ url }}" {{ attrs }}>{{ label }}</a>{% if x %}{% endif %}';
    const { data } = mask(src, twig);
    expect(data).toBe(`<a href="${SENTINEL.repeat(9)}" ${" ".repeat(11)}>${"x".repeat(11)}</a>${" ".repeat(21)}`);
  });

  test("only the first branch is kept, nested blocks included", () => {
    const { data } = mask("{% if a %}<b>{% if c %}<i>{% else %}<u>{% endif %}{% elseif d %}<s>{% else %}<q>{% endif %}", twig);
    expect(data.replace(/\s+/g, " ").trim()).toBe("<b> <i>");
  });

  test("a closing tag ends an inner block the template left open", () => {
    const { data } = mask("@if($a)<b>@if($c)<i>@else<u>@endif<p>tail</p>", blade);
    expect(data).toContain("<p>tail</p>");
  });

  test("conditional attributes are marked in document order", () => {
    const { attributes } = mask('<main id="m">@auth<div id="a" class="x">@endauth<span id="s">', blade);
    expect(attributes).toEqual([
      { key: "id", conditional: false },
      { key: "id", conditional: true },
      { key: "class", conditional: true },
      { key: "id", conditional: false },
    ]);
  });
});
