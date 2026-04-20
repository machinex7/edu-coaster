# CLAUDE.md — edu-coaster

Educational theme park business simulation. Plain HTML/CSS/JS, no build tools, no framework.

**Full technical reference:** `README.md`  
**Game design document:** `reqs.md`  

---

## Running

```bash
python3 -m http.server   # must be HTTP — fetch() won't work over file://
# open http://localhost:8000
```

---

## Script load order (matters)

```
constants.js → game.js → grid.js → finance.js → staff.js → history.js → hud.js
```

---

## Key architecture rules

- **No build step.** Edit files directly; refresh browser to test.
- **Constants first.** All shared string enums live in `constants.js` as `Object.freeze({...})`. Never use raw strings for status, stage, job, or facility IDs — always use `STATUS.*`, `JOB.*`, etc.
- **Cross-file calls are safe.** All functions are globals declared with `function`; load order ensures definitions exist before any call at runtime.
- **No persistence.** All state is in-memory JS variables. Reload = fresh game.
- **Panel pattern.** Side panels are `position:absolute; left:100%` overlays inside `#left-nav`. One open at a time, toggled via `togglePanel(panelId)` in `hud.js`. To add a new panel: add a button to `#btn-bar`, add a `#panel-{name}` div in `index.html`, add `if (panelId === 'name') buildPanel()` in `openPanel()`.
- **Adding a job type.** Append to `JOB_TYPES` in `staff.js` and add the key to `JOB` in `constants.js`. Everything else (panel grouping, salary totals, hiring) picks it up automatically.
- **Adding a facility.** Add to `facilities.json`. Placement rules (`edgeOnly`, `mustBeAdjacentTo`, `limit`) are enforced by `canPlaceFacility()` in `game.js` — no code change needed for existing rule types.

---

## Current state summary

Two game stages: **Setup** (instant builds, no income) → **Play** (weekly rounds, construction payments, revenue).

**Finance:** `gatePrice` ($20 default) drives gate revenue. `priceExhaustion` is internal — rises when prices increase, decays 1/round, reduces demand by 1% per point. `parkingPrice` and `foodUpcharge` exist but aren't yet wired to revenue.

**Attendance:** `min(dailyDemand, gateThroughput)`. Demand = `parkExcitement × 20 × (1 − exhaustion/100)`. Throughput = booth attendants × `500 × moodMult × expMult × skillModifier`.

**Staff:** Each employee has `name`, `skillModifier` (0.75–1.25), `salaryModifier` (0.80–1.20), `weeksEmployed`. Experience tiers: Junior / Normal / Senior / Lead (>260 wks, 1.5×). HR staff boost candidate generation (+tier candidates, +tier×5 quality per HR employee).

**Candidates:** Each round with postings → generate candidates via `generateEmployee(quality)`. Candidates with no matching posting are discarded immediately. Withdrawal: 20% at week 4, +20%/week. Player hires or declines via Candidates panel — nothing auto-hires.

**Rides panel:** Master-detail. Tap a ride → detail view with pause/resume construction, close/reopen, and last-round ridership bar (actual vs max capacity).

---

## What's not yet implemented (priority candidates)

- Firing / wage adjustment UI
- Staff mood dynamics
- Ride breakdown / repair
- Parking and food revenue
- Reports / graphs
- Marketing and reputation
