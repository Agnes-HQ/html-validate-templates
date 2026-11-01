// Checks the built packages the way html-validate loads them: `import` and `require` must both give the plugin itself.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { HtmlValidate } from "html-validate";

const require = createRequire(import.meta.url);
const cases = {
  blade: ["page.blade.php", "@if($a)<div class=\"a\">@else<div class=\"b\">@endif<x-avatar /></div>"],
  twig: ["page.html.twig", "{% if a %}<div class=\"a\">{% else %}<div class=\"b\">{% endif %}{{ x }}</div>"],
  handlebars: ["post.hbs", "{{#if a}}<div class=\"a\">{{else}}<div class=\"b\">{{/if}}{{x}}</div>"],
};

for (const [name, [file, src]] of Object.entries(cases)) {
  const dir = new URL(`../packages/${name}/dist/`, import.meta.url);
  const esm = (await import(new URL("index.js", dir).href)).default;
  const cjs = require(new URL("index.cjs", dir).pathname);
  for (const plugin of [esm, cjs]) {
    assert.equal(plugin.name, `html-validate-${name}`);
    assert.equal(typeof plugin.transformer, "function");
    const hv = new HtmlValidate({ root: true, plugins: [plugin], extends: ["html-validate:recommended", `${plugin.name}:recommended`] });
    const report = await hv.validateString(src, file);
    assert.equal(report.valid, true, `${name}: ${JSON.stringify(report.results[0]?.messages)}`);
  }
  console.log(`ok html-validate-${name}`);
}
