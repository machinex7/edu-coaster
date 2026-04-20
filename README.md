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
| `population.js` | Visitor behavior rates and external economic conditions (`Population` object) |
| `game.js` | Core state, grid constants, placement logic, construction queue, ride actions |
| `grid.js` | Grid DOM, cell painting, mouse/touch event handlers |
| `shopping.js` | Shop catalog, installed shops, revenue and theft calculations (`Shopping` object) |
| `finance.js` | Attendance model, park metrics, all income/cost sources, round processing (`Finance` object) |
| `staff.js` | Job registry, employee generation, staff/candidates/postings state and panel UI (`Staff` object) |
| `security.js` | Security opinion state, incident calculation, panel UI (`Security` object) |
| `history.js` | Append-only per-round data log for future reports/graphs (`History` object) |
| `hud.js` | HUD display, stage transitions, panel management, round summary modal, pricing panel |
| `rides.json` | Ride catalogue |
| `facilities.json` | Facility catalogue |
| `shops.json` | Shop catalogue |
| `reqs.md` | Full game design document — read before adding features |

**Script load order:**
```
constants.js → population.js → game.js → grid.js → shopping.js → finance.js → staff.js → security.js → history.js → hud.js
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

Objects and their responsibilities:

| Object | File | Owns |
|---|---|---|
| `Population` | `population.js` | Visitor behavior rates, labor constants, economic multipliers |
| `Finance` | `finance.js` | Pricing state, attendance model, income/cost calculations, round processing |
| `Shopping` | `shopping.js` | Shop catalog, installed shops, revenue and theft math, staffing ratios |
| `Staff` | `staff.js` | Roster, postings, candidates, experience, panel rendering |
| `Security` | `security.js` | Opinion state, incident calculation, panel rendering |
| `History` | `history.js` | Append-only per-round log |

---

## Shared constants (`constants.js`)

All enums are `Object.freeze`d — typos return `undefined` immediately rather than silently comparing wrong strings.

```js
STAGE         = { SETUP, PLAY }
STATUS        = { ACTIVE, UNDER_CONSTRUCTION, PAUSED_CONSTRUCTION, CLOSED }
CATEGORY      = { RIDE, FACILITY, SHOP }
SHOP_ID       = { MERCHANDISE }
JOB           = { RIDE_OPERATOR, SECURITY, JANITOR, ENGINEER, BOOTH_ATTENDANT,
                  MERCHANDISE_ATTENDANT, BUSINESS_ANALYST, HR }
FACILITY_ID   = { PARK_ENTRANCE, PATH, BATHROOM, STATUE, GARDEN, FOUNTAIN }
SECURITY_FOCUS = { PATROL, GATE, SHOP }
```

---

## Population constants (`population.js`)

Centralises all tunable rates so game balance changes are made in one place.

| Constant | Value | Used by |
|---|---|---|
| `MINIMUM_WAGE_HOURLY` | 7.25 | Reference only |
| `MINIMUM_WAGE_WEEKLY` | 290 | `Staff.JOB_TYPES` (Merchandise Attendant salary) |
| `BUYER_RATE` | 0.15 | `Shopping.calcRevenue()` |
| `THEFT_RATE` | 0.008 | `Shopping.calcTheftIncidents()` |
| `OVERFLOW_INCIDENT_RATE` | 0.05 | `Security.calcIncidents()` |
| `UNRIDDEN_INCIDENT_RATE` | 0.20 | `Security.calcIncidents()` |
| `RANDOM_INCIDENT_RATE` | 0.001 | `Security.calcIncidents()` |
| `utilityMultiplier` | 1 | `Finance.calcUtilityCosts()` — stub for rising energy costs |
| `inflationRate` | 1.02 | Stub for future cost-of-living adjustments |

---

## Game stages

| Stage | Constant | Behaviour |
|---|---|---|
| Setup | `STAGE.SETUP` | Items placed instantly at full cost. No income. Park opens once a Park Entrance and at least one connected ride exist. |
| Play | `STAGE.PLAY` | Items under construction pay `buildCost / buildWeeks` per round. All income and expenses process on each round advance. |

---

## UI layout

```
<header>           — HUD: budget, date, stage badge
<div id="main">
  <div id="left-nav">            — position:relative container
    <nav id="btn-bar">           — narrow vertical button bar; always visible
    <div class="side-panel">     — Construction (Attractions / Shopping / Facilities tabs)
    <div class="side-panel">     — Rides (master-detail)
    <div class="side-panel">     — Staffing (Roster / Postings / Candidates views)
    <div class="side-panel">     — Security (guard list with focus assignment)
    <div class="side-panel">     — Pricing
  <div id="park-view">           — flex:1, centers the grid
    <div id="grid">              — CSS grid of 20×20 cells
