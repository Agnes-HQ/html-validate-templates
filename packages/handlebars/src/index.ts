import { createPlugin, handlebars } from "@html-validate-templates/core";

/**
 * Handlebars for html-validate: `plugins: ["html-validate-handlebars"]` and `extends: ["html-validate-handlebars:recommended"]`.
 * Template syntax is masked so the HTML around it is linted with every line and column where it was.
 */
const plugin = createPlugin("html-validate-handlebars", handlebars, {
  files: "\\.(hbs|handlebars)$",
});

export default plugin;
