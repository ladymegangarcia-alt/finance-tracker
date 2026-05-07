import { useMemo, useState } from "react";
import { CATEGORY_COLORS } from "../categories.js";

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function TopMerchants({ expenses }) {
  const [limit,    setLimit]    = useState(15);
  const [monthIdx, setMonthIdx] = useState(null); // null = all, 0–11 = month

  const availableMonths = useMemo(() => {
    const s = new Set(expenses.map((t) => t.date?.getMonth()).filter((m) => m != null));
    return Array.from(s).sort((a, b) => a - b);
  }, [expenses]);

  const filteredExpenses = useMemo(() =>
    monthIdx === null ? expenses : expenses.filter((t) => t.date?.getMonth() === monthIdx),
    [expenses, monthIdx]
  );

  const byCategory = useMemo(() => {
    const map = {};
    for (const t of filteredExpenses) {
      if (!map[t.category]) map[t.category] = { name: t.category, total: 0, count: 0 };
      map[t.category].total += t.amount;
      map[t.category].count += 1;
    }
    return Object.values(map)
      .map((c) => ({ ...c, total: parseFloat(c.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses]);

  const merchants = useMemo(() => {
    const map = {};
    for (const t of filteredExpenses) {
      const key = t.description;
      if (!map[key]) map[key] = { name: key, total: 0, count: 0, category: t.category };
      map[key].total += t.amount;
      map[key].count += 1;
    }
    return Object.values(map)
      .map((m) => ({ ...m, total: parseFloat(m.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses]);

  const shown = merchants.slice(0, limit);

  // Slider: 0 = All, 1…N = each available month
  const sliderMax = availableMonths.length;
  const sliderVal = monthIdx === null ? 0 : availableMonths.indexOf(monthIdx) + 1;

  function handleSlider(val) {
    setMonthIdx(val === 0 ? null : availableMonths[val - 1]);
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>Spend Analysis</h2>
      </div>

      {/* Month slider */}
      {availableMonths.length > 1 && (
        <div className="spend-month-filter">
          <div className="spend-month-label">
            {monthIdx === null ? "All months" : MONTH_FULL[monthIdx]}
          </div>
          <input
            type="range"
            className="month-slider"
            min={0}
            max={sliderMax}
            value={sliderVal}
            onChange={(e) => handleSlider(Number(e.target.value))}
          />
          <div className="spend-month-ticks">
            <span>All</span>
            {availableMonths.map((m) => (
              <span key={m}>{MONTH_NAMES[m]}</span>
            ))}
          </div>
        </div>
      )}

      {/* Category tiles */}
      {byCategory.length > 0 ? (
        <div className="spend-category-grid">
          {byCategory.map((c) => (
            <div
              key={c.name}
              className="spend-cat-tile"
              style={{ borderTopColor: CATEGORY_COLORS[c.name] || "#9ca3af" }}
            >
              <div className="spend-cat-name">
                <span className="cat-dot" style={{ background: CATEGORY_COLORS[c.name] || "#9ca3af" }} />
                {c.name}
              </div>
              <div className="spend-cat-total">{fmt(c.total)}</div>
              <div className="spend-cat-count">{c.count} transaction{c.count !== 1 ? "s" : ""}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-hint">No transactions for this period.</p>
      )}

      {/* Merchant table */}
      <div className="section" style={{ marginTop: 32 }}>
        <div className="section-header-row">
          <h3>All Merchants ({merchants.length})</h3>
          <select className="limit-select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={10}>Top 10</option>
            <option value={15}>Top 15</option>
            <option value={25}>Top 25</option>
            <option value={50}>Top 50</option>
            <option value={99999}>All</option>
          </select>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th><th>Merchant</th><th>Category</th><th>Times</th><th>Total</th><th>Avg/Visit</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m, i) => (
              <tr key={m.name}>
                <td className="mono" style={{ color: "#aaa" }}>{i + 1}</td>
                <td>{m.name}</td>
                <td>
                  <span className="cat-dot" style={{ background: CATEGORY_COLORS[m.category] || "#9ca3af" }} />
                  {m.category}
                </td>
                <td>{m.count}</td>
                <td>{fmt(m.total)}</td>
                <td>{fmt(m.total / m.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