<div id="round-modal">           — fixed overlay, shown after each round
```

Panels slide open at `left: 100%` of `#btn-bar` (overlaying the park). Width transitions 0 ↔ 275px. Only one panel open at a time.

---

## Grid

- **Size:** 20 × 20, cells 40 px with 1 px gap (`CELL_STEP = 41 px`).
- **`gridCells[r][c]`** — 2D array of `<div>` elements, built once in `buildGrid()`.
- **`gridState[r][c]`** — parallel 2D array of `instanceId | null`. Source of truth for collision detection.
- **`facilityTypeAtCell["row,col"]`** — fast lookup map from cell coordinate to `facilityId`. Written on every facility placement; read by adjacency checks and connectivity tests.

---

## Placed item records

```js
// installedRides[]
{
  instanceId,             // "ride_{id}_{timestamp}"
  rideId, name, color,
  row, col, footprint,
  status,                 // STATUS.ACTIVE | UNDER_CONSTRUCTION | PAUSED_CONSTRUCTION | CLOSED
  // if under_construction or paused_construction:
  weeksTotal, weeksCompleted, weeklyPayment,
  // populated after first round running:
  lastRoundRiders,        // actual weekly riders (staff-ratio adjusted)
  lastRoundCapacity,      // max weekly riders at full staffing
}

// installedFacilities[]
{
  instanceId,             // "facility_{id}_{timestamp}"
  facilityId, name, color,
  row, col, footprint,
  status,
  // if under_construction: same fields as installedRides
}

// Shopping.installed[]
{
  instanceId,             // "shop_{id}_{timestamp}"
  shopId, name, color,
  row, col, footprint,
  status,
  // if under_construction: same fields as installedRides
}
```

### Status transitions (all placed items)

```
UNDER_CONSTRUCTION ←→ PAUSED_CONSTRUCTION   (pause/resume in Rides panel)
UNDER_CONSTRUCTION → ACTIVE                 (construction completes automatically)
ACTIVE ←→ CLOSED                            (close/reopen in Rides panel)
```

---

## Finance system (`finance.js`)

### Pricing state (on `Finance` object)

| Property | Default | Notes |
|---|---|---|
| `gatePrice` | 20 | $ per visitor |
| `parkingPrice` | 10 | $ per vehicle |
| `foodUpcharge` | 0 | $ per food item — not yet wired to revenue |
| `priceExhaustion` | 0 | Internal. Rises on price increases, decays 1/round. |

**Price exhaustion rules:**
- Gate price increase of `+$N` → `priceExhaustion += 2N`
- Parking price increase of `+$N` → `priceExhaustion += 1N`
- Decays by 1 each round (floor 0)
- Applied to demand: `dailyDemand × (1 − priceExhaustion / 100)`

### Park metrics

| Property | Description |
|---|---|
| `Finance.parkExcitement` | `runningRideCount × rideOpinion`. Drives daily demand. |
| `Finance.rideOpinion` | Smoothed 0–1 score of how well rides serve the crowd. Starts at 1.0. |
| `Security.opinion` | Accumulated danger perception. Reduces demand via `1 − √opinion / 100`. |

### Attendance model

```
dailyDemand      = parkExcitement × 20 × (1 − priceExhaustion/100) × (1 − √Security.opinion/100)
gateThroughput   = Σ per booth attendant: 500 × moodMult × expMult × skillModifier
                   (moodMult: 0.8–1.2; expMult from tier; skillModifier: 0.75–1.25)
dailyAttendance  = min(dailyDemand, gateThroughput)
weeklyAttendance = round(dailyAttendance × 7)
```

