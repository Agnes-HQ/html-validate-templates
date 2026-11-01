import { defineConfig } from "tsup";

// the shared core is bundled in, so the package depends on html-validate only
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: { resolve: true },
  // `require("html-validate-…")` must return the plugin itself, as html-validate loads it
  cjsInterop: true,
  splitting: true,
  target: "node22",
  clean: true,
  noExternal: ["@html-validate-templates/core"],
  external: ["html-validate"],
});
