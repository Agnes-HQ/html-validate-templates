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
  return new Masker(src, syntax).run();
}

/** Where the HTML state machine is: the state, the tag name so far, and the raw text element it is in. */
interface HtmlCursor {
  state: HtmlState;
  tagName: string;
  rawName: string;
}

interface Block {
  name: string;
  start: number;
  /** A switch whose first case has been seen. */
  started?: boolean;
}

/** One pass of {@link mask} over a source. */
class Masker {
  private readonly src: string;
  private readonly syntax: Syntax;
  /** The masked output, one character per source character; every index is overwritten. */
  private readonly out: string[];
  private readonly html: HtmlCursor = { state: "text", tagName: "", rawName: "" };
  private readonly stack: Block[] = [];
  private readonly conditionals: Array<[number, number]> = [];
  /** The stack depth whose rest is being blanked, or -1. */
  private blankFrom = -1;

  constructor(src: string, syntax: Syntax) {
    this.src = src;
    this.syntax = syntax;
    this.out = src.split("");
  }

  run(): MaskResult {
    let i = 0;
    while (i < this.src.length) {
      const tok = this.syntax.match(this.src, i, this.html.state);
      i = tok ? this.token(tok, i) : this.char(i);
    }
    // blocks a template never closed run to its end
    while (this.stack.length > 0) this.conditionals.push([this.stack.pop()!.start, this.src.length]);
    const data = this.out.join("");
    return { data, attributes: attributesOf(data, this.conditionals) };
  }

  /** Masks the template token at `i`; returns the index to go on from. */
  private token(tok: Token, i: number): number {
    if (tok.kind === "control" && tok.name) this.trackBlock(tok.name, i, tok.end);
    if (this.blankFrom !== -1) this.fill(i, tok.end, " ");
    else if (tok.verbatimEnd) return this.verbatim(i, tok.end, tok.verbatimEnd);
    else this.maskToken(tok, i);
    return tok.end;
  }

  /** Copies the source character at `i`, or blanks it inside a branch being left out. */
  private char(i: number): number {
    if (this.blankFrom !== -1) {
      this.fill(i, i + 1, " ");
      return i + 1;
    }
    const ch = this.src[i]!;
    const { componentChar } = this.syntax;
    this.out[i] = this.html.state === "tagName" && componentChar ? componentChar(this.html.tagName, ch) : ch;
    step(this.src, i, this.html);
    return i + 1;
  }

  /** Updates the open blocks for the control token `name` from `start` to `end`. */
  private trackBlock(name: string, start: number, end: number) {
    const { stack, syntax } = this;
    // a closing tag ends its own block, and any inner block a template left open
    const closing = stack.findLastIndex((b) => syntax.closes(name, b.name));
    const top = stack[stack.length - 1];
    if (closing !== -1) {
      while (stack.length > closing) this.conditionals.push([stack.pop()!.start, end]);
      if (this.blankFrom > stack.length) this.blankFrom = -1;
    } else if (top && !top.started && syntax.startsFirstBranch?.(name, top.name)) {
      top.started = true;
    } else if (top && syntax.isBranch(name, top.name)) {
      if (this.blankFrom === -1) this.blankFrom = stack.length;
    } else if (syntax.opens(name)) {
      stack.push({ name, start });
    }
  }

  /** A verbatim block: its tags are blanked and its content kept as HTML. Returns the index past its closing tag. */
  private verbatim(i: number, end: number, close: { start: number; end: number }): number {
    this.fill(i, end, " ");
    for (let k = end; k < close.start; k++) {
      this.out[k] = this.src[k]!;
      step(this.src, k, this.html);
    }
    this.fill(close.start, close.end, " ");
    return close.end;
  }

