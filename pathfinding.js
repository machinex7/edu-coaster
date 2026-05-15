// pathfinding.js — Grid path-distance utilities.
// Finds shortest walking distances between tiles, moving only along Path tiles.
//
// Load order: after grid.js (needs facilityTypeAtCell, GRID_ROWS, GRID_COLS).

// Returns { dist, path } for the shortest walk from the edge of rideRecord to
// (destRow, destCol), moving only along path tiles. dist is the step count;
// path is an ordered array of { row, col } tiles from the first adjacent path
// tile to the destination. The destination tile itself does not need to be a
// path tile (e.g. a bathroom tile). Returns null if unreachable.
function shortestPathToTile(rideRecord, destRow, destCol) {
  // Step 1: collect every path tile that borders any cell in the ride's footprint.
  const startKeys = new Set();
  for (let r = 0; r < rideRecord.footprint.length; r++) {
    for (let c = 0; c < rideRecord.footprint[r].length; c++) {
      if (rideRecord.footprint[r][c] !== 1) continue;
      const gr = rideRecord.row + r;
      const gc = rideRecord.col + c;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = gr + dr, nc = gc + dc;
        if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
        const nType = facilityTypeAtCell[`${nr},${nc}`];
        if (nType === FACILITY_ID.PATH || nType === FACILITY_ID.BRIDGE) {
          startKeys.add(`${nr},${nc}`);
        }
      }
    }
  }

  if (startKeys.size === 0) return null; // ride has no adjacent path tiles

  const destKey = `${destRow},${destCol}`;

  function walkable(r, c) {
    const k = `${r},${c}`;
    const t = facilityTypeAtCell[k];
    return k === destKey || t === FACILITY_ID.PATH || t === FACILITY_ID.BRIDGE;
  }

  // A* with Manhattan distance heuristic.
  const h = (r, c) => Math.abs(r - destRow) + Math.abs(c - destCol);

  // Open list kept in ascending f order via insertion sort.
  // Insertion sort is O(n) per push; fine for a ≤ 400 cell grid.
  const gScore   = new Map();
  const cameFrom = new Map(); // key → parent key, null for start nodes
  const open     = []; // { f, g, row, col }

  function push(row, col, g, parentKey) {
    const key = `${row},${col}`;
    if (gScore.has(key) && gScore.get(key) <= g) return;
    gScore.set(key, g);
    cameFrom.set(key, parentKey);
    const entry = { f: g + h(row, col), g, row, col };
    let i = open.length;
    open.push(entry);
    while (i > 0 && open[i - 1].f > open[i].f) {
      [open[i - 1], open[i]] = [open[i], open[i - 1]];
      i--;
    }
  }

  // Walks cameFrom back to the start, building the path in forward order.
  function reconstructPath(endKey) {
    const path = [];
    let key = endKey;
    while (key !== null) {
      const [r, c] = key.split(',').map(Number);
      path.unshift({ row: r, col: c });
      key = cameFrom.get(key) ?? null;
    }
    return path;
  }

  for (const key of startKeys) {
    const [r, c] = key.split(',').map(Number);
    if (r === destRow && c === destCol) return { dist: 1, path: [{ row: r, col: c }] };
    push(r, c, 1, null);
  }

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (open.length > 0) {
    const { g, row, col } = open.shift();
    const key = `${row},${col}`;

    if (row === destRow && col === destCol) return { dist: g, path: reconstructPath(key) };

    // Skip stale entries superseded by a cheaper path.
    if (gScore.get(key) < g) continue;

    for (const [dr, dc] of DIRS) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
      if (!walkable(nr, nc)) continue;
      push(nr, nc, g + 1, key);
    }
  }

  return null; // destination unreachable
}

// Returns { dist, path } for the walk from rideRecord to the nearest bathroom tile.
// Checks every cell of every installed bathroom and returns the shortest result.
// Falls back to { dist: GRID_COLS, path: [] } if no bathroom exists or none is reachable.
function nearestBathroom(rideRecord) {
  let best = null;
  for (const fac of installedFacilities) {
    if (fac.facilityId !== FACILITY_ID.BATHROOM) continue;
    for (let r = 0; r < fac.footprint.length; r++) {
      for (let c = 0; c < fac.footprint[r].length; c++) {
        if (fac.footprint[r][c] !== 1) continue;
        const result = shortestPathToTile(rideRecord, fac.row + r, fac.col + c);
        if (result !== null && (best === null || result.dist < best.dist)) best = result;
      }
    }
  }
  return best ?? { dist: GRID_COLS, path: [] };
}
