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

// ── Game State ─────────────────────────────────────────────────────────────
let rides      = [];  // from rides.json (with _color added)
let facilities = [];  // from facilities.json

let gridCells = [];   // [row][col] → <div>
let gridState = [];   // [row][col] → instanceId string, or null

// Economy & time
let money = STARTING_MONEY;
let round = 1; // increments on each Next Round press

// The canonical records of everything built in the park.
// Each ride entry:     { instanceId, rideId, name, color, row, col, footprint }
// Each facility entry: { instanceId, facilityId, name, color, row, col, footprint }
let installedRides      = [];
let installedFacilities = [];

// Maps "row,col" → facilityId for fast adjacency lookups (e.g. path placement).
const facilityTypeAtCell = {};

// ── Selection State ────────────────────────────────────────────────────────
// set while a card is selected; cleared on Escape, tab-switch, or re-click
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
  // Touch: preview as the finger moves, place on lift
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
      ${item.limit != null ? `<span>Limit: ${item.limit}</span>` : ''}
      ${item.edgeOnly         ? `<span class="rule-note">Edge only</span>` : ''}
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

// Renders a miniature footprint grid for a card.
function buildFootprintPreview(footprint, color) {
  const rows = footprint.length;
  const cols = footprint[0].length;
  const maxDim = Math.max(rows, cols);
  // Scale cell size so tiny footprints aren't invisible
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
  return category === 'ride'
    ? canPlaceRide(item, startRow, startCol)
    : canPlaceFacility(item, startRow, startCol);
}

// Every occupied cell must be in-bounds and unoccupied.
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

  // Enforce per-type limit
  if (facility.limit != null) {
    const placed = installedFacilities.filter(f => f.facilityId === facility.id).length;
    if (placed >= facility.limit) return false;
  }

  // Park Entrance: at least one occupied cell must touch the grid boundary
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

  // Path: at least one occupied cell must be orthogonally adjacent to a
  // facility of an allowed type (e.g. another path or the park entrance)
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
  if (category === 'ride') {
    placeRide(item, startRow, startCol);
  } else {
    placeFacility(item, startRow, startCol);
    // Auto-deselect once a limited item hits its cap
    if (item.limit != null) {
      const placed = installedFacilities.filter(f => f.facilityId === item.id).length;
      if (placed >= item.limit) deselectItem();
    }
  }
}

function placeRide(ride, startRow, startCol) {
  const instanceId = `ride_${ride.id}_${Date.now()}`;
  installedRides.push({
    instanceId,
    rideId:    ride.id,
    name:      ride.name,
    color:     ride._color,
    row:       startRow,
    col:       startCol,
    footprint: ride.footprint,
  });
  paintCells(ride.footprint, startRow, startCol, ride._color, instanceId, ride.name);
  console.log(`Placed ride "${ride.name}" @ (${startRow}, ${startCol})`);
}

function placeFacility(facility, startRow, startCol) {
  const instanceId = `facility_${facility.id}_${Date.now()}`;
  const color = facility.color ?? '#888';
  installedFacilities.push({
    instanceId,
    facilityId: facility.id,
    name:       facility.name,
    color,
    row:        startRow,
    col:        startCol,
    footprint:  facility.footprint,
  });

  // Register each occupied cell so adjacency checks can find it
  for (let r = 0; r < facility.footprint.length; r++) {
    for (let c = 0; c < facility.footprint[r].length; c++) {
      if (facility.footprint[r][c] === 1) {
        facilityTypeAtCell[`${startRow + r},${startCol + c}`] = facility.id;
      }
    }
  }

  paintCells(facility.footprint, startRow, startCol, color, instanceId, facility.name);
  console.log(`Placed facility "${facility.name}" @ (${startRow}, ${startCol})`);
}

// Shared helper: update gridState and colour the DOM cells.
function paintCells(footprint, startRow, startCol, color, instanceId, label) {
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
    }
  }
}

// ── HUD ────────────────────────────────────────────────────────────────────
function initHUD() {
  updateHUD();
  document.getElementById('next-round-btn').addEventListener('click', advanceRound);
}

function advanceRound() {
  round++;
  updateHUD();
}

// Converts the current round number into a calendar-style label.
// Weeks 1–13 = Q1, 14–26 = Q2, 27–39 = Q3, 40–52 = Q4.
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
}

// ── Sidebar sub-tabs ───────────────────────────────────────────────────────
function initSubTabs() {
  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-panel`).classList.remove('hidden');
      deselectItem(); // selected card may no longer be visible
    });
  });
}

// ── Keyboard ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') deselectItem();
});

// ── Start ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
