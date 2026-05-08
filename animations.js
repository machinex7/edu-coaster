// animations.js — People-walking animation system.
// Computes paths between all active park destinations (rides, shops, gate)
// at the start of each round, then drives sprite animation along those paths.
//
// Load order: after pathfinding.js (needs shortestPathToTile, FACILITY_ID,
// STATUS), after shopping.js (needs Shopping.installed).

const Animations = {

  // Computed each round. Each entry: { from, to, gridPath }
  // from / to: the source/dest record (ride, shop, or gate facility).
  // gridPath: ordered array of { row, col } tiles from shortestPathToTile,
  // or null if the two nodes are not connected by path tiles.
  paths: [],

  // Collects every active node that should participate in animations:
  // open rides, open shops, and the park entrance.
  _allNodes() {
    const nodes = [];
    for (const r of installedRides) {
      if (r.status === STATUS.ACTIVE) nodes.push(r);
    }
    for (const s of Shopping.installed) {
      if (s.status === STATUS.ACTIVE) nodes.push(s);
    }
    const gate = installedFacilities.find(
      f => f.facilityId === FACILITY_ID.PARK_ENTRANCE && f.status === STATUS.ACTIVE
    );
    if (gate) nodes.push(gate);
    return nodes;
  },

  // Finds the shortest path from nodeA to nodeB by trying every cell of
  // nodeB's footprint as a destination. Returns the best { dist, gridPath }
  // or null if unreachable.
  _pathBetween(nodeA, nodeB) {
    let best = null;
    for (let r = 0; r < nodeB.footprint.length; r++) {
      for (let c = 0; c < nodeB.footprint[r].length; c++) {
        if (nodeB.footprint[r][c] !== 1) continue;
        const result = shortestPathToTile(nodeA, nodeB.row + r, nodeB.col + c);
        if (result !== null && (best === null || result.dist < best.dist)) {
          best = result;
        }
      }
    }
    return best;
  },

  // Rebuilds Animations.paths for the current park layout.
  // Called (via setTimeout) at the start of each play-mode round.
  // Iterates unique pairs only (A→B is stored; B→A is skipped).
  buildPaths() {
    this.paths = [];
    const nodes = this._allNodes();
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const result = this._pathBetween(nodes[i], nodes[j]);
        this.paths.push({
          from:     nodes[i],
          to:       nodes[j],
          gridPath: result ? result.gridPath : null,
        });
      }
    }
  },

};