  /** Replaces a template token with what fits where it is in the HTML. */
  private maskToken(tok: Token, i: number) {
    switch (this.html.state) {
      case "dq":
      case "sq":
      case "unq":
      case "beforeValue":
        return this.maskInValue(tok, i);
      case "tag":
      case "tagName":
        return this.maskInTag(tok, i);
      case "text":
        return this.maskInText(tok, i);
      default:
        // a comment, script or style
        return this.fill(i, tok.end, " ");
    }
  }

  /** In an attribute value, or where one starts: a dynamic value, but a template comment is left out. */
  private maskInValue(tok: Token, i: number) {
    if (this.html.state === "beforeValue") {
      this.fill(i, tok.end, SENTINEL);
      this.html.state = "unq";
    } else {
      this.fill(i, tok.end, tok.kind === "comment" ? " " : SENTINEL);
    }
  }

  /** In a tag, after or glued to its name. */
  private maskInTag(tok: Token, i: number) {
    const output = tok.kind === "output";
    if (output && this.html.state === "tagName" && this.html.tagName.replace("/", "") !== "") {
      // output glued to a tag name, `<h{{ level }}>`: the rest of a custom element name, `<h-xxxxxxx>`
      this.fill(i, tok.end, "x");
      this.out[i] = "-";
      this.html.tagName += "-";
      return;
    }
    // a dynamic attribute name, `{{ key }}="…"`, becomes a placeholder name of the same length; output in attribute
    // position (`<div {{ attributes }}>`) and control tags become spaces
    const attributeName = output && /^\s*=/.test(this.src.slice(tok.end, tok.end + 8));
    this.fill(i, tok.end, attributeName ? "x" : " ");
    this.html.state = "tag";
  }

  /** In text: output keeps the element's text, other tokens print nothing. */
  private maskInText(tok: Token, i: number) {
    const { src } = this;
    if (tok.kind !== "output") {
      this.fill(i, tok.end, " ");
      return;
    }
    this.fill(i, tok.end, "x");
    if (src[i - 1] === "<" || src.slice(i - 2, i) === "</") {
      // a dynamic tag name, `<{{ tag }}>`: a custom element name of the same length
      if (tok.end - i >= 2) this.out[i + 1] = "-";
      this.html.state = "tagName";
      this.html.tagName = src[i - 1] === "/" ? "/x-" : "x-";
    }
  }

  /** Fills `from`–`to` with `ch`, keeping line breaks. */
  private fill(from: number, to: number, ch: string) {
    for (let k = from; k < to; k++) this.out[k] = this.src[k] === "\n" || this.src[k] === "\r" ? this.src[k]! : ch;
  }
}

type Stepper = (c: string, src: string, i: number, at: HtmlCursor) => void;

/** How each HTML state moves on over the character `c` at `i`. */
const STEPS: Record<HtmlState, Stepper> = {
  text(c, src, i, at) {
    if (c !== "<") return;
    if (src.startsWith("<!--", i)) {
      at.state = "comment";
    } else if (isTagStart(src, i)) {
      at.state = "tagName";
      at.tagName = "";
    } else if (src[i + 1] === "!" || src[i + 1] === "?") {
      at.state = "tag";
      at.tagName = "!";
    }
  },
  tagName(c, _src, _i, at) {
    if (c === "/" && at.tagName === "") at.tagName = "/"; // an end tag: never enters raw text
    else if (/\s/.test(c)) at.state = "tag";
    else if (c === ">") at.state = contentOf(at.tagName);
    else at.tagName += c.toLowerCase();
  },
  tag(c, src, i, at) {
    if (c === ">") at.state = src[i - 1] === "/" ? "text" : contentOf(at.tagName);
    else if (c === "=") at.state = "beforeValue";
  },
  beforeValue(c, _src, _i, at) {
    if (c === '"') at.state = "dq";
    else if (c === "'") at.state = "sq";
    else if (c === ">") at.state = contentOf(at.tagName);
    else if (!/\s/.test(c)) at.state = "unq";
  },
  dq(c, _src, _i, at) {
    if (c === '"') at.state = "tag";
  },
  sq(c, _src, _i, at) {
    if (c === "'") at.state = "tag";
  },
  unq(c, _src, _i, at) {
    if (/\s/.test(c)) at.state = "tag";
    else if (c === ">") at.state = contentOf(at.tagName);
  },
  comment(c, src, i, at) {
    if (c === ">" && src.slice(i - 2, i) === "--") at.state = "text";
  },
  raw(c, src, i, at) {
    if (c === "<" && src.slice(i, i + 2 + at.rawName.length).toLowerCase() === `</${at.rawName}`) {
      at.state = "tagName";
      at.tagName = "";
    }
  },
};

