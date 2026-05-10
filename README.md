# edu-coaster

An educational browser game about running a theme park business. Students design a park, manage finances, staff, and long-term planning across turn-based weekly rounds. Teachers configure the starting scenario. Built in plain HTML, CSS, and JavaScript — no build tools, no framework, no dependencies.

See `reqs.md` for the full game design document.

---

## Running locally

Requires a local HTTP server (`fetch()` won't work over `file://`).

```bash
python3 -m http.server
# then open http://localhost:8000
```

---

## File index

| File | Purpose |
|---|---|
| `index.html` | Shell — layout structure only, no logic |
| `style.css` | All styles |
| `constants.js` | Frozen enum objects shared across all scripts |
| `unlock.js` | Progressive feature unlock system — `Unlock` flags and `UnlockWeeks` countdown table |
| `population.js` | Visitor behavior rates and external economic conditions (`Population` object) |
| `game.js` | Core state, grid constants, placement logic, construction queue, ride actions |
| `grid.js` | Grid DOM, cell painting, mouse/touch event handlers |
| `shopping.js` | Shop catalog, installed shops, revenue and theft calculations (`Shopping` object) |
| `finance.js` | Attendance model, park metrics, all income/cost sources, round processing (`Finance` object) |
| `banking.js` | Loan applications, covenants, repayments, and negotiation (`Banking` object) |
| `staff.js` | Job registry, employee generation, staff/candidates/postings/benefits simulation logic (`Staff` object) |
| `staff-panel.js` | All staffing panel UI — roster, postings, candidates, benefits views (extends `Staff` via `Object.assign`) |
| `security.js` | Security opinion state, incident calculation, panel UI (`Security` object) |
| `history.js` | Append-only per-round data log for future reports/graphs (`History` object) |
| `pl-statement.js` | Quarterly P&L statement exercise — drag-and-drop sorting modal (`PLStatement` object) |
| `balance-sheet.js` | Annual balance sheet exercise — drag-and-drop sorting modal (`BalanceSheet` object) |
| `budget.js` | Two-phase quarterly budget projection exercise — tentative forecast + post-P&L revision (`Budget` object) |
| `concessions.js` | Concessions panel: ingredient ordering, menu pricing, combo meals, food revenue calculation (`Concessions` object) |
| `membership.js` | Membership plan definitions, sales simulation, member attendance contribution, Admission-panel UI (`Membership` object) |
| `animations.js` | Visual-only visitor animation system — path caching, sprite movement, trash and coin particles (`Animations` object) |
| `hud.js` | HUD display, stage transitions, panel management, view mode toolbar, construction bottom bar, security SVG overlay, round summary modal, pricing panel |
| `incidents.js` | Random multi-phase incident system — spawn logic, phase management, computed property outputs, panel rendering (`Incidents` object) |
| `rides.json` | Ride catalogue |
| `facilities.json` | Facility catalogue |
| `shops.json` | Shop catalogue |
| `merchandise.json` | Merchandise item catalogue (12 items: 3 price tiers × 4 categories) |
| `suppliers.json` | Supplier catalogue (delivery time, surcharge; first entry unlocked at start) |
| `concessions.json` | Concessions menu item catalogue (7 items: id, name, cost, mealValue; water cup is `alwaysAvailable`) |
| `incidents.json` | Incident definitions — all incidents, their phases, effects, and challenge conditions |
| `reqs.md` | Full game design document — read before adding features |

**Script load order:**
```
constants.js → unlock.js → population.js → game.js → grid.js → pathfinding.js → shopping.js → banking.js → finance.js → staff.js → staff-panel.js → security.js → history.js → notifications.js → charts.js → survey.js → research.js → awards.js → discounts.js → marketing.js → visitor-profile.js → pl-statement.js → balance-sheet.js → cash-flow.js → budget.js → forms-panel.js → concessions.js → incidents.js → membership.js → animations.js → hud.js
```

All cross-file calls happen at runtime (not parse time), so forward references inside method bodies are safe.

---

## Architecture: global objects

All major systems use a plain-object pattern:

```js
const Foo = {
  someState: 0,
  someMethod() { this.someState++; },
};
```

| Object | File | Owns |
|---|---|---|
| `Population` | `population.js` | Visitor behavior rates, labor constants, economic multipliers |
| `Finance` | `finance.js` | Pricing state, attendance model, income/cost calculations, round processing |
| `Banking` | `banking.js` | Loan applications, covenants, repayments, negotiation |
| `Shopping` | `shopping.js` | Shop catalog, installed shops, merchandise revenue/theft math, staffing ratios |
| `Concessions` | `concessions.js` | Menu items, freezer stock, 4-week delivery orders, combo meals, food revenue calculation |
| `Membership` | `membership.js` | Annual membership plan definitions, weekly sales simulation, member attendance and parking, food/merch discount tracking |
| `Staff` | `staff.js` + `staff-panel.js` | Roster, postings, candidates, benefits policy, experience, panel rendering |
| `Security` | `security.js` | Opinion state, incident calculation, panel rendering |
| `History` | `history.js` | Append-only per-round log |
| `PLStatement` | `pl-statement.js` | Quarterly P&L drag-and-drop exercise |
| `BalanceSheet` | `balance-sheet.js` | Annual balance sheet drag-and-drop exercise |
| `Budget` | `budget.js` | Two-phase quarterly budget projection exercise |
| `FormsPanel` | `forms-panel.js` | Review panel — stores and renders the latest completed submission for each form type |
| `Incidents` | `incidents.js` | Random multi-phase incident system — spawn logic, phase management, computed property outputs, panel rendering |

---

## Shared constants (`constants.js`)

All enums are `Object.freeze`d — typos return `undefined` immediately rather than silently comparing wrong strings.

```js
STAGE          = { SETUP, PLAY }
STATUS         = { ACTIVE, UNDER_CONSTRUCTION, PAUSED_CONSTRUCTION, CLOSED, BROKEN_DOWN, DEMOLISHING }
CATEGORY       = { RIDE, FACILITY, SHOP }
JOB            = { RIDE_OPERATOR, SECURITY, JANITOR, ENGINEER, BOOTH_ATTENDANT,
                   MERCHANDISE_ATTENDANT, CONCESSIONS_WORKER, BUSINESS_ANALYST, HR }
FACILITY_ID    = { PARK_ENTRANCE, PATH, BATHROOM, STATUE, GARDEN, FOUNTAIN, STAFF_LOUNGE }
SECURITY_FOCUS = { PATROL, GATE, SHOP }
ENGINEER_FOCUS = { MAINTENANCE, CONSTRUCTION }
LOAN_STATUS    = { APPROACHING, OPEN, APPLYING, OFFERED, REVIEW }
MENU_ITEM      = { WATER_CUP, SODA, HOT_DOG, FRIES, TATER_TOTS, BURGER, CHICKEN_TENDERS }
MAX_EFFECTIVE_WEAR = 1000   // breakdown probability reaches 100% at this cumulative wear
WEEKS_PER_YEAR     = 52
COVENANT_RATE_DISCOUNT      = 0.4    // interest rate reduction per covenant accepted
MISSED_PAYMENT_RATE_PENALTY = 0.15   // rate premium added per historical missed payment
MISSED_PAYMENT_LTV_PENALTY  = 0.05   // LTV cap reduction per missed payment
```

---

## Population constants (`population.js`)

Centralises all tunable rates so game balance changes are made in one place.

| Constant | Used by |
|---|---|
| `MINIMUM_WAGE_WEEKLY` | `Staff.JOB_TYPES` (Merchandise Attendant and Concessions Worker salary) |
| `BUYER_RATE` | `Shopping.calcRevenue()` |
| `THEFT_RATE` | `Shopping.calcTheftIncidents()` |
| `OVERFLOW_INCIDENT_RATE` | `Security.calcIncidents()` |
| `UNRIDDEN_INCIDENT_RATE` | `Security.calcIncidents()` |
| `RANDOM_INCIDENT_RATE` | `Security.calcIncidents()` |
| `utilityMultiplier` | `Finance.calcUtilityCosts()` — stub for rising energy costs |
| `inflationRate` | Annual rate; `Staff.applyInflation()` applies `inflationRate/52` to each employee's `costOfLiving` per round |

---

## Game stages

| Stage | Behaviour |
|---|---|
| `STAGE.SETUP` | Items placed instantly at full cost. No income. Park opens once a Park Entrance and at least one connected ride exist. |
| `STAGE.PLAY` | Items under construction pay `buildCost / buildWeeks` per round. All income and expenses process on each round advance. |

---

## Feature unlock system (`unlock.js`)

Features are revealed progressively so new players learn one system at a time. Teachers can also permanently disable features to focus a lesson on a single concept.

### Configuration

Edit `_DEFS` in `unlock.js`:

```js
const _DEFS = {
  STAFFING:    { afterWeek: 4,   name: 'Staffing' },
  MESSES:      { afterWeek: 6,   name: 'Messes' },
  MERCHANDISE: { afterWeek: 6,   name: 'Merchandise' },
  SECURITY:    { afterWeek: 8,   name: 'Security' },
  FOOD:        { afterWeek: 8,   name: 'Food & Dining' },
  LOANS:       { afterWeek: 10,  name: 'Business Loans' },
};
```

| `afterWeek` value | Behaviour |
|---|---|
| `0` | Unlocked immediately at game start |
| `n > 0` | Unlocks after n rounds of play; notification fires on unlock |
| `null` | Permanently disabled for the entire session |

### Runtime API

```js
Unlock.SECURITY       // boolean — read directly in any conditional
UnlockWeeks.SECURITY  // rounds remaining (0 if unlocked, null if permanent)
Unlock.tick()         // called once per round from advanceRound()
```

`Unlock.tick()` is called in `advanceRound()` after `round++` and before `updateLockedPanels()`, so UI hides/shows take effect in the same frame the feature unlocks.

### What each feature gates

| Feature | UI hidden | Calculations bypassed |
|---|---|---|
| `STAFFING` | Staffing nav button; Staff Lounge in construction | All staff event processing; wages/postings/insurance costs set to 0; gate throughput → ∞; ride staffRatio → 1; merchandise staffRatio → 1; food capacity → unlimited; janitor capacity → ∞; research assumes 1 junior analyst |
| `MESSES` | Mess map mode | `messFactor` fixed at 1 in `calcExcitement`; cleanliness excluded from survey |
| `MERCHANDISE` | Inventory nav button; merchandise shops in construction; Merchandise Attendant job type | Shopper mess contribution zeroed; theft incidents → 0; shopping excluded from survey |
| `FOOD` | Food shops in construction; Concessions Worker job type | `mealSatisfaction` fixed at 1; food excluded from survey |
| `SECURITY` | Security nav button; Security map mode; Guard Post in construction; Security guard job type | `Security.calcIncidents()` returns zeros (no theft, no incidents); `advanceOpinion` skipped; `securityFactor` fixed at 1 in `calcExcitement` |
| `LOANS` | Loan section in Banking panel | *(no calculation bypass — loan mechanics simply can't be initiated)* |

On park open, any hired staff whose feature is locked are automatically removed from the roster (`Staff.purgeLockedRoles()`).

---

## UI layout

```
<header>           — HUD: budget, date, stage badge, weather, staff/ride counts
<div id="main">
  <div id="left-nav">            — position:relative container
    <nav id="btn-bar">           — narrow vertical button bar; always visible
    <div class="side-panel">     — Rides (master-detail)
    <div class="side-panel">     — Staffing (Roster / Postings / Candidates / Benefits tabs)
    <div class="side-panel">     — Security (guard list with focus assignment)
    <div class="side-panel">     — Admission (gate pricing)
    <div class="side-panel">     — Banking (loan application + active loans)
    … (other side panels)
  <div id="park-view">           — flex column
    <div id="view-mode-bar">     — pill-button toolbar: Play / Build / Demolish / Security / …
    <div id="park-scroll">       — flex:1, scrollable, centers the grid wrapper
      <div id="grid-wrapper">    — position:relative; holds grid + SVG overlay
        <div id="grid">          — CSS grid of 20×20 cells
        <svg id="security-overlay"> — absolute, pointer-events:none; drawn in security mode
    <div id="construction-bar">  — horizontal build menu; visible only in Build mode
      <div id="cbar-tabs">       — Attractions / Shopping / Facilities tabs
      <div id="cbar-content">    — horizontally scrolling item cards
<div id="round-modal">           — fixed overlay, shown after each round
```

Side panels slide open at `left: 100%` of `#btn-bar` (overlaying the park). Width transitions 0 ↔ 275px. Only one panel open at a time. The construction menu is a bottom bar, not a side panel.

---

## Grid

- **Size:** 20 × 20, cells 40 px with 1 px gap (`CELL_STEP = 41 px`).
- **`gridCells[r][c]`** — 2D array of `<div>` elements, built once in `buildGrid()`.
- **`gridState[r][c]`** — parallel 2D array of `instanceId | null`. Source of truth for collision detection.
- **`facilityTypeAtCell["row,col"]`** — fast lookup map from cell coordinate to `facilityId`.

---

## Placed item records

```js
// installedRides[]
{
  instanceId,             // "ride_{id}_{timestamp}"
  rideId, name, color,
  row, col, footprint,
  status,                 // STATUS.ACTIVE | UNDER_CONSTRUCTION | PAUSED_CONSTRUCTION | CLOSED | BROKEN_DOWN | DEMOLISHING
  // if under_construction or paused_construction:
  weeksTotal, weeksCompleted, weeklyPayment,
  // populated after first round running:
  lastRoundRiders,        // actual weekly riders (staff-ratio adjusted)
  lastRoundCapacity,      // max weekly riders at full staffing
}
```

`installedFacilities[]` and `Shopping.installed[]` share the same shape minus the ride-specific fields.

### Status transitions

```
UNDER_CONSTRUCTION ←→ PAUSED_CONSTRUCTION   (pause/resume in Rides panel)
UNDER_CONSTRUCTION → ACTIVE                 (construction completes)
ACTIVE ←→ CLOSED                            (close/reopen in Rides panel)
ACTIVE → BROKEN_DOWN                        (wear-based breakdown)
BROKEN_DOWN → ACTIVE                        (engineer repairs)
any → DEMOLISHING                           (player uses Demolish tool; irrevocable)
DEMOLISHING → (removed)                     (processDemolition completes countdown)
```

Demolishing structures are excluded from all game calculations. Demolition takes `ceil(buildWeeks / 2)` rounds; items with `buildWeeks === 0` (paths and setup-built structures) are removed instantly. The Park Entrance cannot be demolished.

---

## Finance system (`finance.js`)

### Pricing state

| Property | Notes |
|---|---|
| `gatePrice` | $ per visitor |
| `parkingPrice` | $ per vehicle |
| `priceExhaustion` | Rises on price increases, decays 1/round; reduces demand |

### Park metrics

| Property | Description |
|---|---|
| `Finance.parkExcitement` | Drives daily demand. Computed end-of-round from attendance, ride satisfaction, security opinion, and meal satisfaction. |
| `Finance.rideOpinion` | Smoothed 0–1 score of ride capacity vs. crowd size. Degrades when operators can't serve all visitors. |
| `Finance.mealSatisfaction` | Food capacity vs. visitor demand. Penalises `parkExcitement` when food is undersupplied. |
| `Security.opinion` | Suppresses demand each round. Rises with unhandled incidents, decays by a fraction each round. |

### Attendance model

`Finance.calcDailyDemand()` — key signals: `parkExcitement`, price exhaustion, population events, demographic favor, weather forecast (`WEATHER_DEMAND_REDUCTION`).

`Finance.calcGateThroughput()` — key signals: working booth attendant count, mood, experience tier, skill modifier.

`Finance.calcDailyAttendance()` — min of demand and throughput; multiplied by 7 for weekly figure.

### Income sources

All revenue is recorded at **gross** (full-price) amounts. The cost of membership benefits is subtracted separately as a single expense line so each stream's true potential is visible.

| Source | Signals |
|---|---|
| Gate | gate price × weekly paying attendance + member admission value (grossed up) |
| Parking | parking price × paying vehicle estimate + non-free-parking member vehicles + free-parking member vehicle value (grossed up) |
| Shop | see `Shopping.calcRevenue()` (full price regardless of member discounts) |
| Food | see `Concessions.calcFood()` (full price regardless of member discounts) |
| Memberships | annual price × new sales this round; see `Membership.calcSales()` |

### Cost sources

| Source | Signals |
|---|---|
| Staff wages | all employed staff salaries, including those currently absent |
| Posting fees | weekly cost per active job posting |
| Ride utilities | running connected rides × `Population.utilityMultiplier` |
| Facility utilities | active facilities with a `utilityCost` field × `Population.utilityMultiplier` |
| Construction | weekly installment per item under construction |
| Theft loss | unhandled shop incidents × `THEFT_LOSS_PER` |
| Membership benefits | sum of: free admission value (memberAttendance × gatePrice), free parking value (freeParkingVehicles × parkingPrice, only when PARKING_FEES unlocked), food discount loss, merch discount loss |

### Round processing order (`Finance.processRound`)

1. `processEngineers()` — repair/maintenance before excitement recalc
2. `recalcExcitement()`
3. Calc demand, throughput, attendance
4. `computeRideOpinion()` — updates `rideOpinion`; writes `lastRoundRiders/Capacity`
5. `processWear()` — accumulate wear, roll for breakdown (probability = wear / `MAX_EFFECTIVE_WEAR`)
6. `Membership.calcMemberAttendance()` — estimate member visits, free/paid parking vehicles, food/merch discount fractions
7. `Concessions.calcFood()` — compute food revenue, `mealsWanted`, and `mealsServed`
8. Calc membership benefit costs; gross up gate and parking revenues; subtract combined benefit loss
9. `Banking.processLoanRepayments()` — deduct weekly amortized payments before other costs
10. Calc remaining costs; apply to `money`
11. `processConstruction()` — deduct weekly payments, complete finished builds
11a. `processDemolition()` — advance demolition timers, remove completed demolitions
12. `Banking.processCovenantBreaches()` — collect deferred breach fees; retire breached covenants
13. `Banking.processActiveCovenants(weeklyAttendance)` — check ongoing covenants; call `breachCovenant` on violations
14. `Staff.processSickness()` — decrement absences, roll for new illness/injury/vacation
15. `Staff.advanceExperience/applyInflation/updateMoods/advancePostings/generateCandidates/advanceCandidates()`
16. Calc `weeklyNetMess`; compute `mealSatisfaction`; call `calcExcitement()`
17. `Membership.calcSales()` — simulate membership purchases; update 52-week sliding windows; return revenue
18. `advancePriceExhaustion()`
19. `Security.advanceOpinion(unhandled)`

`advanceRound()` (in `hud.js`) calls `Banking.processPendingLoan()` each round to advance the loan application state machine.

### Loans

Players can apply for loans via the Banking panel. The full flow:

```
[form] → APPROACHING → (1 round risk check) → OPEN → [Apply] → APPLYING → (1 round) → OFFERED → [Accept] → REVIEW → (2 rounds) → disbursed
```

**State machine (`Banking.loanApplication`):**

| State | Meaning |
|---|---|
| `APPROACHING` | Initial eligibility check pending (next round) |
| `OPEN` | Bank accepted; player can click Apply For Loan |
| `APPLYING` | Awaiting offer (next round) |
| `OFFERED` | Bank has posted terms; player reviews and negotiates |
| `REVIEW` | Accepted; 2-round final review before funds arrive |
| `null` | No active application |

**Eligibility (`Banking.processPendingLoan`, APPROACHING state):**

`Finance.parkValue()` sums: active/closed building costs; in-construction payments made so far; broken-down rides at a 10%-per-repair-week discount; merchandise inventory value; current cash. The requested amount must be positive and below `Banking.effectiveLtvCap(purpose) × parkValue`. LTV caps by purpose: new rides 70%, staffing 50%, emergency 90%; each missed payment reduces the cap by `MISSED_PAYMENT_LTV_PENALTY`.

**Interest rate (`Banking.calcLoanRate`):**

`baseRate = Population.inflationRate × 100 + 1`, then additive premiums:

| Component | Range |
|---|---|
| LTV premium | 0 / 0.75 / 1.75 / 3.5% depending on loan-to-value ratio |
| Coverage premium | Based on recent income vs. expenses |
| Term premium | 0 (≤1 yr) / 0.5 / 1.0 / 1.5% |
| Favor premium | −0.5 to +0.5 based on bank favor (1–3) |
| Covenant discount | −`COVENANT_RATE_DISCOUNT` per covenant accepted |
| Missed payment penalty | +`MISSED_PAYMENT_RATE_PENALTY` per historical missed payment |

**Bank favor (1–3):** Randomly generated at application time. Upper limit shrinks by 1 per existing active loan (floored at 1). Displayed on the offer panel; each negotiation action spends 1 favor point.

**Covenants:** The bank includes one randomly chosen applicable covenant in its offer. Seven types:

| ID | Applicable to | Enforcement |
|---|---|---|
| `MIN_CASH` | All | Must maintain a cash floor for the loan term |
| `NO_NEW_LOANS` | All | Loan panel blocks new applications while active |
| `COMPLETE_RIDE` | new_rides | Must complete 1 new ride within 25% of term |
| `NO_DEMOLISH` | new_rides | Demolish panel blocked while active |
| `HIRE_STAFF` | staffing | Must hire N new employees within 25% of term |
| `RIDERSHIP_FLOOR` | new_rides, staffing | Must maintain attendance ≥ floor for the full term |
| `SECURITY_THRESHOLD` | emergency | Security opinion must stay below threshold for full term |

`MIN_CASH`, `RIDERSHIP_FLOOR`, and `SECURITY_THRESHOLD` are ongoing — checked every round. `COMPLETE_RIDE` and `HIRE_STAFF` are achievement-based — satisfied once met, breached at their deadline. `NO_NEW_LOANS` and `NO_DEMOLISH` are UI locks only. Breaching a covenant queues a deferred fee (5–20% of loan amount, set at offer time); the fee is collected the following round and the covenant is permanently retired (`breached = true`).

**Negotiation:** Spending bank favor allows: removing a covenant (+0.3% rate), reducing the rate by 0.5% (with a free covenant) or 0.2% (without), or reducing the breach fee by 5% (floor 5%).

**Repayment (`Banking.calcLoanPayment`):**

Standard amortization: `PMT = P × r(1+r)^n / ((1+r)^n − 1)` where `r = annualRate/100/52` and `n = weeksRemaining`. Returns `{ total, principal }` where `principal = total − (balance × r)`. If `weeksRemaining ≤ 1` the full balance is returned as principal. Loans are fully paid off when `balance ≤ 0`; they are removed from `Banking.activeLoans` automatically.

Missed payments increment `loan.missedPayments` and `Banking.totalMissedPayments`, which permanently penalise future loan rates and LTV caps.

**History:** Each round's `History` entry records `loanBalance`, `loanInterestPaid`, and `loanPrincipalPaid` across all active loans.

---

## Weather system (`game.js`)

Two forecast state variables live in `game.js`:

| Variable | Meaning |
|---|---|
| `nextWeekForecast` | Weather emoji applied this round by `Finance` and `Shopping` |
| `futurecastForecast` | Weather emoji shown as "+2 Wks" in the HUD |

At the end of each `advanceRound`: `nextWeekForecast = futurecastForecast`, then `futurecastForecast = forecastForRound(round + 2)`.

`forecastForRound(r)` checks `HOLIDAY_FORECAST` for the corresponding week-in-year before falling back to `randomWeatherEmoji()`.

### Constants (all in `game.js`)

| Constant | Purpose |
|---|---|
| `WEATHER_EMOJIS` | Pool of random forecast emojis |
| `WEATHER_DEMAND_REDUCTION` | Maps emoji → fraction subtracted from demand (e.g. `'⛈️': 0.25`) |
| `WEATHER_MERCHANDISE_MULTIPLIERS` | Maps emoji → `{ itemId: multiplier }` applied to purchase attempts |
| `HOLIDAY_FORECAST` | Maps week-in-year → fixed emoji (15 → 🐰, 51 → 🎄) |

### HUD gating

| Research | Effect |
|---|---|
| `WEATHER_SENSOR` | Shows the weather panel (Next Wk forecast) |
| `WEATHER_STATION` | Additionally shows the +2 Wks futurecast slot |

---

## Incidents system (`incidents.js` + `incidents.json`)

Random multi-phase events defined entirely in `incidents.json`. No code changes are required to add new incidents.

### Spawn rules

| Rule | Value |
|---|---|
| Per-round spawn chance (when eligible) | `SPAWN_CHANCE = 0.05` (5%) |
| Global cooldown after any incident ends | `GLOBAL_COOLDOWN_ROUNDS = 4` rounds |
| Annual cap | No more than 2 incidents may begin within any rolling 52-round window |
| Per-incident cooldown | `cooldown` field in JSON; incident cannot re-spawn until that many rounds have passed since it last ended |
| Minimum round | `minRound` field; incident not eligible until that round |
| Trigger condition | Optional `triggerCondition` — e.g. `has_employee` requires a specific job to exist on the roster |

When eligible, a weighted random draw selects from all qualifying incidents (`weight` field controls relative probability). Only one incident can be active at a time; `tick()` skips the spawn check entirely while `active !== null`.

### Incident JSON schema (`incidents.json`)

```json
{
  "id":               "unique_snake_case_string",
  "name":             "Display Name",
  "emoji":            "🌡️",
  "weight":           2,
  "minRound":         8,
  "cooldown":         26,
  "triggerCondition": { "type": "has_employee", "jobId": "business_analyst" },
  "phases": [ ... ]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | Unique identifier; used for per-incident cooldown tracking |
| `name` | Yes | Panel and notification display name |
| `emoji` | Yes | Used in notifications, HUD pill, and panel header |
| `weight` | No | Relative spawn probability (default 1) |
| `minRound` | No | Earliest round the incident can spawn (default 0) |
| `cooldown` | No | Rounds before this incident can spawn again (default 0); use 999 for once-per-game |
| `triggerCondition` | No | Additional runtime check; currently only `has_employee` is supported |
| `phases` | Yes | Ordered array of phase objects |

### Phase schema

```json
{
  "name":          "Phase Display Name",
  "durationWeeks": 4,
  "flavor":        ["Week 1 narrative.", "Week 2 narrative."],
  "challenge":     { ... },
  "effects":       [ ... ]
}
```

| Field | Notes |
|---|---|
| `name` | Shown in panel header and phase-change notifications |
| `durationWeeks` | How many rounds this phase lasts before auto-advancing |
| `flavor` | Array of narrative strings. Index 0 plays on the spawn round; subsequent indices play on subsequent weeks. The last entry repeats if elapsed > array length. |
| `challenge` | Optional — see Challenge schema below |
| `effects` | Array of effect objects (may be empty) |

### Challenge schema

```json
{
  "conditionType": "security_clean",
  "failImmediately": true,
  "onSuccess": 2,
  "onFail": 3
}
```

| Field | Notes |
|---|---|
| `conditionType` | `"security_clean"` — zero unhandled incidents last round; `"benefits_unlocked"` — EMPLOYEE_BENEFITS research completed |
| `failImmediately` | `true`: condition re-evaluated every round — first failure jumps to `onFail` immediately; `false`: condition evaluated only once at phase end |
| `onSuccess` | Phase index to advance to on success (0-based) |
| `onFail` | Phase index to advance to on failure (0-based) |

`onSuccess`/`onFail` indices that exceed the phase array length end the incident. Pass `null` to end the incident immediately.

### Effect schema

Each effect object has at minimum a `type` field. Effects with `"timing": "on_start"` fire exactly once when their phase begins; all others are recurring (recomputed every tick).

#### Recurring effects (reset each tick, read by other systems)

| `type` | Extra fields | What it does |
|---|---|---|
| `demand_multiplier` | `value` | Multiplied into `Finance.calcDailyDemand()` |
| `ride_demand_multiplier` | `value`, `rampPerRound?` | Multiplied into `Finance.calcExcitement()`. Optional `rampPerRound` changes the effective value by that amount per week elapsed: `Math.max(0, value + rampPerRound × elapsed)` |
| `bathroom_disabled` | *(none)* | Stops bathrooms contributing to mess cleanup |
| `staff_sick_multiplier` | `value` | Multiplied into sick-out rate in `Staff.processSickness()` |
| `ingredient_cost_multiplier` | `value`, `itemIds[]` | Multiplied into `Concessions` ingredient order costs for the listed item IDs |
| `ride_build_cost_multiplier` | `value`, `rampPerRound?` | Multiplied into ride/facility build cost in `placeItem()`. Clamped at 1.0 minimum. Optional `rampPerRound`: `Math.max(1, value + rampPerRound × elapsed)` |
| `utility_cost_multiplier` | `value`, `rampPerRound?` | Multiplied into per-ride utility cost in `Finance.calcUtilityCosts()`. Clamped at 1.0 minimum. Optional `rampPerRound`: `Math.max(1, value + rampPerRound × elapsed)` |

#### One-shot effects (`"timing": "on_start"`)

| `type` | Extra fields | What it does |
|---|---|---|
| `spoil_all_food` | *(none)* | Zeros all non-`alwaysAvailable` concessions stock |
| `wear_all_rides` | `amount` | Adds `amount` wear points to every installed ride |
| `demolish_paths_fraction` | `fraction` | Randomly demolishes `floor(paths.length × fraction)` path tiles immediately; clears animation path cache |
| `halve_cash` | *(none)* | Sets `money = floor(money / 2)` |
| `fire_employee` | `jobId` | Removes the first employee with matching `jobId` from the roster |
| `staff_mood_bonus` | `value` | Adds `value` mood points (capped at 100) to every employee |
| `staff_strike_fraction` | `value` | Forces `floor(working.length × value)` currently-working staff onto a 3-week absence |
| `demographic_chance_multiplier` | `bracketKey`, `bracketIndices[]`, `value` | **Permanent.** Multiplies the `chance` field of the targeted `Population[bracketKey]` entries. Do NOT reset `baselineFavorablePopulation` afterward — the reduced market must produce a lasting multiplier < 1. |
| `desired_rides_addend` | `value` | **Permanent.** Adds `value` to `Population.DESIRED_RIDES` |
| `staff_parental_rate_multiplier` | `value` | **Permanent.** Multiplies `Staff.PARENTAL_LEAVE_RATE` by `value` |
| `demographic_count_multiplier` | `bracketKey`, `bracketIndices[]`, `value` | **Permanent.** Multiplies the `count` field of the targeted `Population[bracketKey]` entries. Do NOT reset `baselineFavorablePopulation` — the enlarged market must produce a lasting multiplier > 1. |
| `inflation_addend` | `value` | **Permanent.** Adds `value` (decimal) to `Population.inflationRate`. Use positive values to spike inflation (e.g. economic crisis `+0.08`) and negative values for partial recovery (e.g. `−0.06`). Clamped at 0. Cascades to staff cost-of-living growth, cumulative inflation, and loan rate calculations. |

### Computed properties

`Incidents._recomputeProperties()` runs every tick. All properties reset to their defaults, then the active phase's recurring effects are applied. Other systems read these properties directly — no scattered conditionals in those files.

| Property | Default | Pending integration point |
|---|---|---|
| `demandMultiplier` | `1` | `Finance.calcDailyDemand()` — multiplied with other demand factors |
| `rideExcitementMultiplier` | `1` | `Finance.calcExcitement()` — scales effective ride opinion before excitement is computed |
| `bathroomsDisabled` | `false` | `Finance.calcMessGenerated()` — uses max distance for intense-ride mess when true |
| `staffSickMultiplier` | `1` | `Staff.processSickness()` — multiplied into `SICKNESS_RATE` |
| `ingredientCostMultipliers` | `{}` | `Concessions.onRoundAdvance()` and order panel — per-item cost multiplied by `multipliers[item.id] ?? 1` |
| `rideBuildCostMultiplier` | `1` | `placeItem()` in `game.js` — multiplied into build cost and weekly payment at placement time |
| `utilityCostMultiplier` | `1` | `Finance.payUtilityCosts()` — multiplied into per-ride and per-facility utility cost |

### `hud.js` integration points

| Where | What |
|---|---|
| `initHUD()` | `Incidents.init()` — fetches and parses `incidents.json` |
| `advanceRound()` | `Incidents.tick()` called before `Finance.processRound()` |
| `advanceRound()` | `Incidents.refreshPanel()` called after the round completes if the incidents panel is open |
| `showRoundSummary()` | `Incidents.currentFlavor()` prepended to the population events list |
| `updateAchievementIndicators()` | `Incidents.hudPill()` contributes a pill to the HUD indicator row |
| `openPanel()` | `Incidents.buildPanel()` builds the side panel on open |

### Adding a new incident

1. Add an object to `incidents.json` with the schema above.
2. If the incident requires a new effect type: add a `case` to `_applyOneShotEffect` (one-shot) or `_applyRecurringEffect` (recurring) in `incidents.js`, then read the new computed property in the relevant system file.
3. If the incident requires a new challenge condition: add a `case` to `_evalChallenge` and a `case` to `_describeChallenge` in `incidents.js`.

---

## Security system (`security.js`)

`Security.opinion` rises by `unhandled` incident count each round; decays `ceil(opinion × 0.20)` per round. Suppresses demand via `1 − √opinion / 100`.

Only guards with `weeksOut === 0` count toward capacity and focus bonuses.

### Incident sources

| Source | Handled by focus |
|---|---|
| Gate overflow | Gate guards |
| Unridden visitors | Patrol guards |
| Shop theft | Shop guards |
| Random | Any |

### Two-phase handling

1. **Focus bonus** — each guard with a matching focus handles `FOCUS_BONUS` extra incidents of that type, free.
2. **Normal capacity** — pooled weekly quota per guard: `(3 + tier) × 7`. Handles remaining incidents.

Unhandled shop incidents cost `THEFT_LOSS_PER` each.

---

## Shopping system (`shopping.js`)

Shop entries in `shops.json` carry a `shopType` field (`"merchandise"` or `"food"`) which gates which calculations they participate in.

### Merchandise

`Shopping.calcRevenue()` — per-item demand model using `merchandise` and `merchandiseInventory` (parallel arrays loaded from `merchandise.json`). Key signals: category desire (demographic `preferredCategory` brackets), item affordability (income brackets vs. shelf price), weekly attendance, staffing ratio, and weather multiplier (`WEATHER_MERCHANDISE_MULTIPLIERS`). Stock is deducted from `merchandiseInventory` each round.

Theft is calculated separately — key signals: attendance, merchandise tile count, staffing deficit. Zero merchandise tiles → no revenue and no theft.

### Inventory and orders

`merchandise[]` — catalogue from `merchandise.json`. 12 items: toy / practical / apparel / souvenir × cheap / mid / high.

`merchandiseInventory[]` — parallel runtime array of `{ count, price }`. Initialised at game start (count=100, price=basePrice). Depletes each round via `calcRevenue`.

`orders[]` — pending restock orders: `{ itemIndex, itemName, count, weeksRemaining }`. Created via the Inventory panel. `tickOrders()` runs at the start of each `advanceRound`, decrementing `weeksRemaining`; arrivals add to inventory and push a Delivery notification chip.

`Population.cumulativeInflation` starts at 1 and compounds weekly. Order cost = item price × quantity × inflation multiplier + supplier surcharge.

### Suppliers

Loaded from `suppliers.json` into `suppliers[]`. Active supplier tracked in `selectedSupplierId`; available suppliers in `unlockedSupplierIds` (Set). Only the first supplier is unlocked at game start. Each supplier has `{ id, name, deliveryTime, surcharge }`.

Storage capacity = `calcMerchandiseTiles() × STORAGE_PER_SHOP` (displayed as a progress bar in the Inventory panel Stock tab).

---

## Concessions system (`concessions.js`)

The `Concessions` object handles food & beverage: ingredient ordering, freezer stock, menu pricing, combo meal creation, and per-round revenue calculation.

### State

| Property | Type | Purpose |
|---|---|---|
| `menuItems` | array | Loaded from `concessions.json` — 7 items with `id`, `name`, `cost`, `mealValue`, and optional `alwaysAvailable` |
| `prices` | array | Player-set sale prices (parallel to `menuItems`); defaults to `max(cost × 2, cost + 2)` |
| `stock` | array | Units currently in the freezer (parallel to `menuItems`); depleted by sales each round |
| `standingOrder` | array | Quantities for the next delivery (parallel to `menuItems`); editable until order locks |
| `meals` | array | Player-created combo meals: `[{ name, items: [{id, count}], price, sold }]` |
| `soldLastRound` | array | Units sold in the most recent round (parallel to `menuItems`); includes ingredients consumed by combos |
| `lockRound` | number | Round on which the current order locks and the player is charged |
| `nextDeliveryRound` | number | Round on which ordered items arrive in the freezer |
| `repeatOrder` | boolean | Whether the standing order persists after each delivery |

### 4-week delivery cycle

| Week in cycle | What happens |
|---|---|
| 1–2 | Order open — player edits quantities in the Orders tab |
| 3 | Order locks (`lockRound`): player charged `subtotal + DELIVERY_FEE ($75)` |
| 4 | Delivery (`nextDeliveryRound`): `floor(stock × SPOILAGE_RATE)` of existing stock spoils first, then ordered quantities are added; cycle advances by 4 |

If `repeatOrder` is true the order carries over; otherwise it clears. The delivery fee is waived for an empty order. `alwaysAvailable` items (Water Cup) are exempt from spoilage. A "Spoilage" notification fires if any items spoiled.

### Revenue calculation (`Concessions.calcFood`)

1. **Worker throughput cap** — total capacity = sum of `MEALS_PER_WORKER_PER_DAY × (1 + 0.2 × tier)` for up to `min(workers, foodTiles)` concessions workers, sorted best-first. Without staffing unlocked, capacity is uncapped.

2. **Option pool** — solo items (require freezer stock unless `alwaysAvailable`) and combo meals (require all ingredient stock) are added to a pool and sorted largest `mealValue` first.

3. **Demand** — each `Population.HOUSEHOLD_SIZES` bracket contributes visits weighted by Gaussian proximity to its `mealTarget`, value score (`ingredientCost / price`), and income affordability.

4. **Cascade fulfillment** — options are served from highest to lowest `mealValue`. Stock shortages roll unmet demand to the next option; worker capacity exhaustion is terminal.

Returns `{ revenue, mealsSold, mealsWanted, mealsServed, itemSales[], mealSales[] }`. Revenue is credited to `money` in `Finance.processRound`. `mealsSold` and `mealsServed` feed `Finance.mealSatisfaction`, which multiplies `parkExcitement`.

### Combo meals

Players create combos via the **Menu** tab. The builder lets them set ingredient counts, an optional name (auto-generated from ingredients if blank), and a price (auto-suggested from component menu prices). Each combo card shows ingredient chips, an editable price, and a "sold last round" badge during Play. Deleting a combo removes it immediately.

### Panel tabs

| Tab | Content |
|---|---|
| **Menu** | One row per item: name, "X sold" badge (Play only), editable sale price. Combo meals section below with cards and "+ Add Meal" button. |
| **Orders** | 4-week delivery cycle tracker; order table (Item / Cost per Unit / In Freezer / Order Qty / Line Cost); subtotal + delivery fee + total summary; Repeat Order / Clear Order radio. |

---

## Membership system (`membership.js`)

The `Membership` object handles annual membership plans sold to visitors, their ongoing attendance contribution, and the associated benefit costs.

### Plan definition

Each plan is created by the player in the Admission panel and stored in `Membership.plans[]`:

```js
{
  id, name,
  annualPrice,       // $ per year
  guestCount,        // people admitted per membership household
  freeParking,       // boolean — skips parking fee for member vehicles
  foodDiscountPct,   // 0–100: percentage off food purchases
  merchDiscountPct,  // 0–100: percentage off merchandise purchases
  salesThisRound,    // new memberships sold this week
  salesHistory,      // rolling 52-entry array; one entry per round (including zeros)
  activeMembers,     // salesHistory.reduce(sum) — members still within their annual term
  totalMembers,      // cumulative all-time sales
}
```

### 52-week sliding window

Each round, `salesThisRound` is pushed onto `salesHistory`. When the array exceeds 52 entries the oldest entry is shifted off. `activeMembers = salesHistory.reduce((s,n) => s+n, 0)` — members whose annual term has not yet expired.

### Sales simulation (`Membership.calcSales`)

Called after `calcExcitement()` so `Finance.parkExcitement` reflects this round's visitor experience.

Per plan, per distance bracket:
1. **Break-even check** — `admissionSavings + parkingSavings - annualPrice > 0`; distance brackets with no financial incentive are skipped entirely.
2. **Value ratio** — `netValue / annualPrice`; higher = more compelling deal.
3. **Household match** — Solo plans target Solo brackets, Couple → Couple, 3–4 guests → Small Family, 5+ → Large Family. Households won't buy a plan that doesn't match their size.
4. **Purchase probability** — `min(valueRatio × satisfactionPerVisitor × propensity × MEMBERSHIP_BUY_RATE / D.annualVisits, MEMBERSHIP_MAX_PROB)`. Dividing by `D.annualVisits` de-duplicates repeat visitors so frequent locals aren't counted multiple times over the year.
5. **Expected sales** — `weeklyAttendance × dFraction × hFraction × prob` summed across all brackets.

`satisfactionPerVisitor = Finance.parkExcitement / weeklyAttendance` — a per-visitor quality score independent of crowd size.

### Member attendance (`Membership.calcMemberAttendance`)

Called before shopping/food/security each round. For each plan × distance bracket:

- `membersInBracket × weeklyVisitRate × guestCount` → added to `memberAttendanceThisRound` (headcount)
- `membersInBracket × weeklyVisitRate` → vehicle trips; routed to `freeParkingVisitsThisRound` (free parking plans) or `paidParkingVehiclesThisRound` (paid)
- Per-plan attendance weighted by `foodDiscountPct` and `merchDiscountPct` → accumulates into `foodDiscountFractionThisRound` and `merchDiscountFractionThisRound` (weighted-average discount rates)

`totalAttendance = weeklyAttendance (paying) + memberAttendance (free)`. Members boost shopping, food, security, and excitement calculations without paying gate admission.

### Membership benefit costs

All revenue streams are reported at **gross** (full-price) amounts. A single `memberBenefitLoss` expense covers all four benefit types:

| Component | Formula |
|---|---|
| Free admission | `memberAttendance × gatePrice` |
| Free parking | `freeParkingVehicles × parkingPrice` (only when PARKING_FEES unlocked) |
| Food discount | `foodRevenue × memberFraction × foodDiscountFractionThisRound` |
| Merch discount | `shopRevenue × memberFraction × merchDiscountFractionThisRound` |

This nets to the same cash result as applying discounts directly, but keeps gross revenues visible for budgeting. Recorded in `History` as `memberBenefitExpense`; shown in the P&L exercise as **Membership Benefits**.

---

## Staffing system (`staff.js` + `staff-panel.js`)

### Staff constants

| Constant | Purpose |
|---|---|
| `POSTING_WEEKLY_COST` | Weekly cost per active job posting |
| `SICKNESS_RATE` | Per-round chance of a 1-week illness |
| `INJURY_RATE` | Per-round chance of a 4-week critical injury |
| `VACATION_RATE` | Per-round base chance of taking a vacation |
| `VACATION_WEEKS` | Vacation duration in weeks; also scales effective vacation chance (`VACATION_RATE × VACATION_WEEKS`) and the passive mood baseline bonus (`+5 × VACATION_WEEKS`) |

### Employee record

```js
{
  instanceId,     // "staff_{seq}"
  name,           // "Alex K."
  jobId,          // JOB.* constant
  salary,         // $/week (paid even when absent)
  skillModifier,  // 0.75–1.25
  costOfLiving,   // $/week baseline; grows with inflation
  mood,           // 0–100
  weeksEmployed,
  focus,          // ENGINEER_FOCUS.* or SECURITY_FOCUS.*
  events,         // [{ moodModifier, comment }] — decay toward 0 each round
  weeksOut,       // weeks of absence remaining; 0 = working
}
```

### Absence mechanic

Each round, `Staff.processSickness()` runs for every employee:
- If `weeksOut > 0`: decrement by 1.
- If `weeksOut === 0`: roll for a new absence — injury check first, then sickness, then vacation. Rolls are mutually exclusive; an employee already out cannot become more out.

Absent employees contribute nothing to any working capacity calculation but remain on payroll.

### Mood calculation (`Staff.updateMoods`)

Key signals: salary vs. cost-of-living ratio, active staff events (decay each round), vacation weeks policy, staff lounge count.

### Experience tiers

| Tier | Threshold | Multiplier |
|---|---|---|
| Junior | < 52 weeks | 0.75× |
| (Normal) | 52–156 weeks | 1.0× |
| Senior | 157–260 weeks | 1.25× |
| Lead | > 260 weeks | 1.5× |

### Special job effects

- **Booth Attendant** — drives gate throughput. Mood, experience, and skill all multiply per-attendant capacity.
- **Ride Operator** — under-staffing degrades `rideOpinion` and per-ride ridership.
- **Engineer** — focus `MAINTENANCE`: repairs broken rides or reduces wear on running ones. Focus `CONSTRUCTION`: expedites a build, then falls back to maintenance.
- **HR** — each working HR employee boosts candidate count and quality by tier.
- **Security** — capacity and focus bonuses; only working guards counted.
- **Janitor** — clears mess each round; only working janitors counted.
- **Merchandise Attendant** — 2 required per active merchandise store; only working attendants counted.
- **Concessions Worker** — staffs food buildings. Effective count = `min(workers, foodTiles)`; higher-tier workers are used first. Each worker's output is boosted 20% per experience tier.

### Staffing panel tabs

- **Roster** — all employees grouped by job type; click to open detail view with salary negotiation, bonus, and fire actions.
- **Postings** — create and cancel job postings with min experience and salary offer.
- **Candidates** — applicants generated each round; hire (consumes matching posting) or decline.
- **Benefits** — company-wide policies. Currently: vacation weeks.

---

## History tracking (`history.js`)

`History.record(report)` appends one entry per round. `History.rounds` is append-only.

---

## Visitor animation system (`animations.js`)

Visual-only; has no effect on simulation mechanics or saved state.

### Path caching

`Animations.buildPaths()` iterates every unique pair of active nodes (rides + shops + gate) and calls `shortestPathToTile()` (`pathfinding.js`) to find the shortest A* route along PATH tiles. Results are cached in `Animations.paths` as `{ from, to, gridPath }` entries — `from`/`to` are live record references; `gridPath` is an ordered `[{row,col}]` array or `null` if unreachable.

**When paths are rebuilt:**
- On park open (`openPark()` in `hud.js`) — 100 ms after `gameStage` is set to `PLAY`
- At the start of each play-mode round — 100 ms `setTimeout` at the end of `advanceRound()`
- When the player enters Play view mode and `Animations.paths` is empty (e.g. after a path demolition)

**Cache invalidation:** `completeDemolition()` in `game.js` clears `Animations.paths` whenever a `PATH` facility is removed (paths demolish instantly, so the invalidation is synchronous).

### Sprite lifecycle

Rendered on `<canvas id="people-overlay">` (inside `#grid-wrapper`, same `position:absolute; pointer-events:none` rules as the SVG overlays). The canvas is managed by `Animations.init()` (called from `initHUD()`).

One visitor spawns at the gate every **5 seconds** while the view is in Play mode, up to `PERSON_LIMIT = 10` simultaneous sprites. Each visitor:

1. Picks a random reachable destination (ride or shop).
2. Walks tile-by-tile at **one tile per 2 seconds** (`SPEED = CELL_STEP / 2000` px/ms). Each tile waypoint is offset by a small random jitter (±20 % of `CELL_SIZE`) so sprites don't perfectly overlap.
3. Hides for **5 seconds** at the destination (`VISIT_DURATION`).
4. Repeats steps 1–3 up to **6 times** (`MAX_STOPS`), then routes back to the gate and despawns.

Sprites are white dots (4 px radius). They are hidden while visiting and whenever the view mode is not `play`.

### Particles

| Particle | Trigger | Appearance | Lifetime |
|---|---|---|---|
| **Trash** | Every `TRASH_INTERVAL_TILES` (8) tile crossings per visitor. Interval shortened by `Finance.calcMessFactor()` when messes are unlocked. | Brown `#92400e` dot, 3 px → 0 px (shrinks linearly) | 2 s |
| **Coin** | On visitor spawn at gate; also when a visitor leaves a food or merchandise shop. | Green `#4ade80` bold `$` (13 px monospace), rises 38 px, fades 1 → 0 | 700 ms |

Trash is drawn before people dots; coins are drawn last (on top of everything). `ctx.save/restore` scopes `globalAlpha` changes in the coin pass.

### Key constants (`animations.js`)

| Constant | Value | Effect |
|---|---|---|
| `PERSON_LIMIT` | 10 | Max simultaneous sprites |
| `SPEED` | `CELL_STEP / 2000` | px/ms — one tile per 2 s |
| `VISIT_DURATION` | 5000 ms | Pause at each destination |
| `SPAWN_INTERVAL` | 5000 ms | Gate spawn cadence |
| `MAX_STOPS` | 6 | Visits before heading home |
| `TRASH_INTERVAL_TILES` | 8 | Tile crossings between trash drops |
| `TRASH_RADIUS` | 3 px | Starting radius of a trash piece |
| `TRASH_DURATION` | 2000 ms | Time for trash to shrink away |

---

## Rides panel (master-detail)

**List view** — tappable rows showing name + condition badge.

**Detail view** — name, status badge, weekly utility cost, last-round ridership bar, and context-sensitive actions:

| Status | Actions |
|---|---|
| Under Construction | Weeks remaining · Pause |
| Paused Construction | Weeks remaining · Resume |
| Active | Close Ride |
| Closed | Re-open Ride |
| Broken Down | (awaiting engineer) |

---

## Data schemas

### `rides.json`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique, snake_case |
| `name` | string | Display name |
| `footprint` | `number[][]` | `1` = occupied, `0` = empty |
| `buildCost` | number | Dollars |
| `buildWeeks` | number | Construction time |
| `rideDuration` | number | Seconds per cycle |
| `intensity` | string | `low` / `medium` / `high` / `extreme` |
| `ridesPerHour` | number | Drives capacity and `rideOpinion` |
| `utilityCost` | number | $/week while running |

### `facilities.json`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique, snake_case |
| `name` | string | Display name |
| `color` | string | Hex |
| `footprint` | `number[][]` | Same format as rides |
| `buildCost` | number | |
| `buildWeeks` | number | `0` = instant |
| `limit` | number \| null | Max in park; `null` = unlimited |
| `edgeOnly` | boolean? | Must touch grid boundary |
| `mustBeAdjacentTo` | string[]? | Neighbor must contain one of these facility ids |
| `utilityCost` | number? | $/week while active; included in `Finance.calcUtilityCosts()` |

### `shops.json`

Same shape as `facilities.json` plus:

| Field | Type | Notes |
|---|---|---|
| `shopType` | string | `"merchandise"` or `"food"` — gates which revenue/staffing calculations apply |

---

## Educational forms

Periodic exercises that interrupt gameplay to test financial literacy. Each form is a self-contained object in its own file, following the global-object pattern.

### Pattern

Each form file exports a single object with three public entry points called from `hud.js`:

| Entry point | Where called in `hud.js` | Purpose |
|---|---|---|
| `Form.init()` | `initHUD()` | Wire up DOM event listeners once at startup |
| `Form.pending = true` | `advanceRound()` | Schedule the form to appear after the round summary |
| `Form.show()` | `hideRoundSummary()` | Build and display the modal |

The form's `.pending` flag is set by the trigger condition in `advanceRound()` and cleared inside `show()`. `hideRoundSummary()` checks flags in priority order and chains `show()` so the round summary always appears first. Forms with multiple phases (e.g. `Budget`) use separate flags per phase (`pendingTentative`, `pendingRevised`) and pass a phase argument to `show(phase)`.

**Chain order in `hideRoundSummary()`:**
```
Budget (tentative) → P&L → Balance Sheet → Budget (revised)
```
The budget tentative fires two rounds before quarter end. P&L fires at quarter end and chains to the balance sheet at year-end. The budget revised fires one round into the new quarter, after the player has seen the P&L.

### Adding a new form

1. Create `my-form.js` with a `MyForm` object implementing `pending`, `init()`, and `show()`.
2. Add `<script src="my-form.js"></script>` to `index.html` before `hud.js` (after `forms-panel.js`).
3. Add the modal HTML to `index.html`.
4. Add form-specific styles to `style.css` (modal styles) or `panels.css` (panel content).
5. In `hud.js`: call `MyForm.init()` in `initHUD()`, set `MyForm.pending = true` on your trigger in `advanceRound()`, and add `if (MyForm.pending) MyForm.show();` in `hideRoundSummary()`.
6. Optionally add a review card to `forms-panel.js`: call `FormsPanel.save({ type: 'my-form', ... })` on completion and add a `_renderMyFormCard()` method to `FormsPanel`.

### P&L statement (`pl-statement.js` — `PLStatement`)

Triggers every 13 rounds (end of each quarter). Aggregates the last 13 entries from `History.rounds` to produce real quarterly totals. Active line items (those with a non-zero quarterly total): Gate Admissions, Parking, Merchandise Sales, Food & Beverage, Memberships (revenue), Staff Wages, Ride Utilities, Construction, Marketing, Merchandise Orders, Bus Service, Parking Amenities, Membership Benefits (expense).

Students drag each item into a Revenue or Expenses column. The submit button is disabled until all items have been placed. On submit, correctly placed items lock in place with a checkmark; wrong items return to the bank to be re-sorted. This repeats until all items are correct, at which point the net profit/loss is revealed and Continue appears.

At year-end (round 52, 104, …), `PLStatement.hide()` chains directly to `BalanceSheet.show()` once the student clicks Continue.

**CSS classes:** `.pl-modal-card`, `.pl-bank`, `.pl-zone`, `.pl-card-item`, `.pl-locked`, `.pl-correct`, `.pl-result` — all in `style.css`.

**`PLStatement.ITEMS`** — array of `{ key, label, correct, histKey }` defining the line items. Edit here to add, remove, or rename items. `histKey` must match a field in `History.rounds`.

### Balance sheet (`balance-sheet.js` — `BalanceSheet`)

Triggers every 52 rounds (end of each in-game year), always chaining after the quarterly P&L (since every multiple of 52 is also a multiple of 13). Unlike the P&L, which sums historical records, the balance sheet reads **live game state** at the moment `show()` runs — making it a true point-in-time snapshot.

Line items and their sources:

| Label | Category | Source |
|---|---|---|
| Cash on Hand | Asset | `money` |
| Merchandise Inventory | Asset | `merchandiseInventory[i].count × inv.price` summed |
| Food & Beverage Stock | Asset | `Concessions.stock[i] × menuItems[i].cost` summed (only when `Unlock.FOOD`) |
| Park Equipment | Asset | Active, closed, and broken-down rides/facilities/shops at `buildCost` |
| Construction in Progress | Asset | In-construction items at `weeksCompleted × weeklyPayment` |
| Outstanding Loans | Liability | `Banking.activeLoans[*].balance` summed |

Students drag each item into an Assets or Liabilities column. On completion, Owner's Equity (Assets − Liabilities) is revealed. Positive equity is shown in blue; negative in red.

**CSS classes:** `.bs-modal-card`, `.bs-bank`, `.bs-zone`, `.bs-card-item`, `.bs-locked`, `.bs-correct`, `.bs-result`, `.bs-equity` — all in `style.css`.

### Budget (`budget.js` — `Budget`)

Two-phase exercise that teaches budgeting and variance analysis. Unlike the P&L and balance sheet (which are scored drag-and-drop exercises), the budget form is a manual-entry planning activity with no right/wrong grading.

#### Phase 1 — Tentative (trigger: `round % 13 === 11`)

Fires two rounds before the end of each quarter (week 11 of 13). The player has not yet seen the quarter-end P&L, so this is a genuine forward forecast. Inputs start at `$0`; no pre-population from history, to prevent copying rather than reasoning.

| Column | Content |
|---|---|
| *(comparison, if available)* | Prior quarter's **revised** budget — shown as a scale reference from the most recent completed plan |
| Projection | Player's number inputs for the upcoming quarter |

The label shows the **calendar quarter being budgeted** (the next quarter, e.g. "Q4 2024 Tentative Budget"). The submitted values are stored in `Budget._tentative[targetQNum]`.

#### Phase 2 — Revised (trigger: `round % 13 === 1 && round > 1`)

Fires one week into the new quarter, the round after the P&L exercise. Now the player has full information and can calibrate. Inputs pre-populate from the tentative values to make editing incremental.

| Column | Content |
|---|---|
| Tentative Budget | The values submitted in Phase 1 |
| *(prior quarter label)* Actual | Summed from `History.rounds` for the quarter that just ended |
| Projection | Editable inputs, pre-filled from the tentative |

The submitted values are stored in `Budget._revised[targetQNum]`.

#### Quarter numbering

`targetQNum` is a monotonically increasing game-wide quarter index (`Math.ceil(round / 13)` for revised; `+1` for tentative). It is used to key both `_tentative` and `_revised` dictionaries so Phase 2 can look up the Phase 1 values by matching index.

`Budget._calendarLabel(gameQNum)` converts a game quarter index to a "Q3 2024" display string using the same `STARTING_WEEK_OF_YEAR` / `STARTING_YEAR` calculation as `getDateLabel()` in `hud.js`.

#### Totals and net bar

Each Revenue and Expenses table has a `<tfoot>` row with static comparison-column subtotals and a live-updating Projection total (recomputes on every `input` event). A Projected Net bar below both tables shows Revenue − Expenses in real time.

#### Forms panel

Saving either phase calls `FormsPanel.save({ type: 'budget-tentative' | 'budget-revised', ... })`. The Forms panel renders two separate cards — "Budget — Tentative" and "Budget — Revised" — showing non-zero projected line items, section totals, and the projected net.

**CSS classes:** `.budget-modal-card`, `.budget-table`, `.budget-th`, `.budget-td`, `.budget-input`, `.budget-total-row`, `.budget-net-bar`, `.budget-var-favorable`, `.budget-var-unfavorable` — all in `style.css`.

**`Budget.ITEMS`** — array of `{ key, label, section, histKey }`. `section` is `'revenue'` or `'expense'`; `histKey` matches a field in `History.rounds`. Edit here to add, remove, or rename line items.

---

## What's implemented

- 20×20 park grid with collision detection and irregular footprint support
- Ride, facility, and shop catalogues loaded from JSON
- Placement rules: edge-only, adjacency, per-type limits, affordability
- Two-stage game: Setup → Play with weekly construction payments
- Park-open prerequisites: Park Entrance + at least one connected ride
- Ride conditions: Running, Unconnected, Under Construction, Paused, Closed, Broken Down, Demolishing
- Grid view mode toolbar: Play (default), Build (shows construction bar), Demolish, Security overlay; pill-shaped buttons with legend; adding future modes requires only a `VIEW_MODES` entry + handler in `setViewMode()`
- Construction bottom bar: horizontal scrolling item cards (Attractions / Shopping / Facilities tabs) pinned to bottom of park view; replaces the former side panel
- Demolish mode: activates via view mode bar; hovering highlights a structure's full footprint in red; clicking starts demolition (irrevocable); takes `ceil(buildWeeks / 2)` rounds; paths and setup-built items are instant; Park Entrance is indestructible
- Security overlay: SVG drawn over the grid in Security mode showing patrol-radius circles (blue = staffed, amber = unstaffed); redraws live on hire, fire, or focus change
- Ride detail panel: pause/resume, close/reopen, ridership bar, utility cost
- Engineer system: repair broken rides and reduce wear; focus on construction or maintenance
- Side panels: Rides, Staffing, Security, Admission, Banking, Inventory, Survey, Research, Marketing, Visitor Profile, Awards
- HUD: budget, date (Week W, QN, YYYY), stage badge
- Finance: gate/parking/shop revenue; staff/utility/construction/theft costs; round summary modal
- Admission panel: gate price control; price exhaustion suppresses demand
- Banking panel: loan application flow
- Merchandise upcharge control in Inventory → Stock tab
- Park metrics: `parkExcitement`, `rideOpinion`, `mealSatisfaction`
- Security system: incident tracking, two-phase handling, guard focus assignment, opinion decay
- Shop theft: scales with tiles and understaffing; unhandled incidents lose money
- Staff absence system: per-round rolls for sickness, critical injury, and vacation; absent staff excluded from all capacity calculations
- Staff benefits panel: vacation weeks setting drives absence duration and passive mood baseline
- Staffing: employees with skill/salary/mood/experience; events-based mood system; inflation
- Nine job types with distinct gameplay effects (added Concessions Worker)
- Job postings, candidate pipeline with withdrawal timer, hire/decline flow
- Staff Lounge facility: `floor(sqrt(count))` passive mood bonus to all employees
- Three merchandise shop sizes: Kiosk (1 tile), Merchandise Store (2 tiles), Large Store (4 tiles)
- Three food shop sizes: Snack Shop (1 tile), Quick Foods (2 tiles), Diner (4 tiles)
- Full concessions system: 7 menu ingredients loaded from `concessions.json`; player sets sale prices, manages freezer stock, and creates combo meals; food revenue calculated per round via `Concessions.calcFood()` with Gaussian demand model, cascade fulfillment, and worker throughput cap
- 4-week standing delivery cycle: order open → lock (player charged) → delivery (stock credited); repeat or clear mode
- Food satisfaction system: `mealSatisfaction` multiplies park excitement based on meals served vs. meals wanted
- Facility utility costs: facilities with a `utilityCost` field are billed each round
- Per-round history log (attendance, income, expenses, security, food metrics, loan balance/interest/principal)
- Merchandise inventory system: 12 items (3 tiers × 4 categories), demand-driven per-item sales, stock depletion
- Supplier system: multiple suppliers with delivery time and surcharge; unlocked progressively
- Restock orders with delivery countdown; Delivery notification on arrival
- `Population.cumulativeInflation`: weekly compound tracker, multiplies restock order costs
- Demographic `preferredCategory` on every bracket drives per-category purchase desire
- Loan system: multi-round application flow (approach → open → apply → offer → review → disbursed); amortized weekly repayments; 7 covenant types with enforcement and deferred breach fees; rate/covenant/fee negotiation; missed payment penalties on future rates and LTV caps
- Membership plans: player-created annual plans with guest count, optional free parking, food discount %, and merch discount %; 52-week sliding window tracks active members per plan; weekly sales simulation uses distance/household demographics, break-even value, and per-visitor satisfaction score
- Member attendance: active members contribute to weekly headcount (free gate admission); free-parking plans skip parking fees; non-free-parking member vehicles pay standard rate; all four benefit types (admission, parking, food discount, merch discount) recorded as a single gross-revenue offset expense
- Quarterly P&L statement exercise: drag-and-drop modal every 13 rounds; real quarterly totals from `History`; items lock on correct placement; wrong items return to bank for retry; net income revealed on completion; includes Food & Beverage, Memberships (revenue), and Membership Benefits (expense)
- Annual balance sheet exercise: drag-and-drop modal every 52 rounds (chained after the year-end P&L); point-in-time snapshot of assets (cash, merchandise inventory, food stock, park equipment, construction in progress) and liabilities (outstanding loans); Owner's Equity revealed on completion
- Two-phase quarterly budget exercise: Phase 1 (tentative, round 11 of each quarter) fires before the P&L — player forecasts blind with prior quarter's revised budget as a reference, inputs start at $0; Phase 2 (revised, round 1 of the next quarter) fires after the P&L — shows tentative budget and last quarter's actuals side by side, inputs pre-populated from Phase 1; live-updating section subtotals and projected net bar; both phases saved as separate cards in the Forms review panel
- Visitor animation system: white-dot sprites spawn at the gate every 5 s (capped at 10), walk A* routes between rides and shops, hide at each stop for 5 s, then return home after 6 visits; brown shrinking trash particles drop every 8 tile crossings (interval scales with mess factor); green rising `$` coin particles appear on spawn and on leaving food/merch shops; all rendered on a canvas overlay with no simulation impact

## What's not yet implemented (see `reqs.md`)

- Wage adjustment UI
- Ride breakdown repair UI (engineers repair automatically; no player-visible repair queue yet)
- Supplier unlock triggers (currently only the first supplier is ever unlocked)
- `Population.utilityMultiplier` wired to round-by-round increases
- Reports, graphs, and awards
- Marketing and reputation
- Login stage and teacher configuration
