// ── Constants ──────────────────────────────────────────────────────────────
const GRID_COLS = 20;
const GRID_ROWS = 20;

// Lot geometry: five axis-aligned rectangles that tile most of the 20×20 grid.
// r1/c1 are inclusive upper-left; r2/c2 are inclusive lower-right.
// Side lots deliberately overlap at the four corners; the small gaps between
// the center lot and the side lots are permanently outside all lots.
const LOTS = [
  { id: LOT_ID.CENTER, r1:  7, c1:  7, r2: 12, c2: 12 }, // 6×6 center
  { id: LOT_ID.NORTH,  r1:  0, c1:  3, r2:  5, c2: 16 }, // 6×14 top strip
  { id: LOT_ID.SOUTH,  r1: 14, c1:  3, r2: 19, c2: 16 }, // 6×14 bottom strip
  { id: LOT_ID.WEST,   r1:  3, c1:  0, r2: 16, c2:  5 }, // 14×6 left strip
  { id: LOT_ID.EAST,   r1:  3, c1: 14, r2: 16, c2: 19 }, // 14×6 right strip
];

// The set of lot IDs the player currently owns. Populated in initGame().
let ownedLotIds = new Set();

// Blue fill used for river / water tiles.
const WATER_COLOR = '#1e6db5';

// Set of "row,col" keys for every tile occupied by the river. Populated by
// generateRiver() and never mutated afterwards; bridges read it to validate placement.
let riverTiles = new Set();
// Euclidean tile radius covered by each staffed guard post.
const GUARD_RADIUS = 5;
// Divisor for converting observed ride tiles × surplus capacity into an intensity-observation delta.
const INTENSITY_OBSERVATION_DIVISOR = 1000;
const CELL_SIZE = 40;  // px
const CELL_GAP  = 1;   // px — must match the CSS gap on #grid
const CELL_STEP = CELL_SIZE + CELL_GAP;

const RIDE_COLORS = [
  '#f87171', // red
  '#34d399', // emerald
  '#60a5fa', // blue
  '#fbbf24', // amber
  '#a78bfa', // violet
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#f472b6', // pink
  '#a3e635', // lime
  '#e879f9', // fuchsia
  '#38bdf8', // sky
];

// ── Economy & Time Constants ───────────────────────────────────────────────
const STARTING_MONEY        = 1_000_000;
const STARTING_YEAR         = 2024;
const STARTING_WEEK_OF_YEAR = 27; // week 27 = first week of Q3

const WEATHER_EMOJIS = ['🥵', '☀️', '🌤️', '⛅', '🌦️', '⛈️', '🌧️', '🌫️', '🌨️', '🥶'];
const WEATHER_DEMAND_REDUCTION = Object.freeze({
  '⛈️': 0.50,
  '🌨️': 0.25,
  '🌧️': 0.10,
  '🥵': 0.10,
  '🥶': 0.50,
});
const WEATHER_WEAR_MULTIPLIER = 1.2;
const WEATHER_WET_EMOJIS = Object.freeze(['🌧️', '🌨️', '⛈️']);
const WEATHER_MERCHANDISE_MULTIPLIERS = Object.freeze({
  '☀️':  { sunscreen:   3 },
  '🌦️': { umbrella:    2 },
  '🌧️': { umbrella:    2 },
  '⛈️': { umbrella:    3 },
  '🌨️': { hoodie:      2 },
  '🥶': { hoodie:      3 },
  '🐰':  { plush_bunny: 4 },
  '🎄':  { snow_globe:  4 },
});
const HOLIDAY_FORECAST = Object.freeze({
  15: '🐰',  // second week of April
  51: '🎄',  // next-to-last week of year
});
function randomWeatherEmoji(weekInYear) {
  const offset = Math.round(2 * Math.abs(26 - weekInYear) / 26); //offset for time of year-appropriate weather
  return WEATHER_EMOJIS[Math.floor(Math.random() * 8) + offset];
}
function forecastForRound(r) {
  const weekInYear = ((r + 25) % 52) + 1;
  return HOLIDAY_FORECAST[weekInYear] ?? randomWeatherEmoji(weekInYear);
}

// ── Stage Constants ────────────────────────────────────────────────────────
// Stage 1 (login) is a future placeholder; game starts at setup for now.

