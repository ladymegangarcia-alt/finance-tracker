import { useState, useCallback, useRef, useMemo } from "react";
import Logo from '../components/Logo';
import { parseStatementCSV } from "./parseCSV.js";
import Dashboard from "./views/Dashboard.jsx";
import ByCategory from "./views/ByCategory.jsx";
import OverTime from "./views/OverTime.jsx";
import TopMerchants from "./views/TopMerchants.jsx";
import Budgets from "./views/Budgets.jsx";
import Transactions from "./views/Transactions.jsx";
import Reconciled from "./views/Reconciled.jsx";
import Accounts from "./views/Accounts.jsx";
import Trends from "./views/Trends.jsx";
import Categories from "./views/Categories.jsx";
import HelpModal from "./views/HelpModal.jsx";
import WelcomeOverlay from "./views/WelcomeOverlay.jsx";
import "./App.css";


const ACCOUNT_COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#ef4444","#0ea5e9","#8b5cf6","#f97316","#14b8a6","#a16207"];

// ── localStorage helpers ──────────────────────────────────────────
function loadStored() {
  try {
    const txns          = JSON.parse(localStorage.getItem("ft-transactions")      || "[]");
    const files         = JSON.parse(localStorage.getItem("ft-files")             || "[]");
    const budgets       = JSON.parse(localStorage.getItem("ft-budgets")           || "{}");
    const openingBalance = JSON.parse(localStorage.getItem("ft-opening-balance")  || "0");
    const customCats    = JSON.parse(localStorage.getItem("ft-custom-categories") || "[]");
    const accounts      = JSON.parse(localStorage.getItem("ft-accounts")          || "[]");
    const subcategories = JSON.parse(localStorage.getItem("ft-subcategories")     || "{}");
    txns.forEach((t) => {
      t.date = t.dateStr ? new Date(t.dateStr) : null;
      if (!t.type) t.type = t.amount >= 0 ? "credit" : "debit";
      t.amount = Math.abs(t.amount);
    });
    return { txns, files, budgets, openingBalance, customCats, accounts, subcategories };
  } catch {
    return { txns: [], files: [], budgets: {}, openingBalance: 0, customCats: [], accounts: [], subcategories: {} };
  }
}

function saveStored(txns, files, budgets, openingBalance, accounts) {
  const lean = txns.map(({ rawRow, ...t }) => t);
  localStorage.setItem("ft-transactions",      JSON.stringify(lean));
  localStorage.setItem("ft-files",             JSON.stringify(files));
  localStorage.setItem("ft-budgets",           JSON.stringify(budgets));
  localStorage.setItem("ft-opening-balance",   JSON.stringify(openingBalance ?? 0));
  localStorage.setItem("ft-accounts",          JSON.stringify(accounts ?? []));
}

function dateRangeOf(txns) {
  const dates = txns.map((t) => t.date).filter(Boolean);
  if (!dates.length) return null;
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  return { min, max, label: `${min.toLocaleDateString()} – ${max.toLocaleDateString()}` };
}

function availableYears(txns) {
  const years = new Set(txns.map((t) => t.date?.getFullYear()).filter(Boolean));
  return Array.from(years).sort((a, b) => b - a);
}

// ── Component ─────────────────────────────────────────────────────
const stored = loadStored();

