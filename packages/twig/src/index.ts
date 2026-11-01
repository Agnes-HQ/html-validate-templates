import { createPlugin, twig } from "@html-validate-templates/core";

/**
 * Twig and Nunjucks for html-validate: `plugins: ["html-validate-twig"]` and `extends: ["html-validate-twig:recommended"]`.
 * Template syntax is masked so the HTML around it is linted with every line and column where it was.
 */
const plugin = createPlugin("html-validate-twig", twig, {
  files: "\\.(twig|njk)$",
  // Symfony UX components self-close (`<twig:Alert />`); they are namespaced XML elements
  rules: { "no-self-closing": ["error", { ignoreXML: true }] },
});

export default plugin;
