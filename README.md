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
| `game.js` | Core state, grid constants, placement logic, construction queue, ride actions |
| `grid.js` | Grid DOM, cell painting, mouse/touch event handlers |
| `finance.js` | Pricing variables, attendance model, park metrics, round financial processing |
| `staff.js` | Job registry, employee generation, staff/candidates/postings state, panel rendering |
| `history.js` | Append-only per-round data log for future reports/graphs |
| `hud.js` | HUD display, stage transitions, panel management, round summary modal, pricing panel |
| `rides.json` | Ride catalogue |
| `facilities.json` | Facility catalogue |
| `reqs.md` | Full game design document — read before adding features |

**Script load order:** `constants.js → game.js → grid.js → finance.js → staff.js → history.js → hud.js`

All cross-file calls happen at runtime (not parse time), so forward references are safe.

---

## Shared constants (`constants.js`)

All enums are `Object.freeze`d — typos like `STATUS.ACTVE` return `undefined` immediately rather than silently comparing wrong strings.

```js
STAGE        = { SETUP, PLAY }
STATUS       = { ACTIVE, UNDER_CONSTRUCTION, PAUSED_CONSTRUCTION, CLOSED }
CATEGORY     = { RIDE, FACILITY }
JOB          = { RIDE_OPERATOR, SECURITY, JANITOR, ENGINEER, BOOTH_ATTENDANT, BUSINESS_ANALYST, HR }
FACILITY_ID  = { PARK_ENTRANCE, PATH, BATHROOM, STATUE, GARDEN, FOUNTAIN }
```

---

## Game stages

| Stage | Constant | Behaviour |
|---|---|---|
| Setup | `STAGE.SETUP` | Items placed instantly at full cost. No income. Park opens once a Park Entrance and at least one connected ride exist. |
| Play | `STAGE.PLAY` | Items under construction pay `buildCost / buildWeeks` per round. Income and expenses process on each round advance. |

---

## UI layout

```
<header>           — HUD: budget, date, stage badge
<div id="main">
  <div id="left-nav">            — position:relative container
    <nav id="btn-bar">           — narrow vertical button bar; always visible
    <div class="side-panel">     — Construction panel (position:absolute overlay, z-index 10)
    <div class="side-panel">     — Rides panel (master-detail)
    <div class="side-panel">     — Staffing panel
    <div class="side-panel">     — Pricing panel
  <div id="park-view">           — flex:1, centers the grid
    <div id="grid">              — CSS grid of 20×20 cells
<div id="round-modal">           — fixed overlay, shown after each round
```

- Panels slide open at `left: 100%` of `#btn-bar` (overlaying the park). Width transitions 0 ↔ 275px. Only one panel open at a time.
- **Open Park** and **Next Round** buttons are `position:fixed` at `bottom-right` of the viewport (with `safe-area-inset-bottom` for mobile). They share the same spot; only one is visible at a time.

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
  // if under_construction: same fields as above
}
```

### Ride status transitions

```
UNDER_CONSTRUCTION ←→ PAUSED_CONSTRUCTION   (pause/resume in Rides panel)
UNDER_CONSTRUCTION → ACTIVE                 (construction completes automatically)
ACTIVE ←→ CLOSED                            (close/reopen in Rides panel)
```

---

## Interaction model

**Tap/click-to-select → hover-to-preview → tap/click-to-place.**

1. Click a sidebar card → `selectItem()` stores `selected` and marks the grid with `.has-selection`.
2. Mousemove / touchmove over the grid → `updatePlacementFromPoint()` calls `highlightPlacement()`, runs `canPlaceItem()`, applies `.highlight-valid` (green) or `.highlight-invalid` (red).
3. Click/tap grid → `placeItem()` if `currentPlacement.valid`.
4. Escape, re-clicking the active card, or switching tabs → `deselectItem()`.

---

## Placement validation

`canPlaceItem()` checks affordability then dispatches:

- **Rides** — `canPlaceFootprint()` only (bounds + collision).
- **Facilities** — `canPlaceFootprint()`, then:
  - **`limit`** — counts matching entries in `installedFacilities`.
  - **`edgeOnly`** — at least one occupied cell must touch the grid boundary.
  - **`mustBeAdjacentTo`** — at least one orthogonal neighbor of any occupied cell must be a listed facility type (via `facilityTypeAtCell`).

---

## Ride connectivity

`isRideConnected(record)` — returns `true` if any occupied cell of the ride's footprint has a `path` tile as an orthogonal neighbor. Used for:

- Ride condition display (Running vs Unconnected)
- Park-open prerequisite
- Finance calculations (only connected rides count toward excitement and staffing needs)

---

## Finance system (`finance.js`)

### Pricing variables

| Variable | Default | Notes |
|---|---|---|
| `gatePrice` | 20 | $ per visitor |
| `parkingPrice` | 10 | $ per vehicle — not yet wired to revenue |
| `foodUpcharge` | 0 | $ per food item — not yet wired to revenue |
| `priceExhaustion` | 0 | Internal only. Rises on price increases, decays 1/round. Reduces demand. |

**Price exhaustion rules:**
- Gate price increase of `+$N` → `priceExhaustion += 2N`
- Parking price increase of `+$N` → `priceExhaustion += 1N`
- Decays by 1 each round (floor 0)
- Applied to demand: `dailyDemand × (1 - priceExhaustion / 100)`

### Park metrics

| Variable | Description |
|---|---|
| `parkExcitement` | `runningRideCount × rideOpinion`. Drives daily demand. |
| `rideOpinion` | Smoothed 0–1 score of how well rides serve the crowd. Starts at 1.0. |

### Attendance model

```
dailyDemand       = parkExcitement × 20 × (1 − priceExhaustion/100)
gateThroughput    = Σ per booth attendant: 500 × moodMult × expMult × skillModifier
                    (moodMult: 0.8–1.2, expMult from tier, skillModifier 0.75–1.25)
