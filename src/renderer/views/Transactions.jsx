import { useEffect, useMemo, useState } from "react";
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

export default function Transactions({ transactions, bulkUpdateTransactions, customCategories = [], addCustomCategory, accounts = [], accountFilter = "all", addTransaction, deleteTransaction, deleteTransfer, linkTransfer, subcategories = {}, addSubcategory, addTxnTrigger = 0 }) {
  const [search,    setSearch]    = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [sort, setSort] = useState({ col: "date", dir: "desc" });

  // Staged edits: { [transactionId]: { category?, type?, subcategory?, reconciled? } }
  const [pendingEdits, setPendingEdits] = useState({});
  const [saved, setSaved] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTxnDate, setNewTxnDate] = useState("");
  const [newTxnDescription, setNewTxnDescription] = useState("");
  const [newTxnAmount, setNewTxnAmount] = useState("");
  const [newTxnType, setNewTxnType] = useState("debit");
  const [newTxnAccountId, setNewTxnAccountId] = useState("");
  const [newTxnCategory, setNewTxnCategory] = useState("");
  const [newTxnSubcategory, setNewTxnSubcategory] = useState("");

  // New category modal
  const [modal, setModal] = useState(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState("expense");

  // Suggestion modal: { targetCategory, vendor, matches: [{id, description, date, amount, currentCat}], checked: Set }
  const [suggestion, setSuggestion] = useState(null);

  // Inline new-subcategory state: which row is adding + text being typed
  const [addingSubcatId,   setAddingSubcatId]   = useState(null);
  const [newSubcatText,    setNewSubcatText]     = useState("");

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

  function confirmNewSubcat(txnId, category) {
    const name = newSubcatText.trim();
    if (!name) { setAddingSubcatId(null); return; }
    addSubcategory(category, name);
    stageEdit(txnId, "subcategory", name);
    setAddingSubcatId(null);
    setNewSubcatText("");
    triggerSubcatSuggestion(txnId, category, name);
  }

  const filterCategories = useMemo(() => {
    const s = new Set(transactions.map((t) => t.category));
    return ["All", ...Array.from(s).sort()];
  }, [transactions]);

  function todayStr() {
    return new Date().toISOString().split("T")[0];
  }

  function openAddTransaction() {
    setShowAddForm(true);
    setNewTxnDate(todayStr());
    setNewTxnDescription("");
    setNewTxnAmount("");
    setNewTxnType("debit");
    setNewTxnAccountId(accountFilter !== "all" ? accountFilter : accounts[0]?.id || "");
    setNewTxnCategory(allCategories[0] || "");
    setNewTxnSubcategory("");
  }

  useEffect(() => {
    if (!addTxnTrigger) return;
    openAddTransaction();
  }, [addTxnTrigger]);

  function handleAddTransaction(e) {
    e.preventDefault();
    if (!newTxnDate || !newTxnDescription.trim() || !newTxnAmount || !newTxnAccountId) return;
    const amount = parseFloat(newTxnAmount);
    if (Number.isNaN(amount) || amount === 0) return;
    addTransaction({
      date: new Date(newTxnDate),
      dateStr: newTxnDate,
      description: newTxnDescription.trim(),
      amount: Math.abs(amount),
      type: newTxnType,
      category: newTxnCategory || allCategories[0] || "",
      subcategory: newTxnSubcategory || undefined,
      accountId: newTxnAccountId,
      reconciled: false,
      fileId: null,
    });
    setShowAddForm(false);
  }

  const filtered = useMemo(() => {
    let rows = transactions;
    // Show only unreconciled transactions
    rows = rows.filter((t) => !(t.reconciled ?? false));
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

    // Stage the category change and auto-mark as reconciled
    setPendingEdits((prev) => ({
      ...prev,
      [transactionId]: { ...prev[transactionId], category: value, reconciled: true },
    }));

    // Find similar transactions from the same vendor with a different category
    const changed = transactions.find((t) => t.id === transactionId);
    if (!changed) return;
    const key = vendorKey(changed.description);
    if (!key) return;

    const matches = transactions.filter((t) => {
      if (t.id === transactionId) return false;
      const currentCat = pendingEdits[t.id]?.category ?? t.category;
      return vendorKey(t.description) === key && currentCat !== value;
    });

    if (matches.length > 0) {
      setSuggestion({
        targetCategory: value,
        vendor: vendorName(changed.description),
        matches,
        checked: new Set(matches.map((t) => t.id)),
      });
    }
  }

  function toggleSuggestionCheck(id) {
    setSuggestion((prev) => {
      const checked = new Set(prev.checked);
      checked.has(id) ? checked.delete(id) : checked.add(id);
      return { ...prev, checked };
    });
  }

  function applySuggestions() {
    suggestion.checked.forEach((id) => {
      setPendingEdits((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          category: suggestion.targetCategory,
          ...(suggestion.targetSubcategory != null && { subcategory: suggestion.targetSubcategory }),
        },
      }));
    });
    setSuggestion(null);
  }

  function triggerSubcatSuggestion(transactionId, category, subcategory) {
    const needle = subcategory.toLowerCase();
    if (!needle) return;

    const matches = transactions.filter((t) => {
      if (t.id === transactionId || t.transferId) return false;
      if (!t.description.toLowerCase().includes(needle)) return false;
      const currentSubcat = pendingEdits[t.id]?.subcategory ?? t.subcategory;
      return currentSubcat !== subcategory;
    });

    if (matches.length > 0) {
      setSuggestion({
        targetCategory: category,
        targetSubcategory: subcategory,
        vendor: subcategory,
        matches,
        checked: new Set(matches.map((t) => t.id)),
      });
    }
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
        <h2>Transactions</h2>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
          <button className="btn-new-cat" onClick={openAddTransaction} disabled={accounts.length === 0} title={accounts.length === 0 ? "Add an account first" : undefined}>
            + Add Transaction
          </button>
        </div>
        {accounts.length === 0 && (
          <div className="empty-hint" style={{ marginTop: 12 }}>
            Add an account in the Accounts tab first, then return here to enter transactions manually.
          </div>
        )}
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

      {showAddForm && (
        <form className="modal modal-add-transaction" onSubmit={handleAddTransaction} style={{ position: "relative", padding: "16px", marginBottom: "16px", background: "#faf6ec", borderRadius: "12px", boxShadow: "0 12px 24px rgba(15,23,42,.08)" }}>
          <div className="modal-title" style={{ marginBottom: 12 }}>New Transaction</div>
          <div className="modal-field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label>Date</label>
              <input className="modal-input" type="date" value={newTxnDate} onChange={(e) => setNewTxnDate(e.target.value)} autoFocus />
            </div>
            <div>
              <label>Account</label>
              <select className="modal-select" value={newTxnAccountId} onChange={(e) => setNewTxnAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="modal-field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label>Description</label>
              <input className="modal-input" type="text" placeholder="Description" value={newTxnDescription} onChange={(e) => setNewTxnDescription(e.target.value)} />
            </div>
            <div>
              <label>Amount</label>
              <div className="acct-form-bal" style={{ width: "100%" }}>
                <span className="balance-prefix">$</span>
                <input className="modal-input" type="number" step="0.01" placeholder="0.00" value={newTxnAmount} onChange={(e) => setNewTxnAmount(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div style={{ marginTop: 6, fontSize: "0.85rem", color: "#6b6b62" }}>
                Enter a positive value. Use Debit for spending and Credit for refunds or deposits.
              </div>
            </div>
          </div>
          <div className="modal-field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label>Type</label>
              <select className="modal-select" value={newTxnType} onChange={(e) => setNewTxnType(e.target.value)}>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div>
              <label>Category</label>
              <select className="modal-select" value={newTxnCategory} onChange={(e) => setNewTxnCategory(e.target.value)}>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>Subcategory</label>
              <input className="modal-input" type="text" placeholder="Optional" value={newTxnSubcategory} onChange={(e) => setNewTxnSubcategory(e.target.value)} />
            </div>
          </div>
          <div className="modal-actions" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
            <button type="submit" className="btn-sm btn-save" disabled={!newTxnDate || !newTxnDescription.trim() || !newTxnAmount || !newTxnAccountId}>Add transaction</button>
          </div>
        </form>
      )}

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

      {/* Suggestion modal */}
      {suggestion && (
        <div className="modal-overlay" onClick={() => setSuggestion(null)}>
          <div className="modal modal-suggest" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Apply to similar transactions?</div>
            <p className="suggest-subtitle">
              Found <strong>{suggestion.matches.length}</strong> other transactions from{" "}
              <strong>{suggestion.vendor}</strong>. Select which ones to tag as{" "}
              <strong>
                {suggestion.targetCategory}
                {suggestion.targetSubcategory ? ` › ${suggestion.targetSubcategory}` : ""}
              </strong>:
            </p>
            <div className="suggest-list">
              <label className="suggest-check-all">
                <input
                  type="checkbox"
                  checked={suggestion.checked.size === suggestion.matches.length}
                  onChange={() => setSuggestion((prev) => ({
                    ...prev,
                    checked: prev.checked.size === prev.matches.length
                      ? new Set()
                      : new Set(prev.matches.map((t) => t.id)),
                  }))}
                />
                Select all
              </label>
              {suggestion.matches.map((t) => (
                <label key={t.id} className="suggest-row">
                  <input
                    type="checkbox"
                    checked={suggestion.checked.has(t.id)}
                    onChange={() => toggleSuggestionCheck(t.id)}
                  />
                  <span className="suggest-date">{t.date ? t.date.toLocaleDateString() : t.dateStr}</span>
                  <span className="suggest-desc">{t.description}</span>
                  <span className="suggest-from">
                    {pendingEdits[t.id]?.category ?? t.category}
                    {(pendingEdits[t.id]?.subcategory ?? t.subcategory) ? ` › ${pendingEdits[t.id]?.subcategory ?? t.subcategory}` : ""}
                  </span>
                  <span className="suggest-arrow">→</span>
                  <span className="suggest-to">
                    {suggestion.targetCategory}
                    {suggestion.targetSubcategory ? ` › ${suggestion.targetSubcategory}` : ""}
                  </span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-sm" onClick={() => setSuggestion(null)}>Skip</button>
              <button
                className="btn-sm btn-save"
                disabled={suggestion.checked.size === 0}
                onClick={applySuggestions}
              >
                Apply to selected ({suggestion.checked.size})
              </button>
            </div>
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

              // CC Payment: on a CC account, payments are "debit" type (negative in CSV = reduces balance).
              // On a bank account, look for payment-pattern debits and offer to link to CC accounts.
              const ccPaymentAccounts = (() => {
                if (isCreditCardAccount && t.type === "debit" && isPotentialTransfer)
                  return accounts.filter((a) => a.id !== t.accountId && a.type !== "credit");
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
                      title="Mark as reconciled (will move to Reconciled view)"
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
                    {/* Subcategory selector */}
                    {addingSubcatId === t.id ? (
                      <div className="subcat-new-row">
                        <input
                          className="subcat-input"
                          autoFocus
                          placeholder="Subcategory name…"
                          value={newSubcatText}
                          onChange={(e) => setNewSubcatText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") confirmNewSubcat(t.id, cat);
                            if (e.key === "Escape") setAddingSubcatId(null);
                          }}
                        />
                        <button className="btn-sm btn-save" onClick={() => confirmNewSubcat(t.id, cat)}>✓</button>
                        <button className="btn-sm" onClick={() => setAddingSubcatId(null)}>✕</button>
                      </div>
                    ) : (
                      <select
                        className="subcat-select"
                        value={resolved(t, "subcategory") || ""}
                        onChange={(e) => {
                          if (e.target.value === "__new_subcat__") {
                            setAddingSubcatId(t.id);
                            setNewSubcatText("");
                          } else {
                            stageEdit(t.id, "subcategory", e.target.value);
                            if (e.target.value) triggerSubcatSuggestion(t.id, cat, e.target.value);
                          }
                        }}
                      >
                        <option value="">— subcategory —</option>
                        {(subcatsByCategory[cat] || []).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        <option disabled>──────────</option>
                        <option value="__new_subcat__">+ Add new…</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <select
                      className={`inline-select type-select ${type}`}
                      value={type}
                      onChange={(e) => stageEdit(t.id, "type", e.target.value)}
                    >
                      <option value="debit">{isCreditCardAccount ? "Payment" : "Debit"}</option>
                      <option value="credit">{isCreditCardAccount ? "Charge" : "Credit"}</option>
                    </select>
                  </td>
                  <td className={type === "credit" ? "credit-amt" : ""}>
                    {type === "credit" ? "+" : "-"}{fmt(Math.abs(t.amount))}
                  </td>
                  <td>
                    <select
                      className="action-select"
                      defaultValue=""
                      onChange={(e) => {
                        const action = e.target.value;
                        e.target.value = "";
                        if (action === "reconcile") stageEdit(t.id, "reconciled", true);
                        if (action === "delete") deleteTransaction(t.id);
                      }}
                    >
                      <option value="">···</option>
                      <option value="reconcile">✓ Reconcile</option>
                      <option value="delete">✕ Delete</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
