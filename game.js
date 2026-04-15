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
const STARTING_MONEY        = 2_000_000;
const STARTING_YEAR         = 2024;
const STARTING_WEEK_OF_YEAR = 27; // week 27 = first week of Q3

// ── Stage Constants ────────────────────────────────────────────────────────
// Stage 1 (login) is a future placeholder; game starts at setup for now.
const STAGE_SETUP = 'setup';
const STAGE_PLAY  = 'play';

// ── Game State ─────────────────────────────────────────────────────────────
let rides      = [];  // from rides.json (with _color added)
let facilities = [];  // from facilities.json

let gridCells = [];   // [row][col] → <div>
let gridState = [];   // [row][col] → instanceId string, or null

// Economy & time
let gameStage = STAGE_SETUP;
let money     = STARTING_MONEY;
let round     = 1;

// The canonical records of everything placed in the park.
// status: 'active' | 'under_construction'
// ride entry:     { instanceId, rideId, name, color, row, col, footprint, status }
// facility entry: { instanceId, facilityId, name, color, row, col, footprint, status }
let installedRides      = [];
let installedFacilities = [];

// Items currently being built (play stage only).
// Each entry: { instanceId, category, row, col, footprint,
//               weeksTotal, weeksCompleted, weeklyPayment }
let underConstruction = [];

// Maps "row,col" → facilityId for fast adjacency lookups.
const facilityTypeAtCell = {};

// ── Selection State ────────────────────────────────────────────────────────
let selected         = null;  // { item, category: 'ride'|'facility', cardEl }
let currentPlacement = null;  // { startRow, startCol, valid }

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  [rides, facilities] = await Promise.all([
    fetch('rides.json').then(r => r.json()),
    fetch('facilities.json').then(r => r.json()),
  ]);

  rides.forEach((ride, i) => {
    ride._color = RIDE_COLORS[i % RIDE_COLORS.length];
  });

  gridState = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

  buildGrid();
  buildRideList();
  buildFacilityList();
  initSubTabs();
  initHUD();
}

// ── Grid ───────────────────────────────────────────────────────────────────
function buildGrid() {
  const grid = document.getElementById('grid');
  grid.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${CELL_SIZE}px)`;
  grid.style.gridTemplateRows    = `repeat(${GRID_ROWS}, ${CELL_SIZE}px)`;

  for (let r = 0; r < GRID_ROWS; r++) {
    gridCells[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      grid.appendChild(cell);
      gridCells[r][c] = cell;
    }
  }

  grid.addEventListener('click',      onGridClick);
  grid.addEventListener('mousemove',  onGridMouseMove);
  grid.addEventListener('mouseleave', onGridMouseLeave);
  grid.addEventListener('touchstart', onGridTouchStart, { passive: false });
  grid.addEventListener('touchmove',  onGridTouchMove,  { passive: false });
  grid.addEventListener('touchend',   onGridTouchEnd);
}

// ── Sidebar lists ──────────────────────────────────────────────────────────
function buildRideList() {
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
      ${item.limit != null      ? `<span>Limit: ${item.limit}</span>`        : ''}
      ${item.edgeOnly           ? `<span class="rule-note">Edge only</span>` : ''}
      ${item.mustBeAdjacentTo   ? `<span class="rule-note">Needs adjacency</span>` : ''}`;
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

// ── Shared position → placement helper ────────────────────────────────────
function updatePlacementFromPoint(clientX, clientY) {
  if (!selected) return;

  const grid = document.getElementById('grid');
  const rect = grid.getBoundingClientRect();
  const col = Math.floor((clientX - rect.left) / CELL_STEP);
  const row = Math.floor((clientY - rect.top)  / CELL_STEP);

  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) {
    clearHighlights();
    currentPlacement = null;
    return;
  }

  const fp = selected.item.footprint;
  const startRow = row - Math.floor(fp.length    / 2);
  const startCol = col - Math.floor(fp[0].length / 2);

  if (currentPlacement?.startRow === startRow &&
      currentPlacement?.startCol === startCol) return;

  highlightPlacement(selected.item, selected.category, startRow, startCol);
}

