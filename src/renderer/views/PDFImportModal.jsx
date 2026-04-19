import { useState, useMemo } from "react";

const TYPE_LABELS = { checking: "Checking", savings: "Savings", credit: "Credit Card" };

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function PDFImportModal({ fileName, rows, accounts, onConfirm, onCancel }) {
  // Which rows are checked (all by default)
  const [checked, setChecked] = useState(() => new Set(rows.map((_, i) => i)));

  // Account picker
  const [importAccountId, setImportAccountId] = useState(
    accounts.length === 0 ? "__new__" : null
  );
  const [importNewName, setImportNewName] = useState("");
  const [importNewType, setImportNewType] = useState("checking");

  const allChecked  = checked.size === rows.length;
  const noneChecked = checked.size === 0;

  function toggleRow(i) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(rows.map((_, i) => i)));
  }

  const selectedRows = useMemo(
    () => rows.filter((_, i) => checked.has(i)),
    [rows, checked]
  );

  const canConfirm =
    checked.size > 0 &&
    importAccountId &&
    (importAccountId !== "__new__" || importNewName.trim());

  function handleConfirm() {
    onConfirm(selectedRows, importAccountId === "__new__" ? null : importAccountId, {
      newName: importNewName.trim(),
      newType: importNewType,
      isNew:   importAccountId === "__new__",
    });
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-pdf" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-title">Import PDF: {fileName}</div>
        <p className="modal-subtitle">
          Found <strong>{rows.length}</strong> transactions.
          Review below, uncheck any rows to skip, then choose an account.
        </p>

        {/* Account picker */}
        <div className="pdf-section-label">Import into account</div>
        <div className="account-picker">
          {accounts.map((a) => (
            <div
              key={a.id}
              className={`acct-pick-card ${importAccountId === a.id ? "selected" : ""}`}
              onClick={() => setImportAccountId(a.id)}
            >
              <span className="acct-dot" style={{ background: a.color }} />
              <div>
                <div className="acct-pick-name">{a.name}</div>
                <div className="acct-pick-type">{TYPE_LABELS[a.type] ?? a.type}</div>
              </div>
            </div>
          ))}
          <div
            className={`acct-pick-card ${importAccountId === "__new__" ? "selected" : ""}`}
            onClick={() => setImportAccountId("__new__")}
          >
            <span className="acct-dot" style={{ background: "#9ca3af" }} />
            <div><div className="acct-pick-name">+ New account</div></div>
          </div>
        </div>

        {importAccountId === "__new__" && (
          <div className="import-new-acct">
            <input
              className="modal-input"
              placeholder="Account name (e.g. Chase Sapphire)"
              value={importNewName}
              onChange={(e) => setImportNewName(e.target.value)}
              autoFocus
            />
            <select
              className="modal-select"
              value={importNewType}
              onChange={(e) => setImportNewType(e.target.value)}
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
            </select>
          </div>
        )}

        {/* Transaction preview table */}
        <div className="pdf-section-label" style={{ marginTop: 16 }}>
          Transactions &nbsp;
          <span className="pdf-count-badge">{checked.size} / {rows.length} selected</span>
        </div>
        <div className="pdf-table-wrap">
          <table className="pdf-preview-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = !allChecked && !noneChecked; }}
                    onChange={toggleAll}
                  />
                </th>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Type</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr
                  key={i}
                  className={!checked.has(i) ? "pdf-row-unchecked" : ""}
                  onClick={() => toggleRow(i)}
                >
                  <td><input type="checkbox" checked={checked.has(i)} onChange={() => toggleRow(i)} onClick={(e) => e.stopPropagation()} /></td>
                  <td className="mono">{t.dateStr}</td>
                  <td className="pdf-desc">{t.description}</td>
                  <td><span className="pdf-cat-badge">{t.category}</span></td>
                  <td>
                    <span className={`type-badge ${t.type}`}>
                      {t.type === "credit" ? "Credit" : "Debit"}
                    </span>
                  </td>
                  <td className={t.type === "credit" ? "credit-amt" : ""}>
                    {t.type === "credit" ? "+" : "-"}{fmt(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="modal-actions">
          <button className="btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn-sm btn-save"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            Import selected ({checked.size})
          </button>
        </div>
      </div>
    </div>
  );
}
