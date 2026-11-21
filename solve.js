// A faster drop-in for make.fun's csv-reader 1.0.0.
//
// run(input) returns exactly what csv-reader 1.0.0's readCsv returns for
// the same input {text, header}: {columns, rows, errors}. The reading
// policy is csv-reader's own, followed character for character:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is
//     no record;
//   - outside a quoted field a CR not followed by LF is dropped (error
//     stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote, and each CRLF or lone CR inside
//     it read as LF; what follows its closing quote, up to the next comma
//     or line break, is appended as it stands (quote_junk, when the
//     field ends); a quote that never closes is a literal character, and
//     the text after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields
//     stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows
//     holds the records after it (every record when header is false),
//     each padded with "" (short_row, with fields: its field count) or
//     cut (long_row, with extra: the cut fields) to the first record's
//     width;
//   - each error is {code, line, row}, in the order met, a record's
//     short_row or long_row when it ends: line the 1-based line its
//     record starts on, counting every LF, CRLF and lone CR inside
//     quotes, and row its record's index in rows, null for the header.
//
// Where csv-reader reads one character at a time and builds each field
// a character at a time, this reader jumps from delimiter to delimiter
// with a regular expression and takes each field's text with one slice,
// so a clean field costs one match and one slice instead of one loop
// iteration per character. The field readers return only the field's
// string and leave how it ended in `ended`, so no object is built per
// field. Nothing else changes: the same records, the same fields, the
// same errors, in the same order.

const COMMA = 0; // how a field ended: at a comma (the record goes on)
const LINE_BREAK = 1; // at a line break (the record ends)
const END = 2; // at the end of the text (the record ends)

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows
  // it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // How the field just read ended (COMMA, LINE_BREAK or END).
  let ended = END;

  // The next delimiter of an unquoted field (comma, CR or LF) and of a
  // quoted field (quote, CR or LF). Fresh per call, so lastIndex is
  // always set before each use and never shared between calls.
  const UNQ = /[,\r\n]/g;
  const QUO = /["\r\n]/g;

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the
  // field; `ended` says how it ended.
  function readUnquoted(value) {
    let parts = null; // the field's pieces, once a stray CR splits it
    let start = pos;
    for (;;) {
      UNQ.lastIndex = pos;
      const m = UNQ.exec(text);
      if (m === null) {
        if (parts) {
          parts.push(text.slice(start));
          value = parts.join('');
        } else {
          value += text.slice(start);
        }
        pos = n;
        ended = END;
        return value;
      }
      const idx = m.index;
      const ch = m[0];
      if (ch === ',') {
        if (parts) {
          parts.push(text.slice(start, idx));
          value = parts.join('');
        } else {
          value += text.slice(start, idx);
        }
        pos = idx + 1;
        ended = COMMA;
        return value;
      }
      if (ch === '\n') {
        if (parts) {
          parts.push(text.slice(start, idx));
          value = parts.join('');
        } else {
          value += text.slice(start, idx);
        }
        pos = idx + 1;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      // A CR: a line break when followed by LF, else a stray CR that is
      // dropped and the field goes on.
      if (text.charCodeAt(idx + 1) === 10) {
        if (parts) {
          parts.push(text.slice(start, idx));
          value = parts.join('');
        } else {
          value += text.slice(start, idx);
        }
        pos = idx + 2;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (parts === null) parts = [value];
      parts.push(text.slice(start, idx));
      pos = idx + 1;
      start = pos;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns the
  // field; `ended` says how it ended.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    let parts = null; // the field's pieces, once a break or quote splits it
    let start = pos;
    for (;;) {
      QUO.lastIndex = pos;
      const m = QUO.exec(text);
      if (m === null) {
        // The quote never closes: it is a literal character, and the
        // text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      const idx = m.index;
      const ch = m[0];
      if (ch === '"') {
        if (parts === null) parts = [value];
        parts.push(text.slice(start, idx));
        if (text.charCodeAt(idx + 1) === 34) {
          parts.push('"');
          pos = idx + 2;
          start = pos;
          continue;
        }
        value = parts.join('');
        pos = idx + 1;
        closed = true;
        break;
      }
      // A CR or LF inside quotes is one LF in the value.
      if (parts === null) parts = [value];
      parts.push(text.slice(start, idx));
      parts.push('\n');
      line += 1;
      pos = ch === '\r' && text.charCodeAt(idx + 1) === 10 ? idx + 2 : idx + 1;
      start = pos;
    }
    if (!closed) {
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    if (pos >= n) {
      ended = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      ended = COMMA;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      ended = LINE_BREAK;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      ended = LINE_BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break. Junk is when the unquoted part added
    // anything at all.
    const junk = readUnquoted(value);
    if (junk.length > value.length) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let value;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      value = quoted ? readQuoted() : readUnquoted('');
      fields.push(value);
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
