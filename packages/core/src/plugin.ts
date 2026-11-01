import { DynamicValue, type AttributeData, type ConfigData, type Plugin, type Source, type Transformer } from "html-validate";
import { mask, SENTINEL, type MaskedAttribute, type Syntax } from "./mask";

/** Attributes whose duplicates html-validate reports; inside a conditional block they may replace each other, not clash. */
const UNIQUE_ATTRIBUTES = new Set(["id", "name"]);

/** XML written as a template (feeds, sitemaps, OpenSearch) is not HTML, and is skipped. */
const XML_ROOTS = new Set(["rss", "feed", "urlset", "sitemapindex", "opensearchdescription"]);

function isXml(html: string): boolean {
  if (/^\s*<\?xml/.test(html)) return true;
  const root = /<([A-Za-z][\w:-]*)/.exec(html.replace(/<!--[\s\S]*?-->/g, ""))?.[1]?.toLowerCase();
  return root !== undefined && XML_ROOTS.has(root);
}

/**
 * Walks the masked attribute list alongside html-validate's parser, which calls the hook once per attribute in document
 * order. The key is checked on every step; after an attribute the list does not know (another transformer's, say) it
 * looks a few entries ahead, and otherwise leaves the attribute as it is.
 */
function attributeHook(attributes: MaskedAttribute[]) {
  let next = 0;
  return function* processAttribute(attr: AttributeData): Iterable<AttributeData> {
    const key = attr.key.toLowerCase();
    let conditional = false;
    for (let k = next; k < Math.min(next + 4, attributes.length); k++) {
      if (attributes[k]!.key === key) {
        conditional = attributes[k]!.conditional;
        next = k + 1;
        break;
      }
    }
    const value = attr.value;
    if (typeof value === "string" && (value.includes(SENTINEL) || (conditional && UNIQUE_ATTRIBUTES.has(key)))) {
      yield { ...attr, value: new DynamicValue(value.replaceAll(SENTINEL, "…")) };
    } else {
      yield attr;
    }
  };
}

/** The transformer for one template syntax: one HTML source per template, or none for XML. */
export function createTransformer(syntax: Syntax): Transformer {
  const transform = function (source: Source): Source[] {
    const { data, attributes } = mask(source.data, syntax);
    if (isXml(data)) return [];
    return [
      {
        ...source,
        data,
        originalData: source.originalData ?? source.data,
        hooks: { ...source.hooks, processAttribute: attributeHook(attributes) },
      },
    ];
  } as Transformer;
  transform.api = 1;
  return transform;
}

/**
 * An html-validate plugin for one template syntax: its transformer, and a `recommended` preset that registers it for
 * the syntax's file extensions and adjusts the rules templates trip over.
 */
export function createPlugin(name: string, syntax: Syntax, options: { files: string; rules?: ConfigData["rules"] }): Plugin {
  return {
    name,
    transformer: createTransformer(syntax),
    configs: {
      recommended: {
        transform: { [options.files]: name },
        rules: {
          // a layout often has `<main>` in two blocks that never render together (signed in, signed out)
          "no-multiple-main": "off",
          // a line with only a control tag (`@if (…)`, `{% endif %}`) is left as spaces
          "no-trailing-whitespace": "off",
          ...options.rules,
        },
      },
    },
  };
}
