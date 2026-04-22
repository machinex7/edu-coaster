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
| `staff.js` | Job registry, employee generation, staff/candidates/postings/benefits state and panel UI (`Staff` object) |
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

| Object | File | Owns |
|---|---|---|
| `Population` | `population.js` | Visitor behavior rates, labor constants, economic multipliers |
| `Finance` | `finance.js` | Pricing state, attendance model, income/cost calculations, round processing |
| `Shopping` | `shopping.js` | Shop catalog, installed shops, revenue and theft math, staffing ratios |
| `Staff` | `staff.js` | Roster, postings, candidates, benefits policy, experience, panel rendering |
| `Security` | `security.js` | Opinion state, incident calculation, panel rendering |
| `History` | `history.js` | Append-only per-round log |

---

## Shared constants (`constants.js`)

All enums are `Object.freeze`d — typos return `undefined` immediately rather than silently comparing wrong strings.

```js
STAGE          = { SETUP, PLAY }
STATUS         = { ACTIVE, UNDER_CONSTRUCTION, PAUSED_CONSTRUCTION, CLOSED, BROKEN_DOWN }
CATEGORY       = { RIDE, FACILITY, SHOP }
SHOP_ID        = { MERCHANDISE }
JOB            = { RIDE_OPERATOR, SECURITY, JANITOR, ENGINEER, BOOTH_ATTENDANT,
                   MERCHANDISE_ATTENDANT, BUSINESS_ANALYST, HR }
FACILITY_ID    = { PARK_ENTRANCE, PATH, BATHROOM, STATUE, GARDEN, FOUNTAIN }
SECURITY_FOCUS = { PATROL, GATE, SHOP }
ENGINEER_FOCUS = { MAINTENANCE, CONSTRUCTION }
```

---

## Population constants (`population.js`)

Centralises all tunable rates so game balance changes are made in one place.

| Constant | Used by |
|---|---|
| `MINIMUM_WAGE_WEEKLY` | `Staff.JOB_TYPES` (Merchandise Attendant salary) |
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

## UI layout

