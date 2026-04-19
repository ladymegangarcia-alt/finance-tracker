import Papa from "papaparse";
import { categorize } from "./categories.js";

// Extract a likely employer name from a payroll description.
// Strips the word "payroll", digits, and punctuation; takes up to 3 meaningful words.
function parsePayrollSource(description) {
  const cleaned = description
    .replace(/payroll/gi, "")
    .replace(/\d+/g, "")
    .replace(/[^a-zA-Z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .join(" ")
    .trim();
  return cleaned || null;
}

// Tries to detect which column is the date, description, and amount
// by inspecting header names and sample values.

function detectColumns(headers) {
  const h = headers.map((s) => s.toLowerCase().trim());

  const dateCol = h.findIndex((c) =>
    /date|posted|trans|time/.test(c)
  );
  const descCol = h.findIndex((c) =>
    /desc|merchant|narr|memo|payee|detail|name|ref/.test(c)
  );

  // Amount: prefer a single "amount" col; otherwise debit/credit pair
  const amtCol  = h.findIndex((c) => /^amount$|^amt$/.test(c));
  const debitCol  = h.findIndex((c) => /debit|withdrawal|charge/.test(c));
  const creditCol = h.findIndex((c) => /credit|deposit/.test(c));

  return { dateCol, descCol, amtCol, debitCol, creditCol };
}

function parseAmount(val) {
  if (val === undefined || val === null || val === "") return null;
  // Remove currency symbols, spaces, parentheses (parentheses = negative)
  const negative = /^\(.*\)$/.test(val.trim());
  const num = parseFloat(val.replace(/[^0-9.\-]/g, ""));
  if (isNaN(num)) return null;
  return negative ? -Math.abs(num) : num;
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  if (!isNaN(d)) return d;
  return null;
}

export function parseStatementCSV(text) {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    trimHeaders: true,
  });

  if (!result.data || result.data.length === 0) {
    throw new Error("No data found in CSV.");
  }

  const headers = result.meta.fields || [];
  const { dateCol, descCol, amtCol, debitCol, creditCol } = detectColumns(headers);

  const transactions = [];

  for (const row of result.data) {
    const vals = headers.map((h) => row[h]);

    const rawDesc = descCol >= 0 ? vals[descCol] : Object.values(row).join(" ");
    const rawDate = dateCol >= 0 ? vals[dateCol] : null;

    let amount = null;
    if (amtCol >= 0) {
      amount = parseAmount(vals[amtCol]);
    } else if (debitCol >= 0 || creditCol >= 0) {
      const debit  = debitCol  >= 0 ? parseAmount(vals[debitCol])  : null;
      const credit = creditCol >= 0 ? parseAmount(vals[creditCol]) : null;
      // Debits are expenses (positive), credits are income (negative expense)
      if (debit  != null && debit  !== 0) amount = Math.abs(debit);
      else if (credit != null && credit !== 0) amount = -Math.abs(credit);
    }

    if (amount === null) continue; // skip rows with no parseable amount

    const date = parseDate(rawDate);
    const description = (rawDesc || "Unknown").trim();

    const type = amount >= 0 ? "credit" : "debit"; // positive = credit (money in), negative = debit (money out)
    const category = categorize(description);
    const subcategory = category === "Payroll" ? parsePayrollSource(description) : undefined;
    transactions.push({
      id: transactions.length,
      date,
      dateStr: rawDate || "",
      description,
      amount: Math.abs(amount),   // always positive; type determines direction
      type,
      category,
      ...(subcategory != null && { subcategory }),
      rawRow: row,
    });
  }

  if (transactions.length === 0) {
    throw new Error("Could not parse any transactions. Check that your CSV has date, description, and amount columns.");
  }

  return transactions;
}
