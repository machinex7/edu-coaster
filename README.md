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
| `game.js` | Core state, constants, placement logic, construction queue |
| `grid.js` | Grid DOM, cell painting, mouse/touch event handlers |
| `finance.js` | Attendance model, park metrics, round financial processing |
| `staff.js` | Job type registry, staff state, staffing requirements, panel rendering |
| `history.js` | Append-only per-round data log for future reports/graphs |
| `hud.js` | HUD display, stage transitions, panel management, round summary modal |
| `rides.json` | Ride catalogue |
| `facilities.json` | Facility catalogue |
| `reqs.md` | Full game design document — read before adding features |

Script load order matters: `game.js → grid.js → finance.js → staff.js → history.js → hud.js`. All cross-file calls happen at runtime (not parse time), so function declarations are always available.

---

## Game stages

| Stage | Constant | Behaviour |
|---|---|---|
| Setup | `STAGE_SETUP` | Items placed instantly at full cost. No income. Park can be opened once a Park Entrance and at least one connected ride exist. |
| Play | `STAGE_PLAY` | Items under construction pay `buildCost / buildWeeks` per round. Income and expenses process on each round advance. |

---

## UI layout

```
<header>           — HUD: budget, date, stage badge, Open Park / Next Round buttons
<div id="main">
  <div id="left-nav">            — position:relative container
    <nav id="btn-bar">           — narrow vertical button bar; always visible
    <div class="side-panel">     — Construction panel (position:absolute overlay, z-index 10)
    <div class="side-panel">     — Rides panel
    <div class="side-panel">     — Staffing panel
  <div id="park-view">           — flex:1, centers the grid
    <div id="grid">              — CSS grid of 20×20 cells
<div id="round-modal">           — fixed overlay, shown after each round
```

Panels slide open at `left: 100%` of `#btn-bar` (overlaying the park, never pushing it). Width transitions 0 ↔ 275px via CSS. Only one panel is open at a time; clicking the active button closes it.

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
  instanceId,   // "ride_{id}_{timestamp}"
  rideId, name, color,
  row, col, footprint,
  status,       // 'active' | 'under_construction'
  // if under_construction:
  weeksTotal, weeksCompleted, weeklyPayment,
}