dailyAttendance   = min(dailyDemand, gateThroughput)
weeklyAttendance  = round(dailyAttendance × 7)
```

### Ride opinion & per-ride ridership

Each round: `staffRatio = min(1, actualOperators / neededOperators)`.

Per running ride:
- `lastRoundCapacity = round(ridesPerHour × 7)` — weekly max at full staff
- `lastRoundRiders = round(ridesPerHour × staffRatio × 7)` — weekly actual

`rideOpinion = (rideOpinion + score) / 2` where `score = min(1, totalCapacity × staffRatio / dailyAttendance)`.

### Round processing order (`processRound`)

1. `recalcExcitement()` — uses previous round's `rideOpinion`
2. `calcDailyAttendance()` — demand (with price exhaustion) vs gate throughput
3. `computeRideOpinion(daily)` — updates `rideOpinion`; writes per-ride ridership
4. Gate revenue added to `money` (rounded to nearest dollar)
5. Staff wages and posting costs deducted
6. `processConstruction()` — deducts weekly payments, completes finished builds
7. `advanceExperience()` — increments `weeksEmployed` for all staff
8. `advancePostings()` — increments `weeksActive` for all postings
9. `generateCandidates()` — generates new applicants if postings exist
10. `advanceCandidates()` — withdrawal check, then increments `weeksAsCandidate`
11. `advancePriceExhaustion()` — decays exhaustion by 1

Returns `{ weeklyAttendance, gateRevenue, staffCosts, constructionCosts, totalExpenses, rideEfficiency }`.

---

## Staffing system (`staff.js`)

### Job type registry

`JOB_TYPES` array — add new job types here. Fields: `id`, `label`, `plural`, `weeklySalary`.

Current jobs: Ride Operator · Security · Janitor · Engineer · Booth Attendant · Business Analyst · HR

### Employee generation

`generateEmployee(quality)` creates a randomised employee object (not yet in `staff[]`):
- Random first name from pool + single capital-letter last name
- Random job type from `JOB_TYPES`
- `skillModifier`: `0.75 + rand × 0.5 × (quality/100)` — ranges 0.75 at quality 0, up to 1.25 at quality 100
- `salaryModifier`: `0.80 + rand × 0.40` — ±20% salary variation, quality-independent
- `weeksEmployed`: random 0–`round(5 × quality/100)` years converted to weeks
- `salary`: `round(job.weeklySalary × salaryModifier)`

### Staff record shape

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
}
```

### Experience tiers

| Tier | Threshold | Efficiency multiplier |
|---|---|---|
| Junior | < 52 weeks | 0.75× |
| (Normal) | 52–156 weeks | 1.0× |
| Senior | 157–260 weeks | 1.25× |
| Lead | > 260 weeks | 1.5× |

`getExperienceTier(weeksEmployed)` returns `{ label, multiplier, tier }` where `tier` is 1–4.

### HR staff effect

Each HR employee boosts candidate generation per round:
- Adds `tier` extra candidates (Junior=+1, Normal=+2, Senior=+3, Lead=+4)
- Adds `tier × 5` to the quality parameter for generation

Base generation without HR: 4 candidates at quality 0.

### Postings system

```js
// postings[]
{ instanceId, jobId, minYearsExperience, salary, weeksActive }
```

Cost: `$75/week per active posting` (deducted from `staffCosts`).

### Candidates pipeline