// ── Grid event handlers ────────────────────────────────────────────────────
function onGridClick(e) {
  if (!selected || !currentPlacement?.valid) return;
  placeItem(selected.item, selected.category,
            currentPlacement.startRow, currentPlacement.startCol);
}

function onGridMouseMove(e) {
  if (!selected) return;
  updatePlacementFromPoint(e.clientX, e.clientY);
}

function onGridMouseLeave() {
  if (!selected) return;
  clearHighlights();
  currentPlacement = null;
}

function onGridTouchStart(e) {
  if (!selected) return;
  e.preventDefault();
  const t = e.touches[0];
  updatePlacementFromPoint(t.clientX, t.clientY);
}

function onGridTouchMove(e) {
  if (!selected) return;
  e.preventDefault();
  const t = e.touches[0];
  updatePlacementFromPoint(t.clientX, t.clientY);
}

function onGridTouchEnd(e) {
  if (!selected) return;
  const t = e.changedTouches[0];
  updatePlacementFromPoint(t.clientX, t.clientY);
  if (currentPlacement?.valid) {
    placeItem(selected.item, selected.category,
              currentPlacement.startRow, currentPlacement.startCol);
  }
}

// ── Placement validation ───────────────────────────────────────────────────
function highlightPlacement(item, category, startRow, startCol) {
  clearHighlights();
  const fp = item.footprint;
  const valid = canPlaceItem(item, category, startRow, startCol);

  for (let r = 0; r < fp.length; r++) {
    for (let c = 0; c < fp[r].length; c++) {
      if (fp[r][c] !== 1) continue;
      const gr = startRow + r;
      const gc = startCol + c;
      if (gr >= 0 && gr < GRID_ROWS && gc >= 0 && gc < GRID_COLS) {
        gridCells[gr][gc].classList.add(valid ? 'highlight-valid' : 'highlight-invalid');
      }
    }
  }

  currentPlacement = { startRow, startCol, valid };
}

function clearHighlights() {
  document.querySelectorAll('.highlight-valid, .highlight-invalid').forEach(el =>
    el.classList.remove('highlight-valid', 'highlight-invalid'));
}

