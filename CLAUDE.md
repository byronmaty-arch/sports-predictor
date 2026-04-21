# CLAUDE.md — Sports Predictor

Guidance file for Claude Code when working in this repo. Keep this current: if
you change thresholds, swap data sources, add a new pick route, or retire a
filter, update the relevant section here in the same commit.

---

## Project purpose

A Telegram bot that generates a daily **football betting slip** for the top 5
European leagues (EPL, La Liga, Serie A, Bundesliga, Ligue 1). Each morning at
08:00 EAT (05:00 UTC) it pulls today's fixtures, runs each through a
Poisson + Dixon–Coles model enriched with Elo, xG, form, rest and injuries,
and posts a categorised slip (High Confidence / Double Chance hedges / Goals).
Also supports on-demand `/predict`, `/slip`, `/debug` commands and an optional
WhatsApp mirror via Twilio.

Deployed on **Railway** in webhook mode (not polling).

---

## Tech stack

- **Runtime:** Node.js (CommonJS), no build step
- **Bot framework:** `node-telegram-bot-api` (webhook mode)
- **HTTP server:** `express` (receives Telegram webhook POSTs at `/bot<TOKEN>`)
- **Scheduling:** `node-cron`
- **HTTP client:** native `fetch` (Node 18+); `node-fetch` listed but legacy
- **HTML parsing:** `cheerio` (legacy; current Understat path uses JSON)
- **Secondary channel:** `twilio` for WhatsApp
- **Hosting:** Railway (see `railway.json`; start = `node bot.js`)

No test framework is wired up. No lint config. No TypeScript.

---

## File map

| File | Role |
|---|---|
| `bot.js` | Telegram webhook server, command handlers, daily cron trigger |
| `slip.js` | Daily slip generator — orchestrates fixtures → per-match analysis → filtered pick list. **This is where all pick-safety thresholds live.** |
| `predictor.js` | `analyzMatch(home, away)` — composes all inputs into Poisson lambdas + probabilities |
| `poisson.js` | Poisson/Dixon–Coles math, score matrix, over/under probabilities, regression-to-mean |
| `elo.js` | Elo ratings: `SEED_ELO` per team, `calculateElo`, `eloStrengthMultiplier`, home bonus, K-factor |
| `fetcher.js` | football-data.org API client, Understat xG scraper, `UNDERSTAT_TEAM_MAP`, `computeTeamStats` with exponential decay |
| `injuries.js` | Player impact database + `computeInjuryFactor` (attack/defence multipliers) |
| `formatter.js` | Telegram HTML + WhatsApp plain-text slip renderers, message-section splitter |
| `whatsapp.js` | Twilio WhatsApp sender |
| `backtest.js` | Historical replay script — compares old slip picks vs current model on a date |
| `config.js` | API keys (Telegram, football-data.org, the-odds-api.com, Twilio). Keys are hardcoded as fallbacks — prefer env vars in production |
| `package.json` | Deps + `npm start` |
| `railway.json` | Railway deploy config |

### Scratch files

Validation/debug one-offs (`dryrun.js`, `validate_inputs.js`, `backtest_1804.js`)
should be deleted after use — never committed. If you need a scratch, write it
at the repo root and `rm` it at the end of the task.

---

## Data sources

1. **football-data.org** (free tier, 10 req/min) — fixtures + recent match
   results. Rate-limited: slip loop sleeps **22s between matches** (`RATE_LIMIT_DELAY`).
2. **Understat** — xG data. **Uses the JSON AJAX endpoint**
   `https://understat.com/getTeamData/{slug}/{season}` with
   `X-Requested-With: XMLHttpRequest` header. (The older HTML-scraper approach
   broke ~Nov 2025 when Understat stopped embedding `var matchesData` inline.)
   Team slugs are maintained in `UNDERSTAT_TEAM_MAP` in `fetcher.js`.
3. **the-odds-api.com** — bookmaker odds for value analysis (optional; slip
   works without it).

### Understat slug conventions

Slugs are the club title with spaces → underscores. Watch for these
non-obvious ones (mistakes here return silent `null`, not an error):

