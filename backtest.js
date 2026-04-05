/**
 * Backtest: run recent finished matches through the predictor and score vs actual results.
 *
 * Usage:
 *   node backtest.js                          → last 7 days
 *   node backtest.js 2026-03-20 2026-03-22   → specific date range
 *   node backtest.js 2026-03-22              → single day
 */

const { analyzMatch } = require('./predictor');
const { FOOTBALL_DATA_API_KEY } = require('./config');
const { overProbabilities } = require('./poisson');
const fetch = require('node-fetch');

const FD_BASE = 'https://api.football-data.org/v4';
const RATE_LIMIT_DELAY = 7000; // 7s between API calls (free tier: 10 req/min)
const PREDICT_DELAY    = 22000; // 22s between full predictions (each uses multiple API calls)

// Leagues we cover (must query per-competition on free tier)
const LEAGUES = ['PL', 'BL1', 'SA', 'PD', 'FL1', 'PPL', 'DED'];

// Team ID → predictor key (mirrors TEAM_MAP in fetcher.js)
const TEAM_ID_TO_KEY = {
  // Premier League
  57: 'arsenal', 58: 'aston villa', 61: 'chelsea', 62: 'everton',
  63: 'fulham', 64: 'liverpool', 65: 'man city', 66: 'man united',
  67: 'newcastle', 71: 'sunderland', 73: 'tottenham', 76: 'wolves',
  328: 'burnley', 341: 'leeds united', 351: 'nottingham forest',
  354: 'crystal palace', 397: 'brighton', 402: 'brentford',
  563: 'west ham', 1044: 'bournemouth',
  // Bundesliga
  1: 'koln', 2: 'hoffenheim', 3: 'bayer leverkusen', 4: 'borussia dortmund',
  5: 'bayern munich', 7: 'hamburger sv', 10: 'stuttgart', 11: 'wolfsburg',
  12: 'werder bremen', 15: 'mainz', 16: 'augsburg', 17: 'freiburg',
  18: 'gladbach', 19: 'eintracht frankfurt', 20: 'st. pauli',
  28: 'union berlin', 44: 'heidenheim', 721: 'rb leipzig',
  // La Liga
  77: 'athletic bilbao', 78: 'atletico madrid', 79: 'osasuna',
  80: 'espanyol', 81: 'barcelona', 82: 'getafe', 86: 'real madrid',
  87: 'rayo vallecano', 88: 'levante', 89: 'mallorca', 90: 'real betis',
  92: 'real sociedad', 94: 'villarreal', 95: 'valencia',
  263: 'alaves', 285: 'elche', 298: 'girona', 558: 'celta vigo',
  559: 'sevilla', 1048: 'real oviedo',
  // Serie A
  98: 'ac milan', 99: 'fiorentina', 100: 'as roma', 102: 'atalanta',
  103: 'bologna', 104: 'cagliari', 107: 'genoa', 108: 'inter milan',
  109: 'juventus', 110: 'lazio', 112: 'parma', 113: 'napoli',
  115: 'udinese', 450: 'hellas verona', 586: 'torino',
  5890: 'lecce', 7397: 'como',
  // Ligue 1
  511: 'toulouse', 512: 'brest', 516: 'marseille', 519: 'auxerre',
  521: 'lille', 522: 'nice', 523: 'lyon', 524: 'psg', 525: 'lorient',
  529: 'rennes', 532: 'angers', 533: 'le havre', 543: 'nantes',
  545: 'metz', 546: 'lens', 548: 'monaco', 576: 'strasbourg',
  1045: 'paris fc',
  // Others
  678: 'ajax', 503: 'porto', 498: 'benfica', 264: 'celtic', 258: 'rangers',
};

