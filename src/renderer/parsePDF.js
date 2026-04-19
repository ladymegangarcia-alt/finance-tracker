import * as pdfjs from "pdfjs-dist";
import { categorize } from "./categories.js";

// Vite bundles the worker as a separate asset and provides its URL
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// ── Patterns ─────────────────────────────────────────────────────────
// Date at start of line: MM/DD, M/D, MM/DD/YY, MM/DD/YYYY
const DATE_START_RE = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+/;

// Amount at end of line: optional leading -, optional $, digits/commas, dot, 2 digits, optional trailing -
const AMOUNT_END_RE = /\s+(-?\$?[\d,]+\.\d{2}-?)$/;

// ── Helpers ───────────────────────────────────────────────────────────
function parseAmount(str) {
  const s = str.trim();
  const trailingMinus = s.endsWith("-");
  const leadingMinus  = s.startsWith("-");
  const num = parseFloat(s.replace(/[$,]/g, "").replace(/-/g, ""));
  if (isNaN(num)) return null;
  return trailingMinus || leadingMinus ? -num : num;
}

function parseDate(str, statementYear) {
  const parts = str.split("/");
  if (parts.length < 2) return null;
  const month = parseInt(parts[0]) - 1;
  const day   = parseInt(parts[1]);
  let year = statementYear ?? new Date().getFullYear();
  if (parts[2]) {
    year = parseInt(parts[2]);
    if (year < 100) year += 2000;
  }
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

// ── Text extraction ───────────────────────────────────────────────────
async function extractItems(arrayBuffer) {
  const pdf  = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (item.str && item.str.trim()) {
        items.push({
          text: item.str,
          x:    item.transform[4],
          y:    item.transform[5],
          page: p,
        });
      }
    }
  }
  return items;
}

// Group scattered text items into logical lines by Y proximity
function groupIntoLines(items) {
  if (!items.length) return [];

  // Sort: page asc → Y desc (PDF Y is bottom-up) → X asc
  items.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
    return a.x - b.x;
  });

  const lines = [];
  let current = [items[0]];

  for (let i = 1; i < items.length; i++) {
    const item  = items[i];
    const first = current[0];
    if (item.page === first.page && Math.abs(item.y - first.y) <= 3) {
      current.push(item);
    } else {
      lines.push(current);
      current = [item];
    }
  }
  lines.push(current);

  return lines.map((line) => ({
    text: line
      .map((i) => i.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  }));
}

// ── Transaction detection ─────────────────────────────────────────────
function parseTransactionLine(text, statementYear) {
  const dateMatch = text.match(DATE_START_RE);
  if (!dateMatch) return null;

  const rest        = text.slice(dateMatch[0].length);
  const amountMatch = rest.match(AMOUNT_END_RE);
  if (!amountMatch) return null;

  const dateStr    = dateMatch[1];
  const amountStr  = amountMatch[1];
  const description = rest.slice(0, rest.length - amountMatch[0].length).trim();

  if (!description || description.length < 2) return null;

  const date   = parseDate(dateStr, statementYear);
  const amount = parseAmount(amountStr);
  if (!date || amount === null) return null;

  // Credit card charges are positive in the statement (debits to you)
  // Payments/credits are negative
  const type = amount >= 0 ? "debit" : "credit";

  return {
    dateStr,
    date,
    description,
    amount: Math.abs(amount),
    type,
    category: categorize(description),
  };
}

// Guess the statement year from the most common year found in dates
function guessStatementYear(lines) {
  const years = {};
  for (const { text } of lines) {
    const m = text.match(/\b(20\d{2})\b/);
    if (m) years[m[1]] = (years[m[1]] || 0) + 1;
  }
  const sorted = Object.entries(years).sort((a, b) => b[1] - a[1]);
  return sorted.length ? parseInt(sorted[0][0]) : new Date().getFullYear();
}

// ── Public API ────────────────────────────────────────────────────────
export async function parsePDFStatement(arrayBuffer) {
  const items = await extractItems(arrayBuffer);
  const lines = groupIntoLines(items);
  const year  = guessStatementYear(lines);

  const transactions = [];
  for (const { text } of lines) {
    const txn = parseTransactionLine(text, year);
    if (txn) transactions.push(txn);
  }

  if (!transactions.length) {
    throw new Error(
      "No transactions found in this PDF. The file may be a scanned image, " +
      "or the format isn't supported. Try downloading a CSV export from your bank instead."
    );
  }

  return transactions;
}
