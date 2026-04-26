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

// ── Cell painting ──────────────────────────────────────────────────────────

// Updates gridState and colours DOM cells. Adds .under-construction when needed.
function paintCells(footprint, startRow, startCol, color, instanceId, label, status = STATUS.ACTIVE) {
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
      cell.classList.toggle('under-construction', status === STATUS.UNDER_CONSTRUCTION);
    }
  }
}

// ── Placement highlighting ─────────────────────────────────────────────────
function highlightPlacement(item, category, startRow, startCol) {
  clearHighlights();
  const fp    = item.footprint;
  const valid = canPlaceItem(item, category, startRow, startCol);

  for (let r = 0; r < fp.length; r++) {
    for (let c = 0; c < fp[r].length; c++) {
      if (fp[r][c] !== 1) continue;
      const gr = startRow + r;
      const gc = startCol + c;
      if (gr >= 0 && gr < GRID_ROWS && gc >= 0 && gc < GRID_COLS)
        gridCells[gr][gc].classList.add(valid ? 'highlight-valid' : 'highlight-invalid');
    }
  }

  currentPlacement = { startRow, startCol, valid };
}

function clearHighlights() {
  document.querySelectorAll('.highlight-valid, .highlight-invalid').forEach(el =>
    el.classList.remove('highlight-valid', 'highlight-invalid'));
}

// ── Demolish hover highlight ───────────────────────────────────────────────
let _demolishHoverInstance = null;

function clearDemolishHighlight() {
  document.querySelectorAll('.demolish-hover').forEach(el => el.classList.remove('demolish-hover'));
  _demolishHoverInstance = null;
}

function updateDemolishHighlight(clientX, clientY) {
  const grid = document.getElementById('grid');
  const rect = grid.getBoundingClientRect();
  const col  = Math.floor((clientX - rect.left) / CELL_STEP);
  const row  = Math.floor((clientY - rect.top)  / CELL_STEP);

  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) {
    clearDemolishHighlight();
    return;
  }

  const instanceId = gridState[row][col] ?? null;
  if (instanceId === _demolishHoverInstance) return;
  clearDemolishHighlight();
  _demolishHoverInstance = instanceId;

  if (!instanceId) return;

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (gridState[r][c] === instanceId) gridCells[r][c].classList.add('demolish-hover');
    }
  }
}

// ── Shared position → placement helper ────────────────────────────────────
function updatePlacementFromPoint(clientX, clientY) {
  if (!selected) return;

  const grid = document.getElementById('grid');
  const rect = grid.getBoundingClientRect();
  const col  = Math.floor((clientX - rect.left) / CELL_STEP);
  const row  = Math.floor((clientY - rect.top)  / CELL_STEP);

  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) {
    clearHighlights();
    currentPlacement = null;
    return;
  }

  const fp       = selected.item.footprint;
  const startRow = row - Math.floor(fp.length    / 2);
  const startCol = col - Math.floor(fp[0].length / 2);

  if (currentPlacement?.startRow === startRow &&
      currentPlacement?.startCol === startCol) return;

  highlightPlacement(selected.item, selected.category, startRow, startCol);
}

// ── Grid event handlers ────────────────────────────────────────────────────
function _cellFromPoint(clientX, clientY) {
  const grid = document.getElementById('grid');
  const rect = grid.getBoundingClientRect();
  const col  = Math.floor((clientX - rect.left) / CELL_STEP);
  const row  = Math.floor((clientY - rect.top)  / CELL_STEP);
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
  return { row, col };
}

function onGridClick(e) {
  if (demolishMode) {
    const cell = _cellFromPoint(e.clientX, e.clientY);
    if (cell) startDemolition(cell.row, cell.col);
    return;
  }
  if (!selected || !currentPlacement?.valid) return;
  placeItem(selected.item, selected.category,
            currentPlacement.startRow, currentPlacement.startCol);
}

function onGridMouseMove(e) {
  if (selected) { updatePlacementFromPoint(e.clientX, e.clientY); return; }
  if (demolishMode) updateDemolishHighlight(e.clientX, e.clientY);
}

function onGridMouseLeave() {
  if (selected) { clearHighlights(); currentPlacement = null; return; }
  if (demolishMode) clearDemolishHighlight();
}

function onGridTouchStart(e) {
  if (!selected && !demolishMode) return;
  e.preventDefault();
  const t = e.touches[0];
  if (selected) updatePlacementFromPoint(t.clientX, t.clientY);
  else updateDemolishHighlight(t.clientX, t.clientY);
}

function onGridTouchMove(e) {
  if (!selected && !demolishMode) return;
  e.preventDefault();
  const t = e.touches[0];
  if (selected) updatePlacementFromPoint(t.clientX, t.clientY);
  else updateDemolishHighlight(t.clientX, t.clientY);
}

function onGridTouchEnd(e) {
  if (!selected && !demolishMode) return;
  const t = e.changedTouches[0];
  if (selected) {
    updatePlacementFromPoint(t.clientX, t.clientY);
    if (currentPlacement?.valid)
      placeItem(selected.item, selected.category,
                currentPlacement.startRow, currentPlacement.startCol);
  } else {
    const cell = _cellFromPoint(t.clientX, t.clientY);
    if (cell) startDemolition(cell.row, cell.col);
    clearDemolishHighlight();
  }
}
