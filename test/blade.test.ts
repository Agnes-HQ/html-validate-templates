import { describe, expect, test } from "vitest";
import plugin from "../packages/blade/src/index";
import { asPlainHtml, lint, rules, tpl } from "./helpers";

const blade = (src: string, extra?: Record<string, unknown>) => lint(plugin, "resources/views/page.blade.php", src, extra);

describe("html-validate-blade", () => {
  test("a clean template has no findings", async () => {
    const src = tpl`
      @extends('layouts.app')
      @section('content')
        {{-- a comment with <unclosed> markup --}}
        <h1 class="{{ $big ? 'text-xl' : 'text-lg' }}">{{ $title }}</h1>
        @if ($user)
          <div class="card">
        @else
          <div class="card empty">
        @endif
          @foreach ($items as $item)
            <a href="{{ route('items.show', $item) }}" @class(['active' => $item->active])>{!! $item->name !!}</a>
          @endforeach
          </div>
        <form method="post" action="/save">
          @csrf
          <label for="name">Name</label>
          <input id="name" name="name" type="{{ $type }}" value="{{ old('name') }}" @disabled($locked)>
          <button type="submit">Save</button>
        </form>
      @endsection
    `;
    expect(await blade(src)).toEqual([]);
  });

  test("real mistakes are reported where they are", async () => {
    const src = tpl`
      <p class="intro">
        {{ $text }}
        <div>block in a paragraph</div>
      </p>
    `;
    const messages = await blade(src);
    expect(rules(messages)).toContain("close-order");
    expect(messages).toEqual(await lint(plugin, "page.html", asPlainHtml(src)));
  });

  test("components self-close and may have dots and colons in their names", async () => {
    const src = tpl`
      <x-avatar :user="$user" />
      <x-buttons.primary type="submit">Save</x-buttons.primary>
      <x-slot:title>Hello</x-slot:title>
      <livewire:chat.box :room="$room" />
    `;
    expect(await blade(src)).toEqual([]);
  });

  test("Alpine and Vue attributes, email addresses and escaped echoes are left alone", async () => {
    const src = tpl`
      <button type="button" @click="open = !open" @keydown.escape="open = false">Menu</button>
      <p>Mail support@example.com or follow @agnes</p>
      <p>@{{ vueValue }} and @@notADirective</p>
    `;
    expect(await blade(src)).toEqual([]);
  });

  test("@php blocks are skipped and @verbatim content is linted as HTML", async () => {
    const src = tpl`
      @php
        $x = '<div>';
      @endphp
      @verbatim
        <p><div>{{ vue }}</div></p>
      @endverbatim
    `;
    expect(rules(await blade(src))).toContain("close-order");
  });

  test("ids in blocks that exclude each other are not duplicates; ids next to each other are", async () => {
    const exclusive = tpl`
      @auth
        <div id="content">signed in</div>
      @endauth
      @guest
        <div id="content">signed out</div>
      @endguest
    `;
    expect(await blade(exclusive)).toEqual([]);
    expect(rules(await blade('<p id="a"></p><p id="a"></p>'))).toEqual(["no-dup-id"]);
  });

  test("forelse keeps its loop branch and switch its first case", async () => {
    const src = tpl`
      <ul>
      @forelse ($items as $item)
        <li>{{ $item }}</li>
      @empty
        <p>No items</p>
      @endforelse
      </ul>
      @switch($kind)
        @case('a')
          <section>
          @break
        @case('b')
          <article>
          @break
      @endswitch
      </section>
    `;
    expect(await blade(src)).toEqual([]);
  });

  test("XML templates (feeds, sitemaps) are skipped", async () => {
    const src = tpl`
      <?= '<?xml version="1.0" encoding="UTF-8"?>' ?>
      <feed xmlns="http://www.w3.org/2005/Atom"><id>{{ $url }}</id><link href="{{ $url }}"/></feed>
    `;
    expect(await blade(src)).toEqual([]);
  });
});
