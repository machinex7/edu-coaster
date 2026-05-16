// animations.js — People-walking animation system.
// Spawns white-dot visitor sprites at the gate, routes them between active
// park destinations via pre-computed A* paths, and animates them tile by tile.
//
// Load order: after pathfinding.js (shortestPathToTile, FACILITY_ID, STATUS),
// after shopping.js (Shopping.installed), before hud.js
// (currentViewMode, gameStage, STAGE are referenced only at call time).

const Animations = {

  // Hard cap on simultaneously rendered visitor sprites.
  PERSON_LIMIT: 50,

  // One sprite is shown per this many weekly visitors (scales up to PERSON_LIMIT).
  ATTENDANCE_PER_PERSON: 40,

  // Walking speed: one CELL_STEP per 2 seconds (px per ms).
  SPEED: CELL_STEP / 1200,

  // Milliseconds a visitor pauses (hidden) at each destination.
  VISIT_DURATION: 5000,

  // Milliseconds between gate spawns.
  SPAWN_INTERVAL: 3000,

  // Milliseconds between feedback bubble triggers (±5 s jitter applied).
  BUBBLE_INTERVAL: 20000,

  // Milliseconds a feedback bubble stays visible.
  BUBBLE_DURATION: 5000,

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

  // Rising dollar-sign particles spawned at the gate on each visitor spawn.
  // Each entry: { x, y, vy, age, maxAge }.
  coins: [],

  // Active speech bubbles: { personRef, lastX, lastY, comment, age, maxAge }.
  bubbles: [],

  // Canvas overlay element and 2-D context.
  canvas: null,
  ctx:    null,

  // Internal handles and counters.
  _spawnTimer:  null,
  _animFrame:   null,
  _lastTime:    null,
  _nextId:      0,
  _bubbleTimer: null,

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
    if (!this._bubbleTimer) this._scheduleBubble();
  },

  // Stops the gate spawn timer. Sprites already in-flight finish naturally.
  stopSpawning() {
    if (this._spawnTimer) {
      clearInterval(this._spawnTimer);
      this._spawnTimer = null;
    }
    if (this._bubbleTimer) {
      clearTimeout(this._bubbleTimer);
      this._bubbleTimer = null;
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
        if (result) this.paths.push({ from: nodes[i], to: nodes[j], gridPath: result.path });
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
    if (!entry) return null;

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

  // Returns the current sprite cap: 1 sprite per ATTENDANCE_PER_PERSON weekly
  // visitors from the last round, bounded to [3, PERSON_LIMIT].
  _effectiveLimit() {
    const last = History.rounds[History.rounds.length - 1];
    const attendance = last ? last.attendance : 0;
    return Math.min(this.PERSON_LIMIT, Math.max(3, Math.floor(attendance / this.ATTENDANCE_PER_PERSON)));
  },

  // Creates one visitor at the gate (if under the cap) and sends them
  // toward a random reachable destination.
  _spawnPerson() {
    if (this.people.length >= this._effectiveLimit()) return;
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
    this._spawnCoin(start.x, start.y);
  },

  // Launches a green dollar-sign particle that rises from (x, y) and fades out.
  _spawnCoin(x, y) {
    this.coins.push({ x, y, vy: -55, age: 0, maxAge: 700 });
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

  // ── feedback speech bubbles ──────────────────────────────────────────────

  // Weighted-random pick from Finance.feedback, weighted by guestCount.
  _pickFeedbackItem() {
    const items = Finance.feedback;
    if (!items || items.length === 0) return null;
    const total = items.reduce((s, f) => s + f.guestCount, 0);
    let r = Math.random() * total;
    for (const item of items) {
      r -= item.guestCount;
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  },

  // Queues the next bubble trigger with ±5 s jitter around BUBBLE_INTERVAL.
  _scheduleBubble() {
    const delay = this.BUBBLE_INTERVAL + (Math.random() - 0.5) * 10000;
    this._bubbleTimer = setTimeout(() => {
      this._triggerBubble();
      this._bubbleTimer = null;
      this._scheduleBubble();
    }, delay);
  },

  // Picks a visible walking person and a feedback item, spawns a bubble above them.
  _triggerBubble() {
    if (currentViewMode !== 'play') return;
    if (this.bubbles.length > 0) return;
    const item = this._pickFeedbackItem();
    if (!item) return;
    const visible = this.people.filter(p => p.state !== 'visiting');
    if (visible.length === 0) return;
    const person = visible[Math.floor(Math.random() * visible.length)];
    this.bubbles.push({
      personRef: person,
      lastX:     person.x,
      lastY:     person.y,
      comment:   item.comment,
      age:       0,
      maxAge:    this.BUBBLE_DURATION,
    });
  },

  // Draws a speech bubble with a downward tail pointing toward (bx, by).
  _drawBubble(ctx, bx, by, comment) {
    const padding  = 8;
    const cornerR  = 6;
    const tailH    = 10;
    const tailW    = 9;
    const maxTextW = 160;
    const lineH    = 15;

    ctx.font = '11px sans-serif';
    const words = comment.split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width > maxTextW) {
        if (cur) lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);

    const textW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const boxW  = textW + padding * 2;
    const boxH  = lines.length * lineH + padding * 2;

    const boxX = bx - boxW / 2;
    const boxY = by - tailH - boxH - this.DOT_RADIUS - 3;

    // Rounded rectangle body with a downward-pointing tail.
    ctx.beginPath();
    ctx.moveTo(boxX + cornerR, boxY);
    ctx.lineTo(boxX + boxW - cornerR, boxY);
    ctx.arcTo(boxX + boxW, boxY,          boxX + boxW, boxY + cornerR,       cornerR);
    ctx.lineTo(boxX + boxW, boxY + boxH - cornerR);
    ctx.arcTo(boxX + boxW, boxY + boxH,   boxX + boxW - cornerR, boxY + boxH, cornerR);
    ctx.lineTo(bx + tailW / 2, boxY + boxH);
    ctx.lineTo(bx,             by - this.DOT_RADIUS - 2);
    ctx.lineTo(bx - tailW / 2, boxY + boxH);
    ctx.lineTo(boxX + cornerR, boxY + boxH);
    ctx.arcTo(boxX, boxY + boxH, boxX, boxY + boxH - cornerR,               cornerR);
    ctx.lineTo(boxX, boxY + cornerR);
    ctx.arcTo(boxX, boxY,        boxX + cornerR, boxY,                      cornerR);
    ctx.closePath();

    ctx.fillStyle   = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.fillStyle    = '#1e293b';
    ctx.font         = '11px sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], boxX + padding, boxY + padding + i * lineH);
    }
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
          // Check the node they're leaving before _pickNextDestination reassigns toNode.
          const visited   = p.toNode;
          const shopDef   = visited.shopId && Shopping.catalog.find(s => s.id === visited.shopId);
          const isShop    = shopDef && (shopDef.shopType === 'food' || shopDef.shopType === 'merchandise');
          p.stops++;
          this._pickNextDestination(p);
          // Spawn coin above the guest as they re-emerge from a shop.
          if (isShop && p.state === 'walking') this._spawnCoin(p.x, p.y);
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

    // Rise and age coin particles.
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.y   += c.vy * (dt / 1000);
      c.age += dt;
      if (c.age >= c.maxAge) this.coins.splice(i, 1);
    }

    // Age speech bubbles; track person position so the bubble follows them.
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.age += dt;
      if (b.age >= b.maxAge) { this.bubbles.splice(i, 1); continue; }
      if (this.people.includes(b.personRef)) {
        b.lastX = b.personRef.x;
        b.lastY = b.personRef.y;
      }
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

      const prev = p.waypoints[p.wpIdx - 1];
      const next = p.waypoints[p.wpIdx];
      const half = CELL_STEP / 2;

      if (p.wpIdx === 1) {
        // First segment: stay hidden until within half a tile of the first path tile.
        const dx = next.x - p.x, dy = next.y - p.y;
        if (dx * dx + dy * dy > half * half) continue;
      } else if (p.wpIdx === p.waypoints.length - 1) {
        // Last segment: hide once more than half a tile from the last path tile.
        const dx = p.x - prev.x, dy = p.y - prev.y;
        if (dx * dx + dy * dy > half * half) continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, this.DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw coin particles on top of everything; fade and rise like Mario coins.
    ctx.save();
    ctx.font         = 'bold 20px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#4ade80';
    for (const c of this.coins) {
      ctx.globalAlpha = 1 - (c.age / c.maxAge);
      ctx.fillText('$', c.x, c.y);
    }
    ctx.restore();

    // Draw speech bubbles on top of everything with a fade-in and fade-out.
    ctx.save();
    for (const b of this.bubbles) {
      ctx.globalAlpha = Math.min(b.age / 300, 1, (b.maxAge - b.age) / 500);
      this._drawBubble(ctx, b.lastX, b.lastY, b.comment);
    }
    ctx.restore();
  },

};
