import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CATEGORY_COLORS } from "../categories.js";

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function ByCategory({ expenses }) {
  const [selected, setSelected] = useState(null);

  const byCategory = useMemo(() => {
    const map = {};
    for (const t of expenses) {
      if (!map[t.category]) map[t.category] = { total: 0, count: 0, transactions: [] };
      map[t.category].total += t.amount;
      map[t.category].count += 1;
      map[t.category].transactions.push(t);
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, total: parseFloat(v.total.toFixed(2)), count: v.count, transactions: v.transactions }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const total = useMemo(() => byCategory.reduce((s, c) => s + c.total, 0), [byCategory]);

  const selectedData = selected ? byCategory.find((c) => c.name === selected) : null;

  return (
    <div className="view">
      <div className="view-header"><h2>Spending by Category</h2></div>

      <div className="section">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={byCategory} onClick={(d) => d && setSelected(d.activePayload?.[0]?.payload?.name)}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
            <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
              {byCategory.map((entry) => (
                <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#9ca3af"} opacity={selected && selected !== entry.name ? 0.4 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {selected && <p className="chart-hint">Showing detail for <strong>{selected}</strong>. Click a bar to change selection.</p>}
      </div>

      <div className="section">
        <h3>All Categories</h3>
        <table className="data-table">
          <thead>
            <tr><th>Category</th><th>Amount</th><th>Transactions</th><th>% of Total</th></tr>
          </thead>
          <tbody>
            {byCategory.map((c) => (
              <tr
                key={c.name}
                className={selected === c.name ? "row-selected" : ""}
                onClick={() => setSelected(selected === c.name ? null : c.name)}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <span className="cat-dot" style={{ background: CATEGORY_COLORS[c.name] }} />
                  {c.name}
                </td>
                <td>{fmt(c.total)}</td>
                <td>{c.count}</td>
                <td>{total > 0 ? ((c.total / total) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drill-down transactions for selected category */}
      {selectedData && (
        <div className="section">
          <h3>{selectedData.name} — Transactions</h3>
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {selectedData.transactions
                .sort((a, b) => (b.date || 0) - (a.date || 0))
                .map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.date ? t.date.toLocaleDateString() : t.dateStr}</td>
                    <td>{t.description}</td>
                    <td>{fmt(t.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