// installedFacilities[]
{
  instanceId,   // "facility_{id}_{timestamp}"
  facilityId, name, color,
  row, col, footprint,
  status,
  // if under_construction: same fields as above
}
```

---

## Interaction model

**Tap/click-to-select → hover-to-preview → tap/click-to-place.**

1. Click a sidebar card → `selectItem()` stores `selected` and marks the grid with `.has-selection`.
2. Mousemove / touchmove over the grid → `updatePlacementFromPoint()` calls `highlightPlacement()`, which runs `canPlaceItem()` and applies `.highlight-valid` (green) or `.highlight-invalid` (red).
3. Click/tap grid → `placeItem()` if `currentPlacement.valid`.
4. Escape, re-clicking the active card, or switching tabs → `deselectItem()`.

---

## Placement validation

`canPlaceItem()` checks affordability then dispatches:

- **Rides** — `canPlaceFootprint()` only (bounds + collision).
- **Facilities** — `canPlaceFootprint()`, then:
  - **`limit`** — counts matching entries in `installedFacilities`.
  - **`edgeOnly`** — at least one occupied cell must touch the grid boundary.
  - **`mustBeAdjacentTo`** — at least one orthogonal neighbor of any occupied cell must be a listed facility type (read from `facilityTypeAtCell`).

To add a new placement rule: add a field to `facilities.json` and a corresponding check in `canPlaceFacility()` in `game.js`.

---

## Ride connectivity

`isRideConnected(record)` — returns `true` if any occupied cell of the ride's footprint has a `path` tile as an orthogonal neighbor (checked via `facilityTypeAtCell`). Used for:

- Ride condition display (Running vs Unconnected)
- Park-open prerequisite (at least one connected ride required)
- Finance calculations (only connected rides count toward excitement and staffing)

---

## Finance system (`finance.js`)

### Park metrics

| Variable | Description |
|---|---|
| `parkExcitement` | `runningRideCount × rideOpinion`. Drives daily demand. |
| `rideOpinion` | Smoothed 0–1 score of how well rides serve the crowd. Starts at 1.0. |

### Attendance model

```
dailyDemand      = parkExcitement × 20
gateThroughput   = boothAttendantCount × 500 × moodMultiplier  (moodMultiplier: 0.8–1.2)
dailyAttendance  = min(dailyDemand, gateThroughput)
weeklyAttendance = dailyAttendance × 7
```

### Ride opinion

Each round: `staffRatio = min(1, actualOperators / neededOperators)`. Daily ride capacity = `sum(ridesPerHour for Running rides) × staffRatio`. Score = `min(1, rideCapacity / dailyAttendance)`. `rideOpinion = (rideOpinion + score) / 2` (gradual shift).

### Round processing order (`processRound`)

1. `recalcExcitement()` — uses previous round's `rideOpinion`
2. `calcDailyAttendance()` — demand vs gate throughput
3. `computeRideOpinion(daily)` — updates `rideOpinion` for next round
4. Gate revenue added to `money`
5. Staff wages deducted
6. `processConstruction()` — deducts weekly payments, completes finished builds

Returns `{ weeklyAttendance, gateRevenue, staffCosts, constructionCosts, totalExpenses, rideEfficiency }`.

---

## Staffing system (`staff.js`)

### Job type registry

`JOB_TYPES` array — add new careers here. Fields: `id`, `label`, `plural`, `weeklySalary`.

Current jobs: Ride Operator · Security · Janitor · Engineer · Booth Attendant · Business Analyst.

### Staff state

`staff[]` — array of `{ instanceId, jobId, salary, mood }`. Mood is 0–100 (≥70 Happy, 40–69 Neutral, <40 Unhappy). `hireStaff(jobId)` is the single entry point.

Starting staff: 2 Ride Operators, 1 Security, 1 Janitor, 1 Engineer, 2 Booth Attendants.

### Staffing requirements

`operatorsNeededForRide(record)` — maps occupied tile count to required operators: ≤4 tiles → 2, 5–9 → 3, ≥10 → 4.

`rideOperatorsNeeded()` — sums requirements across all Running rides.

---

## History tracking (`history.js`)

`roundHistory` is an append-only array. `recordRound(report)` is called after each round. Each entry:

```js
{
  round, date,
  attendance, gateIncome,
  staffExpense, constructionExpense,
  rideEfficiency,       // 0–1
  staffCount, staffMood,  // staffMood is rounded integer 0–100
  runningRides,
}
```

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
| `ridesPerHour` | number | Used for ride capacity and `rideOpinion` calculations |

Colors assigned at runtime from `RIDE_COLORS` in `game.js` by array index — not stored in JSON.

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
- Tap/click-to-select placement flow (desktop + mobile touch)
- Two-stage game: Setup (instant builds) → Play (weekly construction payments)
- Park-open prerequisites: Park Entrance built + at least one connected ride
- Ride connectivity via path adjacency (`isRideConnected`)
- Ride conditions: Running, Unconnected, Under Construction
- Overlay slide panels: Construction, Rides, Staffing
- HUD: budget, date (Week W, QN, YYYY), stage badge
- Finance: attendance model, gate revenue, staff wages, round summary modal
- Park metrics: `parkExcitement`, `rideOpinion` (smoothed staffing quality score)
- Staffing panel: employees grouped by job with salary and mood
- Per-round history log for future reports and graphs

## What's not yet implemented (see `reqs.md`)

- Hiring / firing / wage adjustment UI
- Staff mood dynamics (events that change mood)
- Ride breakdown / repair system
- Login stage and teacher configuration
- Income beyond gate admission (food, merchandise, parking)
- Reputation system
- Research and surveys
- Marketing campaigns
- Shopping tab contents
- Reports, graphs, and awards
- Events system
- Demographics
