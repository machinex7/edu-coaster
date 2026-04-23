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
constants.js → population.js → game.js → grid.js → shopping.js → finance.js → staff.js → staff-panel.js → security.js → history.js → hud.js
```

---

## Key architecture rules

- **No build step.** Edit files directly; refresh browser to test.
- **Constants first.** All shared string enums live in `constants.js` as `Object.freeze({...})`. Never use raw strings for status, stage, job, or facility IDs — always use `STATUS.*`, `JOB.*`, etc.
- **Global object pattern.** All major systems are plain objects: `Finance`, `Staff`, `Security`, `Shopping`, `History`, `Population`. State is properties; logic is methods using `this.*`. Arrow functions inside methods capture `this` lexically from the enclosing method — safe when called as `Object.method()`.
- **Cross-file calls are safe.** All objects and functions are globals; load order ensures definitions exist before any call at runtime. Forward references inside method bodies (e.g. `Finance` calling `Staff.*`) are fine because methods only execute after all scripts load.
- **No persistence.** All state is in-memory. Reload = fresh game.
- **Panel pattern.** Side panels are `position:absolute; left:100%` overlays inside `#left-nav`. One open at a time, toggled via `togglePanel(panelId)` in `hud.js`. To add a new panel: add a button to `#btn-bar`, add a `#panel-{name}` div in `index.html`, add `if (panelId === 'name') buildPanel()` in `openPanel()`.
- **Adding a job type.** Append to `Staff.JOB_TYPES` in `staff.js` and add the key to `JOB` in `constants.js`. Everything else (panel grouping, salary totals, hiring) picks it up automatically.
- **Adding a facility.** Add to `facilities.json`. Placement rules (`edgeOnly`, `mustBeAdjacentTo`, `limit`) are enforced by `canPlaceFacility()` in `game.js` — no code change needed for existing rule types.
- **Adding a shop type.** Add to `shops.json`. Add its id to `SHOP_ID` in `constants.js`. Placement validation reuses the facility rule system (`canPlaceFacility`).

---

## Current state summary

Two game stages: **Setup** (instant builds, no income) → **Play** (weekly rounds, construction payments, revenue).

**Finance (`Finance` object):** Revenue sources this round: gate (`gatePrice × weeklyAttendance`), parking (`floor(dailyDemand × 7 / 3) × parkingPrice`), shop (`Shopping.calcRevenue()`). Costs: staff wages + posting fees, ride utility costs (`utilityCost × Population.utilityMultiplier` per running ride), construction payments, theft losses. `priceExhaustion` decays 1/round, reduces demand 1% per point.

**Attendance:** `min(dailyDemand, gateThroughput)`. Demand = `parkExcitement × 20 × exhaustionFactor × securityFactor` where `securityFactor = 1 − √Security.opinion / 100`. Throughput = booth attendants × `500 × moodMult × expMult × skillModifier`.

**Security (`Security` object):** `Security.opinion` rises by unhandled incidents each round, decays 20% (rounded up). Three incident sources: gate overflow (5%), unridden visitors (20%), random (0.1%) — rates live in `Population`. Two-phase handling: focus bonuses (free) then pooled normal capacity. Unhandled shop incidents cause theft losses at `$50` each.

**Shopping (`Shopping` object):** Revenue and theft both scale by `sqrt(activeMerchandiseTiles)`. Revenue further multiplied by `staffRatio = min(1, attendants / workersNeeded)`. Theft multiplied by `1 + 0.25 × deficit`. Behavior rates (`BUYER_RATE`, `THEFT_RATE`) and economic multipliers (`utilityMultiplier`, `inflationRate`) live in `Population`.

**Staff (`Staff` object):** Employees have `skillModifier` (0.75–1.25), `costOfLiving` (base salary ±20%), `weeksEmployed`, `mood`, `focus`. Experience tiers: Junior / Normal / Senior / Lead (>260 wks). HR staff boost candidate generation. Security guards have focus assignments (Patrol / Gate / Shop). Merchandise Attendants are hired at minimum wage and staff the shop.

**Candidates:** Each round with postings → generate via `Staff.generateEmployee(quality)`. Candidates with no matching posting discarded immediately. Withdrawal: 20% at week 4, +20%/week. Player hires or declines — nothing auto-hires.

**Rides panel:** Master-detail. Tap a ride → detail view with pause/resume construction, close/reopen, last-round ridership bar, and weekly utility cost.

---

## What's not yet implemented (priority candidates)

- Firing / wage adjustment UI
- Staff mood dynamics
- Ride breakdown / repair
- Food revenue
- Reports / graphs
- Marketing and reputation
- `Population.inflationRate` wired to cost adjustments
- `Population.utilityMultiplier` wired to round-by-round increases
