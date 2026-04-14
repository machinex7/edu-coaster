# edu-coaster

An educational browser game about running a theme park business. Students design a park, manage finances, staff, and long-term planning across turn-based weekly rounds. Teachers configure the starting scenario. Built in plain HTML, CSS, and JavaScript — no build tools, no framework, no dependencies.

See `reqs.md` for the full game design document.

---

## Running locally

Requires a local HTTP server (fetch() won't work over file://).

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
| `game.js` | All game logic (single file for now) |
| `rides.json` | Ride catalogue |
| `facilities.json` | Facility catalogue (entrance, paths, bathrooms) |
| `reqs.md` | Full game design document — read this before adding features |

---

## Data file schemas

### `rides.json`
Array of ride definitions. Example:
```json
{
  "id": "carousel",
  "name": "Carousel",
  "footprint": [[1,1],[1,1]],
  "buildCost": 75000,
  "buildWeeks": 2,
  "rideDuration": 180,
  "intensity": "low",
  "ridesPerHour": 15
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique key, snake_case |
| `name` | string | Display name |
| `footprint` | `number[][]` | 2D grid; `1` = occupied cell, `0` = empty. Irregular shapes supported. |
| `buildCost` | number | Dollars |
| `buildWeeks` | number | Construction time |
| `rideDuration` | number | Seconds per ride cycle |
| `intensity` | string | `"low"` / `"medium"` / `"high"` / `"extreme"` |
| `ridesPerHour` | number | Ride cycles per hour (not total rider throughput) |

Ride colors are assigned at runtime from `RIDE_COLORS` in `game.js` based on array index — they are not stored in the JSON.

### `facilities.json`
Array of facility definitions. Example:
```json
{
  "id": "path",
  "name": "Path",
  "color": "#d6d3d1",
  "footprint": [[1]],
  "buildCost": 100,
  "buildWeeks": 0,
  "limit": null,
  "mustBeAdjacentTo": ["path", "park_entrance"]
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique key, snake_case |
| `name` | string | Display name |
| `color` | string | Hex color — facilities define their own colors in the JSON |
| `footprint` | `number[][]` | Same format as rides |
| `buildCost` | number | Dollars |
| `buildWeeks` | number | `0` = instant |
| `limit` | number \| null | Max allowed in the park; `null` = unlimited |
| `edgeOnly` | boolean? | If true, at least one occupied cell must be on the grid boundary (used for Park Entrance) |
| `mustBeAdjacentTo` | string[]? | List of facility `id`s; at least one neighbor cell must contain one of these (used for Path) |

---

## Architecture

### Grid

- **Size:** `GRID_COLS × GRID_ROWS` (currently 20×20), each cell `CELL_SIZE`px (40px) with `CELL_GAP`px (1px) between.
- **`gridCells[r][c]`** — 2D array of `<div>` DOM elements, built once in `buildGrid()`.
- **`gridState[r][c]`** — parallel 2D array of `instanceId` strings (or `null`). This is the source of truth for collision detection. Both rides and facilities write to it.

### Placed item records

```js
// installedRides[] — one entry per placed ride
{ instanceId, rideId, name, color, row, col, footprint }

// installedFacilities[] — one entry per placed facility
{ instanceId, facilityId, name, color, row, col, footprint }
```

`instanceId` format: `"ride_{id}_{timestamp}"` or `"facility_{id}_{timestamp}"`.

### Facility adjacency lookup

`facilityTypeAtCell` is a plain object used as a map:
```js
facilityTypeAtCell["row,col"] = facilityId  // e.g. "3,7" → "path"
```
Written on every `placeFacility()` call. Read by `canPlaceFacility()` to enforce `mustBeAdjacentTo` rules without scanning `installedFacilities`.

---

## Interaction model

**Tap/click-to-select, hover/move-to-preview, tap/click-to-place.**

1. Click a sidebar card → `selectItem()` sets `selected = { item, category, cardEl }` and adds `.selected` to the card and `.has-selection` to `#grid`.
2. Mousemove / touch over the grid → `updatePlacementFromPoint()` computes the footprint anchor (centered on cursor cell) and calls `highlightPlacement()`.
3. `highlightPlacement()` runs `canPlaceItem()` and adds `.highlight-valid` (green) or `.highlight-invalid` (red) classes to the relevant cells. Stores result in `currentPlacement`.
4. Click/tap the grid → `onGridClick()` / `onGridTouchEnd()` calls `placeItem()` if `currentPlacement.valid`.
5. Escape, re-clicking the active card, or switching sidebar tabs calls `deselectItem()`.

The flow is unified for rides and facilities. Touch events are attached to `#grid` (not the document), so they only fire when the user is actually over the grid.

---

## Placement validation

`canPlaceItem(item, category, startRow, startCol)` dispatches to:

- **`canPlaceRide()`** — calls `canPlaceFootprint()` only (bounds + collision).
- **`canPlaceFacility()`** — calls `canPlaceFootprint()`, then checks:
  - **`limit`** — counts matching entries in `installedFacilities`.
  - **`edgeOnly`** — at least one occupied cell has `row === 0`, `row === GRID_ROWS-1`, `col === 0`, or `col === GRID_COLS-1`.
  - **`mustBeAdjacentTo`** — at least one of the four orthogonal neighbors of any occupied cell exists in `facilityTypeAtCell` with a matching id.

Adding a new placement rule to a facility type: add the field to `facilities.json` and add a corresponding check in `canPlaceFacility()` in `game.js`.

---

## Sidebar structure

The sidebar has one section ("Construction") with three sub-tabs driven by `data-tab` attributes:

```
#sidebar
  #sidebar-header        — "Construction" label
  #sub-tabs
    [data-tab="attractions"]  → #attractions-panel  (rides)
    [data-tab="shopping"]     → #shopping-panel     (empty)
    [data-tab="facilities"]   → #facilities-panel   (facilities)
```

`initSubTabs()` wires the buttons. Switching tabs calls `deselectItem()`. To add a new tab: add a `<button class="sub-tab-btn" data-tab="foo">` and a `<div id="foo-panel" class="tab-panel hidden">` — the handler finds the panel by id automatically.

---

## What's implemented

- Park grid (20×20) with collision detection
- Ride catalogue loaded from `rides.json` with footprint previews
- Facility catalogue loaded from `facilities.json` (Park Entrance, Path, Bathroom)
- Special placement rules: edge-only, adjacency, per-type limits
- Tap/click-to-select placement flow (desktop + mobile)
- `installedRides` and `installedFacilities` arrays tracking everything placed

## What's not yet implemented (see `reqs.md`)

- Budget / cost enforcement
- Turn-based weekly rounds
- Staffing system
- Income / attendance simulation
- Reputation system
- Research, surveys, marketing
- Shopping tab contents
- Reports and graphs
- Events system