// ── Game State ─────────────────────────────────────────────────────────────
let rides      = [];  // from rides.json (with _color added)
let facilities = [];  // from facilities.json
// Active marketing campaigns; each entry is a snapshot of draft state at launch time.
// { impressions, medium, hook, messageType, xAxis, yAxis, xRange, yRange,
//   weeksTotal, weeksRemaining, interest, focusMultiplier,
//   trackedBrackets, weeklyDeltas, cost, roundLaunched }
// interest (calcInterest × calcHookMax) is recomputed each round by Marketing.tickCampaigns().
// weeklyDeltas[week] is the total estimated additional visitors across all targeted
// brackets from that week's favor increase (summed scalar, not per-bracket).
let activeCampaigns      = [];  // running campaigns — see comment block above
// Campaigns moved here on completion so their weeklyDeltas survive for the summary screen.
let completedCampaigns   = [];

let gridCells = [];   // [row][col] → <div>
let gridState = [];   // [row][col] → instanceId string, or null

// Economy & time
let gameStage = STAGE.SETUP;
let money     = STARTING_MONEY;
let round     = 1;
let nextWeekForecast   = forecastForRound(2);
let futurecastForecast = forecastForRound(3);

// The canonical records of everything placed in the park.
// status: STATUS.ACTIVE | STATUS.UNDER_CONSTRUCTION
// ride entry:     { instanceId, rideId, name, color, row, col, footprint, status }
// facility entry: { instanceId, facilityId, name, color, row, col, footprint, status }
let installedRides      = [];
let installedFacilities = [];
let placedRideIds       = new Set(); // rideIds ever placed (persists through demolition)

// Maps "row,col" → facilityId for fast adjacency lookups.
const facilityTypeAtCell = {};

// ── Selection State ────────────────────────────────────────────────────────
let selected         = null;  // { item, category: 'ride'|'facility', cardEl }
let currentPlacement = null;  // { startRow, startCol, valid }

// ── Demolish Mode ──────────────────────────────────────────────────────────
let demolishMode = false;

function setDemolishMode(active) {
  demolishMode = active;
  document.getElementById('grid').classList.toggle('demolish-mode', active);
  if (!active) clearDemolishHighlight();
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  let demographics;
  [rides, facilities, Shopping.catalog, Shopping.merchandise, Shopping.suppliers, demographics, Concessions.menuItems] = await Promise.all([
    fetch('rides.json').then(r => r.json()),
    fetch('facilities.json').then(r => r.json()),
    fetch('shops.json').then(r => r.json()),
    fetch('merchandise.json').then(r => r.json()),
    fetch('suppliers.json').then(r => r.json()),
    fetch('demographics.json').then(r => r.json()),
    fetch('concessions.json').then(r => r.json()),
  ]);
  Object.assign(Population, demographics);

  rides.forEach((ride, i) => {
    ride._color = RIDE_COLORS[i % RIDE_COLORS.length];
  });

  Shopping.init();

  gridState = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

  // Grant the center lot and one random side lot at game start.
  const sideLotIds = [LOT_ID.NORTH, LOT_ID.SOUTH, LOT_ID.WEST, LOT_ID.EAST];
  const randomSide = sideLotIds[Math.floor(Math.random() * sideLotIds.length)];
  ownedLotIds = new Set([LOT_ID.CENTER, randomSide]);

  buildGrid();
  refreshLotOverlay();
  generateRiver();
  placeWaterTiles();
  scatterTrees();
  buildRideCatalog();
  buildFacilityList();
  Shopping.buildCatalog();
  Staff.init();
  Population.initDemographics();
  initHUD();
}

// ── Sidebar lists ──────────────────────────────────────────────────────────
function buildRideCatalog() {
  const list = document.getElementById('ride-list');
  rides.forEach(ride => {
    const card = createItemCard(ride, 'ride');
    card.dataset.rideId = ride.id;
    list.appendChild(card);
  });
}

function buildFacilityList() {
  const list = document.getElementById('facility-list');
  facilities
    .filter(f => !f.notBuildable &&
                 (Unlock.SECURITY || f.id !== FACILITY_ID.GUARD_STATION) &&
                 (Unlock.STAFFING || f.id !== FACILITY_ID.STAFF_LOUNGE))
    .forEach(facility => list.appendChild(createItemCard(facility, 'facility')));
}