### Income sources

| Source | Formula |
|---|---|
| Gate revenue | `round(gatePrice × dailyAttendance × 7)` |
| Parking revenue | `floor(dailyDemand × 7 / 3) × parkingPrice` (based on demand, not throughput) |
| Shop revenue | `Shopping.calcRevenue(weeklyAttendance)` |

### Cost sources

| Source | Formula |
|---|---|
| Staff wages | `Σ staff.salary` per week |
| Posting fees | `$75 × activePostings` per week |
| Ride utilities | `Σ utilityCost × Population.utilityMultiplier` for running connected rides |
| Construction | `weeklyPayment` per item under construction |
| Theft loss | `Security.calcIncidents()` → `unhandledShop × $50` |

### Round processing order (`Finance.processRound`)

1. `recalcExcitement()` — uses previous `rideOpinion`
2. Calc demand, throughput, attendance
3. `computeRideOpinion(daily)` — updates `rideOpinion`; writes `lastRoundRiders/Capacity` per ride
4. Calc all income and costs for the round
5. Add income to `money`; deduct costs from `money`
6. `processConstruction()` — deducts weekly payments, completes finished builds
7. `Staff.advanceExperience/Postings/generateCandidates/advanceCandidates()`
8. `advancePriceExhaustion()` — decays by 1
9. `Security.advanceOpinion(unhandled)` — decays 20% then adds unhandled count

Returns:
```js
{
  weeklyAttendance,
  gateRevenue, parkingRevenue, shopRevenue, totalIncome,
  staffCosts, utilityCosts, constructionCosts, theftLoss, totalExpenses,
  rideEfficiency,
  security: { ...incidentBreakdown, opinionAfter },
}
```

### Round summary modal

Rows shown: Attendance · Gate Revenue · Parking Revenue · Shop Revenue · Total Expenses · Theft Loss (hidden when 0) · Net.

---

## Security system (`security.js`)

### State

`Security.opinion` — accumulated danger perception (0+). Rises by `unhandled` incident count each round. Decays `ceil(opinion × 0.20)` per round (minimum 0). Suppresses daily demand via `1 − √opinion / 100`.

### Incident sources (per round)

| Source | Formula | Handled by focus |
|---|---|---|
| Gate overflow | `floor(weeklyOverflow × OVERFLOW_INCIDENT_RATE)` | Gate guards |
| Unridden visitors | `floor(unridden × UNRIDDEN_INCIDENT_RATE)` | Patrol guards |
| Shop theft | `Shopping.calcTheftIncidents(weeklyAttendance)` | Shop guards |
| Random | `floor(weeklyAttendance × RANDOM_INCIDENT_RATE)` | Any |

### Two-phase handling

1. **Focus bonus** — each guard with a matching focus handles `FOCUS_BONUS` (3) extra incidents of that type, free (does not consume normal quota).
2. **Normal capacity** — pooled weekly quota handles remaining incidents. Quota per guard: `(3 + tier) × 7` per week (tier 1–4).

### Theft loss

Shop incidents that survive both phases cost `$50` each (`Shopping.calcTheftLoss(unhandledShop)`). Deducted from `money` in `Finance.processRound()`. Tracked proportionally: `unhandledShop = shopRemaining − floor(normalHandled × shopRemaining / remaining)`.

### Guard focus assignment

Each guard has a `focus` property (`SECURITY_FOCUS.PATROL` default). Changed via the Security panel. Focus affects phase-1 bonuses only — all guards share the same phase-2 pool.

---

## Shopping system (`shopping.js`)

### State

| Property | Description |
|---|---|
| `Shopping.catalog` | Loaded from `shops.json` |
| `Shopping.installed` | Placed shop records |
| `Shopping.merchandiseUpcharge` | $ added on top of `BASE_SPEND` per buyer |

### Revenue formula