- `Borussia_Dortmund` (not `Dortmund`)
- `RasenBallsport_Leipzig` (not `RB_Leipzig`)
- `Hamburger_SV` (not `Hamburg`)
- `Mainz_05` (not `Mainz`)
- `Borussia_M.Gladbach` (dot, not underscore)
- `FC_Cologne` (not `FC_Koln`)
- `Inter` (not `Internazionale`)
- `Verona` (not `Hellas_Verona`)
- `VfB_Stuttgart` (not `Stuttgart`)
- `FC_Heidenheim` (not `Heidenheim`)
- `St._Pauli` (dot, not underscore)

To audit slugs end-to-end, hit `getTeamData/{slug}/{season}` with the XHR
header and confirm response starts with `{`. A 404 means the slug is wrong.

---

## Model architecture

`analyzMatch(home, away, { homeInjuries, awayInjuries })` in `predictor.js`:

1. Resolve team IDs via football-data.org search
2. Fetch last 10 matches per team + Understat xG + head-to-head (parallel)
3. Detect league → pick calibrated `LEAGUE_AVG_GOALS` from `LEAGUE_AVG_GOALS_MAP`
4. `computeTeamStats` — exponential decay (rate 0.1, e⁻¹ ≈ 37% weight at match 10)
5. Elo multiplier, rest-factor, form-momentum (last 5 venue-split), injury factor
6. Compose into attack/defence strengths, capped at `leagueAvg × 1.5`
7. Poisson + Dixon–Coles tau → probabilities
8. Regress toward mean by `confidence = min(played/10, 1.0)`
9. H2H blend (15% weight if ≥3 meetings)
10. Flag `drawRisk` (borderline home fav OR giant-killer setup) and `lowDataWarning` (<8 matches)

---

## Slip filter thresholds (slip.js)

All pick-safety constants live at the top of `slip.js`. Change in one place.

```
OUTCOME_THRESHOLD            = 0.65   // Min prob to be eligible
BORDERLINE_THRESHOLD         = 0.70   // 65-70% → DC only; ≥70% → outright
HEDGE_THRESHOLD              = 0.80   // DC hedge bar when no outright pick
OVER_THRESHOLD               = 0.75   // Goals bar (lopsided matches)
OVER_THRESHOLD_EVEN          = 0.80   // Goals bar (|eloGap| < 100)
EVEN_MATCH_ELO_GAP           = 100
AWAY_WIN_FLOOR               = 0.22   // Reject home/DC-home if away ≥22%
CLOSE_MATCH_ELO_GAP          = 60     // Reject home/DC-home if gap < 60
MIN_HOME_WIN_FOR_DC_HEDGE    = 0.45   // DC hedge needs homeWin ≥45%
OVER_XG_FLOOR = { over15: 2.5, over25: 3.3, over35: 4.2 }
```

### Lambda sanity cap (predictor.js)

Caps multiplicative factor stacking (Elo × form × rest × attack × weak-defence)
from producing totals beyond what a direct two-team xG blend would predict.

```
XG_BLEND_SANITY_MULT = 1.25   // in predictor.js
// blend  = (home.xg + away.xga)/2 + (away.xg + home.xga)/2
// if  λ_home + λ_away  >  blend × 1.25  →  scale both lambdas proportionally
```

### Season-blend on xG rates (fetcher.js)

`computeTeamStats` blends recent-decayed xG averages with the full-season
Understat sample (when ≥10 matches available). Weight:
`recent = min(played/10, 1.0) × 0.5` (max 0.5 recent, min 0.5 season).
Applied to overall avg and home/away splits — prevents a favourable/unfavourable
10-game run from hiding a team's true attacking or defensive rate. Example:
Girona 2025/26 season xGA = 1.79 but a 10-game sample trended to 1.5;
blend keeps the defensive weakness visible.

---

## What has been built (chronological, abridged)

Derived from `git log`. Highlights only — read the log for full context.

