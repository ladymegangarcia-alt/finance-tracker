import { useState } from "react";

const STEPS = [
  {
    emoji: "👋",
    title: "Welcome to Finance Tracker!",
    body: "This app helps you analyze your bank and credit card statements \u2014 all privately in your own browser. No account, no server, no subscription.",
  },
  {
    emoji: "📄",
    title: "Import your statements",
    body: 'Click “+ Import CSV” in the sidebar or drag a CSV file onto the main area. If your bank only provides PDF statements, create the account in Accounts and enter the transactions manually.',
  },
  {
    emoji: "🏦",
    title: "Organize by account",
    body: 'Each file belongs to one account (e.g. \u201cChase Checking\u201d or \u201cCiti Visa\u201d). Create accounts in the Accounts tab. Transfers between your own accounts are automatically excluded from spending totals.',
  },
  {
    emoji: "🏷️",
    title: "Categorize your transactions",
    body: "Go to Transactions to assign categories and subcategories. When you tag a vendor, the app offers to apply the same tag to all matching transactions at once.",
  },
  {
    emoji: "📊",
    title: "Explore your data",
    body: "Dashboard shows balances and spending summaries. Trends, By Category, and Over Time reveal patterns month over month. Budgets lets you set monthly limits per category.",
  },
  {
    emoji: "💾",
    title: "Back up your data",
    body: 'Use \u201c\u2b07 Export Backup\u201d in the sidebar to save all your data to a file. You can restore it on any computer with \u201c\u2b06 Import Backup\u201d. Do this regularly so you never lose your work.',
  },
];

export default function WelcomeOverlay({ onClose }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  function finish() {
    localStorage.setItem("ft-welcomed", "1");
    onClose();
  }

  return (
    <div className="modal-overlay welcome-overlay">
      <div className="modal modal-welcome">
        <div className="welcome-emoji">{s.emoji}</div>
        <h2 className="welcome-title">{s.title}</h2>
        <p className="welcome-body">{s.body}</p>

        <div className="welcome-dots">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`welcome-dot ${i === step ? "active" : ""}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        <div className="welcome-actions">
          {step > 0 && (
            <button className="btn-sm" onClick={() => setStep(step - 1)}>&larr; Back</button>
          )}
          <button className="btn-sm" onClick={finish} style={{ marginLeft: "auto", color: "#b0b0a4" }}>
            Skip
          </button>
          {isLast ? (
            <button className="btn-sm btn-save" onClick={finish}>Get started &rarr;</button>
          ) : (
            <button className="btn-sm btn-save" onClick={() => setStep(step + 1)}>Next &rarr;</button>
          )}
        </div>
      </div>
    </div>
  );
}
