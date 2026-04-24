// ── Constants ──────────────────────────────────────────────────────────────
const GRID_COLS = 20;
const GRID_ROWS = 20;
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

let gridCells = [];   // [row][col] → <div>
let gridState = [];   // [row][col] → instanceId string, or null

// Economy & time
let gameStage = STAGE.SETUP;
let money     = STARTING_MONEY;
let round     = 1;

// The canonical records of everything placed in the park.
// status: STATUS.ACTIVE | STATUS.UNDER_CONSTRUCTION
// ride entry:     { instanceId, rideId, name, color, row, col, footprint, status }
// facility entry: { instanceId, facilityId, name, color, row, col, footprint, status }
let installedRides      = [];
let installedFacilities = [];

// Maps "row,col" → facilityId for fast adjacency lookups.
const facilityTypeAtCell = {};

// ── Selection State ────────────────────────────────────────────────────────
let selected         = null;  // { item, category: 'ride'|'facility', cardEl }
let currentPlacement = null;  // { startRow, startCol, valid }

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  [rides, facilities, Shopping.catalog, merchandise, suppliers] = await Promise.all([
    fetch('rides.json').then(r => r.json()),
    fetch('facilities.json').then(r => r.json()),
    fetch('shops.json').then(r => r.json()),
    fetch('merchandise.json').then(r => r.json()),
    fetch('suppliers.json').then(r => r.json()),
  ]);

  rides.forEach((ride, i) => {
    ride._color = RIDE_COLORS[i % RIDE_COLORS.length];
  });

  merchandiseInventory = merchandise.map(item => ({ count: 100, price: item.basePrice }));

  unlockedSupplierIds = new Set([suppliers[0].id]);
  selectedSupplierId  = suppliers[0].id;

  gridState = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

  buildGrid();
  buildRideCatalog();
  buildFacilityList();
  Shopping.buildCatalog();
  Staff.init();
  Population.initDemographics();
  initSubTabs();
  initHUD();
}

// ── Sidebar lists ──────────────────────────────────────────────────────────
function buildRideCatalog() {
  const list = document.getElementById('ride-list');
  rides.forEach(ride => list.appendChild(createItemCard(ride, 'ride')));
}

function buildFacilityList() {
  const list = document.getElementById('facility-list');
  facilities.forEach(facility => list.appendChild(createItemCard(facility, 'facility')));
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
  };

  if (category === CATEGORY.RIDE) {
    record.rideId        = item.id;
    record.name          = item.name;
    record.wear          = 0;
    record.weeksToRepair = 0;
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
  console.log(`[${status}] "${item.name}" @ (${startRow}, ${startCol})`);
  return record;
}

// ── Construction queue ─────────────────────────────────────────────────────
// Advance all pending orders by one week. Returns an array of { itemName, count }
// for every order that arrived this round so callers can notify the player.
function tickOrders() {
  const arrived = [];
  orders = orders.filter(order => {
    order.weeksRemaining--;
    if (order.weeksRemaining <= 0) {
      merchandiseInventory[order.itemIndex].count += order.count;
      arrived.push({ itemName: order.itemName, count: order.count });
      return false;
    }
    return true;
  });
  return arrived;
}

function processConstruction() {
  for (const record of [...installedRides, ...installedFacilities, ...Shopping.installed]) {
    if (record.status !== STATUS.UNDER_CONSTRUCTION) continue;
    money -= record.weeklyPayment;
    record.weeksCompleted++;
    if (record.weeksCompleted >= record.weeksTotal) completeConstruction(record);
  }
}

function completeConstruction(record) {
  record.status = STATUS.ACTIVE;
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

// ── Keyboard ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') deselectItem();
});

// ── Start ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
