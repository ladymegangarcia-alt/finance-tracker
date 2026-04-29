import { useMemo, useState } from "react";
import { CATEGORIES } from "../categories.js";

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Extract vendor key: first significant word (for grouping) + second if available (for display)
function vendorKey(description) {
  const words = description.toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter(w => w.length >= 3);
  return words[0] || "";
}

function vendorName(description) {
  const words = description.toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter(w => w.length >= 3);
  return words.slice(0, 2).join(" ") || "";
}

const TRANSFER_RE = /transfer\s+(debit\s+to|credit\s+from)|online\s+transfer\s+(to|from)|overdraft\s+protection\s+xfer\s+(to|from)|online\s+pym[ty]|pymt\b|pymnt\b|autopay|auto[-\s]pay|payment\s*-?\s*thank|thank\s+you\s+for\s+(your\s+)?payment|bill\s+pay(ment)?|mobile\s+pay(ment)?|web\s+pay(ment)?|ach\s+(pay(ment)?|pmt\b)|wire\s+transfer|e-?payment|zelle|direct\s+pay(ment)?|credit\s+card\s+pay(ment)?/i;

export default function Reconciled({ transactions, bulkUpdateTransactions, customCategories = [], addCustomCategory, accounts = [], deleteTransfer, linkTransfer, subcategories = {}, addSubcategory }) {
  const [search,    setSearch]    = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [sort, setSort] = useState({ col: "date", dir: "desc" });

  // Staged edits: { [transactionId]: { category?, type?, subcategory?, reconciled? } }
  const [pendingEdits, setPendingEdits] = useState({});
  const [saved, setSaved] = useState(false);

  // New category modal
  const [modal, setModal] = useState(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState("expense");

  const allCategories = useMemo(
    () => [...CATEGORIES, ...customCategories.map((c) => c.name)].sort((a, b) => a.localeCompare(b)),
    [customCategories]
  );

  // Merge stored subcategories with any already on transactions
  const subcatsByCategory = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      if (!t.subcategory) continue;
      if (!map[t.category]) map[t.category] = new Set();
      map[t.category].add(t.subcategory);
    }
    for (const [cat, names] of Object.entries(subcategories)) {
      if (!map[cat]) map[cat] = new Set();
      names.forEach((n) => map[cat].add(n));
    }
    return Object.fromEntries(
      Object.entries(map).map(([k, v]) => [k, Array.from(v).sort()])
    );
  }, [transactions, subcategories]);

  const filterCategories = useMemo(() => {
    const s = new Set(transactions.map((t) => t.category));
    return ["All", ...Array.from(s).sort()];
  }, [transactions]);

  const filtered = useMemo(() => {
    let rows = transactions;
    // Show only reconciled transactions
    rows = rows.filter((t) => !!(t.reconciled ?? false));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((t) => t.description.toLowerCase().includes(q));
    }
    if (catFilter !== "All")  rows = rows.filter((t) => t.category === catFilter);
    if (typeFilter !== "All") rows = rows.filter((t) => t.type === typeFilter.toLowerCase());
    rows = [...rows].sort((a, b) => {
      let va, vb;
      if (sort.col === "date")   { va = a.date?.getTime() ?? 0; vb = b.date?.getTime() ?? 0; }
      if (sort.col === "amount") { va = Math.abs(a.amount); vb = Math.abs(b.amount); }
      if (sort.col === "desc")   { va = a.description; vb = b.description; }
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [transactions, search, catFilter, typeFilter, sort]);

  const totalDebits  = useMemo(() => filtered.filter((t) => t.type === "debit").reduce((s, t) => s + Math.abs(t.amount), 0), [filtered]);
  const totalCredits = useMemo(() => filtered.filter((t) => t.type === "credit").reduce((s, t) => s + Math.abs(t.amount), 0), [filtered]);

  const pendingCount = Object.keys(pendingEdits).length;

  function toggleSort(col) {
    setSort((s) => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });
  }
  function sortIcon(col) {
    if (sort.col !== col) return " ↕";
    return sort.dir === "asc" ? " ↑" : " ↓";
  }

  function stageEdit(transactionId, field, value) {
    setPendingEdits((prev) => ({
      ...prev,
      [transactionId]: { ...prev[transactionId], [field]: value },
    }));
  }

  function handleCategoryChange(transactionId, value) {
    if (value === "__new__") {
      setModal({ transactionId });
      setNewCatName("");
      setNewCatType("expense");
      return;
    }

    if (value.startsWith("__link__")) {
      const peerAccountId = value.slice(8);
      linkTransfer(transactionId, peerAccountId);
      return;
    }

    if (value.startsWith("__ccpay__")) {
      const peerAccountId = value.slice(9);
      linkTransfer(transactionId, peerAccountId, "CC Payment");
      return;
    }

    stageEdit(transactionId, "category", value);
  }

  function handleModalSubmit(e) {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name || allCategories.includes(name)) return;
    addCustomCategory(name, newCatType);
    stageEdit(modal.transactionId, "category", name);
    setModal(null);
  }

  function handleSave() {
    if (!pendingCount) return;
    bulkUpdateTransactions(pendingEdits);
    setPendingEdits({});
    setSaved(true);
    setTimeout(() => setSaved(false), 6000);
  }

  function handleClearEdits() {
    setPendingEdits({});
  }

  function resolved(t, field) {
    return pendingEdits[t.id]?.[field] ?? t[field];
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>Reconciled Transactions</h2>
        <div className="edit-actions">
          {saved && <span className="edit-saved">✓ Changes saved</span>}
          {pendingCount > 0 && (
            <>
              <span className="edit-badge">{pendingCount} unsaved {pendingCount === 1 ? "change" : "changes"}</span>
              <button className="btn-sm" onClick={handleClearEdits}>Clear edits</button>
              <button className="btn-sm btn-save" onClick={handleSave}>Save edits</button>
            </>
          )}
        </div>
      </div>

      {/* New category modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">New Category</div>
            <form onSubmit={handleModalSubmit}>
              <div className="modal-field">
                <label>Name</label>
                <input
                  className="modal-input"
                  type="text"
                  placeholder="e.g. Pet Care"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  autoFocus
                />
                {allCategories.includes(newCatName.trim()) && newCatName.trim() && (
                  <span className="new-cat-error">Name already exists</span>
                )}
              </div>
              <div className="modal-field">
                <label>Type</label>
                <select
                  className="modal-select"
                  value={newCatType}
                  onChange={(e) => setNewCatType(e.target.value)}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-sm" onClick={() => setModal(null)}>Cancel</button>
                <button
                  type="submit"
                  className="btn-sm btn-save"
                  disabled={!newCatName.trim() || allCategories.includes(newCatName.trim())}
                >
                  Add &amp; Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="filter-row">
        <input
          className="search-input"
          type="text"
          placeholder="Search description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="limit-select" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          {filterCategories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="limit-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option>All</option>
          <option>Debit</option>
          <option>Credit</option>
        </select>
        <span className="filter-count">
          {filtered.length} rows &nbsp;·&nbsp;
          <span style={{ color: "#dc2626" }}>↓ {fmt(totalDebits)}</span>
          &nbsp;
          <span style={{ color: "#2a7a58" }}>↑ {fmt(totalCredits)}</span>
        </span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>✓</th>
              <th onClick={() => toggleSort("date")} className="sortable">Date{sortIcon("date")}</th>
              <th onClick={() => toggleSort("desc")} className="sortable">Description{sortIcon("desc")}</th>
              <th>Category</th>
              <th>Type</th>
              <th onClick={() => toggleSort("amount")} className="sortable">Amount{sortIcon("amount")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const isTransfer = !!t.transferId;
              const hasEdit = !isTransfer && !!pendingEdits[t.id];
              const cat  = resolved(t, "category");
              const type = resolved(t, "type");
              const peerAcct = isTransfer ? accounts.find((a) => a.id === t.transferPeer) : null;

              if (isTransfer) {
                const isCCPayment = t.category === "CC Payment";
                return (
                  <tr key={t.id} className="row-transfer">
                    <td><input type="checkbox" disabled checked title={isCCPayment ? "CC payments are automatically reconciled" : "Transfers are automatically reconciled"} /></td>
                    <td className="mono">{t.date ? t.date.toLocaleDateString() : t.dateStr}</td>
                    <td>
                      <span className={isCCPayment ? "cc-payment-label" : "transfer-label"}>
                        {isCCPayment ? "💳 CC Payment" : "⇄ Transfer"}
                      </span>
                      {peerAcct && (
                        <span className="transfer-peer">
                          {type === "debit" ? "→" : "←"}
                          <span className="acct-dot-sm" style={{ background: peerAcct.color, margin: "0 4px" }} />
                          {peerAcct.name}
                        </span>
                      )}
                      {t.description && <span className="transfer-note"> · {t.description}</span>}
                    </td>
                    <td><span className="inline-select-static">{isCCPayment ? "CC Payment" : "Transfer"}</span></td>
                    <td><span className={`inline-select-static type-static ${type}`}>{type === "debit" ? "Debit" : "Credit"}</span></td>
                    <td className={type === "credit" ? "credit-amt" : ""}>
                      {type === "credit" ? "+" : "-"}{fmt(Math.abs(t.amount))}
                    </td>
                    <td>
                      <button
                        className="btn-sm btn-danger"
                        style={{ padding: "2px 8px", fontSize: "0.72rem" }}
                        onClick={() => deleteTransfer(t.transferId)}
                        title={`Delete both sides of this ${isCCPayment ? "CC payment" : "transfer"}`}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              }

              const thisAccount = accounts.find((a) => a.id === t.accountId);
              const isCreditCardAccount = thisAccount?.type === "credit";
              const isPotentialTransfer = TRANSFER_RE.test(t.description) && accounts.length > 0;

              const ccPaymentAccounts = (() => {
                if (isCreditCardAccount && t.type === "credit")
                  return accounts.filter((a) => a.id !== t.accountId);
                if (!isCreditCardAccount && isPotentialTransfer)
                  return accounts.filter((a) => a.id !== t.accountId && a.type === "credit");
                return [];
              })();
              const ccPayIds = new Set(ccPaymentAccounts.map((a) => a.id));
              const linkableAccounts = isPotentialTransfer
                ? accounts.filter((a) => a.id !== t.accountId && !ccPayIds.has(a.id))
                : [];

              return (
                <tr key={t.id} className={`${type === "credit" ? "row-credit" : ""} ${hasEdit ? "row-edited" : ""}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={resolved(t, "reconciled") ?? false}
                      onChange={(e) => stageEdit(t.id, "reconciled", e.target.checked)}
                      title="Uncheck to move back to Transactions view"
                    />
                  </td>
                  <td className="mono">{t.date ? t.date.toLocaleDateString() : t.dateStr}</td>
                  <td>{t.description}{hasEdit && <span className="edit-dot" title="Unsaved change" />}</td>
                  <td>
                    <select
                      className="inline-select"
                      value={cat}
                      onChange={(e) => handleCategoryChange(t.id, e.target.value)}
                    >
                      {ccPaymentAccounts.length > 0 && ccPaymentAccounts.map((a) => (
                        <option key={`ccpay-${a.id}`} value={`__ccpay__${a.id}`}>
                          💳 CC Payment → {a.name}{a.last4 ? ` (••${a.last4})` : ""}
                        </option>
                      ))}
                      {linkableAccounts.length > 0 && linkableAccounts.map((a) => (
                        <option key={a.id} value={`__link__${a.id}`}>
                          ⇄ Link transfer → {a.name}{a.last4 ? ` (••${a.last4})` : ""}
                        </option>
                      ))}
                      {(ccPaymentAccounts.length > 0 || linkableAccounts.length > 0) && (
                        <option disabled>──────────</option>
                      )}
                      {allCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option disabled>──────────</option>
                      <option value="__new__">+ Add new category…</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className={`inline-select type-select ${type}`}
                      value={type}
                      onChange={(e) => stageEdit(t.id, "type", e.target.value)}
                    >
                      <option value="debit">Debit</option>
                      <option value="credit">Credit</option>
                    </select>
                  </td>
                  <td className={type === "credit" ? "credit-amt" : ""}>
                    {type === "credit" ? "+" : "-"}{fmt(Math.abs(t.amount))}
                  </td>
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
