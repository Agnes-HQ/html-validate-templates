import { HtmlValidate, StaticConfigLoader, type Plugin } from "html-validate";

export interface Message {
  rule: string;
  line: number;
  column: number;
  message: string;
}

/** Lints `src` as `filename` with html-validate's recommended rules plus the plugin's preset. */
export async function lint(plugin: Plugin, filename: string, src: string, rules: Record<string, unknown> = {}): Promise<Message[]> {
  const hv = new HtmlValidate(
    new StaticConfigLoader({
      root: true,
      plugins: [plugin],
      extends: ["html-validate:recommended", `${plugin.name}:recommended`],
      // style rules that only make the fixtures noisy
      rules: { "no-trailing-whitespace": "off", "void-style": "off", "no-inline-style": "off", ...rules } as never,
    }),
  );
  const report = await hv.validateString(src, filename);
  return report.results.flatMap((r) => r.messages.map((m) => ({ rule: m.ruleId, line: m.line, column: m.column, message: m.message })));
}

export const rules = (messages: Message[]) => messages.map((m) => m.rule).toSorted();

/** Template text as written: strips the indentation of the first line from every line. */
export function tpl(strings: TemplateStringsArray, ...values: unknown[]): string {
  const raw = String.raw({ raw: strings }, ...values).replace(/^\n/, "");
  const indent = /^\s*/.exec(raw)![0].length;
  return raw
    .split("\n")
    .map((l) => l.slice(indent))
    .join("\n");
}

/** The same markup with every `{{ … }}` replaced by text of its length: what the lines and columns should match. */
export const asPlainHtml = (src: string) => src.replace(/\{\{.*?\}\}/g, (m) => "x".repeat(m.length));
