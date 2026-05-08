import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CATEGORY_COLORS } from "../categories.js";

function fmt(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function fmtShort(n) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{d.label}</div>
      <div className="chart-tooltip-val">{fmt(d.total)}</div>
      <div className="chart-tooltip-sub">{d.count} transaction{d.count !== 1 ? "s" : ""}</div>
    </div>
  );
}

export default function TopMerchants({ expenses }) {
  const [monthIdx,         setMonthIdx]         = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedVendor,   setSelectedVendor]   = useState(null); // null = all vendors

  // ── Grid ──────────────────────────────────────────────────────────
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
      map[t.category].count++;
    }
    return Object.values(map)
      .map((c) => ({ ...c, total: parseFloat(c.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses]);

  // Total spend by month across all categories (always all months, used in grid view)
  const totalByMonth = useMemo(() => {
    const map = {};
    for (const t of expenses) {
      if (!t.date) continue;
      const m = t.date.getMonth();
      if (!map[m]) map[m] = { month: m, label: MONTH_NAMES[m], total: 0, count: 0 };
      map[m].total += t.amount;
      map[m].count++;
    }
    return Object.keys(map)
      .map(Number)
      .sort((a, b) => a - b)
      .map((m) => ({ ...map[m], total: parseFloat(map[m].total.toFixed(2)) }));
  }, [expenses]);

  // ── Drill ─────────────────────────────────────────────────────────

  // All vendors (user-assigned subcategory) in this category, sorted by total spend
  const vendorList = useMemo(() => {
    if (!selectedCategory) return [];
    const map = {};
    for (const t of expenses) {
      if (t.category !== selectedCategory || !t.subcategory) continue;
      const key = t.subcategory;
      if (!map[key]) map[key] = { name: key, total: 0, count: 0 };
      map[key].total += t.amount;
      map[key].count++;
    }
    return Object.values(map)
      .map((v) => ({ ...v, total: parseFloat(v.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }, [selectedCategory, expenses]);

  // All months in the category (used as consistent X axis regardless of vendor filter)
  const categoryMonths = useMemo(() => {
    if (!selectedCategory) return [];
    const s = new Set(
      expenses
        .filter((t) => t.category === selectedCategory && t.date != null)
        .map((t) => t.date.getMonth())
    );
    return Array.from(s).sort((a, b) => a - b);
  }, [selectedCategory, expenses]);

  // Bar chart data: monthly totals for the selected vendor (or all vendors)
  const drillData = useMemo(() => {
    if (!selectedCategory) return [];
    const map = {};
    for (const t of expenses) {
      if (t.category !== selectedCategory || !t.date) continue;
      if (selectedVendor !== null && t.subcategory !== selectedVendor) continue;
      const m = t.date.getMonth();
      if (!map[m]) map[m] = { month: m, label: MONTH_NAMES[m], total: 0, count: 0 };
      map[m].total += t.amount;
      map[m].count++;
    }
    // Keep all category months on X axis so the axis stays stable when switching vendors
    return categoryMonths.map((m) =>
      map[m]
        ? { ...map[m], total: parseFloat(map[m].total.toFixed(2)) }
        : { month: m, label: MONTH_NAMES[m], total: 0, count: 0 }
    );
  }, [selectedCategory, selectedVendor, expenses, categoryMonths]);

  const drillTotal = useMemo(() =>
    drillData.reduce((s, d) => s + d.total, 0),
    [drillData]
  );
  const drillCount = useMemo(() =>
    drillData.reduce((s, d) => s + d.count, 0),
    [drillData]
  );

  // ── Handlers ──────────────────────────────────────────────────────
  const sliderMax = availableMonths.length;
  const sliderVal = monthIdx === null ? 0 : availableMonths.indexOf(monthIdx) + 1;
  function handleGridSlider(val) {
    setMonthIdx(val === 0 ? null : availableMonths[val - 1]);
  }

  function handleTileClick(catName) {
    setSelectedCategory(catName);
    setSelectedVendor(null);
  }

  function handleBack() {
    setSelectedCategory(null);
    setSelectedVendor(null);
  }

  const catColor = selectedCategory ? (CATEGORY_COLORS[selectedCategory] || "#9ca3af") : null;

  return (
    <div className="view">
      <div className="view-header">
        {selectedCategory ? (
          <div className="drill-header">
            <button className="btn-back-nav" onClick={handleBack}>← Back</button>
            <h2>{selectedCategory}</h2>
          </div>
        ) : (
          <h2>Spend Analysis</h2>
        )}
      </div>

      {selectedCategory ? (
        /* ── Drill-down view ── */
        <div className="spend-drill">
          {/* Summary tile */}
          <div className="spend-drill-tile" style={{ borderTopColor: catColor }}>
            <div className="spend-cat-name">
              <span className="cat-dot" style={{ background: catColor }} />
              {selectedVendor ?? selectedCategory}
            </div>
            <div className="spend-drill-total">{fmt(drillTotal)}</div>
            <div className="spend-cat-count">
              {drillCount} transaction{drillCount !== 1 ? "s" : ""}
              {selectedVendor && <span className="drill-tile-sub"> · all months</span>}
            </div>
          </div>

          {/* Two-column: chart + vendor list */}
          <div className="spend-drill-layout">
            {/* Left — bar chart */}
            <div className="spend-drill-chart">
              <div className="spend-drill-chart-label">
                {selectedVendor ? selectedVendor : `All vendors · ${selectedCategory}`}
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={drillData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#6b6b62" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtShort}
                    tick={{ fontSize: 10, fill: "#6b6b62" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f0f8f4" }} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} fill={catColor} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Right — vendor list */}
            <div className="spend-vendor-panel">
              <div className="spend-vendor-panel-title">Vendors</div>
              <div className="spend-vendor-list">
                {/* All vendors row */}
                <button
                  className={`spend-vendor-item ${selectedVendor === null ? "active" : ""}`}
                  onClick={() => setSelectedVendor(null)}
                >
                  <span className="spend-vendor-name">All vendors</span>
                  <span className="spend-vendor-total">
                    {fmt(vendorList.reduce((s, v) => s + v.total, 0))}
                  </span>
                </button>

                {vendorList.map((v) => (
                  <button
                    key={v.name}
                    className={`spend-vendor-item ${selectedVendor === v.name ? "active" : ""}`}
                    onClick={() => setSelectedVendor(v.name)}
                  >
                    <span className="spend-vendor-name" title={v.name}>{v.name}</span>
                    <span className="spend-vendor-total">{fmt(v.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Grid view ── */
        <>
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
                onChange={(e) => handleGridSlider(Number(e.target.value))}
              />
              <div className="spend-month-ticks">
                <span>All</span>
                {availableMonths.map((m) => <span key={m}>{MONTH_NAMES[m]}</span>)}
              </div>
            </div>
          )}

          {byCategory.length > 0 ? (
            <div className="spend-category-grid">
              {byCategory.map((c) => (
                <button
                  key={c.name}
                  className="spend-cat-tile"
                  style={{ borderTopColor: CATEGORY_COLORS[c.name] || "#9ca3af" }}
                  onClick={() => handleTileClick(c.name)}
                >
                  <div className="spend-cat-name">
                    <span className="cat-dot" style={{ background: CATEGORY_COLORS[c.name] || "#9ca3af" }} />
                    {c.name}
                  </div>
                  <div className="spend-cat-total">{fmt(c.total)}</div>
                  <div className="spend-cat-count">{c.count} transaction{c.count !== 1 ? "s" : ""}</div>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-hint">No transactions for this period.</p>
          )}

          {totalByMonth.length > 0 && (
            <div className="spend-monthly-chart">
              <div className="spend-monthly-chart-title">Total Spend by Month</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={totalByMonth} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#6b6b62" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtShort}
                    tick={{ fontSize: 10, fill: "#6b6b62" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f0f8f4" }} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="#2a7a58" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
