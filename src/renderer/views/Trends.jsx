import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { CATEGORY_COLORS } from "../categories.js";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function monthKey(date) {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1]} '${y.slice(2)}`;
}

// Distinct colors for subcategory lines beyond the category palette
const EXTRA_COLORS = [
  "#6366f1","#ec4899","#f97316","#0ea5e9","#8b5cf6",
  "#14b8a6","#a16207","#db2777","#0284c7","#7c3aed",
];

export default function Trends({ expenses, income }) {
  const [mode, setMode] = useState("spending"); // "spending" | "income"
  const [activeCategories, setActiveCategories] = useState(null); // null = all selected

  const transactions = mode === "spending" ? expenses : income;

  // Build all months in sorted order
  const allMonths = useMemo(() => {
    const keys = new Set();
    for (const t of transactions) {
      const k = monthKey(t.date);
      if (k) keys.add(k);
    }
    return Array.from(keys).sort();
  }, [transactions]);

  // Build series: one entry per category (or category › subcategory)
  const { chartData, seriesList } = useMemo(() => {
    const seriesMap = {}; // key → { label, color, totals: { [monthKey]: amount } }
    let colorIndex = 0;

    for (const t of transactions) {
      const k = monthKey(t.date);
      if (!k) continue;
      const seriesKey = t.subcategory
        ? `${t.category} › ${t.subcategory}`
        : t.category;
      if (!seriesMap[seriesKey]) {
        const baseColor = CATEGORY_COLORS[t.category];
        seriesMap[seriesKey] = {
          label: seriesKey,
          color: t.subcategory
            ? EXTRA_COLORS[colorIndex++ % EXTRA_COLORS.length]
            : baseColor || "#9ca3af",
          totals: {},
        };
      }
      seriesMap[seriesKey].totals[k] = (seriesMap[seriesKey].totals[k] || 0) + t.amount;
    }

    const seriesList = Object.entries(seriesMap)
      .map(([key, s]) => ({ key, ...s }))
      .sort((a, b) => {
        // Sort by total descending
        const sumA = Object.values(a.totals).reduce((s, v) => s + v, 0);
        const sumB = Object.values(b.totals).reduce((s, v) => s + v, 0);
        return sumB - sumA;
      });

    // Build chart rows — one per month
    const chartData = allMonths.map((mk) => {
      const row = { month: monthLabel(mk), monthKey: mk };
      for (const s of seriesList) {
        row[s.key] = parseFloat((s.totals[mk] || 0).toFixed(2));
      }
      return row;
    });

    return { chartData, seriesList };
  }, [transactions, allMonths]);

  // Which categories are actually toggled on
  const selected = activeCategories ?? new Set(seriesList.map((s) => s.key));

  function toggleCategory(key) {
    const next = new Set(selected);
    if (next.has(key)) {
      if (next.size === 1) return; // keep at least one
      next.delete(key);
    } else {
      next.add(key);
    }
    setActiveCategories(next);
  }

  function selectAll() { setActiveCategories(null); }
  function selectOne(key) { setActiveCategories(new Set([key])); }

  // Summary table: category totals + monthly average
  const summaryRows = useMemo(() => {
    return seriesList
      .filter((s) => selected.has(s.key))
      .map((s) => {
        const monthsWithData = Object.values(s.totals).filter((v) => v > 0).length;
        const total = Object.values(s.totals).reduce((sum, v) => sum + v, 0);
        const avg = monthsWithData ? total / monthsWithData : 0;
        const peak = Math.max(...Object.values(s.totals));
        const peakMonth = allMonths.find((mk) => (s.totals[mk] || 0) === peak);
        return {
          label: s.label,
          color: s.color,
          total,
          avg,
          peak,
          peakMonth: peakMonth ? monthLabel(peakMonth) : "—",
          months: monthsWithData,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [seriesList, selected, allMonths]);

  if (!allMonths.length) {
    return (
      <div className="view">
        <div className="view-header"><h2>Trends</h2></div>
        <p className="empty-msg">No data to display.</p>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>Trends</h2>
        {/* Spending / Income toggle */}
        <div className="trends-mode-toggle">
          <button
            className={`trends-mode-btn ${mode === "spending" ? "active" : ""}`}
            onClick={() => { setMode("spending"); setActiveCategories(null); }}
          >
            Spending
          </button>
          <button
            className={`trends-mode-btn ${mode === "income" ? "active" : ""}`}
            onClick={() => { setMode("income"); setActiveCategories(null); }}
          >
            Income
          </button>
        </div>
      </div>

      {/* Category toggle pills */}
      <div className="trends-pills-row">
        <button className="trends-pill-all" onClick={selectAll}>All</button>
        {seriesList.map((s) => (
          <button
            key={s.key}
            className={`trends-pill ${selected.has(s.key) ? "active" : ""}`}
            style={selected.has(s.key) ? { background: s.color, borderColor: s.color } : {}}
            onClick={() => toggleCategory(s.key)}
            onDoubleClick={() => selectOne(s.key)}
            title="Click to toggle · Double-click to isolate"
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="trends-pill-hint">Click to toggle · Double-click to isolate one</p>

      {/* Multi-line chart */}
      <div className="section">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} width={70} />
            <Tooltip
              formatter={(v, name) => [fmt(v), name]}
              contentStyle={{ fontSize: "0.82rem" }}
            />
            {seriesList
              .filter((s) => selected.has(s.key))
              .map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: s.color }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div className="section">
        <h3>{mode === "spending" ? "Spending" : "Income"} Summary by Category</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Total</th>
              <th>Monthly Avg</th>
              <th>Peak Month</th>
              <th>Peak Amount</th>
              <th>Months Active</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => (
              <tr key={row.label}>
                <td>
                  <span className="trends-cat-dot" style={{ background: row.color }} />
                  {row.label}
                </td>
                <td>{fmt(row.total)}</td>
                <td>{fmt(row.avg)}</td>
                <td>{row.peakMonth}</td>
                <td>{fmt(row.peak)}</td>
                <td>{row.months}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
