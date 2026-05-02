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
| `staff.js` | Job registry, employee generation, staff/candidates/postings/benefits simulation logic (`Staff` object) |
| `staff-panel.js` | All staffing panel UI — roster, postings, candidates, benefits views (extends `Staff` via `Object.assign`) |
| `security.js` | Security opinion state, incident calculation, panel UI (`Security` object) |
| `history.js` | Append-only per-round data log for future reports/graphs (`History` object) |
| `hud.js` | HUD display, stage transitions, panel management, view mode toolbar, construction bottom bar, security SVG overlay, round summary modal, pricing panel |
| `rides.json` | Ride catalogue |
| `facilities.json` | Facility catalogue |
| `shops.json` | Shop catalogue |
| `merchandise.json` | Merchandise item catalogue (12 items: 3 price tiers × 4 categories) |
| `suppliers.json` | Supplier catalogue (delivery time, surcharge; first entry unlocked at start) |
| `reqs.md` | Full game design document — read before adding features |

**Script load order:**
```
constants.js → unlock.js → population.js → game.js → grid.js → shopping.js → finance.js → staff.js → staff-panel.js → security.js → history.js → hud.js
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
| `Shopping` | `shopping.js` | Shop catalog, installed shops, revenue/theft math, food capacity, staffing ratios |
| `Staff` | `staff.js` + `staff-panel.js` | Roster, postings, candidates, benefits policy, experience, panel rendering |
| `Security` | `security.js` | Opinion state, incident calculation, panel rendering |
| `History` | `history.js` | Append-only per-round log |

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
| `LOANS` | Loan section in Financial panel | *(no calculation bypass — loan mechanics simply can't be initiated)* |

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
    <div class="side-panel">     — Financial (pricing + loan)
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

| Source | Signals |
|---|---|
| Gate | gate price × weekly attendance |
| Parking | parking price × vehicle estimate derived from daily demand |
| Shop | see `Shopping.calcRevenue()` |

### Cost sources

| Source | Signals |
|---|---|
| Staff wages | all employed staff salaries, including those currently absent |
| Posting fees | weekly cost per active job posting |
| Ride utilities | running connected rides × `Population.utilityMultiplier` |
| Facility utilities | active facilities with a `utilityCost` field × `Population.utilityMultiplier` |
| Construction | weekly installment per item under construction |
| Theft loss | unhandled shop incidents × `THEFT_LOSS_PER` |

### Round processing order (`Finance.processRound`)

1. `processEngineers()` — repair/maintenance before excitement recalc
2. `recalcExcitement()`
3. Calc demand, throughput, attendance
4. `computeRideOpinion()` — updates `rideOpinion`; writes `lastRoundRiders/Capacity`
5. `processWear()` — accumulate wear, roll for breakdown (probability = wear / `MAX_EFFECTIVE_WEAR`)
6. `Shopping.calcFood()` — compute `mealsWanted` and `mealsServed`
7. `processLoanRepayments()` — deduct weekly amortized payments before other costs
8. Calc income and remaining costs; apply to `money`
9. `processConstruction()` — deduct weekly payments, complete finished builds
9a. `processDemolition()` — advance demolition timers, remove completed demolitions
10. `processCovenantBreaches()` — collect deferred breach fees; retire breached covenants
11. `processActiveCovenants(weeklyAttendance)` — check ongoing covenants; call `breachCovenant` on violations
12. `Staff.processSickness()` — decrement absences, roll for new illness/injury/vacation
13. `Staff.advanceExperience/applyInflation/updateMoods/advancePostings/generateCandidates/advanceCandidates()`
14. Calc `weeklyNetMess`; compute `mealSatisfaction`; call `calcExcitement()`
15. `advancePriceExhaustion()`
16. `Security.advanceOpinion(unhandled)`

`advanceRound()` (in `hud.js`) calls `Finance.processPendingLoan()` each round to advance the loan application state machine.

### Loans

Players can apply for loans via the Financial panel. The full flow:

```
[form] → APPROACHING → (1 round risk check) → OPEN → [Apply] → APPLYING → (1 round) → OFFERED → [Accept] → REVIEW → (2 rounds) → disbursed
```

**State machine (`Finance.loanApplication`):**

| State | Meaning |
|---|---|
| `APPROACHING` | Initial eligibility check pending (next round) |
| `OPEN` | Bank accepted; player can click Apply For Loan |
| `APPLYING` | Awaiting offer (next round) |
| `OFFERED` | Bank has posted terms; player reviews and negotiates |
| `REVIEW` | Accepted; 2-round final review before funds arrive |
| `null` | No active application |

**Eligibility (`processPendingLoan`, APPROACHING state):**

`Finance.parkValue()` sums: active/closed building costs; in-construction payments made so far; broken-down rides at a 10%-per-repair-week discount; merchandise inventory value; current cash. The requested amount must be positive and below `effectiveLtvCap(purpose) × parkValue`. LTV caps by purpose: new rides 70%, staffing 50%, emergency 90%; each missed payment reduces the cap by `MISSED_PAYMENT_LTV_PENALTY`.

**Interest rate (`Finance.calcLoanRate`):**

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

**Repayment (`Finance.calcLoanPayment`):**

Standard amortization: `PMT = P × r(1+r)^n / ((1+r)^n − 1)` where `r = annualRate/100/52` and `n = weeksRemaining`. Returns `{ total, principal }` where `principal = total − (balance × r)`. If `weeksRemaining ≤ 1` the full balance is returned as principal. Loans are fully paid off when `balance ≤ 0`; they are removed from `Finance.activeLoans` automatically.

Missed payments increment `loan.missedPayments` and `Finance.totalMissedPayments`, which permanently penalise future loan rates and LTV caps.

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

### Food (`Shopping.calcFood`)

Compares meals wanted (visitor count × daily meal rate) against meals served (worker count and tier, capped by food tile count). Result stored as `Finance.mealSatisfaction`, which multiplies `parkExcitement` each round. Defaults to 0.5 when no food buildings exist.

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
- Side panels: Rides, Staffing, Security, Financial, Inventory, Survey, Research, Marketing, Visitor Profile, Awards
- HUD: budget, date (Week W, QN, YYYY), stage badge
- Finance: gate/parking/shop revenue; staff/utility/construction/theft costs; round summary modal
- Pricing panel: gate, parking, merchandise upcharge; price exhaustion suppresses demand
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
- Food satisfaction system: `mealSatisfaction` multiplies park excitement based on concessions capacity vs. visitor demand
- Facility utility costs: facilities with a `utilityCost` field are billed each round
- Per-round history log (attendance, income, expenses, security, food metrics, loan balance/interest/principal)
- Merchandise inventory system: 12 items (3 tiers × 4 categories), demand-driven per-item sales, stock depletion
- Supplier system: multiple suppliers with delivery time and surcharge; unlocked progressively
- Restock orders with delivery countdown; Delivery notification on arrival
- `Population.cumulativeInflation`: weekly compound tracker, multiplies restock order costs
- Demographic `preferredCategory` on every bracket drives per-category purchase desire
- Loan system: multi-round application flow (approach → open → apply → offer → review → disbursed); amortized weekly repayments; 7 covenant types with enforcement and deferred breach fees; rate/covenant/fee negotiation; missed payment penalties on future rates and LTV caps

## What's not yet implemented (see `reqs.md`)

- Wage adjustment UI
- Ride breakdown repair UI (engineers repair automatically; no player-visible repair queue yet)
- Food revenue (satisfaction penalty exists; income not yet wired)
- Supplier unlock triggers (currently only the first supplier is ever unlocked)
- `Population.utilityMultiplier` wired to round-by-round increases
- Reports, graphs, and awards
- Marketing and reputation
- Events system and demographics
- Login stage and teacher configuration