// Randomly places trees on the grid at a 1-in-9 chance per cell.
// Trees are pre-existing obstacles the player must build around or demolish.
function scatterTrees() {
  const treeDef = facilities.find(f => f.id === FACILITY_ID.TREE);
  if (!treeDef) return;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (gridState[r][c] !== null) continue;
      if (Math.random() < 1 / 9) {
        _commitPlace(treeDef, CATEGORY.FACILITY, r, c, STATUS.ACTIVE);
      }
    }
  }
}

// Each round during play, every empty tile has a 1-in-2000 chance to naturally grow a tree.
function growTrees() {
  const treeDef = facilities.find(f => f.id === FACILITY_ID.TREE);
  if (!treeDef) return;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (gridState[r][c] === null && Math.random() < 1 / 2000) {
        _commitPlace(treeDef, CATEGORY.FACILITY, r, c, STATUS.ACTIVE);
      }
    }
  }
}

// Computes a meandering river path from a random column on row 0 to row 19.
// The river drifts left/right with equal probability each step, clamped to
// cols 3–16 so it always stays within the playable lot area.
function generateRiver() {
  riverTiles = new Set();
  let col = 4 + Math.floor(Math.random() * 12); // start anywhere in cols 4–15
  for (let row = 0; row < GRID_ROWS; row++) {
    riverTiles.add(`${row},${col}`);
    if (row < GRID_ROWS - 1) {
      const roll = Math.random();
      if      (roll < 0.3 && col > 3)  col--;
      else if (roll < 0.6 && col < 16) col++;
      // else flow straight down
    }
  }
}

// Paints every river tile onto the grid as a non-destructible water tile.
// Water tiles occupy gridState but are NOT stored in installedFacilities, so
// startDemolition finds no matching record and returns early (with a hint).
function placeWaterTiles() {
  for (const key of riverTiles) {
    const [r, c] = key.split(',').map(Number);
    gridState[r][c] = `water_${r}_${c}`;
    const cell = gridCells[r][c];
    cell.style.backgroundColor = WATER_COLOR;
    cell.classList.add('occupied');
    cell.title = 'River';
  }
}

// Returns true if tile (r, c) falls within at least one owned lot's rectangle.
function isTileOwned(r, c) {
  return LOTS.some(lot => ownedLotIds.has(lot.id) &&
    r >= lot.r1 && r <= lot.r2 && c >= lot.c1 && c <= lot.c2);
}

// Adds a lot to the owned set and refreshes the grid overlay.
// Call this whenever the player earns a new lot.
function unlockLot(id) {
  ownedLotIds.add(id);
  refreshLotOverlay();
}

// Stamps or removes the .out-of-bounds CSS class on every grid cell to match
// the current owned-lot set. Safe to call any time after buildGrid().
function refreshLotOverlay() {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      gridCells[r][c].classList.toggle('out-of-bounds', !isTileOwned(r, c));
    }
  }
}

function createItemCard(item, category) {
  const card = document.createElement('div');
  card.className = 'item-card';

  const color = item._color ?? item.color ?? '#888';

  let statsHtml;
  if (category === 'ride') {
    const sec = item.rideDuration;
    const dur = sec < 60 ? `${sec}s` : `${Math.round(sec / 6) / 10}min`;
    statsHtml = `
      <span>$${item.buildCost.toLocaleString()}</span>
      <span>${item.buildWeeks} weeks to build</span>
      <span>${dur} &middot; ${item.ridesPerHour}/hr</span>
      <span><span class="intensity-badge intensity-${item.intensity}">${item.intensity}</span></span>`;
  } else {
    const dur = item.buildWeeks === 0 ? 'Instant' : `${item.buildWeeks} wk`;
    statsHtml = `
      <span>$${item.buildCost.toLocaleString()}</span>
      <span>${dur}</span>
      ${item.limit != null    ? `<span>Limit: ${item.limit}</span>`            : ''}
      ${item.edgeOnly         ? `<span class="rule-note">Edge only</span>`     : ''}
      ${item.mustBeAdjacentTo ? `<span class="rule-note">Needs adjacency</span>` : ''}`;
  }

  card.innerHTML = `
    <div class="item-card-name">${item.name}</div>
    <div class="item-card-body">
      <div class="item-preview">${buildFootprintPreview(item.footprint, color)}</div>
      <div class="item-stats">${statsHtml}</div>
    </div>`;

  card.addEventListener('click', () => {
    if (selected?.cardEl === card) deselectItem();
    else selectItem(item, category, card);
  });

  return card;
}

