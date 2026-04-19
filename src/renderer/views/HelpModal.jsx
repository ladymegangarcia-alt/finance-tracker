import { useState } from "react";

const SECTIONS = [
  {
    title: "Getting Started",
    content: [
      { q: "How do I add my bank data?", a: 'Click \u201c+ Import Statement\u201d in the sidebar (or drag a file onto the main area). The app accepts CSV files exported from your bank and PDF statements. You\'ll be asked to assign the file to an account.' },
      { q: "What's an Account?", a: 'An account represents one bank or credit card (e.g. \u201cChase Checking\u201d, \u201cCiti Visa\u201d). Go to the Accounts tab to create accounts before or during import. Each file is linked to one account.' },
      { q: "What if I close the browser \u2014 do I lose my data?", a: "No. All data is saved in your browser's local storage and survives page refreshes and browser restarts. Use Export Backup to save a file you can take to another computer." },
    ],
  },
  {
    title: "Importing Statements",
    content: [
      { q: "What CSV format does the app expect?", a: "Most bank exports work automatically. The importer looks for columns named Date, Description, and Amount (or close variants). A preview lets you confirm before committing." },
      { q: "Can I import PDF statements?", a: "Yes \u2014 upload a PDF and the app extracts transactions using a text parser. A preview table lets you check and deselect any rows before importing." },
      { q: "Can I import files from multiple accounts?", a: 'Yes. Import as many files as you like, each assigned to its own account. The sidebar lets you switch between \u201cAll accounts\u201d and a specific account.' },
    ],
  },
  {
    title: "Transactions",
    content: [
      { q: "How do I change a category?", a: 'In the Transactions tab, click the category dropdown on any row. After editing, a \u201cSave changes\u201d button appears at the top \u2014 click it to commit all staged edits at once.' },
      { q: "What are subcategories?", a: 'Subcategories let you tag transactions with extra detail \u2014 e.g. category \u201cGroceries\u201d, subcategory \u201cWhole Foods\u201d. Use the subcategory selector below the category dropdown on each row.' },
      { q: "What is the vendor suggestion modal?", a: "When you change a category or subcategory, the app searches all other transactions for the same vendor (by description) and offers to apply the same tag to all of them at once." },
      { q: "What are Transfers?", a: "Transfers move money between your own accounts (e.g. paying a credit card from checking). Mark a transaction as a transfer so it is excluded from spending and income totals. The app detects common transfer descriptions automatically." },
    ],
  },
  {
    title: "Categories",
    content: [
      { q: "Can I rename a category?", a: "Yes \u2014 go to the Categories tab, click \u2728 next to any category name, type the new name, and press Enter. All matching transactions update automatically." },
      { q: "What are system categories?", a: 'System categories (marked with a blue \u201csystem\u201d badge) are built-in and used for auto-detection when importing. You can still rename them.' },
      { q: "How do I delete a subcategory?", a: "In the Categories tab, expand a category with \u25bc, then click \u2715 next to the subcategory. This removes the tag from all transactions in that subcategory." },
    ],
  },
  {
    title: "Dashboard & Charts",
    content: [
      { q: "What does Opening Balance mean?", a: 'The balance your account held at the start of the period. Click the Opening Balance card to edit it when viewing \u201cAll\u201d months. Per-account opening balances are set in the Accounts tab.' },
      { q: "Can I filter by month?", a: "Yes \u2014 if your data spans multiple months, month pills appear at the top of the Dashboard. Click one to focus all cards and charts on that month." },
      { q: "How do I see subcategory totals?", a: "Click any slice on the donut charts or any row in the Top Categories table to open a detail modal showing the subcategory breakdown." },
    ],
  },
  {
    title: "Trends & Over Time",
    content: [
      { q: "What does the Trends tab show?", a: "A multi-line chart with one line per category (or subcategory), showing spending or income month over month. Toggle between Spending and Income at the top." },
      { q: "How do I focus on one category in Trends?", a: "Click a category pill to toggle it on/off. Double-click a pill to isolate just that one category." },
      { q: "What is the Over Time tab?", a: "A monthly bar chart plus a table comparing each month's spending to your average, broken down by category." },
    ],
  },
  {
    title: "Budgets",
    content: [
      { q: "How do I set a budget?", a: "Go to the Budgets tab, find a category, and enter a monthly limit. A color-coded progress bar shows how much of the budget you've used for the current data." },
    ],
  },
  {
    title: "Backup & Restore",
    content: [
      { q: "How do I back up my data?", a: 'Click \u201c\u2b07 Export Backup\u201d in the sidebar. A JSON file is downloaded with all your transactions, accounts, categories, budgets, and subcategories.' },
      { q: "How do I restore on a new computer?", a: 'Open the app in the new browser, click \u201c\u2b06 Import Backup\u201d, and pick your backup file. The app reloads with all your data restored.' },
      { q: "Is the backup file safe to share?", a: "It contains your full transaction history including amounts and descriptions \u2014 treat it like a financial document and keep it private." },
    ],
  },
];

export default function HelpModal({ onClose }) {
  const [openSection, setOpenSection] = useState(0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-help" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          Help &amp; Reference
          <button className="modal-close-x" onClick={onClose}>✕</button>
        </div>

        <div className="help-body">
          <nav className="help-nav">
            {SECTIONS.map((s, i) => (
              <button
                key={s.title}
                className={`help-nav-item ${openSection === i ? "active" : ""}`}
                onClick={() => setOpenSection(i)}
              >
                {s.title}
              </button>
            ))}
          </nav>

          <div className="help-content">
            <h3 className="help-section-title">{SECTIONS[openSection].title}</h3>
            {SECTIONS[openSection].content.map((item) => (
              <div key={item.q} className="help-qa">
                <div className="help-q">{item.q}</div>
                <div className="help-a">{item.a}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-sm btn-save" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
