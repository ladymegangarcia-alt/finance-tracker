import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { CATEGORY_COLORS } from "../categories.js";

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function monthKey(date) {
  if (!date) return "Unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  if (key === "Unknown") return key;
  const [y, m] = key.split("-");
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

export default function OverTime({ expenses }) {
  const monthlyTotal = useMemo(() => {
    const map = {};
    for (const t of expenses) {
      const key = monthKey(t.date);
      map[key] = (map[key] || 0) + t.amount;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, total]) => ({ month: monthLabel(key), total: parseFloat(total.toFixed(2)) }));
  }, [expenses]);

  const monthlyByCategory = useMemo(() => {
    const map = {};
    const cats = new Set();
    for (const t of expenses) {
      const key = monthKey(t.date);
      if (!map[key]) map[key] = {};
      map[key][t.category] = (map[key][t.category] || 0) + t.amount;
      cats.add(t.category);
    }
    const months = Object.keys(map).sort();
    const rows = months.map((key) => {
      const row = { month: monthLabel(key) };
      for (const cat of cats) row[cat] = parseFloat((map[key][cat] || 0).toFixed(2));
      return row;
    });
    return { rows, categories: Array.from(cats) };
  }, [expenses]);

  const avg = useMemo(() => {
    if (!monthlyTotal.length) return 0;
    return monthlyTotal.reduce((s, m) => s + m.total, 0) / monthlyTotal.length;
  }, [monthlyTotal]);

  return (
    <div className="view">
      <div className="view-header"><h2>Spending Over Time</h2></div>

      <div className="section">
        <h3>Monthly Total Spending</h3>
        {monthlyTotal.length > 0 && (
          <p className="chart-hint">Monthly average: <strong>{fmt(avg)}</strong></p>
        )}
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlyTotal}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="section">
        <h3>Spending by Category Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyByCategory.rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Legend />
            {monthlyByCategory.categories.map((cat) => (
              <Line
                key={cat}
                type="monotone"
                dataKey={cat}
                stroke={CATEGORY_COLORS[cat] || "#9ca3af"}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="section">
        <h3>Month by Month</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Total Spent</th>
              <th>vs Average</th>
            </tr>
          </thead>
          <tbody>
            {monthlyTotal.map((m) => {
              const diff = m.total - avg;
              return (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td>{fmt(m.total)}</td>
                  <td style={{ color: diff > 0 ? "#dc2626" : "#16a34a" }}>
                    {diff > 0 ? "+" : ""}{fmt(diff)}
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
