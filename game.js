// ── Constants ──────────────────────────────────────────────────────────────
const GRID_COLS = 20;
const GRID_ROWS = 20;
const CELL_SIZE = 40;  // px
const CELL_GAP  = 1;   // px — must match the CSS gap on #grid
const CELL_STEP = CELL_SIZE + CELL_GAP; // px per grid unit

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

// ── Game State ─────────────────────────────────────────────────────────────
let rides = [];          // raw data from rides.json (with _color added)
let gridCells = [];      // [row][col] → <div> DOM element
let gridState = [];      // [row][col] → instanceId string, or null

// The canonical record of what has been built in the park.
// Each entry: { instanceId, rideId, name, color, row, col, footprint }
let installedRides = [];

// ── Drag State ─────────────────────────────────────────────────────────────
let dragging = null;         // { ride } — set while a card is being dragged
let currentPlacement = null; // { startRow, startCol, valid } — last computed placement

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  rides = await fetch('rides.json').then(r => r.json());

  rides.forEach((ride, i) => {
    ride._color = RIDE_COLORS[i % RIDE_COLORS.length];
  });

  gridState = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

  buildGrid();
  buildRideList();
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

  grid.addEventListener('dragover',  onGridDragOver);
  grid.addEventListener('dragleave', onGridDragLeave);
  grid.addEventListener('drop',      onGridDrop);
}

// ── Sidebar ────────────────────────────────────────────────────────────────
function buildRideList() {
  const list = document.getElementById('ride-list');
  rides.forEach(ride => list.appendChild(createRideCard(ride)));
}

function createRideCard(ride) {
  const card = document.createElement('div');
  card.className = 'ride-card';
  card.draggable = true;

  const durationSec = ride.rideDuration;
  const durationLabel = durationSec < 60
    ? `${durationSec}s`
    : `${Math.round(durationSec / 6) / 10}min`;

  card.innerHTML = `
    <div class="ride-card-name">${ride.name}</div>
    <div class="ride-card-body">
      <div class="ride-preview">${buildFootprintPreview(ride.footprint, ride._color)}</div>
      <div class="ride-stats">
        <span>$${ride.buildCost.toLocaleString()}</span>
        <span>${ride.buildWeeks} weeks to build</span>
        <span>${durationLabel} &middot; ${ride.ridesPerHour}/hr</span>
        <span><span class="intensity-badge intensity-${ride.intensity}">${ride.intensity}</span></span>
      </div>
    </div>
  `;

  card.addEventListener('dragstart', (e) => {
    dragging = { ride };
    e.dataTransfer.effectAllowed = 'copy';
    // Required by Firefox; we use the global `dragging` for everything else
    e.dataTransfer.setData('text/plain', ride.id);
    // Suppress the default browser drag ghost so our grid highlights are the
    // only visual feedback
    const ghost = document.createElement('canvas');
    ghost.width = 1;
    ghost.height = 1;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => ghost.remove());
  });

  card.addEventListener('dragend', () => {
    clearHighlights();
    dragging = null;
    currentPlacement = null;
  });

  return card;
}

// Renders a miniature footprint grid inside a ride card.
function buildFootprintPreview(footprint, color) {
  const rows = footprint.length;
  const cols = footprint[0].length;
  const size = 11; // px per mini-cell

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

// ── Drag & Drop Handlers ───────────────────────────────────────────────────
function onGridDragOver(e) {
  e.preventDefault();
  if (!dragging) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const col = Math.floor((e.clientX - rect.left) / CELL_STEP);
  const row = Math.floor((e.clientY - rect.top)  / CELL_STEP);

  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;

  const fp = dragging.ride.footprint;
  // Anchor the center of the footprint's bounding box to the cursor cell
  const anchorRow = Math.floor(fp.length    / 2);
  const anchorCol = Math.floor(fp[0].length / 2);

  const startRow = row - anchorRow;
  const startCol = col - anchorCol;

  // Skip re-render if the placement position hasn't changed
  if (currentPlacement?.startRow === startRow &&
      currentPlacement?.startCol === startCol) return;

  highlightPlacement(dragging.ride, startRow, startCol);
}

function onGridDragLeave(e) {
  // Only clear when the cursor actually leaves the grid, not when it moves
  // between child cells (relatedTarget would still be inside the grid).
  if (!e.currentTarget.contains(e.relatedTarget)) {
    clearHighlights();
    currentPlacement = null;
  }
}

function onGridDrop(e) {
  e.preventDefault();
  if (!dragging || !currentPlacement?.valid) return;

  placeRide(dragging.ride, currentPlacement.startRow, currentPlacement.startCol);
  clearHighlights();
  dragging = null;
  currentPlacement = null;
}

// ── Placement Logic ────────────────────────────────────────────────────────
function highlightPlacement(ride, startRow, startCol) {
  clearHighlights();

  const fp = ride.footprint;
  const valid = canPlace(fp, startRow, startCol);

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
  document.querySelectorAll('.highlight-valid, .highlight-invalid').forEach(el => {
    el.classList.remove('highlight-valid', 'highlight-invalid');
  });
}

// Returns true only if every occupied footprint cell maps to an in-bounds,
// unoccupied grid cell.
function canPlace(footprint, startRow, startCol) {
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

function placeRide(ride, startRow, startCol) {
  const instanceId = `${ride.id}_${Date.now()}`;
  const instance = {
    instanceId,
    rideId:    ride.id,
    name:      ride.name,
    color:     ride._color,
    row:       startRow,
    col:       startCol,
    footprint: ride.footprint,
  };

  installedRides.push(instance);

  const fp = ride.footprint;
  for (let r = 0; r < fp.length; r++) {
    for (let c = 0; c < fp[r].length; c++) {
      if (fp[r][c] !== 1) continue;
      const gr = startRow + r;
      const gc = startCol + c;
      gridState[gr][gc] = instanceId;
      const cell = gridCells[gr][gc];
      cell.style.backgroundColor = ride._color;
      cell.classList.add('occupied');
      cell.title = ride.name;
    }
  }

  console.log(`Placed "${instance.name}" @ row ${startRow}, col ${startCol}`);
}

// ── Start ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
