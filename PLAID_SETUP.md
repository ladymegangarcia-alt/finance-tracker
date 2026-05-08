# Plaid Integration Setup

## 1. Create a Plaid account

Go to [https://dashboard.plaid.com](https://dashboard.plaid.com) and sign up for a free account.

## 2. Get your API credentials

In the Plaid dashboard go to **Team Settings → Keys**. You need:

- **Client ID** — same for all environments
- **Sandbox Secret** — use this for testing (no real bank needed)

## 3. Create your `.env` file

Copy the example and fill in your credentials:

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder values:

```
PLAID_CLIENT_ID=your_actual_client_id
PLAID_SECRET=your_actual_sandbox_secret
PLAID_ENV=sandbox
SERVER_PORT=3001
```

## 4. Start the app

```bash
npm run dev
```

This starts both the Vite frontend (port 5180) and the Express backend (port 3001) together.

## 5. Verify the server is running

Open your browser and go to:

```
http://localhost:5180/api/health
```

You should see:

```json
{ "ok": true, "ts": "2026-..." }
```

## 6. Sandbox test credentials

When you get to the Plaid Link screen and need to log in to a bank, use:

- **Username:** `user_good`
- **Password:** `pass_good`

These are Plaid's built-in sandbox credentials — no real bank account needed.

## Notes

- The SQLite database lives at `server/data/plaid.db` and is excluded from git.
- Plaid webhooks are out of scope for v1. Use the **Sync** button in the app to pull new transactions manually.
- To go live (real banks), change `PLAID_ENV=production` and swap in your Production Secret from the Plaid dashboard. You will also need Plaid to approve your app for production access.
