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
constants.js → population.js → game.js → grid.js → shopping.js → banking.js → finance.js → staff.js → staff-panel.js → security.js → history.js → pl-statement.js → balance-sheet.js → concessions.js → hud.js
```

---

## CSS structure

Two stylesheet files, both linked in `index.html` (in order):

- **`style.css`** — Base layout only: reset, body/app, header, HUD, stage badges, action buttons, grid cells, main layout, tool button bar, left nav, `.side-panel`/`.side-panel-inner`/`.panel-header` base styles, park view (`#park-view`, `#park-scroll`, `#grid-wrapper`), view mode bar (`#view-mode-bar`, `.view-mode-btn`, `#view-mode-legend`, `.vml-item/.vml-dot`), security SVG overlay (`#security-overlay`), modals, notification stack. The rule `.side-panel.closed { width: 0 !important; }` here must use `!important` because panel-specific ID rules (e.g. `#panel-research { width: 660px }`) have higher specificity.
- **`panels.css`** — All panel-specific content styles: construction bottom bar (`#construction-bar`, `#cbar-tabs`, `.cbar-tab-btn`, `.cbar-panel`), item cards (`.item-card`), rides, inventory, staff, pricing, survey, security, research nodes/tree. Panel width overrides (`#panel-staffing { width: 320px }`, `#panel-research { width: 660px }`) live here.

When adding a new side panel, put its content styles in `panels.css`.

---

## Code style

- **Comments on every function and constant.** Add a short comment above every function and every named constant explaining what it is or does. This is a project preference that overrides the default "only comment the non-obvious" guideline.

---

## Key architecture rules

- **No build step.** Edit files directly; refresh browser to test.
- **Constants first.** All shared string enums live in `constants.js` as `Object.freeze({...})`. Never use raw strings for status, stage, job, or facility IDs — always use `STATUS.*`, `JOB.*`, etc.
- **Global object pattern.** All major systems are plain objects: `Finance`, `Staff`, `Security`, `Shopping`, `Concessions`, `History`, `Population`. State is properties; logic is methods using `this.*`. Arrow functions inside methods capture `this` lexically from the enclosing method — safe when called as `Object.method()`.
- **Cross-file calls are safe.** All objects and functions are globals; load order ensures definitions exist before any call at runtime. Forward references inside method bodies (e.g. `Finance` calling `Staff.*`) are fine because methods only execute after all scripts load.
- **No persistence.** All state is in-memory. Reload = fresh game.
- **Panel pattern.** Side panels are `position:absolute; left:100%` overlays inside `#left-nav`. One open at a time, toggled via `togglePanel(panelId)` in `hud.js`. To add a new panel: add a button to `#btn-bar`, add a `#panel-{name}` div in `index.html`, add `if (panelId === 'name') buildPanel()` in `openPanel()`.
- **View mode bar.** The toolbar above the grid (`#view-mode-bar`) controls `currentViewMode` in `hud.js`. Modes: `play` (default), `build` (shows construction bottom bar), `demolish`, `security` (SVG overlay). To add a new overlay mode: push an entry to `VIEW_MODES`, handle it in `setViewMode()` (show/hide whatever elements the mode needs), and add a legend entry in `_updateViewModeLegend()`. Call `refreshSecurityOverlay()` — or a mode-specific equivalent — from any code path that mutates the data the overlay visualises.
- **Adding a job type.** Append to `Staff.JOB_TYPES` in `staff.js` and add the key to `JOB` in `constants.js`. Everything else (panel grouping, salary totals, hiring) picks it up automatically.
- **Adding a facility.** Add to `facilities.json`. Placement rules (`edgeOnly`, `mustBeAdjacentTo`, `limit`) are enforced by `canPlaceFacility()` in `game.js` — no code change needed for existing rule types.
- **Adding a shop type.** Add to `shops.json`. Add its id to `SHOP_ID` in `constants.js`. Placement validation reuses the facility rule system (`canPlaceFacility`).
- **Adding an educational form.** Create a new file with a plain object implementing `pending` (boolean), `init()` (wire DOM listeners), and `show()` (build and display the modal). Add the script tag before `hud.js` in `index.html`. In `hud.js`: call `Form.init()` in `initHUD()`, set `Form.pending = true` on your trigger in `advanceRound()`, and add `if (Form.pending) Form.show()` in `hideRoundSummary()`. If your form always follows another form (e.g. the balance sheet always follows the P&L at year-end), chain it from the preceding form's `hide()` instead, and add an `else if` fallback in `hideRoundSummary()` for robustness. See `pl-statement.js`, `balance-sheet.js`, and the Educational forms section in `README.md` for the full pattern.

