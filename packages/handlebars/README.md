# html-validate-handlebars

Lint the HTML in Handlebars templates with [html-validate](https://html-validate.org): unclosed and misnested elements, invalid attributes, accessibility problems and the rest of html-validate's rules, with the template syntax around them understood.

## Usage

```sh
npm install --save-dev html-validate html-validate-handlebars
```

`.htmlvalidate.json`:

```json
{
  "plugins": ["html-validate-handlebars"],
  "extends": ["html-validate:recommended", "html-validate-handlebars:recommended"]
}
```

The `recommended` preset registers the transformer for `*.hbs` and `*.handlebars` files and adjusts a few rules for templates (see below). Then run:

```sh
npx html-validate "**/*.hbs"
```

Requires html-validate 11 and Node.js 22.22 or 24.8 and later.

## What it understands

- `{{ }}`, `{{{ }}}`, `{{! }}` and `{{!-- --}}`
- blocks: `{{#if}}`/`{{else if}}`/`{{else}}`, `{{#each}}`/`{{^}}`, `{{#unless}}`, `{{#with}}`, inline partials (`{{#*inline}}`), partial blocks (`{{#> layout}}`) and any helper block, such as Ghost's `{{#foreach}}`
- partials (`{{> name}}`) print markup and become placeholder text

## The `recommended` preset

- `no-multiple-main` is off: layouts often have `<main>` in two blocks that never render together
- `no-trailing-whitespace` is off: a line with only a block tag is left as spaces

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

## Part of html-validate-templates

This package is one of three in [html-validate-templates](https://github.com/Agnes-HQ/html-validate-templates): [html-validate-blade](https://www.npmjs.com/package/html-validate-blade), [html-validate-twig](https://www.npmjs.com/package/html-validate-twig) (Twig and Nunjucks) and [html-validate-handlebars](https://www.npmjs.com/package/html-validate-handlebars). They are built and maintained by [Agnes](https://agnes.dev), which uses them to check the templates of the repositories it analyses. [html-validate](https://html-validate.org) does the actual linting.

MIT licensed.
