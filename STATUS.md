# Current Status

Compact current snapshot for the main browser sweep and benchmark numbers.

Use this file for "where are we right now?".
Use `RESEARCH.md` for why the numbers changed and what was tried.
Use `corpora/STATUS.md` for the long-form corpus canaries.

## Browser Accuracy

Official browser regression sweep:

| Browser | Status |
|---|---|
| Chrome | `7680/7680` |
| Safari | `7680/7680` |
| Firefox | `7680/7680` |

Notes:
- This is the 4-font × 8-size × 8-width × 30-text browser corpus.
- The public accuracy page is effectively a regression gate now, not the main steering metric.

## Benchmark Snapshot

Latest local `bun run benchmark-check` snapshot on this machine:

### Top-level batch

| Metric | Value |
|---|---|
| `prepare()` | `17.50ms` |
| `layout()` | `0.10ms` |
| DOM batch | `3.90ms` |
| DOM interleaved | `42.55ms` |

### Long-form corpus stress

| Corpus | analyze() | measure() | prepare() | layout() | segs (analyze→prepared) | lines @ 300px |
|---|---:|---:|---:|---:|---:|---:|
| Japanese prose | `3.50ms` | `9.60ms` | `13.00ms` | `0.04ms` | `3,606→5,052` | `380` |
| Korean prose | `2.10ms` | `9.90ms` | `12.00ms` | `0.05ms` | `5,282→9,691` | `428` |
| Thai prose | `7.50ms` | `8.30ms` | `17.30ms` | `0.06ms` | `10,281→10,281` | `1,024` |
| Myanmar prose | `0.60ms` | `1.40ms` | `2.00ms` | `<0.01ms` | `797→797` | `81` |
| Myanmar prose (story 2) | `0.40ms` | `1.10ms` | `1.60ms` | `<0.01ms` | `498→498` | `54` |
| Khmer prose | `5.10ms` | `5.70ms` | `11.20ms` | `0.06ms` | `11,109→11,109` | `591` |
| Hindi prose | `3.80ms` | `10.10ms` | `13.80ms` | `0.05ms` | `9,958→9,958` | `653` |
| Arabic prose | `17.50ms` | `62.70ms` | `99.00ms` | `0.19ms` | `37,603→37,603` | `2,643` |

Notes:
- These are current Chrome-side numbers from `bun run benchmark-check`, not the older cross-browser raw snapshot in `pages/benchmark-results.txt`.
- `layout()` remains the resize hot path; `prepare()` is where script-specific cost still lives.
- Long-form corpus rows now split `prepare()` into analysis and measurement phases, which makes it easier to tell whether a script is expensive because of segmentation/glue work or because of raw width measurement volume.

## Pointers

- Historical cross-browser raw benchmark snapshot: `pages/benchmark-results.txt`
- Long-form corpus canary status: `corpora/STATUS.md`
- Full exploration log: `RESEARCH.md`
