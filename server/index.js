import "dotenv/config";
import express from "express";
import cors from "cors";
import db from "./db.js";
import plaidRouter from "./plaid.js";

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Allow any localhost origin (Vite can use 5180, 5181, etc.)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) cb(null, true);
    else cb(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json());

// Initialize DB on startup
db;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use("/api/plaid", plaidRouter);

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