export default function App() {
  const [allTransactions,  setAllTransactions]  = useState(stored.txns);
  const [loadedFiles,      setLoadedFiles]      = useState(stored.files);
  const [budgets,          setBudgetsState]     = useState(stored.budgets);
  const [openingBalance,   setOpeningBalanceState] = useState(stored.openingBalance ?? 0);
  const [customCategories, setCustomCategories] = useState(stored.customCats);
  const [subcategories,    setSubcategoriesState] = useState(stored.subcategories ?? {});
  const [accountsRaw,      setAccountsRaw]      = useState(stored.accounts ?? []);
  const accountsRef = useRef(stored.accounts ?? []); // always-current ref for stale closure fix

  const [error,          setError]          = useState(null);
  const [warning,        setWarning]        = useState(null);
  const [tab,            setTab]            = useState("dashboard");
  const [dragging,       setDragging]       = useState(false);
  const [yearFilter,     setYearFilter]     = useState(() => {
    const years = availableYears(stored.txns);
    return years[0] ?? new Date().getFullYear();
  });
  const [accountFilter,  setAccountFilter]  = useState("all"); // "all" | accountId
  const [pendingFile,    setPendingFile]    = useState(null);  // File waiting for account pick
  const [showHelp,       setShowHelp]       = useState(false);
  const [showWelcome,    setShowWelcome]    = useState(() => !localStorage.getItem("ft-welcomed"));
  const [addTxnTrigger,  setAddTxnTrigger]  = useState(0);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroup = (id) =>
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  // Import modal state
  const [importAccountId, setImportAccountId] = useState(null);
  const [importNewName,   setImportNewName]   = useState("");
  const [importNewType,   setImportNewType]   = useState("checking");

  const fileInputRef   = useRef(null);
  const importDataRef  = useRef(null);


  // ── Accounts ────────────────────────────────────────────────────
  const setAccounts = useCallback((fn) => {
    setAccountsRaw((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      accountsRef.current = next; // keep ref in sync
      localStorage.setItem("ft-accounts", JSON.stringify(next));
      return next;
    });
  }, []);

  const accounts = accountsRaw; // alias for readability

  const addAccount = useCallback((name, type, openingBal = 0, last4 = "") => {
    const id = `acct-${Date.now()}`;
    const color = ACCOUNT_COLORS[accountsRef.current.length % ACCOUNT_COLORS.length];
    setAccounts((prev) => [...prev, { id, name, type, openingBalance: openingBal, color, last4 }]);
    return id; // synchronous — ref updated immediately inside setAccounts
  }, [setAccounts]);

  const updateAccount = useCallback((id, changes) => {
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, ...changes } : a));
  }, [setAccounts]);

  const deleteAccount = useCallback((id) => {
    const linked = loadedFiles.filter((f) => f.accountId === id).length;
    if (linked > 0) {
      setError(`Remove the ${linked} linked file(s) before deleting this account.`);
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    if (accountFilter === id) setAccountFilter("all");
  }, [loadedFiles, accountFilter, setAccounts]);

  // Active account (null when "all")
  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === accountFilter) ?? null,
    [accounts, accountFilter]
  );

  // ── Budgets / opening balance ────────────────────────────────────
  const setBudgets = useCallback((fn) => {
    setBudgetsState((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      localStorage.setItem("ft-budgets", JSON.stringify(next));
      return next;
    });
  }, []);

  const setOpeningBalance = useCallback((val) => {
    if (activeAccount) {
      updateAccount(activeAccount.id, { openingBalance: val });
    } else {
      setOpeningBalanceState(val);
      localStorage.setItem("ft-opening-balance", JSON.stringify(val));
    }
  }, [activeAccount, updateAccount]);

  // ── Custom categories ────────────────────────────────────────────
  const CUSTOM_CAT_COLORS = ["#ef4444","#10b981","#f472b6","#38bdf8","#a3e635","#fbbf24","#34d399","#60a5fa","#fb923c","#a78bfa","#e11d48","#06b6d4"];

  const addCustomCategory = useCallback((name, type) => {
    setCustomCategories((prev) => {
      const color = CUSTOM_CAT_COLORS[prev.length % CUSTOM_CAT_COLORS.length];
      const updated = [...prev, { name, type, color }];
      localStorage.setItem("ft-custom-categories", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const addSubcategory = useCallback((category, name) => {
    setSubcategoriesState((prev) => {
      const existing = prev[category] || [];
      if (existing.includes(name)) return prev;
      const updated = { ...prev, [category]: [...existing, name].sort() };
      localStorage.setItem("ft-subcategories", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const renameCategory = useCallback((oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    // Update all transactions
    const updatedTxns = allTransactions.map((t) =>
      t.category === oldName ? { ...t, category: trimmed } : t
    );
    setAllTransactions(updatedTxns);
    saveStored(updatedTxns, loadedFiles, budgets, openingBalance, accountsRef.current);
    // Move subcategories key
    setSubcategoriesState((prev) => {
      const next = { ...prev };
      if (next[oldName]) { next[trimmed] = next[oldName]; delete next[oldName]; }
      localStorage.setItem("ft-subcategories", JSON.stringify(next));
      return next;
    });
    // Update custom category name
    setCustomCategories((prev) => {
      const next = prev.map((c) => c.name === oldName ? { ...c, name: trimmed } : c);
      localStorage.setItem("ft-custom-categories", JSON.stringify(next));
      return next;
    });
    // Move budget key
    setBudgetsState((prev) => {
      if (!prev[oldName]) return prev;
      const next = { ...prev, [trimmed]: prev[oldName] };
      delete next[oldName];
      localStorage.setItem("ft-budgets", JSON.stringify(next));
      return next;
    });
  }, [allTransactions, loadedFiles, budgets, openingBalance]);

  const renameSubcategory = useCallback((category, oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const updatedTxns = allTransactions.map((t) =>
      t.category === category && t.subcategory === oldName ? { ...t, subcategory: trimmed } : t
    );
    setAllTransactions(updatedTxns);
    saveStored(updatedTxns, loadedFiles, budgets, openingBalance, accountsRef.current);
    setSubcategoriesState((prev) => {
      const next = { ...prev, [category]: (prev[category] || []).map((s) => s === oldName ? trimmed : s).sort() };
      localStorage.setItem("ft-subcategories", JSON.stringify(next));
      return next;
    });
  }, [allTransactions, loadedFiles, budgets, openingBalance]);

  const deleteSubcategory = useCallback((category, name) => {
    const updatedTxns = allTransactions.map((t) =>
      t.category === category && t.subcategory === name ? { ...t, subcategory: undefined } : t
    );
    setAllTransactions(updatedTxns);
    saveStored(updatedTxns, loadedFiles, budgets, openingBalance, accountsRef.current);
    setSubcategoriesState((prev) => {
      const next = { ...prev, [category]: (prev[category] || []).filter((s) => s !== name) };
      localStorage.setItem("ft-subcategories", JSON.stringify(next));
      return next;
    });
  }, [allTransactions, loadedFiles, budgets, openingBalance]);

  // ── Transfers ────────────────────────────────────────────────────
  const createTransfer = useCallback((fromAccountId, toAccountId, amount, date, note) => {
    const transferId = `xfer-${Date.now()}`;
    const dateObj = date ? new Date(date) : new Date();
    const dateStr = dateObj.toISOString().split("T")[0];
    const fromName = accountsRef.current.find((a) => a.id === fromAccountId)?.name ?? "account";
    const toName   = accountsRef.current.find((a) => a.id === toAccountId)?.name   ?? "account";
    const outTxn = {
      id: `${transferId}-out`,
      fileId: null, accountId: fromAccountId, transferId, transferPeer: toAccountId,
      date: dateObj, dateStr,
      description: note || `Transfer to ${toName}`,
      amount: Math.abs(amount), type: "debit", category: "Transfer",
    };
    const inTxn = {
      id: `${transferId}-in`,
      fileId: null, accountId: toAccountId, transferId, transferPeer: fromAccountId,
      date: dateObj, dateStr,
      description: note || `Transfer from ${fromName}`,
      amount: Math.abs(amount), type: "credit", category: "Transfer",
    };
    const updatedTxns = [...allTransactions, outTxn, inTxn];
    setAllTransactions(updatedTxns);
    saveStored(updatedTxns, loadedFiles, budgets, openingBalance, accountsRef.current);
  }, [allTransactions, loadedFiles, budgets, openingBalance]);

  const deleteTransfer = useCallback((transferId) => {
    const updatedTxns = allTransactions.filter((t) => t.transferId !== transferId);
    setAllTransactions(updatedTxns);
    saveStored(updatedTxns, loadedFiles, budgets, openingBalance, accountsRef.current);
  }, [allTransactions, loadedFiles, budgets, openingBalance]);

  // Link an existing imported transaction to a peer account as a transfer.
  // Modifies the existing txn in-place and creates a synthetic mirror on the peer account.
  const linkTransfer = useCallback((txnId, peerAccountId, category = "Transfer") => {
    const transferId = `xfer-${Date.now()}`;
    setAllTransactions((prev) => {
      const existing = prev.find((t) => t.id === txnId);
      if (!existing) return prev;
      const thisName = accountsRef.current.find((a) => a.id === existing.accountId)?.name ?? "account";
      const thisAcct = accountsRef.current.find((a) => a.id === existing.accountId);
      // CC payment initiated from the CC account side: both sides are "debit" (both balances decrease)
      const isCCPaymentFromCC = category === "CC Payment" && thisAcct?.type === "credit" && existing.type === "debit";
      const mirrorType = isCCPaymentFromCC ? "debit" : (existing.type === "debit" ? "credit" : "debit");
      const mirrorDesc = category === "CC Payment"
        ? (existing.type === "debit" ? `CC Payment from ${thisName}` : `CC Payment to ${thisName}`)
        : (existing.type === "debit" ? `Transfer from ${thisName}` : `Transfer to ${thisName}`);
      const mirror = {
        id: `${transferId}-mirror`,
        fileId: null,
        accountId: peerAccountId,
        transferId,
        transferPeer: existing.accountId,
        date: existing.date,
        dateStr: existing.dateStr,
        description: mirrorDesc,
        amount: existing.amount,
        type: mirrorType,
        category,
      };
      const updated = prev
        .map((t) => t.id === txnId ? { ...t, transferId, transferPeer: peerAccountId, category } : t)
        .concat([mirror]);
      saveStored(updated, loadedFiles, budgets, openingBalance, accountsRef.current);
      return updated;
    });
  }, [loadedFiles, budgets, openingBalance]);

  // ── Transaction updates ──────────────────────────────────────────
  const bulkUpdateTransactions = useCallback((edits) => {
    setAllTransactions((prev) => {
      const updated = prev.map((t) => {
        const e = edits[t.id];
        if (!e) return t;
        return { ...t, ...e, amount: Math.abs(t.amount) };
      });
      saveStored(updated, loadedFiles, budgets, openingBalance, accountsRef.current);
      return updated;
    });
  }, [loadedFiles, budgets, openingBalance]);

  const deleteTransaction = useCallback((id) => {
    setAllTransactions((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      saveStored(updated, loadedFiles, budgets, openingBalance, accountsRef.current);
      return updated;
    });
  }, [loadedFiles, budgets, openingBalance]);

  const addTransaction = useCallback((txn) => {
    const transaction = {
      ...txn,
      id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      amount: Math.abs(txn.amount),
      date: txn.date ? new Date(txn.date) : null,
      dateStr: txn.dateStr ?? (txn.date ? txn.date.toISOString().split("T")[0] : ""),
      fileId: txn.fileId ?? null,
    };
    const updatedTxns = [...allTransactions, transaction];
    setAllTransactions(updatedTxns);
    saveStored(updatedTxns, loadedFiles, budgets, openingBalance, accountsRef.current);
    if (transaction.date) setYearFilter(transaction.date.getFullYear());
    setTab("transactions");
  }, [allTransactions, loadedFiles, budgets, openingBalance]);

  // ── Filtered transactions ────────────────────────────────────────
  const transactions = useMemo(
    () => allTransactions.filter((t) => {
      const yearOk = !t.date || t.date.getFullYear() === yearFilter;
      const acctOk = accountFilter === "all" || t.accountId === accountFilter;
      return yearOk && acctOk;
    }),
    [allTransactions, yearFilter, accountFilter]
  );

  const years = useMemo(() => availableYears(allTransactions), [allTransactions]);

  // Exclude transfers from spending/income analysis.
  // Credit card accounts flip the logic: a CC "credit" from the CSV is a charge (expense),
  // because the bank credits your liability account when you spend.
  const expenses = useMemo(() =>
    transactions.filter((t) => {
      if (t.transferId) return false;
      const acct = accounts.find((a) => a.id === t.accountId);
      return acct?.type === "credit" ? t.type === "credit" : t.type === "debit";
    }),
    [transactions, accounts]
  );
  const income = useMemo(() =>
    transactions.filter((t) => {
      if (t.transferId) return false;
      const acct = accounts.find((a) => a.id === t.accountId);
      return acct?.type === "credit" ? t.type === "debit" : t.type === "credit";
    }),
    [transactions, accounts]
  );

  // ── File import ──────────────────────────────────────────────────
  const loadFile = useCallback((file, accountId) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseStatementCSV(e.target.result);
        const fileId = `${Date.now()}`;

        const tagged = parsed.map((t, i) => ({
          ...t,
          id: `${fileId}-${i}`,
          fileId,
          accountId: accountId || null,
          rawRow: undefined,
        }));

        const newRange = dateRangeOf(tagged);
        let overlapWarning = null;
        if (newRange) {
          // Only check overlap within the same account
          const sameAcctFiles = loadedFiles.filter((lf) => lf.accountId === accountId);
          for (const lf of sameAcctFiles) {
            if (!lf.minDate || !lf.maxDate) continue;
            const existMin = new Date(lf.minDate);
            const existMax = new Date(lf.maxDate);
            if (newRange.min <= existMax && newRange.max >= existMin) {
              overlapWarning = `Date range overlaps with "${lf.name}" (${lf.dateRange}). Transactions merged — remove the old file if it's a duplicate.`;
              break;
            }
          }
        }

        const newFile = {
          id: fileId,
          name: file.name,
          accountId: accountId || null,
          loadedAt: new Date().toISOString(),
          count: tagged.length,
          dateRange: newRange?.label ?? "Unknown dates",
          minDate: newRange?.min?.toISOString() ?? null,
          maxDate: newRange?.max?.toISOString() ?? null,
        };

        const updatedTxns  = [...allTransactions, ...tagged];
        const updatedFiles = [...loadedFiles, newFile];

        setAllTransactions(updatedTxns);
        setLoadedFiles(updatedFiles);
        saveStored(updatedTxns, updatedFiles, budgets, openingBalance, accountsRef.current);
        setError(null);
        setTab("dashboard");
        if (accountId) setAccountFilter(accountId);
        if (newRange?.max) setYearFilter(newRange.max.getFullYear());
        if (overlapWarning) setWarning(overlapWarning);
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsText(file);
  }, [allTransactions, loadedFiles, budgets, openingBalance]);

  const removeFile = useCallback((fileId) => {
    const updatedTxns  = allTransactions.filter((t) => t.fileId !== fileId);
    const updatedFiles = loadedFiles.filter((f) => f.id !== fileId);
    setAllTransactions(updatedTxns);
    setLoadedFiles(updatedFiles);
    saveStored(updatedTxns, updatedFiles, budgets, openingBalance, accountsRef.current);
  }, [allTransactions, loadedFiles, budgets, openingBalance]);

  const clearAll = useCallback(() => {
    if (!window.confirm("Clear all data? This cannot be undone.")) return;
    setAllTransactions([]);
    setLoadedFiles([]);
    saveStored([], [], budgets, openingBalance, accountsRef.current);
  }, [budgets, openingBalance]);


  // ── Import modal handlers ────────────────────────────────────────
  function openImportModal(file) {
    setPendingFile(file);
    setImportAccountId(accounts.length === 0 ? "__new__" : null);
    setImportNewName("");
    setImportNewType("checking");
  }

  function handleConfirmImport() {
    let accountId = importAccountId;
    if (importAccountId === "__new__") {
      accountId = addAccount(importNewName.trim(), importNewType, 0);
    }
    loadFile(pendingFile, accountId);
    setPendingFile(null);
    setImportAccountId(null);
    setImportNewName("");
    setImportNewType("checking");
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.name.endsWith(".csv")) openImportModal(file);
    else setError("Please drop a CSV file.");
  }, []);

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.name.endsWith(".csv")) openImportModal(file);
    else setError("Please select a CSV file.");
    e.target.value = "";
  };

  const hasData = allTransactions.length > 0;

  const effectiveOpeningBalance = activeAccount?.openingBalance ?? openingBalance;

  // ── Export / Import backup ───────────────────────────────────────
  const BACKUP_KEYS = [
    "ft-transactions", "ft-files", "ft-budgets",
    "ft-opening-balance", "ft-custom-categories", "ft-accounts", "ft-subcategories",
  ];

  function exportBackup() {
    const data = {};
    for (const key of BACKUP_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw) data[key] = JSON.parse(raw);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `finance-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportBackup(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        for (const key of BACKUP_KEYS) {
          if (data[key] !== undefined) localStorage.setItem(key, JSON.stringify(data[key]));
        }
        window.location.reload();
      } catch {
        setError("Failed to import backup — make sure it's a valid Finance Tracker backup file.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo variant="dark" size={36} />
        </div>

        {/* Year filter */}
        {years.length > 0 && (
          <div className="sidebar-year">
            <span className="sidebar-year-label">Year</span>
            <select
              className="year-select"
              value={yearFilter}
              onChange={(e) => setYearFilter(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        )}

        {/* Account filter */}
        {accounts.length > 0 && (
          <div className="sidebar-year">
            <span className="sidebar-year-label">Account</span>
            <select
              className="year-select acct-select"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
            >
              <option value="all">All</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name.length > 14 ? a.name.slice(0, 13) + "…" : a.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Nav */}
        <nav className="sidebar-nav">
          {/* Analysis sub-group */}
          <div className="nav-group">
            <button className="nav-group-header" onClick={() => toggleGroup("accounts")}>
              <span>Analysis</span>
              <span className={`nav-group-chevron ${collapsedGroups["accounts"] ? "collapsed" : ""}`}>▾</span>
            </button>
            {!collapsedGroups["accounts"] && (
              <>
                {[
                  { id: "category",     label: "By Category" },
                  { id: "overtime",     label: "Over Time" },
                  { id: "transactions", label: "Transactions" },
                  { id: "reconciled",   label: "Reconciled" },
                ].map((t) => (
                  <button
                    key={t.id}
                    className={`nav-item nav-item-child ${tab === t.id ? "active" : ""} ${!hasData ? "disabled" : ""}`}
                    onClick={() => hasData && setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </>
            )}
          </div>
        </nav>

        {/* Files group */}
        <div className="nav-group nav-group-files">
          <button className="nav-group-header" onClick={() => toggleGroup("files")}>
            <span>Files</span>
            <span className={`nav-group-chevron ${collapsedGroups["files"] ? "collapsed" : ""}`}>▾</span>
          </button>
          {!collapsedGroups["files"] && (
            <>
              <div className="files-group-actions">
                <button className="btn-import" onClick={() => fileInputRef.current.click()}>
                  + Import CSV
                </button>
                <button className="btn-secondary" onClick={() => {
                  setTab("transactions");
                  setAddTxnTrigger((prev) => prev + 1);
                }} disabled={accounts.length === 0}>
                  + Add Transaction
                </button>
                <div className="sidebar-backup-row">
                  <button className="btn-backup" onClick={exportBackup} title="Download all your data as a backup file">
                    ⬇ Export Backup
                  </button>
                  <button className="btn-backup" onClick={() => importDataRef.current.click()} title="Restore data from a backup file">
                    ⬆ Import Backup
                  </button>
                </div>
              </div>

              {loadedFiles.length > 0 && (
                <div className="files-section">
                  <div className="files-header">
                    <span>Loaded files</span>
                    <button className="btn-clear-all" onClick={clearAll}>Clear all</button>
                  </div>
                  {loadedFiles.map((f) => {
                    const acct = accounts.find((a) => a.id === f.accountId);
                    return (
                      <div key={f.id} className="file-entry">
                        {acct && <span className="acct-dot-sm" style={{ background: acct.color }} />}
                        <div className="file-entry-info">
                          <div className="file-entry-name">{f.name}</div>
                          <div className="file-entry-meta">{acct ? acct.name + " · " : ""}{f.dateRange} · {f.count} rows</div>
                        </div>
                        <button className="file-entry-remove" onClick={() => removeFile(f.id)} title="Remove this file's data">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileInput} />
          <input ref={importDataRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportBackup} />
        </div>
      </aside>

      {/* ── Main ── */}
      <main
        className={`main ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {/* Top nav */}
        <div className="top-nav">
          <div className="top-nav-items">
            {[
              { id: "dashboard",  label: "Dashboard",     needsData: true  },
              { id: "trends",     label: "Trends",        needsData: true  },
              { id: "merchants",  label: "Top Merchants", needsData: true  },
              { id: "budgets",    label: "Budgets",       needsData: true  },
              { id: "accounts",   label: "Accounts",      needsData: false },
              { id: "categories", label: "Categories",    needsData: true  },
            ].map((t) => (
              <button
                key={t.id}
                className={`top-nav-item ${tab === t.id ? "active" : ""} ${t.needsData && !hasData ? "disabled" : ""}`}
                onClick={() => (!t.needsData || hasData) && setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button className="btn-help" onClick={() => setShowHelp(true)}>Help</button>
        </div>

        <div className="main-content">
        {error && (
          <div className="error-banner">
            ⚠ {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}
        {warning && (
          <div className="warning-banner">
            ⚠ {warning}
            <button onClick={() => setWarning(null)}>✕</button>
          </div>
        )}

        {/* ── Import account picker modal ── */}
        {pendingFile && (
          <div className="modal-overlay" onClick={() => setPendingFile(null)}>
            <div className="modal modal-import" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">Import: {pendingFile.name}</div>
              <div className="import-col-hint">
                Make sure your CSV columns are in this order: <strong>Date · Description · Amount</strong>
              </div>
              <p className="modal-subtitle">Which account does this statement belong to?</p>

              <div className="account-picker">
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className={`acct-pick-card ${importAccountId === a.id ? "selected" : ""}`}
                    onClick={() => setImportAccountId(a.id)}
                  >
                    <span className="acct-dot" style={{ background: a.color }} />
                    <div>
                      <div className="acct-pick-name">{a.name}</div>
                      <div className="acct-pick-type">{a.type}</div>
                    </div>
                  </div>
                ))}
                <div
                  className={`acct-pick-card ${importAccountId === "__new__" ? "selected" : ""}`}
                  onClick={() => setImportAccountId("__new__")}
                >
                  <span className="acct-dot" style={{ background: "#9ca3af" }} />
                  <div>
                    <div className="acct-pick-name">+ New account</div>
                  </div>
                </div>
              </div>

              {importAccountId === "__new__" && (
                <div className="import-new-acct">
                  <input
                    className="modal-input"
                    placeholder="Account name (e.g. Chase Checking)"
                    value={importNewName}
                    onChange={(e) => setImportNewName(e.target.value)}
                    autoFocus
                  />
                  <select
                    className="modal-select"
                    value={importNewType}
                    onChange={(e) => setImportNewType(e.target.value)}
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="credit">Credit Card</option>
                  </select>
                </div>
              )}

              <div className="modal-actions">
                <button className="btn-sm" onClick={() => setPendingFile(null)}>Cancel</button>
                <button
                  className="btn-sm btn-save"
                  disabled={!importAccountId || (importAccountId === "__new__" && !importNewName.trim())}
                  onClick={handleConfirmImport}
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        )}


        {!hasData && tab !== "accounts" ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <h1>Finance Tracker</h1>
            <p>Import your first bank or credit card statement to get started. Supports <strong>CSV</strong> files. If your issuer only provides PDF statements, create the account in Accounts and add transactions manually in Transactions.</p>
            <button className="btn-primary" onClick={() => fileInputRef.current.click()}>
              Browse for CSV file
            </button>
            <button className="btn-secondary" onClick={() => setTab("accounts")}>
              Create an account manually
            </button>
            <p className="empty-hint">or drag & drop a CSV file anywhere on this window</p>
            <p className="empty-hint">Then use the Transactions tab to add entries manually if you do not have a CSV export.</p>
          </div>
        ) : (
          <>
            {tab === "dashboard"    && <Dashboard    transactions={transactions} expenses={expenses} income={income} openingBalance={effectiveOpeningBalance} setOpeningBalance={setOpeningBalance} activeAccount={activeAccount} accounts={accounts} allTransactions={allTransactions} customCategories={customCategories} />}
            {tab === "category"     && <ByCategory   expenses={expenses} />}
            {tab === "overtime"     && <OverTime      expenses={expenses} />}
            {tab === "trends"       && <Trends        expenses={expenses} income={income} />}
            {tab === "merchants"    && <TopMerchants  expenses={expenses} />}
            {tab === "budgets"      && <Budgets       expenses={expenses} budgets={budgets} setBudgets={setBudgets} />}
            {tab === "transactions" && <Transactions  transactions={transactions} bulkUpdateTransactions={bulkUpdateTransactions} customCategories={customCategories} addCustomCategory={addCustomCategory} accounts={accounts} accountFilter={accountFilter} addTransaction={addTransaction} deleteTransaction={deleteTransaction} deleteTransfer={deleteTransfer} linkTransfer={linkTransfer} subcategories={subcategories} addSubcategory={addSubcategory} addTxnTrigger={addTxnTrigger} />}
            {tab === "reconciled"   && <Reconciled    transactions={transactions} bulkUpdateTransactions={bulkUpdateTransactions} customCategories={customCategories} addCustomCategory={addCustomCategory} accounts={accounts} deleteTransaction={deleteTransaction} deleteTransfer={deleteTransfer} linkTransfer={linkTransfer} subcategories={subcategories} addSubcategory={addSubcategory} />}
            {tab === "accounts"     && <Accounts      accounts={accounts} addAccount={addAccount} updateAccount={updateAccount} deleteAccount={deleteAccount} loadedFiles={loadedFiles} allTransactions={allTransactions} createTransfer={createTransfer} deleteTransfer={deleteTransfer} onAccountCreated={(id) => {
              setTab("transactions");
              setAccountFilter(id);
              setAddTxnTrigger((prev) => prev + 1);
            }} onAddTransaction={(id) => {
              setTab("transactions");
              setAccountFilter(id);
              setAddTxnTrigger((prev) => prev + 1);
            }} />}
            {tab === "categories"   && <Categories    transactions={allTransactions} customCategories={customCategories} subcategories={subcategories} renameCategory={renameCategory} renameSubcategory={renameSubcategory} deleteSubcategory={deleteSubcategory} addSubcategory={addSubcategory} />}
          </>
        )}
        </div>
      </main>

      {showHelp    && <HelpModal    onClose={() => setShowHelp(false)} />}
      {showWelcome && <WelcomeOverlay onClose={() => setShowWelcome(false)} />}
    </div>
  );
}