```
<header>           — HUD: budget, date, stage badge
<div id="main">
  <div id="left-nav">            — position:relative container
    <nav id="btn-bar">           — narrow vertical button bar; always visible
    <div class="side-panel">     — Construction (Attractions / Shopping / Facilities tabs)
    <div class="side-panel">     — Rides (master-detail)
    <div class="side-panel">     — Staffing (Roster / Postings / Candidates / Benefits tabs)
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
- **`facilityTypeAtCell["row,col"]`** — fast lookup map from cell coordinate to `facilityId`.

---

## Placed item records

```js
// installedRides[]
{
  instanceId,             // "ride_{id}_{timestamp}"
  rideId, name, color,
  row, col, footprint,
  status,                 // STATUS.ACTIVE | UNDER_CONSTRUCTION | PAUSED_CONSTRUCTION | CLOSED | BROKEN_DOWN
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
```

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
| `Finance.parkExcitement` | `runningRideCount × rideOpinion`. Drives daily demand. |
| `Finance.rideOpinion` | Smoothed 0–1 score of how well rides serve the crowd. |
| `Security.opinion` | Accumulated danger perception. Reduces demand via `1 − √opinion / 100`. |

### Attendance model

```
dailyDemand      = parkExcitement × 20 × exhaustionFactor × securityFactor
gateThroughput   = Σ per booth attendant: 500 × moodMult × expMult × skillModifier
dailyAttendance  = min(dailyDemand, gateThroughput)
weeklyAttendance = round(dailyAttendance × 7)
```

Only working (non-absent) booth attendants count toward throughput.

### Income sources

| Source | Formula |
|---|---|
| Gate | `round(gatePrice × dailyAttendance × 7)` |
| Parking | `floor(dailyDemand × 7 / 3) × parkingPrice` |
| Shop | `Shopping.calcRevenue(weeklyAttendance)` |

### Cost sources

| Source | Formula |
|---|---|
| Staff wages | `Σ staff.salary` — all employees, including those currently absent |
| Posting fees | `POSTING_WEEKLY_COST × activePostings` |
| Ride utilities | `Σ utilityCost × Population.utilityMultiplier` for running connected rides |
| Construction | `weeklyPayment` per item under construction |
| Theft loss | `unhandledShop × THEFT_LOSS_PER` |

### Round processing order (`Finance.processRound`)

1. `processEngineers()` — repair/maintenance before excitement recalc
2. `recalcExcitement()`
3. Calc demand, throughput, attendance
4. `computeRideOpinion()` — updates `rideOpinion`; writes `lastRoundRiders/Capacity`
5. `processWear()` — accumulate wear, roll for breakdown
6. Calc income and costs; apply to `money`
7. `processConstruction()` — deduct weekly payments, complete finished builds
8. `Staff.processSickness()` — decrement absences, roll for new illness/injury/vacation
9. `Staff.advanceExperience/applyInflation/updateMoods/advancePostings/generateCandidates/advanceCandidates()`
10. `advancePriceExhaustion()`
11. `Security.advanceOpinion(unhandled)`

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

```
staffRatio = min(1, workingAttendants / (activeStores × WORKERS_PER_STORE))
revenue    = round(weeklyAttendance × BUYER_RATE × (BASE_SPEND + upcharge) × sqrt(tiles) × staffRatio)

theftMultiplier = 1 + 0.25 × deficit
incidents       = floor(weeklyAttendance × (1 − BUYER_RATE) × THEFT_RATE × sqrt(tiles) × theftMultiplier)
```

Only merchandise attendants with `weeksOut === 0` count toward `staffRatio`. Zero tiles → zero revenue and zero theft.

---

## Staffing system (`staff.js`)

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

### Mood calculation (`updateMoods`)

```
base         = (salary / costOfLiving) / 2 × 100
eventBonus   = Σ moodModifier across active events
vacationBase = 5 × VACATION_WEEKS   (passive benefit of company vacation policy)
mood         = clamp(base + eventBonus + vacationBase, 0, 100)
```

Events decay by 2 per round and are removed when their modifier reaches zero.

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
- **Merchandise Attendant** — 2 required per active store; only working attendants counted.

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

### `shops.json`

Same shape as `facilities.json` plus `shopId` matching `SHOP_ID.*`.

---

## What's implemented

- 20×20 park grid with collision detection and irregular footprint support
- Ride, facility, and shop catalogues loaded from JSON
- Placement rules: edge-only, adjacency, per-type limits, affordability
- Two-stage game: Setup → Play with weekly construction payments
- Park-open prerequisites: Park Entrance + at least one connected ride
- Ride conditions: Running, Unconnected, Under Construction, Paused, Closed, Broken Down
- Ride detail panel: pause/resume, close/reopen, ridership bar, utility cost
- Engineer system: repair broken rides and reduce wear; focus on construction or maintenance
- Five overlay panels: Construction, Rides, Staffing, Security, Pricing
- HUD: budget, date (Week W, QN, YYYY), stage badge
- Finance: gate/parking/shop revenue; staff/utility/construction/theft costs; round summary modal
- Pricing panel: gate, parking, merchandise upcharge; price exhaustion suppresses demand
- Park metrics: `parkExcitement`, `rideOpinion`
- Security system: incident tracking, two-phase handling, guard focus assignment, opinion decay
- Shop theft: scales with tiles and understaffing; unhandled incidents lose money
- Staff absence system: per-round rolls for sickness, critical injury, and vacation; absent staff excluded from all capacity calculations
- Staff benefits panel: vacation weeks setting drives absence duration and passive mood baseline
- Staffing: employees with skill/salary/mood/experience; events-based mood system; inflation
- Eight job types with distinct gameplay effects
- Job postings, candidate pipeline with withdrawal timer, hire/decline flow
- Per-round history log

## What's not yet implemented (see `reqs.md`)

- Firing / wage adjustment UI
- Ride breakdown repair UI (engineers repair automatically; no player-visible repair queue yet)
- Food revenue
- `Population.utilityMultiplier` wired to round-by-round increases
- Reports, graphs, and awards
- Marketing and reputation
- Events system and demographics
- Login stage and teacher configuration
