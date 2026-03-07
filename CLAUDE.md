## Text Metrics

Canvas-first text measurement using canvas `measureText()` + `Intl.Segmenter`. Two-phase: `prepare()` once per text, `layout()` is pure arithmetic on resize. ~0.1ms for 500 comments. Full i18n.

### Commands

- `bun start` — serve pages at http://localhost:3000
- `bun run check` — typecheck + lint
- `bun test` — headless tests (HarfBuzz, 100% accuracy)

### Files

- `src/layout.ts` — the library
- `src/measure-harfbuzz.ts` — HarfBuzz backend for headless tests
- `src/test-data.ts` — shared test texts/params for accuracy page, headless tests, and benchmark page
- `src/layout.test.ts` — bun tests: consistency + word-sum vs full-line accuracy
- `pages/accuracy.html + .ts` — sweep across fonts, sizes, widths, i18n texts (working)
- `pages/emoji-test.html` — canvas vs DOM emoji width comparison (working)
- `pages/demo.html + .ts` — visual side-by-side comparison (TODO)
- `pages/benchmark.html + .ts` — performance comparison (working)
- `pages/bubbles.html + .ts` — bubble shrinkwrap demo (working)

### Key decisions

- Canvas over DOM on the hot path: `layout()` does zero DOM reads. `prepare()` is canvas-based, plus one cached DOM calibration read per font when emoji correction is needed.
- Word width cache (`Map<font, Map<segment, width>>`): persists across prepare() calls. Common words shared across texts. No eviction — grows monotonically per font. Fine for fixed-font bounded feeds; may need LRU for long sessions with varied fonts. `clearCache()` exists for manual eviction.
- Intl.Segmenter over split(' '): handles CJK (per-character breaks), Thai, all scripts. Word and grapheme segmenters hoisted to module level (ICU construction is expensive). Captures default locale at load time.
- Punctuation merged into preceding word-like segments only (not spaces — that hides content from line-breaking).
- Non-word, non-space segments (emoji, parens) are break points, same as words.
- Emoji correction: auto-detected per font size, constant per emoji grapheme, font-independent.
- Kinsoku shori: CJK punctuation merged with adjacent graphemes so they can't be separated across line breaks.
- Bidi levels are computed during `prepare()` and stored on `PreparedText`; `layout()` currently returns only height/line count and does not consume them yet.
- CSS config: targets the default (`white-space: normal`, `word-break: normal`, `overflow-wrap: break-word`, `line-break: auto`). Other configurations (e.g. `break-all`, `keep-all`, `strict`, `loose`, `anywhere`) are untested and unsupported.
- lineHeight default (`round(fontSize * 1.2)`) doesn't match CSS `line-height: normal` for all fonts/browsers. Georgia is off by 1px on Chrome/Safari, Firefox returns fractional values. Always pass explicit lineHeight matching your CSS.
- system-ui font: Safari OK, Chrome sometimes mismatches (documented), Firefox is catastrophic (48px diff — canvas and DOM resolve to different fonts). Never use system-ui with this library. See [RESEARCH.md](RESEARCH.md#discovery-system-ui-font-resolution-mismatch).
- Thai: Intl.Segmenter and CSS use different internal dictionaries for word boundaries. Same text, different break points. Causes ~2 mismatches on Firefox. Unfixable from our side.
- HarfBuzz with explicit LTR for headless tests: guessSegmentProperties assigns wrong direction to isolated Arabic words.

### Accuracy

Chrome 99.96%, Safari 99.92%, Firefox 99.95%, HarfBuzz 100%. 4 fonts × 7680 tests. See [README.md](README.md).

### TODO

- Locale switch: segmenters are hoisted with the default locale. Expose a function to reinitialize them with a new locale without requiring a page refresh (e.g. `setLocale('ja')`). Should also clear the word cache since segmentation boundaries change per locale.
- Rich layout result: `layout()` currently returns only `{ lineCount, height }`. Return per-line break info (start/end index, width) so callers can render lines themselves (custom text layout, canvas rendering). Data is already computed internally, just discarded.
- Latin fast path: ASCII-only text (`/^[\x20-\x7E]+$/`) could skip CJK check, kinsoku, bidi, and emoji correction. Most comment feeds are >90% ASCII.
- Benchmark page: measurement methodology needs review (prepare cold vs warm, visible container sizing).
- Demo page: visual side-by-side comparison of library vs DOM rendering.
- Interleaving page: realistic DOM interleaving demo.
- Additional CSS config support: `break-all`, `keep-all`, `strict`, `loose`, `anywhere`, `pre-wrap`.

### Related

- `../text-layout/` — Sebastian Markbage's original prototype + our experimental variants.

See [RESEARCH.md](RESEARCH.md) for full exploration log. Based on Sebastian Markbage's [text-layout](https://github.com/chenglou/text-layout).