async function fdGet(path) {
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function pct(n, d)  { return d === 0 ? 'N/A' : `${Math.round((n / d) * 100)}%`; }
function prob(p)    { return `${Math.round(p * 100)}%`; }
function bar(ok)    { return ok ? '✅' : '❌'; }

function actualOutcome(hg, ag) {
  if (hg > ag) return 'HOME';
  if (ag > hg) return 'AWAY';
  return 'DRAW';
}
function predictedOutcome(hp, dp, ap) {
  const max = Math.max(hp, dp, ap);
  if (max === hp) return 'HOME';
  if (max === ap) return 'AWAY';
  return 'DRAW';
}

// ─── Fetch all matches for date range across all leagues ──────────────────────

async function fetchMatchesForRange(dateFrom, dateTo) {
  const all = [];
  for (let i = 0; i < LEAGUES.length; i++) {
    const code = LEAGUES[i];
    process.stdout.write(`  Fetching ${code}... `);
    const data = await fdGet(`/competitions/${code}/matches?status=FINISHED&dateFrom=${dateFrom}&dateTo=${dateTo}`);
    const ms = (data?.matches || [])
      .filter(m => TEAM_ID_TO_KEY[m.homeTeam.id] && TEAM_ID_TO_KEY[m.awayTeam.id])
      .filter(m => m.score?.fullTime?.home !== null && m.score?.fullTime?.away !== null);
    console.log(`${ms.length} testable game(s)`);
    all.push(...ms.map(m => ({ ...m, leagueCode: code })));
    if (i < LEAGUES.length - 1) await sleep(RATE_LIMIT_DELAY);
  }
  return all;
}

// ─── Main backtest runner ─────────────────────────────────────────────────────

async function runBacktest(dateFrom, dateTo) {
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  BACKTEST  ${dateFrom}${dateTo !== dateFrom ? ' → ' + dateTo : ''}`);
  console.log(`${'═'.repeat(64)}\n`);

  console.log('Fetching finished matches...');
  const matches = await fetchMatchesForRange(dateFrom, dateTo);

  if (!matches.length) {
    console.log('\nNo testable matches found (both teams must be in our known-teams list).');
    return;
  }

  // Deduplicate (same match may appear if leagues overlap)
  const seen = new Set();
  const unique = matches.filter(m => {
    const key = `${m.homeTeam.id}-${m.awayTeam.id}-${m.utcDate.split('T')[0]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\nFound ${unique.length} testable match(es). Running predictions...`);
  console.log(`(~${Math.ceil(unique.length * PREDICT_DELAY / 60000)} min due to API rate limits)\n`);

  const results = [];
  let outcomeCorrect = 0, overCorrectCount = 0;
  let highConfCorrect = 0, highConfTotal = 0;
  let over75Correct = 0, over75Total = 0;

  for (let i = 0; i < unique.length; i++) {
    const m = unique[i];
    const homeKey = TEAM_ID_TO_KEY[m.homeTeam.id];
    const awayKey = TEAM_ID_TO_KEY[m.awayTeam.id];
    const homeGoals = m.score.fullTime.home;
    const awayGoals = m.score.fullTime.away;
    const actual = actualOutcome(homeGoals, awayGoals);
    const date = m.utcDate.split('T')[0];

    process.stdout.write(`[${i + 1}/${unique.length}] ${m.homeTeam.shortName || m.homeTeam.name} vs ${m.awayTeam.shortName || m.awayTeam.name} (${m.leagueCode} ${date})... `);

    let prediction;
    try {
      prediction = await analyzMatch(homeKey, awayKey);
    } catch (err) {
      console.log(`FAILED — ${err.message}`);
      results.push({ error: true, label: `${m.homeTeam.name} vs ${m.awayTeam.name}` });
      if (i < unique.length - 1) await sleep(PREDICT_DELAY);
      continue;
    }

    const probs = prediction.prediction.probabilities;
    const expGoals = prediction.prediction.expectedGoals;
    const { homeWin, draw, awayWin } = probs;
    const overProbs = overProbabilities(expGoals.home, expGoals.away);
    const over25 = overProbs.over25;
    const predicted = predictedOutcome(homeWin, draw, awayWin);
    const totalGoals = homeGoals + awayGoals;
    const outcomeOk = predicted === actual;
    const over25Predicted = over25 >= 0.50;
    const over25Actual = totalGoals > 2;
    const overOk = over25Predicted === over25Actual;
    const maxProb = Math.max(homeWin, draw, awayWin);
    const isHighConf = maxProb >= 0.65;

    if (outcomeOk) outcomeCorrect++;
    if (overOk) overCorrectCount++;
    if (isHighConf) { highConfTotal++; if (outcomeOk) highConfCorrect++; }
    if (over25 >= 0.75) { over75Total++; if (over25Actual) over75Correct++; }

    results.push({
      homeTeam: m.homeTeam.name,
      awayTeam: m.awayTeam.name,
      homeShort: m.homeTeam.shortName || m.homeTeam.name,
      awayShort: m.awayTeam.shortName || m.awayTeam.name,
      league: m.leagueCode, date,
      score: `${homeGoals}-${awayGoals}`,
      totalGoals, actual, predicted,
      homeWin, draw, awayWin, over25,
      outcomeOk, overOk, isHighConf, maxProb,
      mostLikely: prediction.prediction.mostLikely,
      error: false,
    });

    console.log('done');
    if (i < unique.length - 1) await sleep(PREDICT_DELAY);
  }

  // ─── Match-by-match table ─────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(64)}`);
  console.log('  MATCH-BY-MATCH RESULTS');
  console.log(`${'─'.repeat(64)}`);

  for (const r of results) {
    if (r.error) {
      console.log(`\n❓ ${r.label} — prediction failed`);
      continue;
    }
    const confTag = r.isHighConf ? ` [HIGH CONF ${prob(r.maxProb)}]` : '';
    const overTag = r.over25 >= 0.75 ? ' [OVER PICK]' : '';
    console.log(`\n${bar(r.outcomeOk)} ${r.homeShort} vs ${r.awayShort} (${r.league} · ${r.date})`);
    console.log(`   Result:    ${r.score}  (${r.totalGoals} goals) — actual: ${r.actual}`);
    console.log(`   Predicted: ${r.predicted}${confTag}`);
    console.log(`   Model:     H ${prob(r.homeWin)} | D ${prob(r.draw)} | A ${prob(r.awayWin)}`);
    if (r.mostLikely) {
      console.log(`   Most likely score: ${r.mostLikely}`);
    }
    console.log(`   Over 2.5:  model ${prob(r.over25)}${overTag} → actual ${r.totalGoals > 2 ? 'OVER' : 'UNDER'} ${bar(r.overOk)}`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  const total = results.filter(r => !r.error).length;
  const errors = results.filter(r => r.error).length;

  console.log(`\n${'═'.repeat(64)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(64)}`);
  console.log(`  Matches analysed:            ${total}${errors ? ` (${errors} failed)` : ''}`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Outcome accuracy:            ${outcomeCorrect}/${total} = ${pct(outcomeCorrect, total)}`);
  console.log(`  Over/Under 2.5 accuracy:     ${overCorrectCount}/${total} = ${pct(overCorrectCount, total)}`);
  if (highConfTotal > 0)
    console.log(`  High-conf picks (≥65%):      ${highConfCorrect}/${highConfTotal} = ${pct(highConfCorrect, highConfTotal)}`);
  if (over75Total > 0)
    console.log(`  Strong OVER picks (≥75%):    ${over75Correct}/${over75Total} = ${pct(over75Correct, over75Total)} landed OVER`);
  console.log(`${'═'.repeat(64)}\n`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let dateFrom, dateTo;

if (args.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(args[0]) && /^\d{4}-\d{2}-\d{2}$/.test(args[1])) {
  dateFrom = args[0];
  dateTo = args[1];
} else if (args.length >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
  dateFrom = dateTo = args[0];
} else {
  // Default: last 7 days
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  dateTo = today.toISOString().split('T')[0];
  dateFrom = weekAgo.toISOString().split('T')[0];
}

runBacktest(dateFrom, dateTo).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
