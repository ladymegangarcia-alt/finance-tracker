import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_COLORS } from "../categories.js";

export default function Categories({
  transactions,
  customCategories,
  subcategories,
  renameCategory,
  renameSubcategory,
  deleteSubcategory,
  addSubcategory,
}) {
  // { type: "category"|"subcategory", category, name } — which item is being edited
  const [editing,   setEditing]   = useState(null);
  const [editText,  setEditText]  = useState("");
  // Which categories are expanded to show subcategories
  const [expanded,  setExpanded]  = useState(new Set());
  // New subcategory inline add
  const [addingFor, setAddingFor] = useState(null); // category name
  const [addText,   setAddText]   = useState("");

  const builtInSet = useMemo(() => new Set(CATEGORIES), []);
  const customSet  = useMemo(() => new Set(customCategories.map((c) => c.name)), [customCategories]);

  // All categories that appear in transactions OR are defined
  const allCategoryNames = useMemo(() => {
    const fromTxns = new Set(transactions.map((t) => t.category).filter(Boolean));
    const defined  = new Set([...CATEGORIES, ...customCategories.map((c) => c.name)]);
    return Array.from(new Set([...defined, ...fromTxns])).sort();
  }, [transactions, customCategories]);

  // Subcategories per category: merge store + transaction data
  const subcatsByCategory = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      if (!t.subcategory) continue;
      if (!map[t.category]) map[t.category] = new Set();
      map[t.category].add(t.subcategory);
    }
    for (const [cat, names] of Object.entries(subcategories)) {
      if (!map[cat]) map[cat] = new Set();
      names.forEach((n) => map[cat].add(n));
    }
    return Object.fromEntries(
      Object.entries(map).map(([k, v]) => [k, Array.from(v).sort()])
    );
  }, [transactions, subcategories]);

  function colorFor(name) {
    return CATEGORY_COLORS[name] ?? customCategories.find((c) => c.name === name)?.color ?? "#9ca3af";
  }

  function startEdit(type, category, name) {
    setEditing({ type, category, name });
    setEditText(name);
  }

  function confirmEdit() {
    if (!editing) return;
    if (editing.type === "category") {
      renameCategory(editing.name, editText);
    } else {
      renameSubcategory(editing.category, editing.name, editText);
    }
    setEditing(null);
    setEditText("");
  }

  function cancelEdit() { setEditing(null); setEditText(""); }

  function toggleExpand(cat) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  function confirmAddSubcat(cat) {
    const name = addText.trim();
    if (name) addSubcategory(cat, name);
    setAddingFor(null);
    setAddText("");
  }

  // Usage count per category
  const catCounts = useMemo(() => {
    const map = {};
    for (const t of transactions) map[t.category] = (map[t.category] || 0) + 1;
    return map;
  }, [transactions]);

  return (
    <div className="view">
      <div className="view-header">
        <h2>Categories</h2>
      </div>
      <p className="cats-intro">
        Click <strong>✎</strong> to rename a category or subcategory — all matching transactions update automatically.
        Built-in categories <span className="cats-system-badge">system</span> are used for auto-detection on import.
      </p>

      <div className="cats-list">
        {allCategoryNames.map((cat) => {
          const subcats   = subcatsByCategory[cat] || [];
          const isSystem  = builtInSet.has(cat) && !customSet.has(cat);
          const isOpen    = expanded.has(cat);
          const count     = catCounts[cat] || 0;
          const isEditCat = editing?.type === "category" && editing.name === cat;

          return (
            <div key={cat} className="cat-card">
              {/* Category row */}
              <div className="cat-card-header">
                <span className="cat-dot-lg" style={{ background: colorFor(cat) }} />

                {isEditCat ? (
                  <div className="cat-edit-row">
                    <input
                      className="cat-edit-input"
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")  confirmEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    <button className="btn-sm btn-save" onClick={confirmEdit}>Save</button>
                    <button className="btn-sm" onClick={cancelEdit}>Cancel</button>
                  </div>
                ) : (
                  <span className="cat-card-name">{cat}</span>
                )}

                <div className="cat-card-meta">
                  {isSystem && <span className="cats-system-badge">system</span>}
                  <span className="cat-txn-count">{count} txn{count !== 1 ? "s" : ""}</span>
                </div>

                <div className="cat-card-actions">
                  {!isEditCat && (
                    <button
                      className="btn-icon"
                      title="Rename category"
                      onClick={() => startEdit("category", cat, cat)}
                    >✎</button>
                  )}
                  {subcats.length > 0 && (
                    <button
                      className="btn-icon"
                      title={isOpen ? "Hide subcategories" : "Show subcategories"}
                      onClick={() => toggleExpand(cat)}
                    >
                      {isOpen ? "▲" : "▼"}
                    </button>
                  )}
                  <button
                    className="btn-icon btn-icon-add"
                    title="Add subcategory"
                    onClick={() => { setAddingFor(cat); setAddText(""); setExpanded((p) => new Set([...p, cat])); }}
                  >＋</button>
                </div>
              </div>

              {/* Subcategories */}
              {(isOpen || addingFor === cat) && (
                <div className="subcat-list">
                  {subcats.map((sub) => {
                    const isEditSub = editing?.type === "subcategory" && editing.category === cat && editing.name === sub;
                    const subCount  = transactions.filter((t) => t.category === cat && t.subcategory === sub).length;
                    return (
                      <div key={sub} className="subcat-row">
                        <span className="subcat-indent">└</span>

                        {isEditSub ? (
                          <div className="cat-edit-row">
                            <input
                              className="cat-edit-input"
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")  confirmEdit();
                                if (e.key === "Escape") cancelEdit();
                              }}
                            />
                            <button className="btn-sm btn-save" onClick={confirmEdit}>Save</button>
                            <button className="btn-sm" onClick={cancelEdit}>Cancel</button>
                          </div>
                        ) : (
                          <span className="subcat-name">{sub}</span>
                        )}

                        <span className="cat-txn-count">{subCount} txn{subCount !== 1 ? "s" : ""}</span>

                        {!isEditSub && (
                          <div className="cat-card-actions">
                            <button className="btn-icon" title="Rename" onClick={() => startEdit("subcategory", cat, sub)}>✎</button>
                            <button
                              className="btn-icon btn-icon-del"
                              title="Delete subcategory"
                              onClick={() => {
                                if (window.confirm(`Remove subcategory "${sub}" from all ${subCount} transaction(s)?`))
                                  deleteSubcategory(cat, sub);
                              }}
                            >✕</button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Inline add */}
                  {addingFor === cat && (
                    <div className="subcat-row subcat-add-row">
                      <span className="subcat-indent">└</span>
                      <input
                        className="cat-edit-input"
                        autoFocus
                        placeholder="New subcategory name…"
                        value={addText}
                        onChange={(e) => setAddText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")  confirmAddSubcat(cat);
                          if (e.key === "Escape") { setAddingFor(null); setAddText(""); }
                        }}
                      />
                      <button className="btn-sm btn-save" onClick={() => confirmAddSubcat(cat)}>Add</button>
                      <button className="btn-sm" onClick={() => { setAddingFor(null); setAddText(""); }}>Cancel</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