- Initial Poisson predictor + Telegram `/predict` handler
- Daily slip generator + 05:00 UTC cron (`1fdc498`)
- WhatsApp redundancy channel via Twilio (`1f27bb7`)
- Elo ratings with SEED_ELO table + rest-day fatigue (`f17f277`)
- League-only match filter (remove CL/EL pollution) (`2d2de83`)
- Injury override system with player impact DB (`784c14c`)
- Railway webhook mode (replacing polling) (`3cd8cf4`, `fd990e9`)
- Per-competition fixture querying — general endpoint was broken (`ce67039`)
- League-specific goal averages, defence-weakness cap, OVER dampening for favourites (`a1842e4`, `d5adb9b`)
- Form momentum, giant-killer draw risk, low-data warning, DC routing at 65-70% (`d406463`)
- Message splitter for Telegram 4096-char limit (`3793914`)
- **Three pick-safety filters** (close-match home-side vetoes + even-match over threshold + xG-total floors) (`82afc37`) — driven by the 18/04 backtest (2W/5L)
- **Understat xG scraper fix** (JSON AJAX endpoint + 9 slug corrections) (`106dfef`) — scraper had been silently failing for weeks; model was running on football-data goal counts only

---

## What's working

- Daily slip generation end-to-end (football-data + Understat + odds + injuries)
- Telegram webhook + cron + WhatsApp mirror
- xG data flowing correctly (verified 19/04: all 14 fixtures, both teams resolve)
- Three pick-safety filters active and correctly logging vetoes (`[slip] SKIP ...`)
- Message-length splitting
- `/predict`, `/slip`, `/debug`, `/quick`, plain-text "Team vs Team" handlers

---

## What's in progress / known issues

- **No automated tests.** Every change is validated by hand via dryrun scripts.
- **Bayern-style lambda inflation:** mitigated by the `XG_BLEND_SANITY_MULT`
  cap in `predictor.js` — totals can no longer exceed 1.25× the two-team xG
  blend. Residual risk: the cap still allows 25% headroom, so extreme
  strong-vs-weak fixtures may still be above the pure blend. If you see an
  O3.5 pick on a match where one team is markedly weaker, inspect the
  pre-cap and post-cap lambdas before trusting it.
- **API keys hardcoded in `config.js`** as fallbacks — should be env-only in prod.
- **`backtest.js` has uncommitted local changes** across sessions — keep scope
  clean when committing to avoid pulling unrelated diffs in.

---

## Deferred improvements (not yet tackled)

Originally raised during 18/04 failure analysis. Address when user requests:

1. **Market-disagreement filter** — use `valueAnalysis` as a sanity check:
   skip picks where our prob diverges sharply from the bookmaker's implied odds.
2. **Venue-split minimum** — partially addressed by the season-blend weighting
   in `computeTeamStats` (small venue sample → season xG dominates). Consider
   a hard floor of ≥6 venue matches before using the split stat at all.
3. **Wire injuries into the slip loop** — `/predict` accepts `--home-out` flags,
   but `generateDailySlip` doesn't pull injury data per fixture.
4. **Under 2.5 pick track** — currently only picks Overs; add a symmetric
   Under market for low-scoring matchups (xG total < 2.0, evenly matched).

---

## Common commands

```bash
# Start bot (webhook mode, requires Railway URL registered)
npm start

# Generate a slip locally without Telegram (write a scratch file):
#   const { generateDailySlip } = require('./slip');
#   const { formatSlipSections } = require('./formatter');
#   (async () => console.log((await formatSlipSections(await generateDailySlip())).join('\n')))();
# Takes ~6min due to 22s/match rate-limit delay.

# Replay past fixtures through current model (see backtest.js)
node backtest.js

# Deploy to Railway — happens automatically on push to master
git push
```

---

## Conventions & guardrails

- **Rate limit:** 22s sleep between matches in the slip loop. Don't parallelise
  — football-data.org free tier caps at 10 req/min.
- **Scratch files:** always delete before committing. Never commit `dryrun*.js`,
  `validate_*.js`, `backtest_*.js` one-offs.
- **Commit scope:** only stage files you touched in this session. `backtest.js`
  in particular often has cross-session local edits.
- **Don't amend published commits.** Always create a new commit after hook
  failures or to add fixes.
- **Understat scraping:** if every team suddenly returns null, assume Understat
  changed their endpoint again. Inspect `getTeamData/{slug}/2025` with the XHR
  header before assuming your map is wrong.
- **Threshold changes** must be reflected in the "Slip filter thresholds"
  section of this file in the same commit.