```
tiles      = Σ active Merchandise store footprint tiles (1-cells only)
staffRatio = min(1, merchandiseAttendants / (activeStores × WORKERS_PER_STORE))
revenue    = round(weeklyAttendance × BUYER_RATE × (BASE_SPEND + upcharge) × sqrt(tiles) × staffRatio)
```

Zero tiles → zero revenue.

### Theft formula

```
theftMultiplier = 1 + 0.25 × max(0, workersNeeded − actualAttendants)
incidents       = floor(weeklyAttendance × (1 − BUYER_RATE) × THEFT_RATE × sqrt(tiles) × theftMultiplier)
```

Zero tiles → zero theft incidents.

### Shop staffing

`WORKERS_PER_STORE = 2`. Each missing worker: revenue proportionally reduced (via `staffRatio`) and theft increased by 25% multiplicatively (via `theftMultiplier`).

---

## Staffing system (`staff.js`)

### Job types (`Staff.JOB_TYPES`)

| Job | Weekly salary |
|---|---|
| Ride Operator | $520 |
| Security | $640 |
| Janitor | $480 |
| Engineer | $1,200 |
| Booth Attendant | $480 |
| Merchandise Attendant | $290 (minimum wage) |
| Business Analyst | $1,400 |
| HR | $1,600 |

### Employee record shape

```js
{
  instanceId,       // "staff_{seq}"
  name,             // "Alex K."
  jobId,            // JOB.* constant
  salary,           // $/week
  skillModifier,    // 0.75–1.25
  salaryModifier,   // 0.80–1.20
  mood,             // 0–100
  weeksEmployed,
  focus,            // SECURITY_FOCUS.* (relevant for security guards)
}
```

### Experience tiers

| Tier | Threshold | Multiplier | tier value |
|---|---|---|---|
| Junior | < 52 weeks | 0.75× | 1 |
| (Normal) | 52–156 weeks | 1.0× | 2 |
| Senior | 157–260 weeks | 1.25× | 3 |
| Lead | > 260 weeks | 1.5× | 4 |

`Staff.getExperienceTier(weeksEmployed)` returns `{ label, multiplier, tier }`.

### Special job effects

- **Booth Attendant** — drives `Finance.calcGateThroughput()`. More attendants + higher skill/mood/exp = more visitors admitted per day.
- **Ride Operator** — `Staff.rideOperatorsNeeded()` totals across all running rides. Under-staffing degrades `rideOpinion` and per-ride ridership.
- **HR** — each HR employee boosts candidate generation: +`tier` candidates and +`tier × 5` quality per round.
- **Security** — capacity `(3 + tier) × 7` incidents/week. Focus determines phase-1 bonus type.
- **Merchandise Attendant** — 2 required per active Merchandise store. Under-staffing cuts revenue and raises theft.

### Posting cost

`$75/week` per active posting (added to `staffCosts`).

### Candidate pipeline

Each round (if postings exist):
1. **Generate** — `Staff.generateCandidates()` creates candidates via `Staff.generateEmployee(quality)`. Any with no matching posting discarded immediately.
2. **Withdrawal** — 20% chance at week 4, +20% per additional week (100% at week 8).
3. **Player review** — Hire (moves to roster, fills posting) or Decline (removes candidate, posting stays open).

`Staff.findMatchingPosting(candidate)` — same job, `salary ≤ offer`, `yearsExp ≥ minimum`.

### Ride operator requirements

`Staff.operatorsNeededForRide(record)` — maps occupied tile count: ≤4 tiles → 2, 5–9 → 3, ≥10 → 4.

---

## History tracking (`history.js`)

`History.record(report)` appends one entry per round. `History.rounds` is append-only.

```js
{
  round, date,
  attendance,
  gateIncome, parkingIncome, shopIncome,
  staffExpense, utilityExpense, constructionExpense, theftLoss,
  rideEfficiency,       // 0–1
  staffCount, staffMood,
  runningRides,
  jobPostings,
  matchingCandidates,
  securityIncidents, securityHandled, securityUnhandled, securityOpinion,
}
```

---

## Rides panel (master-detail)

**List view** — tappable rows showing name + condition badge.