function buildFootprintPreview(footprint, color) {
  const rows = footprint.length;
  const cols = footprint[0].length;
  const maxDim = Math.max(rows, cols);
  const size = maxDim <= 2 ? 18 : maxDim <= 4 ? 13 : 11;

  let html = `<div style="display:grid;grid-template-columns:repeat(${cols},${size}px);gap:1px;">`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const filled = footprint[r][c] === 1;
      html += `<div style="width:${size}px;height:${size}px;`
            + `background:${filled ? color : 'transparent'};`
            + `border:1px solid ${filled ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.06)'};`
            + `border-radius:1px;"></div>`;
    }
  }
  html += '</div>';
  return html;
}

// ── Selection ──────────────────────────────────────────────────────────────
function selectItem(item, category, cardEl) {
  if (selected) deselectItem();
  selected = { item, category, cardEl };
  cardEl.classList.add('selected');
  document.getElementById('grid').classList.add('has-selection');
}

function deselectItem() {
  if (!selected) return;
  selected.cardEl.classList.remove('selected');
  document.getElementById('grid').classList.remove('has-selection');
  clearHighlights();
  selected = null;
  currentPlacement = null;
}

// ── Placement validation ───────────────────────────────────────────────────
function canPlaceItem(item, category, startRow, startCol) {
  // Affordability: setup pays full cost; play pays the first weekly instalment.
  // Instant items (buildWeeks === 0) always pay in full regardless of stage.
  const firstPayment = (gameStage === STAGE.SETUP || item.buildWeeks === 0)
    ? item.buildCost
    : Math.ceil(item.buildCost / item.buildWeeks);
  if (firstPayment > money) return false;

  return category === CATEGORY.RIDE
    ? canPlaceRide(item, startRow, startCol)
    : canPlaceFacility(item, startRow, startCol);
}

function canPlaceFootprint(footprint, startRow, startCol) {
  for (let r = 0; r < footprint.length; r++) {
    for (let c = 0; c < footprint[r].length; c++) {
      if (footprint[r][c] !== 1) continue;
      const gr = startRow + r;
      const gc = startCol + c;
      if (gr < 0 || gr >= GRID_ROWS || gc < 0 || gc >= GRID_COLS) return false;
      if (!isTileOwned(gr, gc)) return false;
      if (gridState[gr][gc] !== null) return false;
    }
  }
  return true;
}

function canPlaceRide(ride, startRow, startCol) {
  return canPlaceFootprint(ride.footprint, startRow, startCol);
}

function canPlaceFacility(facility, startRow, startCol) {
  // Bridges go on water tiles, not empty land tiles — skip the normal footprint check.
  if (facility.onWaterOnly) {
    for (let r = 0; r < facility.footprint.length; r++) {
      for (let c = 0; c < facility.footprint[r].length; c++) {
        if (facility.footprint[r][c] !== 1) continue;
        const gr = startRow + r;
        const gc = startCol + c;
        if (gr < 0 || gr >= GRID_ROWS || gc < 0 || gc >= GRID_COLS) return false;
        if (!isTileOwned(gr, gc)) return false;
        if (!riverTiles.has(`${gr},${gc}`)) return false;
        if (facilityTypeAtCell[`${gr},${gc}`] === FACILITY_ID.BRIDGE) return false;
      }
    }
    return true;
  }

  if (!canPlaceFootprint(facility.footprint, startRow, startCol)) return false;

  if (facility.limit != null) {
    const placed = installedFacilities.filter(f => f.facilityId === facility.id).length;
    if (placed >= facility.limit) return false;
  }

  if (facility.edgeOnly) {
    let onEdge = false;
    outer: for (let r = 0; r < facility.footprint.length; r++) {
      for (let c = 0; c < facility.footprint[r].length; c++) {
        if (facility.footprint[r][c] !== 1) continue;
        const gr = startRow + r;
        const gc = startCol + c;
        if (gr === 0 || gr === GRID_ROWS - 1 || gc === 0 || gc === GRID_COLS - 1) {
          onEdge = true;
          break outer;
        }
      }
    }
    if (!onEdge) return false;
  }

  if (facility.mustBeAdjacentTo?.length) {
    let found = false;
    outer: for (let r = 0; r < facility.footprint.length; r++) {
      for (let c = 0; c < facility.footprint[r].length; c++) {
        if (facility.footprint[r][c] !== 1) continue;
        const gr = startRow + r;
        const gc = startCol + c;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const neighborType = facilityTypeAtCell[`${gr+dr},${gc+dc}`];
          if (facility.mustBeAdjacentTo.includes(neighborType)) {
            found = true;
            break outer;
          }
        }
      }
    }
    if (!found) return false;
  }

  return true;
}

