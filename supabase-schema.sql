-- ═══════════════════════════════════════════════
-- OddsX Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════

-- 1. PROFILES TABLE
-- Stores user info and balance
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  balance numeric default 1000 not null,
  created_at timestamptz default now()
);

-- 2. BETS TABLE
-- Stores every bet placed
create table if not exists bets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  selections jsonb not null,        -- array of {label, odds, gameId}
  stake numeric not null,
  odds_total numeric not null,
  potential_payout numeric not null,
  status text default 'pending',    -- 'won' | 'lost' | 'pending'
  payout numeric default 0,
  created_at timestamptz default now()
);

-- 3. TRANSACTIONS TABLE
-- Full audit trail of all money movements
create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null,               -- 'deposit' | 'withdrawal' | 'bet_win' | 'bet_loss'
  amount numeric not null,
  label text,
  balance_after numeric,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Users can only read/write their own data
-- ═══════════════════════════════════════════════

alter table profiles enable row level security;
alter table bets enable row level security;
alter table transactions enable row level security;

-- Profiles: users can only see and update their own profile
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Bets: users can only see and insert their own bets
create policy "Users can view own bets"
  on bets for select using (auth.uid() = user_id);

create policy "Users can insert own bets"
  on bets for insert with check (auth.uid() = user_id);

-- Transactions: users can only see and insert their own transactions
create policy "Users can view own transactions"
  on transactions for select using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on transactions for insert with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════
-- ENABLE GOOGLE AUTH
-- After running this SQL, go to:
-- Supabase Dashboard → Authentication → Providers → Google
-- Toggle Google ON and paste your Google OAuth credentials
-- ═══════════════════════════════════════════════
