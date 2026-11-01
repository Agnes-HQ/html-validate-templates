/**
 * Turns a server-side template into HTML that html-validate can read, keeping every line and column where it was.
 *
 * One pass over the source tracks where it is in the HTML (text, a tag, an attribute value, a comment, script or
 * style) and replaces each template construct with something of the same length that fits there:
 *
 * - output (`{{ name }}`) in text becomes `x`s, so the element still has text;
 * - anything inside an attribute value becomes {@link SENTINEL} characters, which the plugin turns into a dynamic value;
 * - output before `=` (`{{ key }}="…"`) becomes an attribute name, output as or glued to a tag name (`<{{ tag }}>`,
 *   `<h{{ level }}>`) a custom element name;
 * - output in attribute position (`<div {{ attributes }}>`), control tags and comments become spaces.
 *
 * Conditionals keep their first branch: everything from the first `else` up to the matching end is blanked, so
 * `{% if a %}<div class="a">{% else %}<div class="b">{% endif %}` leaves one opening tag, not two.
 */

/** Fills attribute values that hold template code; never valid in real HTML, so it cannot clash with your markup. */
export const SENTINEL = "";

export type HtmlState = "text" | "tagName" | "tag" | "beforeValue" | "dq" | "sq" | "unq" | "comment" | "raw";

export interface Token {
  /** Index just past the token. */
  end: number;
  /** `output` prints something, `control` is a tag or directive, `comment` prints nothing. */
  kind: "output" | "control" | "comment";
  /** For control tokens: the tag or directive name, which drives the block structure. */
  name?: string;
  /** For verbatim/raw blocks: the content up to `start` is literal HTML, and `start`–`end` is the closing tag. */
  verbatimEnd?: { start: number; end: number };
}

export interface Syntax {
  /**
   * Rewrites a character of a component's tag name, given the name so far (`/` first for an end tag), so html-validate
   * accepts it: Blade's `<x-buttons.primary>` becomes `<x:buttons-primary>`, Twig's `<twig:Alert>` `<twig:alert>`.
   */
  componentChar?(tagName: string, ch: string): string;
  /** The template token starting at `i`, or null. `state` is where the HTML is, for syntaxes where that matters. */
  match(src: string, i: number, state: HtmlState): Token | null;
  /** A control token that opens a block with branches. */
  opens(name: string): boolean;
  /** A control token that starts another branch of the open block `open`. */
  isBranch(name: string, open: string): boolean;
  /** A control token that starts the first branch of `open` rather than another one (a switch's first case). */
  startsFirstBranch?(name: string, open: string): boolean;
  /** A control token that ends the open block `open`. */
  closes(name: string, open: string): boolean;
}

export interface MaskedAttribute {
  /** Lowercased attribute name, as html-validate will see it. */
  key: string;
  /** Inside a conditional block: rendered in some cases only, perhaps instead of another one like it. */
  conditional: boolean;
}

export interface MaskResult {
  data: string;
  /** Every attribute of every start tag in `data`, in document order. */
  attributes: MaskedAttribute[];
}

const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);