---

## Current state summary

Two game stages: **Setup** (instant builds, no income) → **Play** (weekly rounds, construction payments, revenue).

**Finance (`Finance` object):** Revenue sources this round: gate (`gatePrice × weeklyAttendance`), parking (`floor(dailyDemand × 7 / 3) × parkingPrice`), shop (`Shopping.calcRevenue()`), food (`Concessions.calcFood()`). Costs: staff wages + posting fees, ride utility costs (`utilityCost × Population.utilityMultiplier` per running ride), construction payments, theft losses. `priceExhaustion` decays 1/round, reduces demand 1% per point.

**Attendance:** `min(dailyDemand, gateThroughput)`. Demand = `parkExcitement × exhaustionFactor × eventFactor × compositeFavor × weatherFactor` where `weatherFactor = 1 − WEATHER_DEMAND_REDUCTION[nextWeekForecast]` (default 1). Throughput = booth attendants × `500 × moodMult × expMult × skillModifier`.

**Security (`Security` object):** `Security.opinion` rises by unhandled incidents each round, decays 20% (rounded up). Three incident sources: gate overflow (5%), unridden visitors (20%), random (0.1%) — rates live in `Population`. Two-phase handling: focus bonuses (free) then pooled normal capacity. Unhandled shop incidents cause theft losses at `$50` each.

**Shopping (`Shopping` object):** Merchandise revenue is demand-driven per item. Each round: (1) category desire = flat 1 + sum of `chance × favor` from every demographic bracket whose `preferredCategory` matches; (2) per-item affordability = sum of `chance` from income brackets whose `INCOME_LIMITS` entry ≥ shelf price; (3) `attempts = desire × afford × weeklyAttendance × BUYER_RATE × staffRatio × weatherMult` where `weatherMult` comes from `WEATHER_MERCHANDISE_MULTIPLIERS[nextWeekForecast][item.id]` (default 1); (4) `sold = min(attempts, stock)` — inventory deducted, revenue accumulated. Zero merchandise tiles → no revenue. Theft still scales by `sqrt(activeMerchandiseTiles)` and is multiplied by `1 + 0.25 × deficit`.

**Concessions (`Concessions` object):** 7 ingredients loaded from `concessions.json` (Water Cup is `alwaysAvailable` — no stock needed). Players set sale prices and create combo meals (arbitrary ingredient counts, custom name and price). Revenue from `Concessions.calcFood(weeklyAttendance)`: builds a pool of purchasable options (solo items + combos with stock), calculates Gaussian demand per `Population.HOUSEHOLD_SIZES` bracket weighted by `mealValue` proximity and income affordability, then cascade-fulfills from largest to smallest option — stock shortfalls roll demand down to the next option; worker capacity exhaustion is terminal. Returns `{ revenue, mealsSold, mealsWanted, mealsServed }`. `Finance.mealSatisfaction = min(1, 0.5 + 0.5 × mealsServed / mealsWanted)`; fixed at 1 when `!Unlock.FOOD`. Standing delivery orders lock on round 3, arrive round 4, then cycle advances by 4; charge = `subtotal + $75 delivery fee`. At delivery, `floor(stock × SPOILAGE_RATE (0.25))` of each non-`alwaysAvailable` item spoils before new stock is added; a Spoilage notification fires if anything spoiled.

**Merchandise inventory (`merchandise`, `merchandiseInventory` in `game.js`):** `merchandise[]` is loaded from `merchandise.json` (12 items, 3 tiers per category: toy / practical / apparel / souvenir). `merchandiseInventory[]` is a parallel array of `{ count, price }` initialised at game start (count=100, price=basePrice). Stock depletes each round via `calcRevenue`; players restock via the Inventory panel.

**Suppliers (`suppliers`, `selectedSupplierId`, `unlockedSupplierIds` in `game.js`):** Loaded from `suppliers.json`. Only the first supplier is unlocked at start; others are unlocked by game events. Order cost = `qty × inv.price × Population.cumulativeInflation + supplier.surcharge`. Orders are stored in `orders[]` as `{ itemIndex, itemName, count, weeksRemaining }`; `tickOrders()` (called each round) decrements delivery countdowns and credits inventory on arrival, firing a Delivery notification.

