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

## CSS structure

Two stylesheet files, both linked in `index.html` (in order):

- **`style.css`** — Base layout only: reset, body/app, header, HUD, stage badges, action buttons, grid cells, main layout, tool button bar, left nav, `.side-panel`/`.side-panel-inner`/`.panel-header` base styles, park view, modals, notification stack. The rule `.side-panel.closed { width: 0 !important; }` here must use `!important` because panel-specific ID rules (e.g. `#panel-research { width: 660px }`) have higher specificity.
- **`panels.css`** — All panel-specific content styles: construction, rides, inventory, staff, pricing, survey, security, research nodes/tree. Panel width overrides (`#panel-staffing { width: 320px }`, `#panel-research { width: 660px }`) live here.

When adding a new panel, put its content styles in `panels.css`.

---

## Code style

- **Comments on every function and constant.** Add a short comment above every function and every named constant explaining what it is or does. This is a project preference that overrides the default "only comment the non-obvious" guideline.

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

**Attendance:** `min(dailyDemand, gateThroughput)`. Demand = `parkExcitement × exhaustionFactor × eventFactor × compositeFavor × weatherFactor` where `weatherFactor = 1 − WEATHER_DEMAND_REDUCTION[nextWeekForecast]` (default 1). Throughput = booth attendants × `500 × moodMult × expMult × skillModifier`.

**Security (`Security` object):** `Security.opinion` rises by unhandled incidents each round, decays 20% (rounded up). Three incident sources: gate overflow (5%), unridden visitors (20%), random (0.1%) — rates live in `Population`. Two-phase handling: focus bonuses (free) then pooled normal capacity. Unhandled shop incidents cause theft losses at `$50` each.

**Shopping (`Shopping` object):** Revenue is demand-driven per item. Each round: (1) category desire = flat 1 + sum of `chance × favor` from every demographic bracket whose `preferredCategory` matches; (2) per-item affordability = sum of `chance` from income brackets whose `INCOME_LIMITS` entry ≥ shelf price; (3) `attempts = desire × afford × weeklyAttendance × BUYER_RATE × staffRatio × weatherMult` where `weatherMult` comes from `WEATHER_MERCHANDISE_MULTIPLIERS[nextWeekForecast][item.id]` (default 1); (4) `sold = min(attempts, stock)` — inventory deducted, revenue accumulated. Zero merchandise tiles → no revenue. Theft still scales by `sqrt(activeMerchandiseTiles)` and is multiplied by `1 + 0.25 × deficit`.

**Merchandise inventory (`merchandise`, `merchandiseInventory` in `game.js`):** `merchandise[]` is loaded from `merchandise.json` (12 items, 3 tiers per category: toy / practical / apparel / souvenir). `merchandiseInventory[]` is a parallel array of `{ count, price }` initialised at game start (count=100, price=basePrice). Stock depletes each round via `calcRevenue`; players restock via the Inventory panel.

**Suppliers (`suppliers`, `selectedSupplierId`, `unlockedSupplierIds` in `game.js`):** Loaded from `suppliers.json`. Only the first supplier is unlocked at start; others are unlocked by game events. Order cost = `qty × inv.price × Population.cumulativeInflation + supplier.surcharge`. Orders are stored in `orders[]` as `{ itemIndex, itemName, count, weeksRemaining }`; `tickOrders()` (called each round) decrements delivery countdowns and credits inventory on arrival, firing a Delivery notification.

**Inflation (`Population.cumulativeInflation`):** Starts at 1; multiplied each round by `(1 + inflationRate / 52)`. Used as a cost multiplier when placing restock orders.

**Staff (`Staff` object):** Employees have `skillModifier` (0.75–1.25), `costOfLiving` (base salary ±20%), `weeksEmployed`, `mood`, `focus`. Experience tiers: Junior / Normal / Senior / Lead (>260 wks). HR staff boost candidate generation. Security guards have focus assignments (Patrol / Gate / Shop). Merchandise Attendants are hired at minimum wage and staff the shop.

**Candidates:** Each round with postings → generate via `Staff.generateEmployee(quality)`. Candidates with no matching posting discarded immediately. Withdrawal: 20% at week 4, +20%/week. Player hires or declines — nothing auto-hires.

**Rides panel:** Master-detail. Tap a ride → detail view with pause/resume construction, close/reopen, last-round ridership bar, and weekly utility cost.

**Weather (`game.js`):** Two forecast slots: `nextWeekForecast` (applies this round) and `futurecastForecast` (2 weeks out). At the end of each round, `nextWeekForecast = futurecastForecast` and a new `futurecastForecast` is generated via `forecastForRound(round + 2)`. `forecastForRound` checks `HOLIDAY_FORECAST` (week 15 → 🐰, week 51 → 🎄) before falling back to `randomWeatherEmoji()`. Demand penalty: `WEATHER_DEMAND_REDUCTION` maps bad-weather emojis to a 0–1 reduction applied in `calcDailyDemand`. Per-item merch boost: `WEATHER_MERCHANDISE_MULTIPLIERS` maps an emoji to `{ itemId: multiplier }` applied to `attempts` in `Shopping.calcRevenue`. Weather panel in header is hidden until `WEATHER_SENSOR` research completes; futurecast slot hidden until `WEATHER_STATION`. To add a weather effect: add an entry to the relevant constant(s) in `game.js`.

---

## What's not yet implemented (priority candidates)

- Firing / wage adjustment UI
- Staff mood dynamics
- Ride breakdown / repair
- Reports / graphs
- Marketing and reputation
- `Population.inflationRate` wired to cost adjustments
- `Population.utilityMultiplier` wired to round-by-round increases
- Supplier unlock triggers (currently only first supplier is ever unlocked)
