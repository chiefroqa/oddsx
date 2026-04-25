# OddsX — Setup Guide

## Project Structure
```
oddsx/
├── index.html          ← Full frontend app
├── vercel.json         ← Vercel routing config
├── supabase-schema.sql ← Run this in Supabase SQL Editor
└── api/
    ├── deposit.js          ← M-Pesa STK Push (Intasend)
    ├── deposit-status.js   ← Payment status polling
    └── withdraw.js         ← M-Pesa payout (Intasend)
```

---

## Step 1 — Supabase Setup

1. Go to https://supabase.com → New Project
2. Copy your **Project URL** and **anon public key** from:
   Settings → API → Project URL & Project API keys
3. Go to **SQL Editor** → paste the contents of `supabase-schema.sql` → Run
4. (Optional) Enable Google Login:
   Authentication → Providers → Google → Toggle ON
   Paste your Google OAuth Client ID & Secret

---

## Step 2 — Update index.html

Open `index.html` and replace these two lines near the top of the script:

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

With your actual values from Supabase.

---

## Step 3 — Intasend Setup (M-Pesa payments)

1. Sign up at https://intasend.com
2. Get your **API Key** and **Public Key** from the dashboard
3. Start with **Sandbox** for testing — no real money needed
4. Switch to **Live** keys when ready for real payments

---

## Step 4 — Deploy to Vercel

```bash
git init
git add .
git commit -m "OddsX launch"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/oddsx.git
git push -u origin main
```

Then:
1. Go to https://vercel.com → Add New Project → Import your repo
2. Before deploying, add Environment Variables:
   - `INTASEND_API_KEY` → your Intasend API key
   - `INTASEND_PUBLIC_KEY` → your Intasend public key
3. Click Deploy

---

## Step 5 — Test

- Sign up with an email → you get KSH 1,000 starting balance
- Place bets, play Crash and Mines — all tracked in Supabase
- To test deposits: use Intasend sandbox with test M-Pesa numbers from their docs
- Check your Supabase dashboard → Table Editor to see live data

---

## Going Live (Real Money)

1. Switch `sandbox.intasend.com` → `payment.intasend.com` in the API files
2. Get a BCLB (Betting Control and Licensing Board) license
3. Update Vercel env vars with live Intasend keys
4. Redeploy
