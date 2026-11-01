import { describe, expect, test } from "vitest";
import plugin from "../packages/twig/src/index";
import { asPlainHtml, lint, rules, tpl } from "./helpers";

const twig = (src: string, file = "templates/page.html.twig") => lint(plugin, file, src);

describe("html-validate-twig", () => {
  test("a clean template has no findings", async () => {
    const src = tpl`
      {% extends 'base.html.twig' %}
      {# a comment with <unclosed> markup #}
      {% block body %}
        <h1 class="title {% if big %}title--big{% endif %}">{{ title }}</h1>
        {% for item in items %}
          <a href="{{ path('item', {id: item.id}) }}" {{ stimulus_controller('link') }}>{{ item.name }}</a>
        {% else %}
          <p>No items</p>
        {% endfor %}
        {% if user %}
          <div class="card">
        {% elseif guest %}
          <div class="card guest">
        {% else %}
          <div class="card empty">
        {% endif %}
        </div>
        <input type="checkbox" {% if checked %}checked{% endif %} {{ key }}="{{ value }}">
      {% endblock %}
    `;
    expect(await twig(src)).toEqual([]);
  });

  test("real mistakes are reported where they are", async () => {
    const src = tpl`
      <table>
        <tr>
          <td>{{ name }}</th>
        </tr>
      </table>
    `;
    const messages = await twig(src);
    expect(rules(messages)).toContain("close-order");
    expect(messages).toEqual(await lint(plugin, "page.html", asPlainHtml(src)));
  });

  test("dynamic tag names and tag names with output in them", async () => {
    expect(await twig("<{{ tag }} class=\"x\">text</{{ tag }}>")).toEqual([]);
    expect(await twig("<h{{ level }} class=\"title\">{{ title }}</h{{ level }}>")).toEqual([]);
  });

  test("set captures are skipped, raw and verbatim content is linted", async () => {
    expect(await twig("{% set icon %}<g><circle r=\"1\"/></g>{% endset %}<svg>{{ icon }}</svg>")).toEqual([]);
    expect(rules(await twig("{% verbatim %}<p><div>{{ x }}</div></p>{% endverbatim %}"))).toContain("close-order");
  });

  test("Symfony UX components self-close, with or without content", async () => {
    expect(await twig('<twig:Alert type="success" />\n<twig:Card>{{ body }}</twig:Card>')).toEqual([]);
  });

  test("Nunjucks templates use the same plugin", async () => {
    const src = tpl`
      {% from "macros.njk" import button %}
      {% if a %}<b>{% elif b %}<i>{% else %}<u>{% endif %}x</b>
      {%- raw %}<span>{{ shown as is }}</span>{% endraw -%}
    `;
    expect(await twig(src, "src/_includes/page.njk")).toEqual([]);
  });
});
