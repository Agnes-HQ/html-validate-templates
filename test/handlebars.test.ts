import { describe, expect, test } from "vitest";
import plugin from "../packages/handlebars/src/index";
import { asPlainHtml, lint, rules, tpl } from "./helpers";

const hbs = (src: string) => lint(plugin, "partials/post.hbs", src);

describe("html-validate-handlebars", () => {
  test("a clean template has no findings", async () => {
    const src = tpl`
      {{!-- a comment with <unclosed> markup --}}
      {{! a short one }}
      {{#if post.featured}}
        <article class="post featured">
      {{else if post.draft}}
        <article class="post draft">
      {{else}}
        <article class="post">
      {{/if}}
        <h2><a href="{{url}}">{{title}}</a></h2>
        {{{html}}}
        {{> author}}
        {{#each tags}}<span class="tag">{{name}}</span>{{^}}<span>No tags</span>{{/each}}
        {{#*inline "extra"}}<em>{{this}}</em>{{/inline}}
      </article>
    `;
    expect(await hbs(src)).toEqual([]);
  });

  test("real mistakes are reported where they are", async () => {
    const messages = await hbs('{{#if a}}\n  <button class="{{cls}}">Go</button>\n{{/if}}');
    expect(rules(messages)).toEqual(["no-implicit-button-type"]);
    expect(messages[0]).toMatchObject((await lint(plugin, "page.html", '         \n  <button class="xxxxxxx">Go</button>\n       '))[0]!);
  });
});
