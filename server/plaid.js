import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import db from "./db.js";
import { Router } from "express";

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  })
);

const router = Router();

// POST /api/plaid/link-token
router.post("/link-token", async (_req, res) => {
  try {
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: "local-user" },
      client_name: "StewardSoft Finance Tracker",
      products: [Products.Transactions],
      language: "en",
      country_codes: [CountryCode.Us],
    });
    res.json({ link_token: data.link_token });
  } catch (err) {
    const msg = err.response?.data?.error_message || err.message;
    console.error("[plaid] link-token:", msg);
    res.status(500).json({ error: msg });
  }
});

// POST /api/plaid/exchange-token
router.post("/exchange-token", async (req, res) => {
  const { public_token } = req.body;
  try {
    const { data: ex } = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = ex;

    // Get institution name
    let institution_name = "Connected Bank";
    try {
      const { data: itemData } = await plaidClient.itemGet({ access_token });
      const inst_id = itemData.item.institution_id;
      if (inst_id) {
        const { data: instData } = await plaidClient.institutionsGetById({
          institution_id: inst_id,
          country_codes: [CountryCode.Us],
        });
        institution_name = instData.institution.name;
      }
    } catch {}

    // Persist item (access_token stored server-side only, never returned to frontend)
    db.prepare(
      `INSERT OR REPLACE INTO plaid_items (id, access_token, institution_name)
       VALUES (?, ?, ?)`
    ).run(item_id, access_token, institution_name);

    db.prepare(
      `INSERT OR IGNORE INTO plaid_sync_cursors (item_id, cursor) VALUES (?, '')`
    ).run(item_id);

    // Get and persist accounts
    const { data: acctData } = await plaidClient.accountsGet({ access_token });
    const insertAcct = db.prepare(
      `INSERT OR REPLACE INTO plaid_accounts
         (plaid_account_id, item_id, name, official_name, type, subtype, mask)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const a of acctData.accounts) {
      insertAcct.run(a.account_id, item_id, a.name, a.official_name, a.type, a.subtype, a.mask);
    }

    // Return accounts to frontend — access_token is never included
    res.json({
      item_id,
      institution_name,
      accounts: acctData.accounts.map((a) => ({
        plaid_account_id: a.account_id,
        name: a.name,
        official_name: a.official_name,
        type: a.type,       // "depository" | "credit" | "loan" | "investment"
        subtype: a.subtype, // "checking" | "savings" | "credit card" | etc.
        mask: a.mask,
        balance_current: a.balances?.current ?? null,
      })),
    });
  } catch (err) {
    const msg = err.response?.data?.error_message || err.message;
    console.error("[plaid] exchange-token:", msg);
    res.status(500).json({ error: msg });
  }
});

// POST /api/plaid/link-accounts — called after user confirms the mapping modal
router.post("/link-accounts", (req, res) => {
  const { mappings } = req.body; // [{ plaid_account_id, ft_account_id }]
  const update = db.prepare(
    `UPDATE plaid_accounts SET ft_account_id = ? WHERE plaid_account_id = ?`
  );
  for (const m of mappings) {
    update.run(m.ft_account_id, m.plaid_account_id);
  }
  res.json({ ok: true });
});

// ── Step 3: Transaction Sync ────────────────────────────────────────

const PLAID_CAT_MAP = {
  FOOD_AND_DRINK:            "Dining",
  TRANSPORTATION:            "Transportation",
  TRAVEL:                    "Travel",
  GENERAL_MERCHANDISE:       "Shopping",
  PERSONAL_CARE:             "Personal Care",
  ENTERTAINMENT:             "Entertainment",
  MEDICAL:                   "Healthcare",
  RENT_AND_UTILITIES:        "Utilities",
  HOME_IMPROVEMENT:          "Home",
  GENERAL_SERVICES:          "Services",
  GOVERNMENT_AND_NON_PROFIT: "Other",
  INCOME:                    "Income",
  TRANSFER_IN:               "Transfer",
  TRANSFER_OUT:              "Transfer",
  LOAN_PAYMENTS:             "Loan Payment",
  BANK_FEES:                 "Bank Fees",
};

function mapPlaidCategory(primary) {
  return PLAID_CAT_MAP[primary] ?? "Uncategorized";
}

// POST /api/plaid/sync — body: { ft_account_id? } (omit to sync all linked items)
router.post("/sync", async (req, res) => {
  const { ft_account_id } = req.body ?? {};
  try {
    let items;
    if (ft_account_id) {
      items = db.prepare(`
        SELECT DISTINCT i.id, i.access_token
        FROM plaid_items i
        JOIN plaid_accounts a ON a.item_id = i.id
        WHERE a.ft_account_id = ?
      `).all(ft_account_id);
    } else {
      items = db.prepare(`SELECT id, access_token FROM plaid_items`).all();
    }

    if (!items.length) {
      return res.json({ added: 0, modified: 0, removed: 0, accounts_synced: 0 });
    }

    let totalAdded = 0, totalModified = 0, totalRemoved = 0;

    for (const item of items) {
      const { access_token, id: item_id } = item;
      const cursorRow = db.prepare(`SELECT cursor FROM plaid_sync_cursors WHERE item_id = ?`).get(item_id);
      let cursor = cursorRow?.cursor ?? "";

      const added = [], modified = [], removed = [];
      let has_more = true;

      while (has_more) {
        const { data } = await plaidClient.transactionsSync({
          access_token,
          ...(cursor ? { cursor } : {}),
          count: 500,
        });
        added.push(...data.added);
        modified.push(...data.modified);
        removed.push(...data.removed);
        cursor = data.next_cursor;
        has_more = data.has_more;
      }

      db.transaction(() => {
        const accts = db.prepare(
          `SELECT plaid_account_id, ft_account_id FROM plaid_accounts WHERE item_id = ?`
        ).all(item_id);
        const acctMap = Object.fromEntries(accts.map((a) => [a.plaid_account_id, a.ft_account_id]));

        const upsert = db.prepare(`
          INSERT OR REPLACE INTO plaid_transactions
            (plaid_id, plaid_account_id, ft_account_id, date, description, amount, type, category, pending)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of [...added, ...modified]) {
          upsert.run(
            t.transaction_id,
            t.account_id,
            acctMap[t.account_id] ?? null,
            t.date,
            t.merchant_name || t.name,
            Math.abs(t.amount),
            t.amount >= 0 ? "debit" : "credit", // Plaid: positive = money out
            mapPlaidCategory(t.personal_finance_category?.primary ?? ""),
            t.pending ? 1 : 0
          );
        }
        const del = db.prepare(`DELETE FROM plaid_transactions WHERE plaid_id = ?`);
        for (const r of removed) del.run(r.transaction_id);

        db.prepare(
          `UPDATE plaid_sync_cursors SET cursor = ?, last_synced_at = unixepoch() WHERE item_id = ?`
        ).run(cursor, item_id);
      })();

      totalAdded    += added.length;
      totalModified += modified.length;
      totalRemoved  += removed.length;
    }

    res.json({ added: totalAdded, modified: totalModified, removed: totalRemoved, accounts_synced: items.length });
  } catch (err) {
    const msg = err.response?.data?.error_message || err.message;
    console.error("[plaid] sync:", msg);
    res.status(500).json({ error: msg });
  }
});