Each round (if postings exist):
1. **Generate** — `generateCandidates()` creates candidates via `generateEmployee(quality)`. Any candidate with no matching posting (same job, salary ≤ offer, years exp ≥ minimum) is discarded immediately.
2. **Withdrawal** — `advanceCandidates()` runs before incrementing `weeksAsCandidate`. Chance: 20% at week 4, +20% per additional week (100% at week 8).
3. **Player review** — Candidates panel shows all waiting candidates with **Hire** / **Decline** buttons.
   - **Hire**: `hireCandidate(id)` finds a matching posting, moves candidate to `staff[]`, removes the posting.
   - **Decline**: `declineCandidate(id)` removes candidate; posting stays open.

### Candidate record shape

Same as staff record, plus `weeksAsCandidate`.

`findMatchingPosting(candidate)` — returns first open posting the candidate qualifies for (used to enable/disable the Hire button).

### Staffing requirements

`operatorsNeededForRide(record)` — maps occupied tile count: ≤4 tiles → 2 operators, 5–9 → 3, ≥10 → 4.

`rideOperatorsNeeded()` — sums across all Running rides.

---

## History tracking (`history.js`)

`roundHistory` is append-only. `recordRound(report)` is called after each round. Each entry:

```js
{
  round, date,
  attendance, gateIncome,
  staffExpense, constructionExpense,
  rideEfficiency,       // 0–1
  staffCount, staffMood,
  runningRides,
  jobPostings,          // active posting count
  matchingCandidates,   // candidates with at least one qualifying posting
}
```

---

## Rides panel (master-detail)

**List view** — tappable rows showing name + condition badge.

**Detail view** — context-sensitive actions based on status:

| Status | Actions shown |
|---|---|
| Under Construction | Weeks remaining · Pause Construction |
| Paused Construction | Weeks remaining · Resume Construction |
| Active (running) | Close Ride |
| Active (unconnected) | Close Ride |
| Closed | Re-open Ride |

Also shows **Last Round Ridership** bar (actual / max capacity with %) for any ride that has run at least one round.

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
| `ridesPerHour` | number | Throughput; used for ride capacity and `rideOpinion` |

Colors assigned at runtime from `RIDE_COLORS` in `game.js` by array index.

### `facilities.json`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique, snake_case |
| `name` | string | Display name |
| `color` | string | Hex — facilities define their own color |
| `footprint` | `number[][]` | Same format as rides |
| `buildCost` | number | Dollars |
| `buildWeeks` | number | `0` = instant |
| `limit` | number \| null | Max allowed in park; `null` = unlimited |
| `edgeOnly` | boolean? | Occupied cell must touch grid boundary |
| `mustBeAdjacentTo` | string[]? | Neighbor must contain one of these facility ids |

---

## What's implemented

- 20×20 park grid with collision detection and irregular footprint support
- Ride and facility catalogues loaded from JSON with footprint previews
- Placement rules: edge-only, adjacency, per-type limits, affordability
- Tap/click-to-select placement (desktop + mobile touch with safe-area support)
- Two-stage game: Setup → Play with weekly construction payments
- Park-open prerequisites: Park Entrance + at least one connected ride
- Ride conditions: Running, Unconnected, Under Construction, Paused, Closed
- Ride detail panel: construction pause/resume, close/reopen, last-round ridership bar
- Four overlay panels: Construction (Attractions/Shopping/Facilities), Rides, Staffing, Pricing
- HUD: budget, date (Week W, QN, YYYY), stage badge; action button fixed at bottom-right
- Finance: attendance model, gate revenue, staff wages, round summary modal
- Pricing panel: gate admission, parking, food upcharge; price exhaustion suppresses demand
- Park metrics: `parkExcitement`, `rideOpinion` (smoothed staffing quality score)
- Per-ride weekly ridership tracking (actual vs max capacity)
- Staffing: named employees with skill/salary modifiers, experience tiers (Junior/Normal/Senior/Lead)
- HR job type boosts candidate count and quality
- Job postings with min experience and salary offer; $75/week posting cost
- Candidate pipeline: generate → withdrawal timer → player hire/decline
- Staff panel: roster view, postings view, candidates view with Hire/Decline buttons
- Per-round history log (attendance, revenue, costs, staff metrics, postings, candidates)

## What's not yet implemented (see `reqs.md`)

- Firing / wage adjustment UI
- Staff mood dynamics (events that change mood)
- Ride breakdown / repair system
- Parking and food revenue wired to attendance
- Login stage and teacher configuration
- Reputation system
- Research and surveys
- Marketing campaigns
- Shopping tab contents
- Reports, graphs, and awards
- Events system
- Demographics
