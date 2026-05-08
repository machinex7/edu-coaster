// animations.js — People-walking animation system.
// Spawns white-dot visitor sprites at the gate, routes them between active
// park destinations via pre-computed A* paths, and animates them tile by tile.
//
// Load order: after pathfinding.js (shortestPathToTile, FACILITY_ID, STATUS),
// after shopping.js (Shopping.installed), before hud.js
// (currentViewMode, gameStage, STAGE are referenced only at call time).

const Animations = {

  // Maximum simultaneously rendered visitor sprites.
  PERSON_LIMIT: 10,

  // Walking speed: one CELL_STEP per 2 seconds (px per ms).
  SPEED: CELL_STEP / 2000,

  // Milliseconds a visitor pauses (hidden) at each destination.
  VISIT_DURATION: 5000,

  // Milliseconds between gate spawns.
  SPAWN_INTERVAL: 5000,

  // Number of destinations a visitor makes before returning to the gate.
  MAX_STOPS: 6,

  // Dot radius in pixels.
  DOT_RADIUS: 4,

  // Tiles a visitor walks before dropping a piece of trash.
  TRASH_INTERVAL_TILES: 8,

  // Starting radius of a trash piece in pixels.
  TRASH_RADIUS: 3,

  // Milliseconds a trash piece takes to shrink to nothing.
  TRASH_DURATION: 2000,

  // Pre-computed unique node pairs for the current round layout.
  // Each entry: { from, to, gridPath } — gridPath is [{row,col}] or null.
  paths: [],

  // Currently active visitor objects.
  people: [],

  // Currently visible trash pieces: { x, y, age, maxAge, maxRadius }.
  trash: [],

  // Canvas overlay element and 2-D context.
  canvas: null,
  ctx:    null,

  // Internal handles and counters.
  _spawnTimer: null,
  _animFrame:  null,
  _lastTime:   null,
  _nextId:     0,

  // ── initialisation ───────────────────────────────────────────────────────

  // Sets up the canvas overlay. Called once from initHUD().
  init() {
    this.canvas        = document.getElementById('people-overlay');
    this.ctx           = this.canvas.getContext('2d');
    this.canvas.width  = GRID_COLS * CELL_STEP - CELL_GAP;
    this.canvas.height = GRID_ROWS * CELL_STEP - CELL_GAP;
  },

  // ── view-mode / game-stage hooks ─────────────────────────────────────────

  // Starts the gate spawn timer and kicks off the animation loop if not
  // already running. Safe to call when already active.
  startSpawning() {
    if (!this._spawnTimer) {
      this._spawnTimer = setInterval(() => this._spawnPerson(), this.SPAWN_INTERVAL);
    }
    if (!this._animFrame) {
      this._lastTime  = null;
      this._animFrame = requestAnimationFrame(t => this._tick(t));
    }
  },

  // Stops the gate spawn timer. Sprites already in-flight finish naturally.
  stopSpawning() {
    if (this._spawnTimer) {
      clearInterval(this._spawnTimer);
      this._spawnTimer = null;
    }
  },

  // ── node helpers ─────────────────────────────────────────────────────────

  // Returns every active node that participates in visitor routing.
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

  // Returns the pixel centre of a node, accounting for multi-cell footprints.
  _nodeCenter(node) {
    const fRows = node.footprint.length;
    const fCols = node.footprint[0].length;
    return {
      x: node.col * CELL_STEP + (fCols * CELL_STEP - CELL_GAP) / 2,
      y: node.row * CELL_STEP + (fRows * CELL_STEP - CELL_GAP) / 2,
    };
  },

  // Returns a tile's pixel centre with a small random position jitter so
  // multiple visitors on the same tile don't perfectly overlap.
  _jitteredTilePos(row, col) {
    const maxOff = CELL_SIZE * 0.2;
    return {
      x: col * CELL_STEP + CELL_SIZE / 2 + (Math.random() * 2 - 1) * maxOff,
      y: row * CELL_STEP + CELL_SIZE / 2 + (Math.random() * 2 - 1) * maxOff,
    };
  },

  // ── path data ────────────────────────────────────────────────────────────

  // Finds the shortest path from nodeA to any occupied cell of nodeB using
  // the A* pathfinder. Returns { dist, gridPath } or null if unreachable.
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
  // Iterates unique pairs only — A→B is stored; B→A is skipped.
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

  // Builds a pixel waypoint array for a visitor walking from fromNode to toNode.
  // Looks up the stored gridPath (reversing if needed) and wraps it with
  // jittered tile centres plus the node centres at each end.
  // Returns null if no connected path exists.
  _buildWaypoints(fromNode, toNode) {
    const entry = this.paths.find(p =>
      (p.from === fromNode && p.to === toNode) ||
      (p.from === toNode   && p.to === fromNode)
    );
    if (!entry || !entry.gridPath || entry.gridPath.length === 0) return null;

    // Use the stored path directly if it runs from→to; otherwise reverse it.
    const tiles = (entry.from === fromNode)
      ? entry.gridPath
      : [...entry.gridPath].reverse();

    const wps = [this._nodeCenter(fromNode)];
    for (const tile of tiles) {
      wps.push(this._jitteredTilePos(tile.row, tile.col));
    }
    wps.push(this._nodeCenter(toNode));
    return wps;
  },

  // ── person lifecycle ─────────────────────────────────────────────────────

  // Creates one visitor at the gate (if under the cap) and sends them
  // toward a random reachable destination.
  _spawnPerson() {
    if (this.people.length >= this.PERSON_LIMIT) return;
    if (gameStage !== STAGE.PLAY)               return;
    if (this.paths.length === 0)                return;

    const gate = installedFacilities.find(
      f => f.facilityId === FACILITY_ID.PARK_ENTRANCE && f.status === STATUS.ACTIVE
    );
    if (!gate) return;

    // Shuffle destinations and take the first with a valid path.
    const destinations = this._allNodes().filter(n => n !== gate);
    if (destinations.length === 0) return;
    const shuffled = destinations.slice().sort(() => Math.random() - 0.5);
    let firstDest = null;
    let firstWps  = null;
    for (const dest of shuffled) {
      const wps = this._buildWaypoints(gate, dest);
      if (wps) { firstDest = dest; firstWps = wps; break; }
    }
    if (!firstDest) return;

    const start = this._nodeCenter(gate);
    this.people.push({
      id:         ++this._nextId,
      x:          start.x,
      y:          start.y,
      waypoints:  firstWps,
      wpIdx:      1,        // wp[0] is the gate centre; visitor starts there
      stops:      0,
      state:      'walking',
      visitTimer: 0,
      returning:  false,
      fromNode:   gate,
      toNode:     firstDest,
      tileCount:  0,        // cumulative waypoint crossings; drives trash drops
    });
  },

  // Assigns the visitor's next waypoint list after they finish a visit.
  // After MAX_STOPS destinations the visitor is routed back to the gate.
  _pickNextDestination(person) {
    const gate = installedFacilities.find(
      f => f.facilityId === FACILITY_ID.PARK_ENTRANCE && f.status === STATUS.ACTIVE
    );

    if (person.returning || person.stops >= this.MAX_STOPS) {
      // Head home.
      if (!gate) { this._despawn(person); return; }
      const wps = this._buildWaypoints(person.toNode, gate);
      if (!wps) { this._despawn(person); return; }
      person.fromNode  = person.toNode;
      person.toNode    = gate;
      person.waypoints = wps;
      person.wpIdx     = 1;
      person.returning = true;
      person.state     = 'walking';
      return;
    }

    // Pick a random reachable destination, excluding the gate and current node.
    const options  = this._allNodes().filter(n => n !== gate && n !== person.toNode);
    const shuffled = options.slice().sort(() => Math.random() - 0.5);
    for (const dest of shuffled) {
      const wps = this._buildWaypoints(person.toNode, dest);
      if (wps) {
        person.fromNode  = person.toNode;
        person.toNode    = dest;
        person.waypoints = wps;
        person.wpIdx     = 1;
        person.state     = 'walking';
        return;
      }
    }
    this._despawn(person);
  },

  // Spawns a piece of brown trash at (x, y) that shrinks to nothing.
  _dropTrash(x, y) {
    this.trash.push({ x, y, age: 0, maxAge: this.TRASH_DURATION, maxRadius: this.TRASH_RADIUS });
  },

  // Removes a visitor from the active list immediately.
  _despawn(person) {
    const idx = this.people.indexOf(person);
    if (idx !== -1) this.people.splice(idx, 1);
  },

  // ── animation loop ───────────────────────────────────────────────────────

  // Per-frame update: advances each visitor's position and state.
  _tick(timestamp) {
    if (!this._lastTime) this._lastTime = timestamp;
    // Cap dt so a tab going to background doesn't teleport everyone.
    const dt = Math.min(timestamp - this._lastTime, 100);
    this._lastTime = timestamp;

    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];

      if (p.state === 'visiting') {
        p.visitTimer -= dt;
        if (p.visitTimer <= 0) {
          p.stops++;
          this._pickNextDestination(p);
        }
        continue;
      }

      // Move toward the current waypoint.
      const target = p.waypoints[p.wpIdx];
      const dx     = target.x - p.x;
      const dy     = target.y - p.y;
      const dist   = Math.sqrt(dx * dx + dy * dy);
      const step   = this.SPEED * dt;

      if (dist <= step) {
        // Snap to waypoint and advance.
        p.x = target.x;
        p.y = target.y;
        p.wpIdx++;

        // Count every tile crossing and drop trash. A higher mess factor
        // (dirtier park) shortens the interval, producing more litter.
        p.tileCount++;
        const messFactor     = Unlock.MESSES ? Finance.calcMessFactor() : 1;
        const trashInterval  = Math.max(1, Math.round(this.TRASH_INTERVAL_TILES / messFactor));
        if (p.tileCount % trashInterval === 0) {
          this._dropTrash(p.x, p.y);
        }

        if (p.wpIdx >= p.waypoints.length) {
          if (p.returning) {
            this._despawn(p);
          } else {
            p.state      = 'visiting';
            p.visitTimer = this.VISIT_DURATION;
          }
        }
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }

    // Age trash pieces and remove any that have fully shrunk away.
    for (let i = this.trash.length - 1; i >= 0; i--) {
      this.trash[i].age += dt;
      if (this.trash[i].age >= this.trash[i].maxAge) this.trash.splice(i, 1);
    }

    this._draw();
    this._animFrame = requestAnimationFrame(t => this._tick(t));
  },

  // Clears the canvas and repaints all visible visitor dots.
  // Dots are hidden both while visiting and when not in play view mode.
  _draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentViewMode !== 'play') return;

    // Draw trash first so people dots appear on top.
    ctx.fillStyle = '#92400e';
    for (const t of this.trash) {
      const radius = t.maxRadius * (1 - t.age / t.maxAge);
      ctx.beginPath();
      ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'white';
    for (const p of this.people) {
      if (p.state === 'visiting') continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  },

};