**Detail view** — shows name, status badge, weekly utility cost, last-round ridership bar, and context-sensitive actions:

| Status | Actions |
|---|---|
| Under Construction | Weeks remaining · Pause Construction |
| Paused Construction | Weeks remaining · Resume Construction |
| Active | Close Ride |
| Closed | Re-open Ride |

---

## Data schemas

### `rides.json`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique, snake_case |
| `name` | string | Display name |
| `footprint` | `number[][]` | 2D grid; `1` = occupied, `0` = empty |
| `buildCost` | number | Dollars |
| `buildWeeks` | number | Construction time |
| `rideDuration` | number | Seconds per cycle |
| `intensity` | string | `low` / `medium` / `high` / `extreme` |
| `ridesPerHour` | number | Throughput; drives capacity and `rideOpinion` |
| `utilityCost` | number | $/week while running; multiplied by `Population.utilityMultiplier` |

Colors assigned at runtime from `RIDE_COLORS` in `game.js` by array index.

### `facilities.json`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique, snake_case |
| `name` | string | Display name |
| `color` | string | Hex |
| `footprint` | `number[][]` | Same format as rides |
| `buildCost` | number | Dollars |
| `buildWeeks` | number | `0` = instant |
| `limit` | number \| null | Max allowed in park; `null` = unlimited |
| `edgeOnly` | boolean? | Occupied cell must touch grid boundary |
| `mustBeAdjacentTo` | string[]? | Neighbor must contain one of these facility ids |

### `shops.json`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Matches `SHOP_ID.*` |
| `name` | string | Display name |
| `color` | string | Hex |
| `footprint` | `number[][]` | Same format as rides |
| `buildCost` | number | Dollars |
| `buildWeeks` | number | Construction time |
| `limit` | number \| null | Max in park |
| `mustBeAdjacentTo` | string[]? | Adjacency requirement |

---

## What's implemented

- 20×20 park grid with collision detection and irregular footprint support
- Ride, facility, and shop catalogues loaded from JSON with footprint previews
- Placement rules: edge-only, adjacency, per-type limits, affordability
- Tap/click-to-select placement (desktop + mobile touch)
- Two-stage game: Setup → Play with weekly construction payments
- Park-open prerequisites: Park Entrance + at least one connected ride
- Ride conditions: Running, Unconnected, Under Construction, Paused, Closed
- Ride detail panel: pause/resume, close/reopen, last-round ridership bar, utility cost
- Five overlay panels: Construction (Attractions/Shopping/Facilities), Rides, Staffing, Security, Pricing
- HUD: budget, date (Week W, QN, YYYY), stage badge
- Finance: gate/parking/shop revenue; staff/utility/construction/theft costs; round summary modal
- Pricing panel: gate, parking, merchandise upcharge; price exhaustion suppresses demand
- Park metrics: `parkExcitement`, `rideOpinion` (smoothed staffing quality score)
- Security system: incident tracking, two-phase handling, guard focus assignment, opinion decay
- Security opinion suppresses daily visitor demand
- Shop theft: scales with store tiles and understaffing; unhandled incidents lose $50 each
- Shop revenue: scales with `sqrt(tiles)` and merchandise attendant staffing ratio
- Ride utility costs deducted each round per running ride
- Staffing: named employees with skill/salary/mood/experience, eight job types
- HR boosts candidate count and quality; Merchandise Attendants staff the shop
- Job postings with min experience, salary offer, $75/week cost
- Candidate pipeline: generate → withdrawal timer → player hire/decline
- Per-round history log (attendance, all revenue/cost streams, security, staff metrics)
- Population constants centralise all tunable behavior rates and economic multipliers

## What's not yet implemented (see `reqs.md`)

- Firing / wage adjustment UI
- Staff mood dynamics
- Ride breakdown / repair
- Food revenue
- `Population.inflationRate` wired to cost-of-living adjustments
- `Population.utilityMultiplier` wired to round-by-round increases
- Reports, graphs, and awards
- Marketing and reputation
- Events system and demographics
- Login stage and teacher configuration
