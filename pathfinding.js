// pathfinding.js — Grid path-distance utilities.
// Finds shortest walking distances between tiles, moving only along Path tiles.
//
// Load order: after grid.js (needs facilityTypeAtCell, GRID_ROWS, GRID_COLS).

// Returns the shortest step count from the edge of rideRecord to (destRow, destCol),
// walking only along path tiles. The search seeds from every path tile adjacent
// to the ride's footprint, so the distance represents steps on the path network
// (not through the ride's own cells).
// The destination tile itself does not need to be a path tile (e.g. a bathroom tile).
// Returns null if the destination cannot be reached.
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
        if (facilityTypeAtCell[`${nr},${nc}`] === FACILITY_ID.PATH) {
          startKeys.add(`${nr},${nc}`);
        }
      }
    }
  }

  if (startKeys.size === 0) return null; // ride has no adjacent path tiles

  const destKey = `${destRow},${destCol}`;

  function walkable(r, c) {
    const k = `${r},${c}`;
    return k === destKey || facilityTypeAtCell[k] === FACILITY_ID.PATH;
  }

  // A* with Manhattan distance heuristic.
  const h = (r, c) => Math.abs(r - destRow) + Math.abs(c - destCol);

  // Open list kept in ascending f order via insertion sort.
  // Insertion sort is O(n) per push; fine for a ≤ 400 cell grid.
  const gScore = new Map();
  const open   = []; // { f, g, row, col }

  function push(row, col, g) {
    const key = `${row},${col}`;
    if (gScore.has(key) && gScore.get(key) <= g) return;
    gScore.set(key, g);
    const entry = { f: g + h(row, col), g, row, col };
    let i = open.length;
    open.push(entry);
    while (i > 0 && open[i - 1].f > open[i].f) {
      [open[i - 1], open[i]] = [open[i], open[i - 1]];
      i--;
    }
  }

  for (const key of startKeys) {
    const [r, c] = key.split(',').map(Number);
    if (r === destRow && c === destCol) return 1;
    push(r, c, 1);
  }

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (open.length > 0) {
    const { g, row, col } = open.shift();

    if (row === destRow && col === destCol) return g;

    // Skip stale entries superseded by a cheaper path.
    if (gScore.get(`${row},${col}`) < g) continue;

    for (const [dr, dc] of DIRS) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
      if (!walkable(nr, nc)) continue;
      push(nr, nc, g + 1);
    }
  }

  return null; // destination unreachable
}