**Inflation (`Population.cumulativeInflation`):** Starts at 1; multiplied each round by `(1 + inflationRate / 52)`. Used as a cost multiplier when placing restock orders.

**Staff (`Staff` object):** Employees have `skillModifier` (0.75–1.25), `costOfLiving` (base salary ±20%), `weeksEmployed`, `mood`, `focus`. Experience tiers: Junior / Normal / Senior / Lead (>260 wks). HR staff boost candidate generation. Security guards have focus assignments (Patrol / Gate / Shop). Merchandise Attendants are hired at minimum wage and staff the shop.

**Candidates:** Each round with postings → generate via `Staff.generateEmployee(quality)`. Candidates with no matching posting discarded immediately. Withdrawal: 20% at week 4, +20%/week. Player hires or declines — nothing auto-hires.

**Rides panel:** Master-detail. Tap a ride → detail view with pause/resume construction, close/reopen, last-round ridership bar, and weekly utility cost.

**View mode bar (`hud.js`):** Pill-shaped toolbar pinned above the grid. `currentViewMode` tracks the active mode. `play` = default, nothing special. `build` = shows the construction bottom bar (`#construction-bar`). `demolish` = activates demolish grid mode. `security` = draws the SVG patrol-radius overlay via `drawSecurityOverlay()`. The overlay redraws automatically via `refreshSecurityOverlay()` whenever guard roster or focus changes (hooked in `Security.buildPanel`, `Staff.hireCandidate`, and the fire-confirm handler in `staff-panel.js`).

**Construction bar (`#construction-bar`):** Horizontal bar pinned to the bottom of `#park-view`. Visible only in `build` mode. Three tabs (Attractions / Shopping / Facilities) switch between `#ride-list`, `#shop-list`, `#facility-list` — the same divs populated by `buildRideCatalog()`, `buildFacilityList()`, and `Shopping.buildCatalog()` at game start. Items scroll horizontally as 180px-wide cards.

**Educational forms (`pl-statement.js`, `balance-sheet.js`):** Periodic drag-and-drop exercises that interrupt gameplay to test financial literacy. Each form is a plain object in its own file with `pending`, `init()`, and `show()`. `hud.js` sets `Form.pending = true` on a trigger condition in `advanceRound()`, then chains `Form.show()` from `hideRoundSummary()`. The P&L statement (`PLStatement`) fires every 13 rounds, sums the last quarter from `History.rounds`, and has students sort line items into Revenue vs. Expenses. The balance sheet (`BalanceSheet`) fires every 52 rounds and chains directly from `PLStatement.hide()` (since year-end is always also a quarter-end); students sort point-in-time asset and liability values, then see Owner's Equity revealed. Items lock on correct placement in both forms; wrong ones return to the bank for retry.

**Weather (`game.js`):** Two forecast slots: `nextWeekForecast` (applies this round) and `futurecastForecast` (2 weeks out). At the end of each round, `nextWeekForecast = futurecastForecast` and a new `futurecastForecast` is generated via `forecastForRound(round + 2)`. `forecastForRound` checks `HOLIDAY_FORECAST` (week 15 → 🐰, week 51 → 🎄) before falling back to `randomWeatherEmoji()`. Demand penalty: `WEATHER_DEMAND_REDUCTION` maps bad-weather emojis to a 0–1 reduction applied in `calcDailyDemand`. Per-item merch boost: `WEATHER_MERCHANDISE_MULTIPLIERS` maps an emoji to `{ itemId: multiplier }` applied to `attempts` in `Shopping.calcRevenue`. Weather panel in header is hidden until `WEATHER_SENSOR` research completes; futurecast slot hidden until `WEATHER_STATION`. To add a weather effect: add an entry to the relevant constant(s) in `game.js`.

---

## What's not yet implemented (priority candidates)

- Wage adjustment UI
- Staff mood dynamics
- Ride breakdown / repair
- Reports / graphs
- Marketing and reputation
- `Population.inflationRate` wired to cost adjustments
- `Population.utilityMultiplier` wired to round-by-round increases
- Supplier unlock triggers (currently only first supplier is ever unlocked)
