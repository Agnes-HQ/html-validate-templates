import { createPlugin, blade } from "@html-validate-templates/core";

/**
 * Laravel Blade for html-validate: `plugins: ["html-validate-blade"]` and `extends: ["html-validate-blade:recommended"]`.
 * Template syntax is masked so the HTML around it is linted with every line and column where it was.
 */
const plugin = createPlugin("html-validate-blade", blade, {
  files: "\\.blade\\.php$",
  // components self-close (`<x-avatar />`); they are read as namespaced XML elements
  rules: { "no-self-closing": ["error", { ignoreXML: true }] },
});

export default plugin;
