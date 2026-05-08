import { useState, useEffect, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";

export default function PlaidConnect({ onConnected }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  const onSuccess = useCallback(async (public_token) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Token exchange failed");
      onConnected(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLinkToken(null);
      setLoading(false);
    }
  }, [onConnected]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => { setLinkToken(null); setLoading(false); },
  });

  // Auto-open Plaid Link as soon as the token is ready
  useEffect(() => {
    if (ready && linkToken) open();
  }, [ready, linkToken, open]);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/plaid/link-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not get link token");
      setLinkToken(data.link_token);
      // loading stays true until ready+open or error
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="plaid-connect-wrap">
      <button
        className="btn-import btn-plaid"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? "Connecting…" : "🏦 Connect Bank"}
      </button>
      {error && <div className="plaid-error">{error}</div>}
    </div>
  );
}