// Returns a 0–1 multiplier reducing a ride's enjoyment contribution after 5 years.
// Decays 2% per year past the threshold: year 5 = 0%, year 10 = −10%, year 55 = −100%.
function rideAgeFactor(record) {
  if (record.installedRound == null) return 1;
  const ageYears = (round - record.installedRound) / 52;
  if (ageYears < 5) return 1;
  return Math.max(0, 1 - (ageYears - 5) * 0.02);
}

// Returns a ≥1 multiplier increasing per-rider wear after 5 years.
// Grows 2% per year past the threshold: year 10 = ×1.10, year 15 = ×1.20, etc.
function rideWearFactor(record) {
  if (record.installedRound == null) return 1;
  const ageYears = (round - record.installedRound) / 52;
  if (ageYears < 5) return 1;
  return 1 + (ageYears - 5) * 0.02;
}

function isRideConnected(record) {
  for (let r = 0; r < record.footprint.length; r++) {
    for (let c = 0; c < record.footprint[r].length; c++) {
      if (record.footprint[r][c] !== 1) continue;
      const gr = record.row + r;
      const gc = record.col + c;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if (facilityTypeAtCell[`${gr+dr},${gc+dc}`] === FACILITY_ID.PATH) return true;
      }
    }
  }
  return false;
}

// ── Placing items ──────────────────────────────────────────────────────────
function placeItem(item, category, startRow, startCol) {
  const instant = gameStage === STAGE.SETUP || item.buildWeeks === 0;
  // Incidents can raise build costs (e.g. steel tariffs). Only applies in play mode
  // since Incidents.tick() never runs during setup, keeping the multiplier at 1.
  const costMult = Incidents.rideBuildCostMultiplier;

  if (instant) {
    money -= Math.round(item.buildCost * costMult);
    _commitPlace(item, category, startRow, startCol, STATUS.ACTIVE);
  } else {
    const weeklyPayment = Math.ceil(item.buildCost * costMult / item.buildWeeks);
    money -= weeklyPayment;
    const record = _commitPlace(item, category, startRow, startCol, STATUS.UNDER_CONSTRUCTION);
    record.weeksTotal     = item.buildWeeks;
    record.weeksCompleted = 1;
    record.weeklyPayment  = weeklyPayment;
  }

  updateHUD();
  refreshRidesPanel();

  if (category === CATEGORY.RIDE) {
    placedRideIds.add(item.id);
    document.querySelector(`#ride-list [data-ride-id="${item.id}"]`)?.remove();
    deselectItem();
  }

  if (category === CATEGORY.FACILITY && item.limit != null) {
    const placed = installedFacilities.filter(f => f.facilityId === item.id).length;
    if (placed >= item.limit) deselectItem();
  }
}

// Monotonically increasing counter to guarantee unique instanceIds even when
// multiple placements happen within the same millisecond (e.g. scatterTrees).
let _placeSeq = 0;

