import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;

const ALL_LEAGUES = [
  'soccer/eng.1', 'soccer/eng.fa', 'soccer/eng.league_cup',
  'soccer/esp.1', 'soccer/ita.1', 'soccer/ger.1', 'soccer/fra.1',
  'soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/uefa.europaconf',
  'basketball/nba', 'baseball/mlb', 'hockey/nhl',
];

// Fetch all finished games across all leagues for the past N days
async function fetchAllFinishedGames(daysBack = 4): Promise<Map<string, { result: string }>> {
  const dates: string[] = [];
  for (let i = -daysBack; i <= 0; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }

  const fetches: Promise<any>[] = [];
  for (const league of ALL_LEAGUES) {
    for (const date of dates) {
      fetches.push(
        fetch(`https://site.api.espn.com/apis/site/v2/sports/${league}/scoreboard?dates=${date}&limit=100`)
          .then(r => r.json())
          .catch(() => ({}))
      );
    }
  }

  const responses = await Promise.all(fetches);
  const games = new Map<string, { result: string }>();

  for (const data of responses) {
    for (const ev of (data.events || [])) {
      const st = ev.status?.type;
      if (!(st?.completed === true || st?.state === 'post')) continue;
      const comp = ev.competitions?.[0];
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
      if (!home || !away) continue;
      const hS = parseInt(home.score) || 0;
      const aS = parseInt(away.score) || 0;
      games.set(String(ev.id), {
        result: hS > aS ? 'home' : aS > hS ? 'away' : 'draw',
      });
    }
  }

  return games;
}

Deno.serve(async (req) => {
  // Allow both cron invocations and manual triggers
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('settle-bets: starting run at', new Date().toISOString());

  // Fetch all pending bets across ALL users (service role bypasses RLS)
  const { data: bets, error: betsError } = await sb
    .from('bets')
    .select('*')
    .eq('status', 'pending');

  if (betsError) {
    console.error('Error fetching bets:', betsError);
    return new Response(JSON.stringify({ error: betsError.message }), { status: 500 });
  }

  if (!bets?.length) {
    console.log('No pending bets found');
    return new Response(JSON.stringify({ settled: 0, message: 'No pending bets' }), { status: 200 });
  }

  console.log(`Found ${bets.length} pending bet(s)`);

  // One bulk ESPN fetch covers all bets
  const finishedGames = await fetchAllFinishedGames(4);
  console.log(`ESPN returned ${finishedGames.size} finished game(s)`);

  let settled = 0;
  let skipped = 0;

  for (const bet of bets) {
    const selections: any[] = bet.selections || [];
    if (!selections.length) continue;

    const allGameIds = selections.map((s: any) => String(s.gameId));
    const allFinished = allGameIds.every(id => finishedGames.has(id));

    if (!allFinished) {
      skipped++;
      continue; // Games still in progress
    }

    // Evaluate all legs
    let allCorrect = true;
    for (const sel of selections) {
      const game = finishedGames.get(String(sel.gameId));
      if (!game || sel.type !== game.result) {
        allCorrect = false;
        break;
      }
    }

    const outcome = allCorrect ? 'won' : 'lost';
    const payout = allCorrect ? (bet.potential_payout || 0) : 0;

    // Atomic update — only proceeds if bet is still pending (prevents double-settle)
    const { data: updated, error: updateError } = await sb
      .from('bets')
      .update({ status: outcome, payout })
      .eq('id', bet.id)
      .eq('status', 'pending') // guard
      .select('*');

    if (updateError || !updated?.length) {
      console.log(`Bet ${bet.id} — skipped (already settled or error)`);
      continue;
    }

    console.log(`Bet ${bet.id} — settled as ${outcome}, payout: ${payout}`);

    // Credit winnings to user balance
    if (allCorrect && payout > 0) {
      const { data: profile } = await sb
        .from('profiles')
        .select('balance')
        .eq('id', bet.user_id)
        .single();

      const currentBalance = profile?.balance || 0;
      const newBalance = currentBalance + payout;

      await sb
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', bet.user_id);

      await sb.from('transactions').insert({
        user_id: bet.user_id,
        type: 'bet_win',
        amount: payout,
        label: `${selections.length}-leg accumulator won (auto-settled)`,
        balance_after: newBalance,
      });

      console.log(`User ${bet.user_id} credited +${payout}, new balance: ${newBalance}`);
    } else if (!allCorrect) {
      // Log the loss transaction
      const { data: profile } = await sb
        .from('profiles')
        .select('balance')
        .eq('id', bet.user_id)
        .single();

      await sb.from('transactions').insert({
        user_id: bet.user_id,
        type: 'bet_loss',
        amount: bet.stake,
        label: `${selections.length}-leg accumulator lost (auto-settled)`,
        balance_after: profile?.balance || 0,
      });
    }

    settled++;
  }

  const summary = { settled, skipped, total: bets.length };
  console.log('settle-bets: done —', summary);
  return new Response(JSON.stringify(summary), { status: 200 });
});
