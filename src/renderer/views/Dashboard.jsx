import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CATEGORY_COLORS } from "../categories.js";

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const FALLBACK_COLORS = [
  "#ef4444","#10b981","#f472b6","#38bdf8","#a3e635","#fbbf24",
  "#34d399","#60a5fa","#fb923c","#a78bfa","#e11d48","#06b6d4",
  "#84cc16","#ec4899","#14b8a6","#f97316","#6366f1","#0ea5e9",
];

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function Dashboard({ transactions, expenses, income, openingBalance, setOpeningBalance, activeAccount, accounts = [], allTransactions = [], customCategories = [] }) {
  const [editingBalance,    setEditingBalance]    = useState(false);
  const [balanceInput,      setBalanceInput]      = useState("");
  const [monthFilter,       setMonthFilter]       = useState(null); // null = all, 0-11 = month index
  const [selectedCategory,  setSelectedCategory]  = useState(null); // { name, isIncome }

  // Months that have data (0-indexed)
  const availableMonths = useMemo(() => {
    const s = new Set(transactions.map((t) => t.date?.getMonth()).filter((m) => m != null));
    return Array.from(s).sort((a, b) => a - b);
  }, [transactions]);

  // Apply month filter to expenses/income/transactions
  const filteredTransactions = useMemo(() =>
    monthFilter == null ? transactions : transactions.filter((t) => t.date?.getMonth() === monthFilter),
    [transactions, monthFilter]
  );
  const filteredExpenses = useMemo(() =>
    monthFilter == null ? expenses : expenses.filter((t) => t.date?.getMonth() === monthFilter),
    [expenses, monthFilter]
  );
  const filteredIncome = useMemo(() =>
    monthFilter == null ? income : income.filter((t) => t.date?.getMonth() === monthFilter),
    [income, monthFilter]
  );

  const totalExpenses  = useMemo(() => filteredExpenses.reduce((s, t) => s + t.amount, 0), [filteredExpenses]);
  const totalIncome    = useMemo(() => filteredIncome.reduce((s, t) => s + t.amount, 0), [filteredIncome]);

  // When a month is selected, opening balance = year opening + all non-transfer transactions before that month
  const effectiveOpeningBalance = useMemo(() => {
    if (monthFilter == null) return openingBalance;
    const preTxns = transactions.filter((t) => t.date && t.date.getMonth() < monthFilter && !t.transferId);
    const preCredits = preTxns.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
    const preDebits  = preTxns.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
    return openingBalance + preCredits - preDebits;
  }, [monthFilter, openingBalance, transactions]);

  const currentBalance = effectiveOpeningBalance + totalIncome - totalExpenses;

  // Per-account balance summary (shown when "all accounts" selected)
  const accountSummaries = useMemo(() => {
    if (activeAccount || accounts.length === 0) return [];
    return accounts.map((a) => {
      const txns   = allTransactions.filter((t) => t.accountId === a.id);
      const debits = txns.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
      const credits= txns.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
      const balance= (a.openingBalance ?? 0) + credits - debits;
      return { ...a, balance };
    });
  }, [activeAccount, accounts, allTransactions]);

  // Merged color map
  const colorMap = useMemo(() => {
    const map = { ...CATEGORY_COLORS };
    customCategories.forEach((c) => { map[c.name] = c.color; });
    return map;
  }, [customCategories]);

  function getColor(name) {
    if (colorMap[name]) return colorMap[name];
    const used = new Set(Object.values(colorMap));
    const fallback = FALLBACK_COLORS.find((c) => !used.has(c)) ?? "#9ca3af";
    colorMap[name] = fallback;
    return fallback;
  }

  // Group by top-level category only — subcategory detail shown in modal on click
  const byCategory = useMemo(() => {
    const map = {};
    for (const t of filteredExpenses) {
      map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  const byIncomeCategory = useMemo(() => {
    const map = {};
    for (const t of filteredIncome) {
      map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredIncome]);

  // Subcategory breakdown for the selected category (used in modal)
  const categoryDetail = useMemo(() => {
    if (!selectedCategory) return null;
    const source = selectedCategory.isIncome ? filteredIncome : filteredExpenses;
    const txns   = source.filter((t) => t.category === selectedCategory.name);
    const total  = txns.reduce((s, t) => s + t.amount, 0);
    const map    = {};
    for (const t of txns) {
      const key = t.subcategory || null;
      map[key]  = (map[key] || 0) + t.amount;
    }
    const subcats = Object.entries(map)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
    return { total, subcats, count: txns.length };
  }, [selectedCategory, filteredExpenses, filteredIncome]);

  const dateRange = useMemo(() => {
    const dates = filteredTransactions.map((t) => t.date).filter(Boolean);
    if (!dates.length) return null;
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    return `${min.toLocaleDateString()} – ${max.toLocaleDateString()}`;
  }, [filteredTransactions]);

  const saveBalance = () => {
    const val = parseFloat(balanceInput.replace(/[^0-9.\-]/g, ""));
    if (!isNaN(val)) setOpeningBalance(val);
    setEditingBalance(false);
  };

  // Editable whenever no month filter is applied (per-account balance updates via setOpeningBalance)
  const canEditBalance = monthFilter == null;

  return (
    <div className="view">
      <div className="view-header">
        <h2>Dashboard</h2>
        {dateRange && <span className="date-range">{dateRange}</span>}
      </div>

      {/* Month filter */}
      {availableMonths.length > 1 && (
        <div className="month-filter-row">
          <button
            className={`month-pill ${monthFilter == null ? "active" : ""}`}
            onClick={() => setMonthFilter(null)}
          >
            All
          </button>
          {availableMonths.map((m) => (
            <button
              key={m}
              className={`month-pill ${monthFilter === m ? "active" : ""}`}
              onClick={() => setMonthFilter(monthFilter === m ? null : m)}
            >
              {MONTH_NAMES[m]}
            </button>
          ))}
        </div>
      )}

      {/* Per-account balance row (all accounts view) */}
      {accountSummaries.length > 0 && (
        <div className="acct-summary-row">
          {accountSummaries.map((a) => (
            <div key={a.id} className="acct-summary-card">
              <span className="acct-dot-sm" style={{ background: a.color }} />
              <div>
                <div className="acct-summary-name">{a.name}</div>
                <div className={`acct-summary-bal ${a.balance >= 0 ? "pos" : "neg"}`}>{fmt(a.balance)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top section: cards left, donut right */}
      <div className="dashboard-top">
        <div className="cards-col">
          <div className="card card-balance">
            <div className="card-label">
              {monthFilter != null ? `Opening Balance — ${MONTH_NAMES[monthFilter]}` : "Opening Balance"}
            </div>
            {editingBalance && canEditBalance ? (
              <div className="balance-edit-row">
                <span className="balance-prefix">$</span>
                <input
                  className="balance-input"
                  type="number"
                  value={balanceInput}
                  autoFocus
                  onChange={(e) => setBalanceInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveBalance(); if (e.key === "Escape") setEditingBalance(false); }}
                />
                <button className="btn-sm btn-save" onClick={saveBalance}>Set</button>
              </div>
            ) : (
              <div
                className={`card-value ${canEditBalance ? "balance-click" : ""}`}
                onClick={canEditBalance ? () => { setBalanceInput(String(openingBalance)); setEditingBalance(true); } : undefined}
              >
                {fmt(effectiveOpeningBalance)}
                {canEditBalance && <span className="balance-edit-hint"> ✎</span>}
              </div>
            )}
            <div className="card-sub">
              {monthFilter != null ? "calculated from year opening" : "click ✎ to edit"}
            </div>
          </div>
          <div className="card card-expense">
            <div className="card-label">Total Debits (Out)</div>
            <div className="card-value">{fmt(totalExpenses)}</div>
            <div className="card-sub">{filteredExpenses.length} transactions</div>
          </div>
          <div className="card card-income">
            <div className="card-label">Total Credits (In)</div>
            <div className="card-value">{fmt(totalIncome)}</div>
            <div className="card-sub">{filteredIncome.length} transactions</div>
          </div>
          <div className={`card ${currentBalance >= 0 ? "card-positive" : "card-negative"}`}>
            <div className="card-label">Current Balance</div>
            <div className="card-value">{fmt(currentBalance)}</div>
            <div className="card-sub">opening {currentBalance >= effectiveOpeningBalance ? "+" : ""}{fmt(currentBalance - effectiveOpeningBalance)}</div>
          </div>
        </div>

        {/* Donut charts */}
        <div className="dashboard-charts">
          <div className="dashboard-donut">
            <h3>Spending by Category <span className="chart-click-hint">click a slice for details</span></h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="value"
                  nameKey="name"
                  cx="35%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  onClick={(entry) => setSelectedCategory({ name: entry.name, isIncome: false })}
                  style={{ cursor: "pointer" }}
                >
                  {byCategory.map((entry) => (
                    <Cell key={entry.name} fill={getColor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="dashboard-donut">
            <h3>Income by Category <span className="chart-click-hint">click a slice for details</span></h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={byIncomeCategory}
                  dataKey="value"
                  nameKey="name"
                  cx="35%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  onClick={(entry) => setSelectedCategory({ name: entry.name, isIncome: true })}
                  style={{ cursor: "pointer" }}
                >
                  {byIncomeCategory.map((entry) => (
                    <Cell key={entry.name} fill={getColor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top categories table */}
      <div className="section">
        <h3>Top Categories <span className="chart-click-hint">click a row for subcategory details</span></h3>
        <table className="data-table">
          <thead>
            <tr><th>Category</th><th>Amount</th><th>% of Spending</th></tr>
          </thead>
          <tbody>
            {byCategory.map((c) => (
              <tr
                key={c.name}
                className="cat-row-clickable"
                onClick={() => setSelectedCategory({ name: c.name, isIncome: false })}
              >
                <td>
                  <span className="cat-dot" style={{ background: getColor(c.name) }} />
                  {c.name}
                </td>
                <td>{fmt(c.value)}</td>
                <td>{totalExpenses > 0 ? ((c.value / totalExpenses) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Category detail modal */}
      {selectedCategory && categoryDetail && (
        <div className="modal-overlay" onClick={() => setSelectedCategory(null)}>
          <div className="modal modal-cat-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span className="cat-dot-lg" style={{ background: getColor(selectedCategory.name) }} />
              {selectedCategory.name}
              <span className="cat-detail-type">{selectedCategory.isIncome ? "Income" : "Spending"}</span>
            </div>

            <div className="cat-detail-summary">
              <div className="cat-detail-stat">
                <span className="cat-detail-label">Total</span>
                <span className="cat-detail-value">{fmt(categoryDetail.total)}</span>
              </div>
              <div className="cat-detail-stat">
                <span className="cat-detail-label">Transactions</span>
                <span className="cat-detail-value">{categoryDetail.count}</span>
              </div>
            </div>

            {categoryDetail.subcats.some((s) => s.name !== null) ? (
              <>
                <h4 className="cat-detail-subheading">Subcategories</h4>
                <table className="data-table">
                  <thead>
                    <tr><th>Subcategory</th><th>Amount</th><th>% of Category</th></tr>
                  </thead>
                  <tbody>
                    {categoryDetail.subcats.map((s) => (
                      <tr key={s.name ?? "__none__"}>
                        <td>{s.name ?? <em style={{ color: "#b0b0a4" }}>Untagged</em>}</td>
                        <td>{fmt(s.value)}</td>
                        <td>{categoryDetail.total > 0 ? ((s.value / categoryDetail.total) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="cat-detail-empty">No subcategories set — you can add them in the Transactions tab.</p>
            )}

            <div className="modal-actions">
              <button className="btn-sm btn-save" onClick={() => setSelectedCategory(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
