import { useMemo, useState } from "react";
import { CATEGORY_COLORS } from "../categories.js";

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function Budgets({ expenses, budgets, setBudgets }) {
  const [editing, setEditing] = useState(null);
  const [inputVal, setInputVal] = useState("");

  const byCategory = useMemo(() => {
    const map = {};
    for (const t of expenses) {
      map[t.category] = (map[t.category] || 0) + t.amount;
    }
    return Object.entries(map)
      .map(([cat, total]) => ({ cat, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const saveBudget = (cat) => {
    const val = parseFloat(inputVal);
    if (!isNaN(val) && val > 0) {
      setBudgets((b) => ({ ...b, [cat]: val }));
    } else {
      setBudgets((b) => { const next = { ...b }; delete next[cat]; return next; });
    }
    setEditing(null);
    setInputVal("");
  };

  const totalBudgeted = Object.values(budgets).reduce((s, v) => s + v, 0);
  const totalSpent    = byCategory.filter((c) => budgets[c.cat]).reduce((s, c) => s + c.total, 0);

  return (
    <div className="view">
      <div className="view-header"><h2>Budget Tracking</h2></div>

      {totalBudgeted > 0 && (
        <div className="cards">
          <div className="card card-expense">
            <div className="card-label">Total Budgeted</div>
            <div className="card-value">{fmt(totalBudgeted)}</div>
          </div>
          <div className={`card ${totalSpent <= totalBudgeted ? "card-positive" : "card-negative"}`}>
            <div className="card-label">Total Spent (budgeted cats)</div>
            <div className="card-value">{fmt(totalSpent)}</div>
            <div className="card-sub">{totalSpent <= totalBudgeted ? "within budget" : "over budget"}</div>
          </div>
        </div>
      )}

      <div className="section">
        <p className="chart-hint">Click <strong>Set Budget</strong> on any category to set a monthly limit. The bar shows how much of your budget you've used.</p>
        <div className="budget-list">
          {byCategory.map(({ cat, total }) => {
            const budget = budgets[cat];
            const pct = budget ? Math.min(100, (total / budget) * 100) : null;
            const over = budget && total > budget;
            return (
              <div key={cat} className="budget-row">
                <div className="budget-info">
                  <span className="cat-dot" style={{ background: CATEGORY_COLORS[cat] ?? "#b0b0a4" }} />
                  <span className="budget-cat">{cat}</span>
                  <span className="budget-spent">{fmt(total)}</span>
                  {budget && (
                    <span className={`budget-limit ${over ? "over" : ""}`}>
                      / {fmt(budget)} {over ? "⚠ over!" : ""}
                    </span>
                  )}
                </div>

                {pct !== null && (
                  <div className="budget-bar-wrap">
                    <div className="budget-bar">
                      <div
                        className="budget-fill"
                        style={{
                          width: `${pct}%`,
                          background: pct > 100 ? "#dc2626" : pct > 80 ? "#c89b3c" : "#2a7a58",
                        }}
                      />
                    </div>
                    <span className="budget-pct">{pct.toFixed(0)}%</span>
                  </div>
                )}

                <div className="budget-actions">
                  {editing === cat ? (
                    <>
                      <span className="budget-prefix">$</span>
                      <input
                        className="budget-input"
                        type="number"
                        min="0"
                        step="10"
                        value={inputVal}
                        autoFocus
                        onChange={(e) => setInputVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveBudget(cat); if (e.key === "Escape") setEditing(null); }}
                      />
                      <button className="btn-sm btn-save" onClick={() => saveBudget(cat)}>Save</button>
                      <button className="btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                    </>
                  ) : (
                    <button
                      className="btn-sm"
                      onClick={() => { setEditing(cat); setInputVal(budget ? String(budget) : ""); }}
                    >
                      {budget ? "Edit Budget" : "Set Budget"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