export function mask(src: string, syntax: Syntax): MaskResult {
  const out: string[] = new Array(src.length);
  let state = "text" as HtmlState; // not narrowed: `advance` changes it from a closure
  let tagName = "";
  let rawName = "";
  const stack: Array<{ name: string; start: number; started?: boolean }> = [];
  const conditionals: Array<[number, number]> = [];
  let blankFrom = -1; // the stack depth whose rest is being blanked, or -1

  const fill = (from: number, to: number, ch: string) => {
    for (let k = from; k < to; k++) out[k] = src[k] === "\n" || src[k] === "\r" ? src[k]! : ch;
  };
  const advance = (k: number) => {
    ({ state, tagName, rawName } = step(src, k, state, tagName, rawName));
  };

  let i = 0;
  while (i < src.length) {
    const tok = syntax.match(src, i, state);
    if (tok) {
      if (tok.kind === "control" && tok.name) {
        // a closing tag ends its own block, and any inner block a template left open
        const closing = stack.findLastIndex((b) => syntax.closes(tok.name!, b.name));
        if (closing !== -1) {
          while (stack.length > closing) conditionals.push([stack.pop()!.start, tok.end]);
          if (blankFrom > stack.length) blankFrom = -1;
        } else if (stack.length > 0 && syntax.startsFirstBranch?.(tok.name, stack[stack.length - 1]!.name) && !stack[stack.length - 1]!.started) {
          stack[stack.length - 1]!.started = true;
        } else if (stack.length > 0 && syntax.isBranch(tok.name, stack[stack.length - 1]!.name)) {
          if (blankFrom === -1) blankFrom = stack.length;
        } else if (syntax.opens(tok.name)) {
          stack.push({ name: tok.name, start: i });
        }
      }

      if (blankFrom !== -1) {
        fill(i, tok.end, " ");
      } else if (tok.verbatimEnd) {
        const { start, end } = tok.verbatimEnd;
        fill(i, tok.end, " ");
        for (let k = tok.end; k < start; k++) {
          out[k] = src[k]!;
          advance(k);
        }
        fill(start, end, " ");
        i = end;
        continue;
      } else if (state === "dq" || state === "sq" || state === "unq") {
        fill(i, tok.end, tok.kind === "comment" ? " " : SENTINEL);
      } else if (state === "beforeValue") {
        fill(i, tok.end, SENTINEL);
        state = "unq";
      } else if (state === "text" && tok.kind === "output" && (src[i - 1] === "<" || src.slice(i - 2, i) === "</")) {
        // a dynamic tag name, `<{{ tag }}>`: a custom element name of the same length
        fill(i, tok.end, "x");
        if (tok.end - i >= 2) out[i + 1] = "-";
        state = "tagName";
        tagName = src[i - 1] === "/" ? "/x-" : "x-";
      } else if (state === "tagName" && tok.kind === "output" && tagName.replace("/", "") !== "") {
        // output glued to a tag name, `<h{{ level }}>`: the rest of a custom element name, `<h-xxxxxxx>`
        fill(i, tok.end, "x");
        out[i] = "-";
        tagName += "-";
      } else if ((state === "tag" || state === "tagName") && tok.kind === "output" && /^\s*=/.test(src.slice(tok.end, tok.end + 8))) {
        // a dynamic attribute name, `{{ key }}="…"`: a placeholder name of the same length
        fill(i, tok.end, "x");
        state = "tag";
      } else if (state === "tag" || state === "tagName") {
        fill(i, tok.end, " ");
        if (state === "tagName") state = "tag";
      } else if (state === "text" && tok.kind === "output") {
        fill(i, tok.end, "x");
      } else {
        fill(i, tok.end, " ");
      }
      i = tok.end;
      continue;
    }

    if (blankFrom !== -1) {
      fill(i, i + 1, " ");
      i++;
      continue;
    }
    out[i] = state === "tagName" && syntax.componentChar ? syntax.componentChar(tagName, src[i]!) : src[i]!;
    advance(i);
    i++;
  }

  // blocks a template never closed run to its end
  while (stack.length > 0) conditionals.push([stack.pop()!.start, src.length]);
  const data = out.join("");
  return { data, attributes: attributesOf(data, conditionals) };
}

