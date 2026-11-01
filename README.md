# html-validate-templates

[html-validate](https://html-validate.org) plugins for server-side templates. They lint the HTML in Blade, Twig, Nunjucks and Handlebars files, with every finding at the right line and column of your template.

| Package | Templates | |
|---|---|---|
| [html-validate-blade](packages/blade) | Laravel Blade (`*.blade.php`) | [![npm](https://img.shields.io/npm/v/html-validate-blade)](https://www.npmjs.com/package/html-validate-blade) |
| [html-validate-twig](packages/twig) | Twig (`*.twig`) and Nunjucks (`*.njk`) | [![npm](https://img.shields.io/npm/v/html-validate-twig)](https://www.npmjs.com/package/html-validate-twig) |
| [html-validate-handlebars](packages/handlebars) | Handlebars (`*.hbs`, `*.handlebars`) | [![npm](https://img.shields.io/npm/v/html-validate-handlebars)](https://www.npmjs.com/package/html-validate-handlebars) |

```sh
npm install --save-dev html-validate html-validate-blade
```

```json
{
  "plugins": ["html-validate-blade"],
  "extends": ["html-validate:recommended", "html-validate-blade:recommended"]
}
```

Each package's README lists the syntax it understands.

## How it works

The plugin's transformer masks the template syntax before html-validate parses the file. Every character keeps its place, so each finding points at the right line and column of your template:

- printed values (`{{ name }}`) become placeholder text, so an element still has content;
- template code inside an attribute value makes that value *dynamic*, so rules that check values (`attribute-allowed-values`, `valid-id`, ...) skip it;
- template code in a tag (`<div {{ attributes }}>`), control tags and comments become spaces;
- a dynamic attribute name (`{{ key }}="..."`) or tag name (`<{{ tag }}>`, `<h{{ level }}>`) becomes a placeholder name.

**Conditionals keep their first branch.** Everything from the first `else` to the end of the block is left out, so `if <div class="a"> else <div class="b"> end` leaves one opening tag, not two. Loops are linted once. An `id` or `name` inside a conditional block is treated as dynamic, so the same id in two blocks that never render together is not reported as a duplicate.

## Limits

- Markup split across files is checked per file: a layout that opens a `<div>` which a child template closes reports an unclosed element in one and a stray end tag in the other.
- Separate conditionals that only balance at run time (`if a <a> end ... if a </a> end`) look unbalanced.
- Only the first branch of a conditional is linted. Markup in `else` branches is not checked.
- Inline styles are normal in email templates; turn off `no-inline-style` for those files if you lint them.

## Development

```sh
npm install
npm run check   # typecheck, tests, build, and a smoke test of the built packages
```

`packages/core` holds the masking shared by all three; it is bundled into each package and never published on its own. The three packages are released together with one version: push a `v*` tag and the release workflow publishes them with npm provenance.

## About

Built and maintained by [Agnes](https://agnes.dev), which uses these plugins to check the templates of the repositories it analyses. The approach was tested on Laravel, Symfony, Eleventy and Ghost projects before release; issues and pull requests are welcome.

MIT licensed.
