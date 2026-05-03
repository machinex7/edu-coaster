// ── Constants ──────────────────────────────────────────────────────────────
const GRID_COLS = 20;
const GRID_ROWS = 20;
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

const WEATHER_EMOJIS = ['☀️', '🌤️', '⛅', '🌦️', '🌧️', '⛈️', '🌨️', '🌫️', '🥵'];
const WEATHER_DEMAND_REDUCTION = Object.freeze({
  '⛈️': 0.25,
  '🌨️': 0.10,
  '🌧️': 0.10,
});
const WEATHER_WEAR_MULTIPLIER = 1.2;
const WEATHER_WET_EMOJIS = Object.freeze(['🌧️', '🌨️', '⛈️']);
const WEATHER_MERCHANDISE_MULTIPLIERS = Object.freeze({
  '☀️':  { sunscreen:   2 },
  '🌦️': { umbrella:    2 },
  '🌧️': { umbrella:    2 },
  '⛈️': { umbrella:    2 },
  '🌨️': { hoodie:      2 },
  '🐰':  { plush_bunny: 2 },
  '🎄':  { snow_globe:  2 },
});
const HOLIDAY_FORECAST = Object.freeze({
  15: '🐰',  // second week of April
  51: '🎄',  // next-to-last week of year
});
function randomWeatherEmoji() {
  return WEATHER_EMOJIS[Math.floor(Math.random() * WEATHER_EMOJIS.length)];
}
function forecastForRound(r) {
  const weekInYear = ((r + 25) % 52) + 1;
  return HOLIDAY_FORECAST[weekInYear] ?? randomWeatherEmoji();
}

// ── Stage Constants ────────────────────────────────────────────────────────
// Stage 1 (login) is a future placeholder; game starts at setup for now.

// ── Game State ─────────────────────────────────────────────────────────────
let rides      = [];  // from rides.json (with _color added)
let facilities = [];  // from facilities.json
let merchandise          = [];  // from merchandise.json
let merchandiseInventory = [];  // parallel to merchandise: { count, price }
let suppliers            = [];  // from suppliers.json
let selectedSupplierId   = null;
let unlockedSupplierIds  = new Set();
let orders               = [];  // { itemIndex, itemName, count, weeksRemaining }
let totalOrderSpend      = 0;  // cumulative dollars spent placing merchandise orders
// Active marketing campaigns; each entry is a snapshot of draft state at launch time.
// { impressions, medium, hook, messageType, xAxis, yAxis, xRange, yRange,
//   weeksTotal, weeksRemaining, interest, focusMultiplier,
//   trackedBrackets, weeklyDeltas, cost, roundLaunched }
// interest (calcInterest × calcHookMax) is recomputed each round by Marketing.tickCampaigns().
// weeklyDeltas[week] is a parallel array to trackedBrackets: estimated additional
// visitors per bracket from that week's favor increase.
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
  [rides, facilities, Shopping.catalog, merchandise, suppliers, demographics] = await Promise.all([
    fetch('rides.json').then(r => r.json()),
    fetch('facilities.json').then(r => r.json()),
    fetch('shops.json').then(r => r.json()),
    fetch('merchandise.json').then(r => r.json()),
    fetch('suppliers.json').then(r => r.json()),
    fetch('demographics.json').then(r => r.json()),
  ]);
  Object.assign(Population, demographics);

  rides.forEach((ride, i) => {
    ride._color = RIDE_COLORS[i % RIDE_COLORS.length];
  });

  merchandiseInventory = merchandise.map(item => ({ count: 500, price: item.basePrice }));

  unlockedSupplierIds = new Set([suppliers[0].id]);
  selectedSupplierId  = suppliers[0].id;
  totalOrderSpend     = 0;

  gridState = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

  buildGrid();
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
    .filter(f => (Unlock.SECURITY || f.id !== FACILITY_ID.GUARD_STATION) &&
                 (Unlock.STAFFING || f.id !== FACILITY_ID.STAFF_LOUNGE))
    .forEach(facility => list.appendChild(createItemCard(facility, 'facility')));
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
      if (gridState[gr][gc] !== null) return false;
    }
  }
  return true;
}

function canPlaceRide(ride, startRow, startCol) {
  return canPlaceFootprint(ride.footprint, startRow, startCol);
}

function canPlaceFacility(facility, startRow, startCol) {
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

  if (instant) {
    money -= item.buildCost;
    _commitPlace(item, category, startRow, startCol, STATUS.ACTIVE);
  } else {
    const weeklyPayment = Math.ceil(item.buildCost / item.buildWeeks);
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

// Records the placement in the installed array and paints the grid cells.
// Returns the pushed record so callers can grab the instanceId.
function _commitPlace(item, category, startRow, startCol, status) {
  const instanceId = `${category}_${item.id}_${Date.now()}`;
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

  if (!record) return;

  if (record.facilityId === FACILITY_ID.PARK_ENTRANCE) {
    Notifications.push({ label: 'Demolish', message: 'The Park Entrance cannot be demolished.' });
    return;
  }

  if (record.status === STATUS.DEMOLISHING) return;

  // In setup stage demolition is instant and refunds the full build cost.
  if (gameStage === STAGE.SETUP) {
    money += record.buildCost ?? 0;
    completeDemolition(record);
    return;
  }

  // Paths are removed immediately; everything else takes at least 1 round.
  const isPath = record.facilityId === FACILITY_ID.PATH;
  const demolishWeeks = isPath ? 0 : Math.max(1, Math.ceil((record.weeksTotal || 0) / 2));
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

  Notifications.push({
    label:   'Demolish',
    message: `${record.name} demolition started — ${demolishWeeks} week${demolishWeeks !== 1 ? 's' : ''} to go.`,
  });

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
  }

  if (record.facilityId !== FACILITY_ID.PATH) {
    Notifications.push({ label: 'Demolish', message: `${name} has been demolished.` });
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