/** Advances the HTML state machine over one character. */
function step(src: string, i: number, state: HtmlState, tagName: string, rawName: string) {
  const c = src[i]!;
  switch (state) {
    case "text":
      if (c === "<") {
        if (src.startsWith("<!--", i)) state = "comment";
        else if (/[A-Za-z]/.test(src[i + 1] ?? "") || (src[i + 1] === "/" && /[A-Za-z]/.test(src[i + 2] ?? ""))) {
          state = "tagName";
          tagName = "";
        } else if (src[i + 1] === "!" || src[i + 1] === "?") {
          state = "tag";
          tagName = "!";
        }
      }
      break;
    case "tagName":
      if (c === "/" && tagName === "") tagName = "/"; // an end tag: never enters raw text
      else if (/\s/.test(c)) state = "tag";
      else if (c === ">") state = contentOf(tagName);
      else tagName += c.toLowerCase();
      break;
    case "tag":
      if (c === ">") state = src[i - 1] === "/" ? "text" : contentOf(tagName);
      else if (c === "=") state = "beforeValue";
      break;
    case "beforeValue":
      if (c === '"') state = "dq";
      else if (c === "'") state = "sq";
      else if (c === ">") state = contentOf(tagName);
      else if (!/\s/.test(c)) state = "unq";
      break;
    case "dq":
      if (c === '"') state = "tag";
      break;
    case "sq":
      if (c === "'") state = "tag";
      break;
    case "unq":
      if (/\s/.test(c)) state = "tag";
      else if (c === ">") state = contentOf(tagName);
      break;
    case "comment":
      if (c === ">" && src.slice(i - 2, i) === "--") state = "text";
      break;
    case "raw":
      if (c === "<" && src.slice(i, i + 2 + rawName.length).toLowerCase() === `</${rawName}`) {
        state = "tagName";
        tagName = "";
      }
      break;
  }
  if (state === "raw" && RAW_TEXT.has(tagName)) rawName = tagName;
  return { state, tagName, rawName };
}

const contentOf = (tagName: string): HtmlState => (RAW_TEXT.has(tagName) ? "raw" : "text");

/**
 * The attributes of every start tag in plain HTML, in document order, each marked when it sits inside one of the
 * conditional blocks. The plugin's attribute hook walks this list alongside html-validate's parser.
 */
export function attributesOf(html: string, conditionals: ReadonlyArray<readonly [number, number]>): MaskedAttribute[] {
  const found: MaskedAttribute[] = [];
  const inConditional = (offset: number) => conditionals.some(([a, b]) => offset >= a && offset < b);
  let i = 0;
  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    const open = /^<([A-Za-z][^\s/>]*)/.exec(html.slice(i, i + 256));
    if (!open) {
      i++;
      continue;
    }
    const name = open[1]!.toLowerCase();
    i += open[0].length;
    // attributes up to the end of the tag
    while (i < html.length && html[i] !== ">") {
      if (/[\s/]/.test(html[i]!)) {
        i++;
        continue;
      }
      const start = i;
      while (i < html.length && !/[\s/>=]/.test(html[i]!)) i++;
      found.push({ key: html.slice(start, i).toLowerCase(), conditional: inConditional(start) });
      while (/\s/.test(html[i] ?? "")) i++;
      if (html[i] !== "=") continue;
      i++;
      while (/\s/.test(html[i] ?? "")) i++;
      const q = html[i];
      if (q === '"' || q === "'") {
        const end = html.indexOf(q, i + 1);
        i = end === -1 ? html.length : end + 1;
      } else {
        while (i < html.length && !/[\s>]/.test(html[i]!)) i++;
      }
    }
    i++;
    // script and style content is text, not markup
    if (RAW_TEXT.has(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, i);
      i = close === -1 ? html.length : close;
    }
  }
  return found;
}

/** Index just past the `)` matching the `(` at `i`, skipping quoted strings; -1 when unbalanced. */
export function balancedParen(src: string, i: number): number {
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "'" || c === '"') {
      const q = c;
      for (k++; k < src.length && src[k] !== q; k++) if (src[k] === "\\") k++;
    } else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return k + 1;
  }
  return -1;
}

/** Index just past the next `close` from `from`, or the end of the source when there is none. */
export function until(src: string, from: number, close: string): number {
  const k = src.indexOf(close, from);
  return k === -1 ? src.length : k + close.length;
}
