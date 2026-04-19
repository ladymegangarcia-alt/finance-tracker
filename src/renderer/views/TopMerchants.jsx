import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CATEGORY_COLORS } from "../categories.js";

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function TopMerchants({ expenses }) {
  const [limit, setLimit] = useState(15);

  const merchants = useMemo(() => {
    const map = {};
    for (const t of expenses) {
      const key = t.description;
      if (!map[key]) map[key] = { name: key, total: 0, count: 0, category: t.category };
      map[key].total += t.amount;
      map[key].count += 1;
    }
    return Object.values(map)
      .map((m) => ({ ...m, total: parseFloat(m.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const shown = merchants.slice(0, limit);

  return (
    <div className="view">
      <div className="view-header"><h2>Top Merchants</h2></div>

      <div className="section">
        <h3>Top {Math.min(limit, shown.length)} by Spend</h3>
        <ResponsiveContainer width="100%" height={Math.max(200, shown.length * 28)}>
          <BarChart data={shown} layout="vertical" margin={{ left: 180, right: 40 }}>
            <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={176} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Bar dataKey="total" radius={[0, 4, 4, 0]}>
              {shown.map((entry) => (
                <Cell key={entry.name} fill={CATEGORY_COLORS[entry.category] || "#9ca3af"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="section">
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
            <tr><th>#</th><th>Merchant</th><th>Category</th><th>Times</th><th>Total</th><th>Avg/Visit</th></tr>
          </thead>
          <tbody>
            {shown.map((m, i) => (
              <tr key={m.name}>
                <td className="mono" style={{ color: "#aaa" }}>{i + 1}</td>
                <td>{m.name}</td>
                <td>
                  <span className="cat-dot" style={{ background: CATEGORY_COLORS[m.category] }} />
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
