// A small CSV reader for admin uploads (RFC 4180, as Excel, Google Sheets and Numbers save it):
// - values separated by commas, or by semicolons or tabs (Excel in some regions saves those);
// - a value in double quotes may hold separators and line breaks, and "" for a quote;
// - a quote anywhere else is an ordinary character, so 12" Banner reads as written;
// - LF or CRLF line ends, an optional UTF-8 byte order mark, UTF-16 when the file says so.

const SEPARATORS = [",", ";", "\t"];

// Text of an uploaded file. Excel's "Unicode text" is UTF-16 with a byte order mark.
const decode = (buffer) => {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  const text = buffer.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
};

// The separator the first line uses most, outside quotes. A one-column file reads as commas.
const detectSeparator = (text) => {
  const counts = new Map(SEPARATORS.map((s) => [s, 0]));
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && counts.has(ch)) counts.set(ch, counts.get(ch) + 1);
  }

  let best = ",";
  let bestCount = 0;
  for (const [separator, count] of counts) {
    if (count > bestCount) {
      best = separator;
      bestCount = count;
    }
  }
  return best;
};

// One value for a CSV line: quoted when it holds a separator, a quote or a line break.
const csvValue = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",;\t\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Rows of values as CSV text, CRLF line ends as Excel writes them.
const toCsv = (rows) => rows.map((row) => row.map(csvValue).join(",")).join("\r\n") + "\r\n";

// Rows of strings. Throws an Error whose message can be shown as it is.
const parseCsv = (text, separator = detectSeparator(text)) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let atFieldStart = true;

  const endField = () => {
    row.push(field);
    field = "";
    atFieldStart = true;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (ch === separator) {
      endField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endField();
      rows.push(row);
      row = [];
    } else {
      field += ch;
      atFieldStart = false;
    }
  }

  if (inQuotes) {
    throw new Error(
      `A value that starts with a quote (") is never closed, so the file can't be read. Check row ${rows.length + 1}.`,
    );
  }

  if (field !== "" || row.length) {
    endField();
    rows.push(row);
  }

  return rows;
};

module.exports = { decode, detectSeparator, parseCsv, toCsv };
