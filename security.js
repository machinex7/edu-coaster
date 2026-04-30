// security.js — Security state, incident calculation, and panel UI.

const Security = {

  // ── State ──────────────────────────────────────────────────────────────────
  // Accumulated perception of danger. Rises by unhandled incident count each
  // round; decays 20% per round (rounded up). Reduces demand via sqrt curve.
  // Read by calcDailyDemand() in finance.js.
  opinion: 0,

  // ── Coverage calculation ──────────────────────────────────────────────────
  // Returns how many path tiles fall within GUARD_RADIUS of at least one
  // staffed guard post. Posts are active guard_station facilities plus the
  // park entrance (treated as a built-in post). Guards on PARKING_OBS are
  // excluded — they are off-grid and assigned to license-plate monitoring.
  // Remaining active guards fill posts one-per-post in roster order; excess
  // guards contribute capacity in calcIncidents but no additional coverage.
  calcCoverage() {
    const posts = installedFacilities.filter(
      f => (f.facilityId === FACILITY_ID.GUARD_STATION || f.facilityId === FACILITY_ID.PARK_ENTRANCE)
        && f.status === STATUS.ACTIVE
    );

    const patrolGuards = Staff.roster.filter(
      s => s.jobId === JOB.SECURITY && s.weeksOut === 0 && s.focus !== SECURITY_FOCUS.PARKING_OBS
    );
    const staffedCount = Math.min(patrolGuards.length, posts.length);
    const staffedPosts = posts.slice(0, staffedCount);

    let totalPath   = 0;
    let coveredPath = 0;

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (facilityTypeAtCell[`${r},${c}`] !== FACILITY_ID.PATH) continue;
        totalPath++;
        const isCovered = staffedPosts.some(post => {
          const dr = r - post.row;
          const dc = c - post.col;
          return Math.sqrt(dr * dr + dc * dc) <= GUARD_RADIUS;
        });
        if (isCovered) coveredPath++;
      }
    }

    return {
      totalPath,
      coveredPath,
      uncoveredPath:    totalPath - coveredPath,
      staffedPosts:     staffedCount,
      totalPosts:       posts.length,
      staffedPostsList: staffedPosts,
    };
  },

  // ── Incident calculation ──────────────────────────────────────────────────
  // Total incidents are split into covered vs uncovered proportional to path
  // tile coverage. Covered incidents cost 1 unit of guard capacity each;
  // uncovered cost 2. Available capacity is distributed proportionally between
  // the two pools; whatever incidents cannot be handled become unhandled.
  calcIncidents(weeklyAttendance, dailyDemand, dailyThroughput) {
    const weeklyOverflow = Math.max(0, (dailyDemand - dailyThroughput) * 7);
    const fromOverflow   = Math.floor(weeklyOverflow * Population.OVERFLOW_INCIDENT_RATE);

    const weeklyRiders = installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
      .reduce((sum, r) => sum + (r.lastRoundRiders ?? 0), 0);
    const unridden     = Math.max(0, weeklyAttendance - weeklyRiders);
    const fromUnridden = Math.floor(unridden * Population.UNRIDDEN_INCIDENT_RATE);

    const fromRandom = Math.floor(weeklyAttendance * Population.RANDOM_INCIDENT_RATE);
    const fromShop   = Shopping.calcTheftIncidents(weeklyAttendance);

    const total = fromOverflow + fromUnridden + fromRandom + fromShop;

    const { totalPath, coveredPath, uncoveredPath, staffedPosts, totalPosts, staffedPostsList } = this.calcCoverage();
    const coveredFraction    = totalPath > 0 ? coveredPath / totalPath : 0;
    const coveredIncidents   = Math.round(total * coveredFraction);
    const uncoveredIncidents = total - coveredIncidents;

    // Weekly capacity: (3 + experienceTier) × 7 per active guard.
    // Excess patrol guards (more guards than posts) and parking-obs guards
    // contribute half capacity — they help but aren't on a dedicated post.
    const guards       = Staff.roster.filter(s => s.jobId === JOB.SECURITY && s.weeksOut === 0);
    const patrolGuards = guards.filter(s => s.focus !== SECURITY_FOCUS.PARKING_OBS);
    const excessSet    = new Set(patrolGuards.slice(staffedPosts).map(s => s.instanceId));
    const capacity = guards.reduce((sum, s) => {
      const { tier } = Staff.getExperienceTier(s.weeksEmployed);
      const base     = (3 + tier) * 7;
      const reduced  = s.focus === SECURITY_FOCUS.PARKING_OBS || excessSet.has(s.instanceId);
      return sum + (reduced ? Math.floor(base / 2) : base);
    }, 0);

    // Effective load: uncovered incidents count as 2 against capacity.
    const effectiveLoad = coveredIncidents + uncoveredIncidents * 2;

    let handled, unhandled;
    if (total === 0 || effectiveLoad <= capacity) {
      handled   = total;
      unhandled = 0;
    } else {
      // Distribute capacity proportionally between covered and uncovered pools.
      // Each covered incident consumes 1 unit; each uncovered consumes 2, so
      // capacity allocated to uncovered is halved when converting to a head count.
      const handledCovered   = Math.min(coveredIncidents,   Math.floor(capacity * coveredIncidents   / effectiveLoad));
      const handledUncovered = Math.min(uncoveredIncidents, Math.floor(capacity * uncoveredIncidents / effectiveLoad));
      handled   = handledCovered + handledUncovered;
      unhandled = total - handled;
    }

    // When guards have surplus capacity, they observe nearby rides and build
    // intensity-preference knowledge for each demographic bracket.
    if (capacity > effectiveLoad) {
      // Build a set of all active ride tile positions using their footprints.
      const rideTilePositions = new Set();
      for (const ride of installedRides.filter(r => r.status === STATUS.ACTIVE)) {
        for (let r = 0; r < ride.footprint.length; r++) {
          for (let c = 0; c < ride.footprint[r].length; c++) {
            if (ride.footprint[r][c]) rideTilePositions.add(`${ride.row + r},${ride.col + c}`);
          }
        }
      }
      // Count unique ride tiles within GUARD_RADIUS of any staffed post.
      const observedTiles = new Set();
      for (const post of staffedPostsList) {
        for (const key of rideTilePositions) {
          const [tr, tc] = key.split(',').map(Number);
          const dr = tr - post.row;
          const dc = tc - post.col;
          if (Math.sqrt(dr * dr + dc * dc) <= GUARD_RADIUS) observedTiles.add(key);
        }
      }
      const delta = observedTiles.size / 100;
      Population.observedIntensity.AGE       = Population.observedIntensity.AGE.map(v => Math.min(1, v + delta));
      Population.observedIntensity.HOUSEHOLD = Population.observedIntensity.HOUSEHOLD.map(v => Math.min(1, v + delta));
    }

    // Shop theft: scale unhandled shop incidents by the overall unhandled rate.
    const unhandledRate = total > 0 ? unhandled / total : 0;
    const unhandledShop = Math.floor(fromShop * unhandledRate);
    const { itemsStolen: theftItemsStolen } = Shopping.handleThefts(unhandledShop);

    return {
      fromOverflow, fromUnridden, fromRandom, fromShop, total,
      totalPath, coveredPath, uncoveredPath, coveredFraction,
      coveredIncidents, uncoveredIncidents,
      staffedPosts, totalPosts,
      capacity, effectiveLoad,
      handled, unhandled,
      unhandledShop, theftItemsStolen,
    };
  },

  // advanceOpinion — Decay existing fear, then add unhandled incidents.
  advanceOpinion(unhandled) {
    const decay  = Math.ceil(this.opinion * 0.20);
    this.opinion = Math.max(0, this.opinion - decay) + unhandled;
  },

  // ── Panel UI ────────────────────────────────────────────────────────────────
  buildPanel() {
    const container = document.getElementById('security-overview');
    const guards    = Staff.roster.filter(s => s.jobId === JOB.SECURITY);

    if (guards.length === 0) {
      container.innerHTML = '<p class="empty-note">No security guards hired. Visit Staffing to hire some.</p>';
      return;
    }

    const coverage = this.calcCoverage();
    const coveragePct = coverage.totalPath > 0
      ? Math.round(coverage.coveredPath / coverage.totalPath * 100)
      : 0;

    // Build the list of active posts so patrol guards can be assigned a label.
    const posts = installedFacilities.filter(
      f => (f.facilityId === FACILITY_ID.GUARD_STATION || f.facilityId === FACILITY_ID.PARK_ENTRANCE)
        && f.status === STATUS.ACTIVE
    );

    // Walk guards in roster order, assigning patrol guards to posts sequentially.
    let postIdx = 0;
    const guardRows = guards.map(s => {
      const { label: expLabel } = Staff.getExperienceTier(s.weeksEmployed);
      const expBadge = expLabel
        ? `<span class="exp-badge exp-${expLabel.toLowerCase()}">${expLabel}</span>`
        : '';
      const out     = s.weeksOut > 0;
      const outBadge = out ? `<span class="out-badge">Out (${s.weeksOut}wk)</span>` : '';

      // Determine post assignment label for display.
      let assignmentHtml = '';
      if (!out && s.focus !== SECURITY_FOCUS.PARKING_OBS) {
        if (postIdx < posts.length) {
          const post     = posts[postIdx++];
          const postName = post.facilityId === FACILITY_ID.PARK_ENTRANCE ? 'Gate' : `Station (${post.row},${post.col})`;
          assignmentHtml = `<span class="sec-assignment">${postName}</span>`;
        } else {
          assignmentHtml = `<span class="sec-assignment sec-excess">Excess</span>`;
        }
      }

      // PARKING_OBS toggle button only shown when license-plate research is unlocked.
      const parkingBtn = Research.completed.has(RESEARCH_ID.LICENSE_PLATE_MONITORING)
        ? `<button class="sec-focus-btn${s.focus === SECURITY_FOCUS.PARKING_OBS ? ' active' : ''}"
                   data-id="${s.instanceId}" data-focus="${SECURITY_FOCUS.PARKING_OBS}"
                   ${out ? 'disabled' : ''}>Parking Obs</button>`
        : '';

      return `<div class="security-guard-row${out ? ' guard-out' : ''}">
        <div class="sec-guard-info">
          <span class="sec-guard-name">${s.name} ${expBadge} ${outBadge}</span>
          ${assignmentHtml}
        </div>
        ${parkingBtn ? `<div class="sec-focus-btns">${parkingBtn}</div>` : ''}
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="sec-coverage-bar">
        <div class="sec-coverage-top">
          <span class="sec-coverage-label">Park coverage</span>
          <span class="sec-coverage-pct">${coveragePct}%</span>
        </div>
        <span class="sec-coverage-detail">${coverage.staffedPosts} / ${coverage.totalPosts} posts staffed</span>
      </div>
      <div class="security-guard-list">${guardRows}</div>`;

    container.querySelectorAll('.sec-focus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const guard = Staff.roster.find(s => s.instanceId === btn.dataset.id);
        if (!guard) return;
        // Toggle PARKING_OBS; reverting it resets back to PATROL.
        guard.focus = guard.focus === SECURITY_FOCUS.PARKING_OBS
          ? SECURITY_FOCUS.PATROL
          : btn.dataset.focus;
        this.buildPanel();
      });
    });
  },

  // refreshPanel — Rebuild if security panel is currently open.
  refreshPanel() {
    if (activePanel === 'security') this.buildPanel();
  },

};