// Records the placement in the installed array and paints the grid cells.
// Returns the pushed record so callers can grab the instanceId.
function _commitPlace(item, category, startRow, startCol, status) {
  const instanceId = `${category}_${item.id}_${Date.now()}_${++_placeSeq}`;
  const color      = item._color ?? item.color ?? '#888';

  const record = {
    instanceId,
    row: startRow, col: startCol,
    footprint: item.footprint,
    color, status,
    buildCost: item.buildCost ?? 0,
  };

  if (category === CATEGORY.RIDE) {
    record.rideId        = item.id;
    record.name          = item.name;
    record.wear          = 0;
    record.weeksToRepair = 0;
    if (status === STATUS.ACTIVE) record.installedRound = round;
    installedRides.push(record);
  } else if (category === CATEGORY.SHOP) {
    record.shopId = item.id;
    record.name   = item.name;
    Shopping.installed.push(record);
  } else {
    record.facilityId = item.id;
    record.name       = item.name;
    installedFacilities.push(record);
    for (let r = 0; r < item.footprint.length; r++) {
      for (let c = 0; c < item.footprint[r].length; c++) {
        if (item.footprint[r][c] === 1)
          facilityTypeAtCell[`${startRow + r},${startCol + c}`] = item.id;
      }
    }
  }

  paintCells(item.footprint, startRow, startCol, color, instanceId, item.name, status);
  return record;
}

// ── Construction queue ─────────────────────────────────────────────────────
function processConstruction() {
  let paid = 0;
  for (const record of [...installedRides, ...installedFacilities, ...Shopping.installed]) {
    if (record.status !== STATUS.UNDER_CONSTRUCTION) continue;
    if (money >= record.weeklyPayment) {
      money -= record.weeklyPayment;
      paid += record.weeklyPayment;
      record.weeksCompleted++;
      if (record.weeksCompleted >= record.weeksTotal) completeConstruction(record);
    }
  }
  return paid;
}

function completeConstruction(record) {
  record.status = STATUS.ACTIVE;
  if (record.rideId !== undefined) record.installedRound = round;
  for (let r = 0; r < record.footprint.length; r++) {
    for (let c = 0; c < record.footprint[r].length; c++) {
      if (record.footprint[r][c] === 1)
        gridCells[record.row + r][record.col + c].classList.remove('under-construction');
    }
  }
}

function pauseRideConstruction(instanceId) {
  const record = installedRides.find(r => r.instanceId === instanceId);
  if (record?.status === STATUS.UNDER_CONSTRUCTION)
    record.status = STATUS.PAUSED_CONSTRUCTION;
}

function resumeRideConstruction(instanceId) {
  const record = installedRides.find(r => r.instanceId === instanceId);
  if (record?.status === STATUS.PAUSED_CONSTRUCTION)
    record.status = STATUS.UNDER_CONSTRUCTION;
}

function closeRide(instanceId) {
  const record = installedRides.find(r => r.instanceId === instanceId);
  if (record?.status === STATUS.ACTIVE) record.status = STATUS.CLOSED;
}

function reopenRide(instanceId) {
  const record = installedRides.find(r => r.instanceId === instanceId);
  if (record?.status === STATUS.CLOSED) record.status = STATUS.ACTIVE;
}

// ── Demolish actions ───────────────────────────────────────────────────────
function startDemolition(row, col) {
  const instanceId = gridState[row][col];
  if (!instanceId) return;

  const record =
    installedRides.find(r => r.instanceId === instanceId) ||
    installedFacilities.find(f => f.instanceId === instanceId) ||
    Shopping.installed.find(s => s.instanceId === instanceId);

  if (!record) {
    if (riverTiles.has(`${row},${col}`)) {
      Notifications.push({ label: 'River', message: 'River tiles cannot be demolished. Build a Bridge over the water instead.' });
    }
    return;
  }

  if (!isTileOwned(row, col)) {
    Notifications.push({ label: 'Demolish', message: 'This tile is outside your park boundary.' });
    return;
  }

  if (record.facilityId === FACILITY_ID.PARK_ENTRANCE) {
    Notifications.push({ label: 'Demolish', message: 'The Park Entrance cannot be demolished.' });
    return;
  }

  if (record.status === STATUS.DEMOLISHING) return;

  // In setup stage demolition is instant and refunds the full build cost.
  // Trees are pre-placed obstacles, not player purchases, so no refund.
  if (gameStage === STAGE.SETUP) {
    if (record.facilityId !== FACILITY_ID.TREE) money += record.buildCost ?? 0;
    completeDemolition(record);
    return;
  }

  // Demolition costs 10% of the original build cost, charged upfront.
  const demolishCost = Math.ceil((record.buildCost ?? 0) / 10);
  if (demolishCost > 0 && money < demolishCost) {
    Notifications.push({ label: 'Demolish', message: `Not enough funds. Demolishing ${record.name} costs $${demolishCost.toLocaleString()}.` });
    return;
  }
  money -= demolishCost;

  // Paths, trees, and bridges are removed immediately; everything else takes at least 1 round.
  const isInstant = record.facilityId === FACILITY_ID.PATH ||
                    record.facilityId === FACILITY_ID.TREE ||
                    record.facilityId === FACILITY_ID.BRIDGE;
  const demolishWeeks = isInstant ? 0 : Math.max(1, Math.ceil((record.weeksTotal || 0) / 2));
  if (demolishWeeks === 0) {
    completeDemolition(record);
    return;
  }

  record.status                = STATUS.DEMOLISHING;
  record.demolishWeeksTotal    = demolishWeeks;
  record.demolishWeeksCompleted = 0;

  for (let r = 0; r < record.footprint.length; r++) {
    for (let c = 0; c < record.footprint[r].length; c++) {
      if (record.footprint[r][c] === 1) {
        const cell = gridCells[record.row + r][record.col + c];
        cell.classList.remove('under-construction');
        cell.classList.add('demolishing');
      }
    }
  }

  updateHUD();
  refreshRidesPanel();
}

