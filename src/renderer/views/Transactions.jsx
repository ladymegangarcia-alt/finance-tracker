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

const TRANSFER_RE = /transfer\s+(debit\s+to|credit\s+from)|online\s+transfer\s+(to|from)|overdraft\s+protection\s+xfer\s+(to|from)/i;

export default function Transactions({ transactions, bulkUpdateTransactions, customCategories = [], addCustomCategory, accounts = [], deleteTransfer, linkTransfer, subcategories = {}, addSubcategory }) {
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

  // Suggestion modal: { targetCategory, vendor, matches: [{id, description, date, amount, currentCat}], checked: Set }
  const [suggestion, setSuggestion] = useState(null);

  // Inline new-subcategory state: which row is adding + text being typed
  const [addingSubcatId,   setAddingSubcatId]   = useState(null);
  const [newSubcatText,    setNewSubcatText]     = useState("");

  const allCategories = useMemo(
    () => [...CATEGORIES, ...customCategories.map((c) => c.name)],
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
          <span style={{ color: "#16a34a" }}>↑ {fmt(totalCredits)}</span>
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
                return (
                  <tr key={t.id} className="row-transfer">
                    <td><input type="checkbox" disabled title="Transfers are automatically reconciled" checked /></td>
                    <td className="mono">{t.date ? t.date.toLocaleDateString() : t.dateStr}</td>
                    <td>
                      <span className="transfer-label">⇄ Transfer</span>
                      {peerAcct && (
                        <span className="transfer-peer">
                          {type === "debit" ? "→" : "←"}
                          <span className="acct-dot-sm" style={{ background: peerAcct.color, margin: "0 4px" }} />
                          {peerAcct.name}
                        </span>
                      )}
                      {t.description && <span className="transfer-note"> · {t.description}</span>}
                    </td>
                    <td><span className="inline-select-static">Transfer</span></td>
                    <td><span className={`inline-select-static type-static ${type}`}>{type === "debit" ? "Debit" : "Credit"}</span></td>
                    <td className={type === "credit" ? "credit-amt" : ""}>
                      {type === "credit" ? "+" : "-"}{fmt(Math.abs(t.amount))}
                    </td>
                    <td>
                      <button
                        className="btn-sm btn-danger"
                        style={{ padding: "2px 8px", fontSize: "0.72rem" }}
                        onClick={() => deleteTransfer(t.transferId)}
                        title="Delete both sides of this transfer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              }

              const isPotentialTransfer = TRANSFER_RE.test(t.description) && accounts.length > 0;
              const linkableAccounts = isPotentialTransfer
                ? accounts.filter((a) => a.id !== t.accountId)
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
                      {allCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option disabled>──────────</option>
                      <option value="__new__">+ Add new category…</option>
                      {linkableAccounts.length > 0 && <option disabled>──────────</option>}
                      {linkableAccounts.map((a) => (
                        <option key={a.id} value={`__link__${a.id}`}>
                          ⇄ Link transfer → {a.name}{a.last4 ? ` (••${a.last4})` : ""}
                        </option>
                      ))}
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
