# Read broken CSV files faster

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/zicloed/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/zicloed/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0. `solve.js` answers
exactly as csv-reader does on every input — the same columns, rows and
errors, in the same order — while reading the text with delimiter jumps
and one slice per field instead of one loop iteration per character.

## How it works

csv-reader reads one character at a time and builds each field a
character at a time. This reader instead jumps from delimiter to
delimiter with a regular expression (`/[,\r\n]/` outside quotes,
`/["\r\n]/` inside them) and takes each field's text with one `slice`,
so a clean field costs one match and one slice. The reading policy is
csv-reader's own, followed exactly:

- a U+FEFF at the very start is dropped;
- a record ends at LF or CRLF, and an empty line is no record;
- outside quotes a CR not followed by LF is dropped (`stray_cr`);
- a quoted field runs to the next undoubled quote, `""` inside it is one
  quote, and each CRLF or lone CR inside it reads as LF; text after the
  closing quote, up to the next comma or line break, is appended as it
  stands (`quote_junk`); a quote that never closes is a literal
  character and the text after it is read again as unquoted
  (`unterminated_quote`);
- a quote inside an unquoted field is literal; fields stay strings,
  never trimmed or converted;
- rows are padded (`short_row`) or cut (`long_row`) to the first
  record's width, and every error carries `{code, line, row}`.

## Files

- `solve.js` — the fast reader: `run(input)` returns
  `{columns, rows, errors}` for one case's `{text, header}`.
- `main.ts` — the program the harness runs: reads every case from
  `/input/cases.json`, answers each with `run`, writes
  `/output/answers.json`. Turns V8's incremental marking off, as the
  house baseline does.
- `package.json` — `{"type": "module"}`, so `solve.js` loads as an ES
  module.

## Entry

Built for the make.fun bounty
[Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121).