function canPlaceItem(item, category, startRow, startCol) {
  // Affordability: setup pays full cost; play pays the first weekly instalment.
  // Instant items (buildWeeks === 0) always pay in full regardless of stage.
  const firstPayment = (gameStage === STAGE_SETUP || item.buildWeeks === 0)
    ? item.buildCost
    : Math.ceil(item.buildCost / item.buildWeeks);
  if (firstPayment > money) return false;

  return category === 'ride'
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

// ── Placing items ──────────────────────────────────────────────────────────
function placeItem(item, category, startRow, startCol) {
  const instant = gameStage === STAGE_SETUP || item.buildWeeks === 0;

  if (instant) {
    // Pay in full; item is immediately active.
    money -= item.buildCost;
    _commitPlace(item, category, startRow, startCol, 'active');
  } else {
    // Pay the first week's instalment; item enters the construction queue.
    const weeklyPayment = Math.ceil(item.buildCost / item.buildWeeks);
    money -= weeklyPayment;
    const record = _commitPlace(item, category, startRow, startCol, 'under_construction');
    underConstruction.push({
      instanceId:     record.instanceId,
      category,
      row:            startRow,
      col:            startCol,
      footprint:      item.footprint,
      weeksTotal:     item.buildWeeks,
      weeksCompleted: 1,
      weeklyPayment,
    });
  }

  updateHUD();

  // Auto-deselect if a limited facility just hit its cap.
  if (category === 'facility' && item.limit != null) {
    const placed = installedFacilities.filter(f => f.facilityId === item.id).length;
    if (placed >= item.limit) deselectItem();
  }
}

// Shared commit: records the placement and paints the cells.
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

  if (category === 'ride') {
    record.rideId = item.id;
    record.name   = item.name;
    installedRides.push(record);
  } else {
    record.facilityId = item.id;
    record.name       = item.name;
    installedFacilities.push(record);
    // Register cells for adjacency lookups.
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

// Update gridState and colour DOM cells. Adds .under-construction when needed.
function paintCells(footprint, startRow, startCol, color, instanceId, label, status = 'active') {
  for (let r = 0; r < footprint.length; r++) {
    for (let c = 0; c < footprint[r].length; c++) {
      if (footprint[r][c] !== 1) continue;
      const gr = startRow + r;
      const gc = startCol + c;
      gridState[gr][gc] = instanceId;
      const cell = gridCells[gr][gc];
      cell.style.backgroundColor = color;
      cell.classList.add('occupied');
      cell.title = label;
      cell.classList.toggle('under-construction', status === 'under_construction');
    }
  }
}

// ── Construction queue (play stage) ───────────────────────────────────────
function processConstruction() {
  const finished = [];

  for (const entry of underConstruction) {
    money -= entry.weeklyPayment;
    entry.weeksCompleted++;

    if (entry.weeksCompleted >= entry.weeksTotal) {
      completeConstruction(entry);
      finished.push(entry);
    }
  }

  for (const entry of finished) {
    underConstruction.splice(underConstruction.indexOf(entry), 1);
  }
}

function completeConstruction(entry) {
  // Update the status on the installed record.
  const records = entry.category === 'ride' ? installedRides : installedFacilities;
  const record  = records.find(r => r.instanceId === entry.instanceId);
  if (record) record.status = 'active';

  // Remove the construction-stripe overlay from every cell.
  for (let r = 0; r < entry.footprint.length; r++) {
    for (let c = 0; c < entry.footprint[r].length; c++) {
      if (entry.footprint[r][c] === 1)
        gridCells[entry.row + r][entry.col + c].classList.remove('under-construction');
    }
  }

  console.log(`Construction complete: "${record?.name}"`);
}

// ── HUD & stage management ─────────────────────────────────────────────────
function initHUD() {
  updateHUD();
  document.getElementById('open-park-btn').addEventListener('click', openPark);
  document.getElementById('next-round-btn').addEventListener('click', advanceRound);
}

function openPark() {
  gameStage = STAGE_PLAY;
  document.getElementById('open-park-btn').classList.add('hidden');
  document.getElementById('next-round-btn').classList.remove('hidden');
  updateHUD();
  console.log('Park is now open — simulation started.');
}

function advanceRound() {
  round++;
  processConstruction();
  updateHUD();
}

function getDateLabel() {
  const weekOfYear    = STARTING_WEEK_OF_YEAR + round - 1;
  const yearsElapsed  = Math.floor((weekOfYear - 1) / 52);
  const weekInYear    = ((weekOfYear - 1) % 52) + 1;
  const quarter       = Math.ceil(weekInYear / 13);
  const weekInQuarter = weekInYear - (quarter - 1) * 13;
  return `Week ${weekInQuarter}, Q${quarter}, ${STARTING_YEAR + yearsElapsed}`;
}

function updateHUD() {
  document.getElementById('money-display').textContent = `$${money.toLocaleString()}`;
  document.getElementById('date-display').textContent  = getDateLabel();
  const badge = document.getElementById('stage-badge');
  badge.textContent = gameStage === STAGE_SETUP ? 'Setup' : 'Open';
  badge.className   = `stage-badge ${gameStage}`;
}

// ── Sidebar sub-tabs ───────────────────────────────────────────────────────
function initSubTabs() {
  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-panel`).classList.remove('hidden');
      deselectItem();
    });
  });
}

// ── Keyboard ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') deselectItem();
});

// ── Start ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
