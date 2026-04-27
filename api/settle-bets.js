// api/settle-bets.js
// Vercel Cron Job — runs every 5 minutes automatically
// Checks all pending bets, fetches ESPN results, settles wins/losses
// This runs SERVER-SIDE — works whether users are online or not
//
// Setup: add to vercel.json crons section (see vercel.json)
// Supabase service role key needed to bypass RLS for admin writes

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role bypasses RLS
);

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// All league slugs we support
const LEAGUES = [
  'soccer/eng.1', 'soccer/eng.fa', 'soccer/eng.league_cup',
  'soccer/esp.1', 'soccer/esp.copa_del_rey',
  'soccer/ita.1', 'soccer/ger.1', 'soccer/fra.1',
  'soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/uefa.europaconf',
  'basketball/nba',
  'baseball/mlb',
  'hockey/nhl',
];

async function fetchRecentResults() {
  // Fetch yesterday + today to catch any recently finished games
  const dates = [];
  for (let i = -1; i <= 0; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }

  const fetches = [];
  for (const league of LEAGUES) {
    for (const date of dates) {
      fetches.push(
        fetch(`${ESPN_BASE}/${league}/scoreboard?dates=${date}&limit=100`)
          .then(r => r.json())
          .catch(() => ({}))
      );
    }
  }

  const responses = await Promise.all(fetches);
  const finishedGames = new Map(); // gameId -> { homeScore, awayScore, status }

  for (const data of responses) {
    for (const ev of (data.events || [])) {
      const status = ev.status?.type;
      if (status?.completed || status?.state === 'post') {
        const comp = ev.competitions?.[0];
        const home = comp?.competitors?.find(c => c.homeAway === 'home');
        const away = comp?.competitors?.find(c => c.homeAway === 'away');
        if (home && away) {
          finishedGames.set(ev.id, {
            id: ev.id,
            homeScore: parseInt(home.score) || 0,
            awayScore: parseInt(away.score) || 0,
            homeTeam: home.team?.displayName,
            awayTeam: away.team?.displayName,
          });
        }
      }
    }
  }

  return finishedGames;
}

function determineResult(homeScore, awayScore) {
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return 'draw';
}

function evaluateBet(bet, finishedGames) {
  const selections = bet.selections || [];
  if (!selections.length) return null;

  let allSettled = true;
  let allCorrect = true;

  for (const sel of selections) {
    const game = finishedGames.get(sel.gameId);
    if (!game) {
      // This game hasn't finished yet — bet stays pending
      allSettled = false;
      break;
    }
    const result = determineResult(game.homeScore, game.awayScore);
    if (sel.type !== result) {
      allCorrect = false;
    }
  }

  if (!allSettled) return null; // not ready yet
  return allCorrect ? 'won' : 'lost';
}

export default async function handler(req, res) {
  // Verify this is called by Vercel cron or our admin (not random requests)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('🎯 Bet settlement job started:', new Date().toISOString());

  try {
    // 1. Get all pending bets
    const { data: pendingBets, error: fetchError } = await supabase
      .from('bets')
      .select('*')
      .eq('status', 'pending');

    if (fetchError) throw fetchError;
    if (!pendingBets?.length) {
      return res.json({ settled: 0, message: 'No pending bets' });
    }

    console.log(`Found ${pendingBets.length} pending bets`);

    // 2. Fetch all recently finished games from ESPN
    const finishedGames = await fetchRecentResults();
    console.log(`Found ${finishedGames.size} finished games`);

    // 3. Evaluate and settle each bet
    let settled = 0;
    let errors = 0;

    for (const bet of pendingBets) {
      const outcome = evaluateBet(bet, finishedGames);
      if (outcome === null) continue; // game not finished yet

      try {
        const payout = outcome === 'won' ? bet.potential_payout : 0;

        // Update bet status
        await supabase
          .from('bets')
          .update({ status: outcome, payout })
          .eq('id', bet.id);

        if (outcome === 'won') {
          // Credit user balance
          const { data: profile } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', bet.user_id)
            .single();

          const newBalance = (profile?.balance || 0) + payout;

          await supabase
            .from('profiles')
            .update({ balance: newBalance })
            .eq('id', bet.user_id);

          // Write transaction record
          await supabase.from('transactions').insert({
            user_id: bet.user_id,
            type: 'bet_win',
            amount: payout,
            label: `Bet won — ${bet.selections?.map(s => s.label).join(' + ')}`,
            balance_after: newBalance,
          });

          console.log(`✅ Settled WON: bet ${bet.id} — payout ${payout}`);
        } else {
          // Write loss transaction for record
          const { data: profile } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', bet.user_id)
            .single();

          await supabase.from('transactions').insert({
            user_id: bet.user_id,
            type: 'bet_loss',
            amount: bet.stake,
            label: `Bet lost — ${bet.selections?.map(s => s.label).join(' + ')}`,
            balance_after: profile?.balance || 0,
          });

          console.log(`❌ Settled LOST: bet ${bet.id}`);
        }

        settled++;
      } catch (err) {
        console.error(`Error settling bet ${bet.id}:`, err);
        errors++;
      }
    }

    return res.json({
      success: true,
      settled,
      errors,
      pendingTotal: pendingBets.length,
      finishedGamesFound: finishedGames.size,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('Settlement job failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