/** Advances the HTML state machine over one character. */
function step(src: string, i: number, at: HtmlCursor) {
  STEPS[at.state](src[i]!, src, i, at);
  if (at.state === "raw" && RAW_TEXT.has(at.tagName)) at.rawName = at.tagName;
}

const isLetter = (c: string | undefined) => /[A-Za-z]/.test(c ?? "");

/** A start or end tag opens at `i`: `<` followed by a letter, or by `/` and a letter. */
const isTagStart = (src: string, i: number) => isLetter(src[i + 1]) || (src[i + 1] === "/" && isLetter(src[i + 2]));

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
      i = until(html, i + 4, "-->");
      continue;
    }
    const open = /^<([A-Za-z][^\s/>]*)/.exec(html.slice(i, i + 256));
    if (!open) {
      i++;
      continue;
    }
    const name = open[1]!.toLowerCase();
    i = readAttributes(html, i + open[0].length, (key, start) => found.push({ key, conditional: inConditional(start) }));
    // script and style content is text, not markup
    if (RAW_TEXT.has(name)) i = skipRawText(html, i, name);
  }
  return found;
}

/** Reads the attributes of a start tag from just after its name; returns the index just past its `>`. */
function readAttributes(html: string, from: number, onAttribute: (key: string, start: number) => void): number {
  let i = from;
  while (i < html.length && html[i] !== ">") {
    if (/[\s/]/.test(html[i]!)) {
      i++;
      continue;
    }
    const start = i;
    while (i < html.length && !/[\s/>=]/.test(html[i]!)) i++;
    onAttribute(html.slice(start, i).toLowerCase(), start);
    i = skipAttributeValue(html, i);
  }
  return i + 1;
}

/** From just after an attribute name: the index past its `= value`, or past the spaces after it when it has none. */
function skipAttributeValue(html: string, from: number): number {
  let i = skipSpaces(html, from);
  if (html[i] !== "=") return i;
  i = skipSpaces(html, i + 1);
  const q = html[i];
  if (q === '"' || q === "'") return until(html, i + 1, q);
  while (i < html.length && !/[\s>]/.test(html[i]!)) i++;
  return i;
}

function skipSpaces(s: string, from: number): number {
  let i = from;
  while (/\s/.test(s[i] ?? "")) i++;
  return i;
}

/** The index of the end tag of the raw text element `name` from `from`, or the end of the HTML. */
function skipRawText(html: string, from: number, name: string): number {
  const close = html.toLowerCase().indexOf(`</${name}`, from);
  return close === -1 ? html.length : close;
}

/** Index just past the `)` matching the `(` at `i`, skipping quoted strings; -1 when unbalanced. */
export function balancedParen(src: string, i: number): number {
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "'" || c === '"') k = closingQuote(src, k);
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return k + 1;
  }
  return -1;
}

/** Index of the quote that closes the string opening at `i`, skipping escaped characters; past the end if none. */
function closingQuote(src: string, i: number): number {
  let k = i + 1;
  while (k < src.length && src[k] !== src[i]) k += src[k] === "\\" ? 2 : 1;
  return k;
}

/** Index just past the next `close` from `from`, or the end of the source when there is none. */
export function until(src: string, from: number, close: string): number {
  const k = src.indexOf(close, from);
  return k === -1 ? src.length : k + close.length;
}
