import { useMemo, useState } from "react";

const TYPE_LABELS = { checking: "Checking", savings: "Savings", credit: "Credit Card" };

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function Accounts({ accounts, addAccount, updateAccount, deleteAccount, loadedFiles, allTransactions, createTransfer, deleteTransfer, onAccountCreated, onAddTransaction, onPlaidSync, syncingAccountId = null }) {
  const [showForm,   setShowForm]   = useState(false);
  const [editingId,  setEditingId]  = useState(null);
  const [formName,   setFormName]   = useState("");
  const [formType,   setFormType]   = useState("checking");
  const [formBal,    setFormBal]    = useState("");
  const [formLast4,  setFormLast4]  = useState("");

  // Transfer modal state
  const [showTransfer, setShowTransfer] = useState(false);
  const [xferFrom,     setXferFrom]     = useState("");
  const [xferTo,       setXferTo]       = useState("");
  const [xferAmount,   setXferAmount]   = useState("");
  const [xferDate,     setXferDate]     = useState(todayStr());
  const [xferNote,     setXferNote]     = useState("");

  const stats = useMemo(() => {
    const map = {};
    for (const a of accounts) map[a.id] = { fileCount: 0, txCount: 0, balance: 0 };
    for (const f of loadedFiles) if (map[f.accountId]) map[f.accountId].fileCount++;
    for (const t of allTransactions) {
      if (!map[t.accountId]) continue;
      map[t.accountId].txCount++;
      map[t.accountId].balance += t.type === "credit" ? t.amount : -t.amount;
    }
    return map;
  }, [accounts, loadedFiles, allTransactions]);

  // Transfers: unique list from allTransactions
  const transfers = useMemo(() => {
    const seen = new Map();
    for (const t of allTransactions) {
      if (!t.transferId || seen.has(t.transferId)) continue;
      if (t.type !== "debit") continue; // use the "out" side as canonical
      const inTxn = allTransactions.find((x) => x.transferId === t.transferId && x.type === "credit");
      seen.set(t.transferId, {
        transferId: t.transferId,
        date: t.date,
        dateStr: t.dateStr,
        amount: t.amount,
        fromAccountId: t.accountId,
        toAccountId: inTxn?.accountId,
        note: t.description,
      });
    }
    return Array.from(seen.values()).sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  }, [allTransactions]);

  function openNew() {
    setEditingId(null);
    setFormName("");
    setFormType("checking");
    setFormBal("");
    setFormLast4("");
    setShowForm(true);
  }

  function openEdit(a) {
    setEditingId(a.id);
    setFormName(a.name);
    setFormType(a.type);
    setFormBal(String(a.openingBalance ?? 0));
    setFormLast4(a.last4 ?? "");
    setShowForm(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const name = formName.trim();
    if (!name) return;
    const bal = parseFloat(formBal) || 0;
    if (editingId) {
      updateAccount(editingId, { name, type: formType, openingBalance: bal, last4: formLast4 });
      setShowForm(false);
      setEditingId(null);
      return;
    }
    const newAccountId = addAccount(name, formType, bal, formLast4);
    setShowForm(false);
    setEditingId(null);
    if (onAccountCreated) onAccountCreated(newAccountId);
  }

  function openTransferModal() {
    setXferFrom(accounts[0]?.id ?? "");
    setXferTo(accounts[1]?.id ?? "");
    setXferAmount("");
    setXferDate(todayStr());
    setXferNote("");
    setShowTransfer(true);
  }

  function handleTransferSubmit(e) {
    e.preventDefault();
    const amount = parseFloat(xferAmount);
    if (!xferFrom || !xferTo || !amount || xferFrom === xferTo) return;
    createTransfer(xferFrom, xferTo, amount, xferDate, xferNote.trim());
    setShowTransfer(false);
  }

  const canTransfer = accounts.length >= 2;

  return (
    <div className="view">
      <div className="view-header">
        <h2>Accounts</h2>
        {accounts.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            {canTransfer && (
              <button className="btn-new-cat btn-transfer" onClick={openTransferModal}>
                ⇄ New Transfer
              </button>
            )}
            <button className="btn-new-cat" onClick={openNew}>+ Add Account</button>
          </div>
        )}
      </div>

      {/* Account form */}
      {showForm && (
        <form className="acct-form" onSubmit={handleSubmit}>
          <div className="acct-form-title">{editingId ? "Edit Account" : "New Account"}</div>
          <div className="acct-form-row">
            <input
              className="modal-input"
              placeholder="Account name (e.g. Chase Checking)"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              autoFocus
            />
            <select className="modal-select" value={formType} onChange={(e) => setFormType(e.target.value)}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
            </select>
            <div className="acct-form-bal">
              <span className="balance-prefix">$</span>
              <input
                className="modal-input"
                type="number"
                placeholder="Opening balance"
                value={formBal}
                onChange={(e) => setFormBal(e.target.value)}
                style={{ width: 140 }}
              />
            </div>
            <input
              className="modal-input"
              placeholder="Last 4 digits"
              value={formLast4}
              onChange={(e) => setFormLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              style={{ width: 100 }}
            />
            <button className="btn-sm btn-save" type="submit" disabled={!formName.trim()}>
              {editingId ? "Save" : "Add"}
            </button>
            <button className="btn-sm" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Transfer modal */}
      {showTransfer && (
        <div className="modal-overlay" onClick={() => setShowTransfer(false)}>
          <div className="modal modal-transfer" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">New Transfer</div>
            <form onSubmit={handleTransferSubmit}>
              <div className="modal-field">
                <label>From</label>
                <select className="modal-select" value={xferFrom} onChange={(e) => setXferFrom(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="modal-field">
                <label>To</label>
                <select className="modal-select" value={xferTo} onChange={(e) => setXferTo(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {xferFrom === xferTo && <span className="new-cat-error">From and To must be different accounts</span>}
              </div>
              <div className="modal-field">
                <label>Amount</label>
                <div className="acct-form-bal">
                  <span className="balance-prefix">$</span>
                  <input
                    className="modal-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={xferAmount}
                    onChange={(e) => setXferAmount(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-field">
                <label>Date</label>
                <input
                  className="modal-input"
                  type="date"
                  value={xferDate}
                  onChange={(e) => setXferDate(e.target.value)}
                />
              </div>
              <div className="modal-field">
                <label>Note <span style={{ color: "#b0b0a4", fontWeight: 400 }}>(optional)</span></label>
                <input
                  className="modal-input"
                  type="text"
                  placeholder="e.g. Monthly savings transfer"
                  value={xferNote}
                  onChange={(e) => setXferNote(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-sm" onClick={() => setShowTransfer(false)}>Cancel</button>
                <button
                  type="submit"
                  className="btn-sm btn-save"
                  disabled={!xferFrom || !xferTo || xferFrom === xferTo || !parseFloat(xferAmount)}
                >
                  Create Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="acct-empty">
          <button className="btn-import" onClick={openNew}>+ Add Account</button>
          <p>Or import a CSV — you'll be prompted to assign it to an account.</p>
        </div>
      ) : (
        <div className="acct-list">
          {accounts.map((a) => {
            const s = stats[a.id] ?? { fileCount: 0, txCount: 0, balance: 0 };
            const net = s.balance + (a.openingBalance ?? 0);
            return (
              <div key={a.id} className="acct-card">
                <div className="acct-card-left">
                  <span className="acct-dot-lg" style={{ background: a.color }} />
                  <div>
                    <div className="acct-card-name">{a.name}</div>
                    <div className="acct-card-type">
                      {TYPE_LABELS[a.type] ?? a.type}
                      {a.last4 && <span className="acct-last4"> &nbsp;•••• {a.last4}</span>}
                    </div>
                    {a.plaidAccountId && (
                      <button
                        className="btn-sm btn-plaid-sync"
                        style={{ marginTop: 6 }}
                        onClick={() => onPlaidSync?.(a)}
                        disabled={syncingAccountId === a.id || syncingAccountId === "all"}
                        title="Sync transactions from Plaid"
                      >
                        {syncingAccountId === a.id ? "Syncing…" : "🔄 Sync"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="acct-card-stats">
                  <div className="acct-stat">
                    <span className="acct-stat-label">Balance</span>
                    <span className={`acct-stat-val ${net >= 0 ? "pos" : "neg"}`}>{fmt(net)}</span>
                  </div>
                </div>
                <div className="acct-card-actions">
                  <button className="btn-sm" onClick={() => openEdit(a)}>Edit</button>
                  <button className="btn-sm btn-add-txn" onClick={() => onAddTransaction?.(a.id)}>
                    + Add Transaction
                  </button>
                  <button
                    className="btn-sm btn-danger"
                    onClick={() => deleteAccount(a.id)}
                    disabled={s.fileCount > 0}
                    title={s.fileCount > 0 ? "Remove linked files first" : "Delete account"}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transfer history */}
      {transfers.length > 0 && (
        <div className="section" style={{ marginTop: 32 }}>
          <h3>Transfer History</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th>Amount</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((x) => {
                const fromAcct = accounts.find((a) => a.id === x.fromAccountId);
                const toAcct   = accounts.find((a) => a.id === x.toAccountId);
                return (
                  <tr key={x.transferId}>
                    <td className="mono">{x.date ? x.date.toLocaleDateString() : x.dateStr}</td>
                    <td>
                      {fromAcct && <span className="acct-dot-sm" style={{ background: fromAcct.color, marginRight: 6 }} />}
                      {fromAcct?.name ?? "Unknown"}
                    </td>
                    <td>
                      {toAcct && <span className="acct-dot-sm" style={{ background: toAcct.color, marginRight: 6 }} />}
                      {toAcct?.name ?? "Unknown"}
                    </td>
                    <td>{fmt(x.amount)}</td>
                    <td style={{ color: "#6b6b62" }}>{x.note}</td>
                    <td>
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => deleteTransfer(x.transferId)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