// GET /api/plaid/transactions?ft_account_id=...
router.get("/transactions", (req, res) => {
  const { ft_account_id } = req.query;
  try {
    const base = `
      SELECT t.*, o.category AS ov_category, o.subcategory AS ov_subcategory, o.reconciled AS ov_reconciled
      FROM plaid_transactions t
      LEFT JOIN plaid_transaction_overrides o ON o.plaid_id = t.plaid_id
    `;
    const rows = ft_account_id
      ? db.prepare(base + `WHERE t.ft_account_id = ? ORDER BY t.date DESC, t.synced_at DESC`).all(ft_account_id)
      : db.prepare(base + `ORDER BY t.date DESC, t.synced_at DESC`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/plaid/transaction/:plaid_id/override
router.put("/transaction/:plaid_id/override", (req, res) => {
  const { plaid_id } = req.params;
  const { category, subcategory, reconciled } = req.body ?? {};
  try {
    db.prepare(`
      INSERT INTO plaid_transaction_overrides (plaid_id, category, subcategory, reconciled)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(plaid_id) DO UPDATE SET
        category    = excluded.category,
        subcategory = excluded.subcategory,
        reconciled  = excluded.reconciled,
        updated_at  = unixepoch()
    `).run(plaid_id, category ?? null, subcategory ?? null, reconciled ? 1 : 0);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