function completeDemolition(record) {
  const name = record.name;

  if (record.rideId !== undefined) {
    const idx = installedRides.indexOf(record);
    if (idx !== -1) installedRides.splice(idx, 1);
    // Re-add to build catalog if no other instance of this ride is still placed.
    if (!installedRides.some(r => r.rideId === record.rideId)) {
      const rideDef = rides.find(r => r.id === record.rideId);
      if (rideDef) {
        const card = createItemCard(rideDef, 'ride');
        card.dataset.rideId = rideDef.id;
        document.getElementById('ride-list').appendChild(card);
      }
    }
  } else if (record.shopId !== undefined) {
    const idx = Shopping.installed.indexOf(record);
    if (idx !== -1) Shopping.installed.splice(idx, 1);
  } else {
    const idx = installedFacilities.indexOf(record);
    if (idx !== -1) installedFacilities.splice(idx, 1);
  }

  for (let r = 0; r < record.footprint.length; r++) {
    for (let c = 0; c < record.footprint[r].length; c++) {
      if (record.footprint[r][c] === 1) {
        const gr = record.row + r;
        const gc = record.col + c;
        gridState[gr][gc] = null;
        const cell = gridCells[gr][gc];
        cell.style.backgroundColor = '';
        cell.classList.remove('occupied', 'under-construction', 'demolishing');
        cell.title = '';
        cell.classList.toggle('out-of-bounds', !isTileOwned(gr, gc));
      }
    }
  }

  if (record.facilityId) {
    for (let r = 0; r < record.footprint.length; r++) {
      for (let c = 0; c < record.footprint[r].length; c++) {
        if (record.footprint[r][c] === 1)
          delete facilityTypeAtCell[`${record.row + r},${record.col + c}`];
      }
    }
    // Demolished path or bridge tiles break every stored A* route.
    if (record.facilityId === FACILITY_ID.PATH || record.facilityId === FACILITY_ID.BRIDGE) Animations.paths = [];
  }

  // A demolished bridge exposes the water tile that was underneath it.
  if (record.facilityId === FACILITY_ID.BRIDGE) {
    for (let r = 0; r < record.footprint.length; r++) {
      for (let c = 0; c < record.footprint[r].length; c++) {
        if (record.footprint[r][c] !== 1) continue;
        const gr = record.row + r;
        const gc = record.col + c;
        gridState[gr][gc] = `water_${gr}_${gc}`;
        const cell = gridCells[gr][gc];
        cell.style.backgroundColor = WATER_COLOR;
        cell.classList.add('occupied');
        cell.title = 'River';
        cell.classList.toggle('out-of-bounds', !isTileOwned(gr, gc));
      }
    }
  }

  updateHUD();
  refreshRidesPanel();
}

function processDemolition() {
  const toComplete = [];
  for (const record of [...installedRides, ...installedFacilities, ...Shopping.installed]) {
    if (record.status !== STATUS.DEMOLISHING) continue;
    record.demolishWeeksCompleted++;
    if (record.demolishWeeksCompleted >= record.demolishWeeksTotal) toComplete.push(record);
  }
  toComplete.forEach(completeDemolition);
}

// ── Keyboard ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') deselectItem();
});

// ── Start ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
