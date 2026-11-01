import { balancedParen, until, type Syntax } from "./mask";

/** Blocks with branches; everything after the first branch is blanked. */
const BRANCHED = new Set([
  "if", "unless", "isset", "auth", "guest", "can", "cannot", "canany", "env", "production", "hassection", "sectionmissing",
  "forelse", "switch", "session", "hasrole", "role", "hasanyrole",
]);
const ELSE = new Set(["else", "elseif", "elsecan", "elsecannot", "elsecanany", "elseauth", "elseguest", "elseenv", "elsehasrole", "elserole"]);

/** Directives that mean something without parentheses; any `@name(…)` is a directive too. */
const BARE = new Set([
  ...BRANCHED, ...ELSE, "php", "verbatim", "empty", "default", "break", "continue", "csrf", "show", "stop", "append", "overwrite",
  "once", "parent", "yield", "method", "dump", "dd", "nonce", "csp", "honeypot", "turnstile", "vite", "vitereactrefresh",
  "livewirestyles", "livewirescripts", "livewirescriptconfig", "fluxstyles", "fluxscripts", "inertia", "inertiahead", "routes",
  "endif", "endunless", "endisset", "endauth", "endguest", "endcan", "endcannot", "endcanany", "endenv", "endproduction",
  "endforelse", "endswitch", "endsession", "endhasrole", "endrole", "endhasanyrole", "endempty", "endforeach", "endfor", "endwhile",
  "endsection", "endpush", "endprepend", "endpushonce", "endprependonce", "endonce", "endcomponent", "endcomponentfirst", "endslot",
  "endphp", "endverbatim", "endfragment", "endteleport", "endpersist", "endassets", "endscript", "enderror", "endlang", "endprops",
  "endaware", "endsetup", "endcache", "endfeature",
]);

/** Laravel Blade: `{{ }}`, `{!! !!}`, `{{-- --}}`, `@directives`, `<?php ?>`, and `<x-…>` components. */
export const blade: Syntax = {
  // `<x-buttons.primary />` becomes `<x:buttons-primary />`: a namespaced name reads as XML (self-closing allowed, no
  // HTML content model), and html-validate's lexer rejects the dot
  componentChar(tagName, ch) {
    if (ch === "-" && (tagName === "x" || tagName === "/x")) return ":";
    if (ch === "." && /^\/?(x|livewire|flux)[:-]/.test(tagName)) return "-";
    return ch;
  },
  match(src, i, state) {
    const c = src[i];
    if (c === "{") {
      if (src.startsWith("{{--", i)) return { end: until(src, i + 4, "--}}"), kind: "comment" };
      if (src.startsWith("{!!", i)) return { end: until(src, i + 3, "!!}"), kind: "output" };
      if (src.startsWith("{{", i)) return { end: until(src, i + 2, "}}"), kind: "output" };
      return null;
    }
    if (c === "<" && src.startsWith("<?php", i)) return { end: until(src, i + 5, "?>"), kind: "control" };
    if (c === "<" && src.startsWith("<?=", i)) return { end: until(src, i + 3, "?>"), kind: "output" };
    if (c !== "@") return null;
    if (i > 0 && /\w/.test(src[i - 1]!)) return null; // name@example.com: Blade only sees a directive after a non-word
    if (src.startsWith("@{{", i)) return { end: until(src, i + 3, "}}"), kind: "output" }; // printed as {{ }} for Vue or Alpine
    if (src[i + 1] === "@") return { end: i + 2, kind: "output" }; // @@foo prints @foo
    const m = /^@([A-Za-z_]\w*(?:::\w+)?)/.exec(src.slice(i, i + 64));
    if (!m) return null;
    const name = m[1]!.toLowerCase();
    let end = i + m[0].length;
    let k = end;
    while (src[k] === " " || src[k] === "\t") k++;
    const hasArgs = src[k] === "(";
    // in a tag, `@click="…"` and `@click.prevent` are Alpine or Vue attributes, not Blade
    if ((state === "tag" || state === "tagName") && !hasArgs && /^[=.:]/.test(src.slice(end).trimStart())) return null;
    // an unknown word without arguments is text (`@username`), as Blade leaves it
    if (!hasArgs && !BARE.has(name)) return null;
    if (hasArgs) {
      const close = balancedParen(src, k);
      if (close !== -1) end = close;
    }
    if (name === "php" && !hasArgs) return { end: until(src, end, "@endphp"), kind: "control" };
    if (name === "verbatim") {
      const start = src.indexOf("@endverbatim", end);
      if (start !== -1) return { end, kind: "control", verbatimEnd: { start, end: start + "@endverbatim".length } };
    }
    // `@empty($x)` opens a conditional; a bare `@empty` is the else branch of `@forelse`
    return { end, kind: "control", name: name === "empty" && hasArgs ? "emptycheck" : name };
  },
  opens: (name) => BRANCHED.has(name) || name === "emptycheck",
  isBranch(name, open) {
    if (open === "forelse") return name === "empty";
    if (open === "switch") return name === "case" || name === "default";
    return ELSE.has(name);
  },
  startsFirstBranch: (name, open) => open === "switch" && name === "case",
  closes: (name, open) => name === (open === "emptycheck" ? "endempty" : `end${open}`),
};
