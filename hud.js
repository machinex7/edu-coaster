// ── HUD & stage management ─────────────────────────────────────────────────
let activePanel = null;

// ── View mode bar ──────────────────────────────────────────────────────────

// The currently active grid view mode. 'play' is the default.
let currentViewMode = 'play';

// Ordered list of view modes displayed in the toolbar.
const VIEW_MODES = [
  { id: 'play',     icon: '🎮', label: 'Play'     },
  { id: 'build',    icon: '🏗️', label: 'Build'    },
  { id: 'demolish', icon: '💣', label: 'Demolish' },
  { id: 'security', icon: '🛡️', label: 'Security' },
  { id: 'dirt',     icon: '🟫', label: 'Mess'     },
];

// Builds pill buttons in #view-mode-bar and wires up click handlers.
function initViewModeBar() {
  const bar = document.getElementById('view-mode-bar');
  const legend = document.getElementById('view-mode-legend');
  VIEW_MODES.forEach(mode => {
    const btn = document.createElement('button');
    btn.className = 'view-mode-btn' + (mode.id === currentViewMode ? ' active' : '');
    if (mode.id === 'security' && !Unlock.SECURITY) btn.classList.add('hidden');
    if (mode.id === 'dirt'     && !Unlock.MESSES)   btn.classList.add('hidden');
    btn.dataset.viewMode = mode.id;
    btn.innerHTML = `<span class="vm-icon">${mode.icon}</span><span>${mode.label}</span>`;
    btn.addEventListener('click', () => setViewMode(mode.id));
    bar.insertBefore(btn, legend);
  });
}

// Switches the active view mode, updating button state, construction bar, demolish mode, and overlays.
function setViewMode(modeId) {
  if (modeId === 'demolish' && Banking.hasActiveCovenant('NO_DEMOLISH')) {
    Notifications.push({ label: 'Covenant', message: 'Your loan covenant prohibits demolishing rides.' });
    return;
  }
  // Clicking the active mode again resets to play.
  if (modeId === currentViewMode) modeId = 'play';
  currentViewMode = modeId;
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.viewMode === modeId);
  });
  document.getElementById('construction-bar').classList.toggle('hidden', modeId !== 'build');
  if (modeId !== 'build') deselectItem();
  setDemolishMode(modeId === 'demolish');
  if (modeId === 'security') drawSecurityOverlay();
  else clearSecurityOverlay();
  if (modeId === 'dirt') drawDirtOverlay();
  else clearDirtOverlay();
  _updateViewModeLegend(modeId);
  // Spawn visitors only while the player is watching the park in play mode.
  if (gameStage === STAGE.PLAY) {
    if (modeId === 'play') {
      if (Animations.paths.length === 0) Animations.buildPaths();
      Animations.startSpawning();
    } else {
      Animations.stopSpawning();
    }
  }
}

// Populates the right-side legend area when an overlay mode is active.
function _updateViewModeLegend(modeId) {
  const legend = document.getElementById('view-mode-legend');
  if (modeId === 'security') {
    legend.innerHTML = `
      <span class="vml-item"><span class="vml-dot" style="background:#3b82f6"></span>Staffed post + radius</span>
      <span class="vml-item"><span class="vml-dot" style="background:#f59e0b"></span>Unstaffed post</span>`;
  } else if (modeId === 'dirt') {
    legend.innerHTML = `
      <span class="vml-item"><span class="vml-dot" style="background:rgba(160,160,160,0.7)"></span>Cleaned</span>
      <span class="vml-item"><span class="vml-dot" style="background:rgba(120,60,20,0.7)"></span>Excess</span>`;
  } else {
    legend.innerHTML = '';
  }
}

// Total SVG canvas size in px — matches the grid exactly.
const OVERLAY_W = GRID_COLS * CELL_STEP - CELL_GAP;
const OVERLAY_H = GRID_ROWS * CELL_STEP - CELL_GAP;

// Returns the pixel centre of a grid cell.
function _cellCentre(row, col) {
  return { x: col * CELL_STEP + CELL_SIZE / 2, y: row * CELL_STEP + CELL_SIZE / 2 };
}

// Draws security post markers and patrol radius circles onto the SVG overlay.
function drawSecurityOverlay() {
  const svg = document.getElementById('security-overlay');
  svg.setAttribute('width',  OVERLAY_W);
  svg.setAttribute('height', OVERLAY_H);
  svg.innerHTML = '';

  const NS = 'http://www.w3.org/2000/svg';

  const coverage     = Security.calcCoverage();
  const staffedIds   = new Set(coverage.staffedPostsList.map(p => p.instanceId));
  const activePosts  = installedFacilities.filter(
    f => (f.facilityId === FACILITY_ID.GUARD_STATION || f.facilityId === FACILITY_ID.PARK_ENTRANCE)
      && f.status === STATUS.ACTIVE
  );

  // Radius circles drawn first so they appear behind the post markers.
  activePosts.forEach(post => {
    if (!staffedIds.has(post.instanceId)) return;
    const { x, y } = _cellCentre(post.row, post.col);
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r',  GUARD_RADIUS * CELL_STEP);
    circle.setAttribute('fill',         'rgba(59, 130, 246, 0.13)');
    circle.setAttribute('stroke',       'rgba(59, 130, 246, 0.45)');
    circle.setAttribute('stroke-width', '1.5');
    svg.appendChild(circle);
  });

  // Post markers — blue for staffed, amber for unstaffed.
  activePosts.forEach(post => {
    const { x, y }  = _cellCentre(post.row, post.col);
    const isStaffed = staffedIds.has(post.instanceId);
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.setAttribute('r',  9);
    dot.setAttribute('fill',         isStaffed ? '#3b82f6' : '#f59e0b');
    dot.setAttribute('stroke',       '#fff');
    dot.setAttribute('stroke-width', '2');
    svg.appendChild(dot);
  });
}

// Removes all security overlay content and resets the SVG canvas size.
function clearSecurityOverlay() {
  const svg = document.getElementById('security-overlay');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.innerHTML = '';
}

// Redraws the security overlay only when security mode is currently active.
// Call this whenever the guard roster or focus assignments change.
function refreshSecurityOverlay() {
  if (currentViewMode === 'security') drawSecurityOverlay();
}

// ── Dirt overlay ────────────────────────────────────────────────────────────

// Maximum number of speck circles drawn per path tile.
const DIRT_MAX_SPECKS = 8;
// Multiplier converting unhandled mess-per-tile into a speck count.
// Mess values are small decimals (e.g. 0.1–2.0), so we scale up so even
// low-mess tiles produce at least one visible speck when mess is unhandled.
const DIRT_SPECK_SCALE = 10;

// Deterministic pseudo-random in [0,1) from an integer seed.
// Using sine-hash so speck positions stay consistent across redraws.
const _dirtRand = seed => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Draws brown speck circles on each path tile representing unhandled mess.
// Speck count per tile is proportional to the tile's share of unhandled mess:
//   unhandledPerTile = f.mess * (weeklyNetMess / totalGenerated)
//   specks = ceil(unhandledPerTile * DIRT_SPECK_SCALE), capped at DIRT_MAX_SPECKS
// This avoids the floor-to-zero problem when per-tile mess is < 1, and avoids
// the inaccurate uniform-cleaning assumption of the old approach.
function drawDirtOverlay() {
  const svg = document.getElementById('dirt-overlay');
  svg.setAttribute('width',  OVERLAY_W);
  svg.setAttribute('height', OVERLAY_H);
  svg.innerHTML = '';

  if (Finance.weeklyNetMess <= 0) return;

  const totalGenerated = Finance.messBreakdown.total;
  const netFraction    = totalGenerated > 0 ? Finance.weeklyNetMess / totalGenerated : 0;

  const NS      = 'http://www.w3.org/2000/svg';
  const SPECK_R = 3;
  const SPREAD  = CELL_SIZE / 2 - SPECK_R - 2;

  const pathFacilities = installedFacilities.filter(f => f.facilityId === FACILITY_ID.PATH);

  for (const f of pathFacilities) {
    const unhandled = (f.mess ?? 0) * netFraction;
    const count     = Math.min(Math.ceil(unhandled * DIRT_SPECK_SCALE), DIRT_MAX_SPECKS);
    if (count <= 0) continue;

    const { x, y } = _cellCentre(f.row, f.col);
    const seed = f.row * 997 + f.col * 31;

    for (let i = 0; i < count; i++) {
      const ox     = (_dirtRand(seed + i * 2)     * 2 - 1) * SPREAD;
      const oy     = (_dirtRand(seed + i * 2 + 1) * 2 - 1) * SPREAD;
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx',   x + ox);
      circle.setAttribute('cy',   y + oy);
      circle.setAttribute('r',    SPECK_R);
      circle.setAttribute('fill', 'rgba(120,60,20,0.7)');
      svg.appendChild(circle);
    }
  }
}

// Clears the dirt overlay canvas.
function clearDirtOverlay() {
  const svg = document.getElementById('dirt-overlay');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.innerHTML = '';
}

// Redraws the dirt overlay only when dirt mode is currently active.
// Call this after each round's mess is distributed.
function refreshDirtOverlay() {
  if (currentViewMode === 'dirt') drawDirtOverlay();
}

// Wires up the construction bar's Attractions / Shopping / Facilities tabs.
function initCbarTabs() {
  document.querySelectorAll('.cbar-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cbar-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.cbar-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.cbarTab}-panel`).classList.remove('hidden');
      deselectItem();
    });
  });
}

function initHUD() {
  // Pin the research panel below the header by measuring it once at startup.
  const headerEl = document.querySelector('header');
  document.documentElement.style.setProperty('--header-h', headerEl.offsetHeight + 'px');
  updateHUD();
  document.getElementById('open-park-btn').addEventListener('click', openPark);
  document.getElementById('next-round-btn').addEventListener('click', advanceRound);
  document.getElementById('modal-close-btn').addEventListener('click', hideRoundSummary);
  PLStatement.init();
  BalanceSheet.init();
  CashFlow.init();
  TaxForm.init();
  Concessions.init();
  Incidents.init();
  Staff.initPanel();
  initInventoryPanel();
  Charts.initModal();
  initPanelBtns();
  initViewModeBar();
  initCbarTabs();
  updateLockedPanels();
  Animations.init();
  Scenario.init();
}

function canOpenPark() {
  const hasEntrance     = installedFacilities.some(f => f.facilityId === FACILITY_ID.PARK_ENTRANCE && f.status === STATUS.ACTIVE);
  const hasConnectedRide = installedRides.some(r => r.status === STATUS.ACTIVE && isRideConnected(r));
  return hasEntrance && hasConnectedRide;
}

function openPark() {
  if (!canOpenPark()) return;
  gameStage = STAGE.PLAY;
  // Clear setup candidates — normal posting-based hiring takes over from here.
  Staff.candidates = Staff.candidates.filter(c => !c.isSetupCandidate);
  Staff.purgeLockedRoles();
  Staff.buildCandidatesView();
  Population.populationEvents.push({ modifier: 50, comment: "Everyone is excited for the grand opening!" });
  document.getElementById('open-park-btn').classList.add('hidden');
  document.getElementById('next-round-btn').classList.remove('hidden');
  updateHUD();
  // Build initial paths and start spawning visitors (view mode defaults to play).
  setTimeout(() => {
    Animations.buildPaths();
    if (currentViewMode === 'play') Animations.startSpawning();
  }, 100);
  console.log('Park is now open — simulation started.');
}

function advanceRound() {
  // Budget gate: block advance on the last round of a quarter until the next
  // quarter's budget has been submitted in the Finance menu.
  if (FinanceMenu._isGateActive()) return;
  round++;
  Scenario.tick(round);
  // Reset per-round tax tracker before any finance processing so History always
  // sees a fresh value even on rounds where no payment is made.
  TaxForm._taxPaidThisRound = 0;
  Concessions.onRoundAdvance();
  // Tick incidents before processRound so computed properties (demandMultiplier,
  // inflationOverride, etc.) are current when this round's revenue is calculated.
  if (gameStage === STAGE.PLAY) Incidents.tick();
  if (gameStage === STAGE.PLAY) growTrees();
  const report     = Finance.processRound();
  const loanResult = Banking.processPendingLoan();
  Banking.processPendingLoc();
  // Collect tax payment on the due round so History captures it alongside this
  // round's other cash movements.
  if (TaxForm.taxDueRound > 0 && round === TaxForm.taxDueRound) {
    money -= TaxForm.taxOwed;
    TaxForm._taxPaidThisRound = TaxForm.taxOwed;
    const msg = money >= 0
      ? `Income tax payment of $${TaxForm.taxOwed.toLocaleString()} processed.`
      : `Income tax of $${TaxForm.taxOwed.toLocaleString()} paid — account overdrawn.`;
    Notifications.push({ label: 'Taxes', message: msg, action: () => openPanel('finance-menu') });
    TaxForm.taxOwed     = 0;
    TaxForm.taxDueRound = 0;
  }
  // Auto-send survey if active and no survey already pending this round.
  if (Survey.autoActive && !Survey.pendingSend) Survey.run(_surveyBatchSize, _surveyIncentive);
  Survey.processPendingSend();
  History.record(report);
  refreshDirtOverlay();
  Research.tickResearch();
  Unlock.tick();
  _tickDemographicConfidence(report.weeklyAttendance);
  if (round % 13 === 1 && round > 1) Awards.checkQuarterly();
  // Schedule the P&L exercise to appear after this round's summary closes.
  if (round % 13 === 0) PLStatement.pending = true;
  // On the last round of a quarter, push a budget reminder if the next quarter's
  // budget hasn't been submitted yet, and lock the Next Round button.
  if (round % 13 === 0) {
    const nextQ = Math.ceil(round / 13) + 1;
    if (!FinanceMenu._budgets[nextQ]) {
      Notifications.push({
        label:   'Budget Due',
        message: `Submit the ${FinanceMenu._calendarLabel(nextQ)} budget in the Finance menu before advancing.`,
        action:  () => openPanel('finance-menu'),
      });
    }
  }
  // Schedule the annual balance sheet and cash flow statement to chain after the P&L at year-end.
  if (round % 52 === 0) BalanceSheet.pending = true;
  if (round % 52 === 0) CashFlow.pending = true;
  // Tax return opens on week 4 of each year starting year 2; covers the prior full year.
  if (round % 52 === 4 && round > 52) TaxForm.pending = true;
  // Reset charity donation YTD counters at the start of each new year.
  if (round % 52 === 1 && round > 1) Banking.resetDonationYTD();
  updateLockedPanels();
  updateHUD();
  refreshRidesPanel();
  Staff.refreshPanel();
  Security.refreshPanel();
  Research.refreshPanel();
  Awards.refreshPanel();
  if (activePanel === 'banking') buildBankingPanel();
  if (activePanel === 'survey')          Survey.buildPanel();
  if (activePanel === 'visitor-profile') VisitorProfile.buildPanel();
  if (activePanel === 'concessions')     Concessions.buildPanel();
  FinanceMenu.refreshBudgetGate();
  showRoundSummary(report);
  nextWeekForecast   = futurecastForecast;
  futurecastForecast = forecastForRound(round + 2);
  // Rebuild animation paths after the grid settles; skipped in setup stage.
  if (gameStage === STAGE.PLAY) setTimeout(() => Animations.buildPaths(), 100);
}

// Tick demographic confidence for every active data-collection source.
// HOUSEHOLD is always collected at the gate; DISTANCE requires the
// license-plate research and a guard assigned to parking observation.
function _tickDemographicConfidence(weeklyAttendance) {
  if (weeklyAttendance <= 0) return;
  Population.tickConfidence('HOUSEHOLD', weeklyAttendance);
  const hasParkingObs = Research.completed.has(RESEARCH_ID.LICENSE_PLATE_MONITORING) &&
    Staff.roster.some(s => s.jobId === JOB.SECURITY && s.focus === SECURITY_FOCUS.PARKING_OBS && s.weeksOut === 0);
  if (hasParkingObs) Population.tickConfidence('DISTANCE', weeklyAttendance);
}

function showRoundSummary(report) {
  const net = report.totalIncome - report.totalExpenses;
  document.getElementById('summary-date').textContent        = getDateLabel();
  document.getElementById('summary-attendance').textContent  = report.weeklyAttendance.toLocaleString();
  document.getElementById('summary-income').textContent         = `$${report.gateRevenue.toLocaleString()}`;

  // Parking row is only meaningful after the research is unlocked.
  const parkingRowEl = document.getElementById('summary-parking-row');
  if (parkingRowEl) parkingRowEl.classList.toggle('hidden', !Research.completed.has(RESEARCH_ID.PARKING_FEES));
  document.getElementById('summary-parking-income').textContent = `$${report.parkingRevenue.toLocaleString()}`;

  // Alt-transport row: show when parking is unlocked and at least one visitor used alternative transport.
  const altRowEl = document.getElementById('summary-alt-transport-row');
  if (altRowEl) {
    const showAlt = Research.completed.has(RESEARCH_ID.PARKING_FEES) && report.altTransportVisitors > 0;
    altRowEl.classList.toggle('hidden', !showAlt);
    document.getElementById('summary-alt-transport').textContent = report.altTransportVisitors.toLocaleString();
  }

  document.getElementById('summary-shop-income').textContent    = `$${report.shopRevenue.toLocaleString()}`;
  document.getElementById('summary-expenses').textContent    = `$${(report.staffCosts + report.utilityCosts + report.constructionCosts).toLocaleString()}`;

  const netEl = document.getElementById('summary-net');
  netEl.textContent = (net >= 0 ? '+' : '\u2212') + `$${Math.abs(net).toLocaleString()}`;
  netEl.className   = net >= 0 ? 'summary-pos' : 'summary-neg';

  const eventsEl = document.getElementById('summary-events');
  const incidentFlavor = Incidents.currentFlavor();
  const allEvents = [
    ...(incidentFlavor ? [{ comment: incidentFlavor, isIncident: true }] : []),
    ...report.populationEvents,
  ];
  if (allEvents.length > 0) {
    eventsEl.innerHTML = allEvents.map(e => {
      if (e.isIncident) {
        // Strip leading emoji for the newspaper headline body.
        const bodyText = e.comment.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '').trim();
        const inc = Incidents.active;
        const headline = inc ? `${inc.def.name}: ${inc.def.phases[inc.phaseIndex].name}` : 'Breaking News';
        return `<div class="modal-event modal-event--incident">
          <div class="modal-incident-masthead">★ The Daily Coaster ★</div>
          <div class="modal-incident-rule"></div>
          <div class="modal-incident-headline">${headline.toUpperCase()}</div>
          <p class="modal-incident-body">${bodyText}</p>
        </div>`;
      }
      return `<div class="modal-event">${e.comment}</div>`;
    }).join('');
    eventsEl.classList.remove('hidden');
  } else {
    eventsEl.classList.add('hidden');
  }

  document.getElementById('round-modal').classList.remove('hidden');
}

function hideRoundSummary() {
  document.getElementById('round-modal').classList.add('hidden');
  // P&L → Balance Sheet → Cash Flow → Tax Return.
  // P&L chains to Balance Sheet; Balance Sheet chains to Cash Flow at year-end.
  if (PLStatement.pending)      PLStatement.show();
  else if (BalanceSheet.pending)  BalanceSheet.show();
  else if (CashFlow.pending)      CashFlow.show();
  else if (TaxForm.pending)       TaxForm.show();
}

// Converts the current round into "Week W, QN, YYYY".
// Weeks 1–13 = Q1, 14–26 = Q2, 27–39 = Q3, 40–52 = Q4.
function getDateLabel() {
  const weekOfYear    = STARTING_WEEK_OF_YEAR + round - 1;
  const yearsElapsed  = Math.floor((weekOfYear - 1) / 52);
  const weekInYear    = ((weekOfYear - 1) % 52) + 1;
  const quarter       = Math.ceil(weekInYear / 13);
  const weekInQuarter = weekInYear - (quarter - 1) * 13;
  return `Week ${weekInQuarter}, Q${quarter}, ${STARTING_YEAR + yearsElapsed}`;
}

// Renders floating countdown pills for in-progress items (research, construction).
// Shows one pill per active countdown; no pill when nothing is in progress.
function updateAchievementIndicators() {
  const container = document.getElementById('achievement-indicators');
  const pills = [];

  if (Research.activeId) {
    const item = Research.items.find(i => i.id === Research.activeId);
    if (item) {
      const wks = Research._weeksRemaining(item);
      const wksLabel = wks === Infinity
        ? 'No researchers'
        : `${wks} wk${wks !== 1 ? 's' : ''}`;
      const spent = Research.progress[item.id] || 0;
      pills.push({ icon: '🔬', text: `${item.name}: ${wksLabel}`, panel: 'research', pct: item.cost > 0 ? spent / item.cost : 0 });
    }
  }

  // Show a pill when a loan is in the final review stage (cash incoming).
  const loan = Banking.loanApplication;
  if (loan?.status === LOAN_STATUS.REVIEW) {
    const wks = loan.reviewWeeksRemaining;
    const wksLabel = `${wks} wk${wks !== 1 ? 's' : ''}`;
    pills.push({ icon: '💰', text: `Loan ($${loan.amount.toLocaleString()}): ${wksLabel}`, panel: 'banking' });
  }

  // Show a tax due countdown pill once the return is filed until payment is collected.
  if (TaxForm.taxOwed > 0 && TaxForm.taxDueRound > round) {
    const wks = TaxForm.taxDueRound - round;
    pills.push({ icon: '🧾', text: `$${TaxForm.taxOwed.toLocaleString()} taxes due: ${wks} wk${wks !== 1 ? 's' : ''}`, panel: 'finance-menu' });
  }

  container.innerHTML = pills
    .map(p => {
      let ringHtml = '';
      if (p.pct != null) {
        const r   = 6;
        const circ = 2 * Math.PI * r;
        const offset = circ * (1 - Math.min(1, Math.max(0, p.pct)));
        ringHtml = `<svg class="pill-ring" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r="${r}" fill="none" stroke="rgba(59,130,246,0.25)" stroke-width="2.5"/>
          <circle cx="9" cy="9" r="${r}" fill="none" stroke="#60a5fa" stroke-width="2.5"
            stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
            transform="rotate(-90 9 9)" stroke-linecap="round"/>
        </svg>`;
      }
      return `<button class="achievement-pill" data-panel="${p.panel}">${ringHtml}${p.icon} ${p.text}</button>`;
    })
    .join('');

  container.querySelectorAll('.achievement-pill').forEach(btn => {
    btn.addEventListener('click', () => openPanel(btn.dataset.panel));
  });

  updateConstructionSlot();
}

// Updates the #construction-slot banner for the ride closest to completion.
// Hidden when no rides are under construction; mirrors the incident slot pattern.
function updateConstructionSlot() {
  const slot = document.getElementById('construction-slot');
  if (!slot) return;

  const building = installedRides
    .filter(r => r.status === STATUS.UNDER_CONSTRUCTION)
    .map(r => ({ record: r, weeksLeft: r.weeksTotal - r.weeksCompleted }))
    .sort((a, b) => a.weeksLeft - b.weeksLeft)[0];

  if (!building) {
    slot.classList.add('hidden');
    return;
  }

  const { record, weeksLeft } = building;
  const { label } = getConstructionPhase(record);
  slot.classList.remove('hidden');
  slot.innerHTML = `
    <div class="con-slot-label">Under Construction</div>
    <div class="con-slot-title">
      <span>🏗️</span>
      <span>${record.name}</span>
    </div>
    <div class="con-slot-subtitle">${label} &bull; ${weeksLeft} wk${weeksLeft !== 1 ? 's' : ''} left</div>
  `;
  slot.onclick = () => openConstructionModal(record);
}

// Opens the construction site-report modal for the given ride record.
function openConstructionModal(record) {
  const modal = document.getElementById('construction-modal');
  const body  = document.getElementById('construction-modal-body');
  if (!modal || !body) return;

  const { phase, label, pct } = getConstructionPhase(record);
  const weeksLeft = record.weeksTotal - record.weeksCompleted;

  const PHASE_FLAVOR = {
    foundation: 'Excavators and groundwork crews have broken ground. The footprint is being prepared with foundations, drainage, and underground utilities. Expect dust and debris on adjacent paths while this phase is underway.',
    framework:  'The structural skeleton is rising. Steel and timber frames are taking shape above the treeline, giving curious visitors their first real glimpse of what\'s coming. Construction noise is at its peak.',
    completion: 'Finishing crews are working through the site — paint, lighting rigs, signage, seat assemblies, and safety restraint systems. The ride looks increasingly like the renders. It\'s almost time.',
    test_runs:  'The machinery is live. The ride is cycling with sandbag passengers while engineers make final calibrations and safety checks. Visitors are already gathering at the fence to watch.',
  };

  const PHASE_EFFECTS = {
    foundation: 'Generates extra debris mess on adjacent path tiles while this phase lasts.',
    framework:  null,
    completion: null,
    test_runs:  '+4% visitor demand from curious onlookers gathering at the fence.',
  };

  const r    = 15;
  const circ = +(2 * Math.PI * r).toFixed(2);
  const off  = +(circ * (1 - Math.min(1, pct))).toFixed(2);
  const ringHtml = `<svg class="con-modal-ring-svg" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="${r}" fill="none" stroke="rgba(245,158,11,0.2)" stroke-width="3.5"/>
    <circle cx="24" cy="24" r="${r}" fill="none" stroke="#f59e0b" stroke-width="3.5"
      stroke-dasharray="${circ}" stroke-dashoffset="${off}"
      transform="rotate(-90 24 24)" stroke-linecap="round"/>
    <text x="24" y="28" text-anchor="middle" fill="#fbbf24" font-size="9" font-family="monospace" font-weight="bold">${Math.round(pct * 100)}%</text>
  </svg>`;

  const effectHtml = PHASE_EFFECTS[phase]
    ? `<div class="con-modal-effect"><span class="con-modal-effect-icon">⚠</span>${PHASE_EFFECTS[phase]}</div>`
    : '';

  body.innerHTML = `
    <div class="con-modal-header">
      <div class="con-modal-ring">${ringHtml}</div>
      <div class="con-modal-header-text">
        <div class="con-modal-ride-name">${record.name}</div>
        <div class="con-modal-phase-badge con-phase-${phase}">${label}</div>
        <div class="con-modal-countdown">${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} remaining</div>
      </div>
    </div>
    <div class="modal-divider"></div>
    <div class="con-modal-flavor">${PHASE_FLAVOR[phase]}</div>
    ${effectHtml}
  `;

  modal.classList.remove('hidden');

  const btn = document.getElementById('construction-modal-close');
  const close = () => {
    modal.classList.add('hidden');
    btn?.removeEventListener('click', close);
    modal.removeEventListener('click', onOverlay);
  };
  const onOverlay = e => { if (e.target === modal) close(); };
  btn?.addEventListener('click', close);
  modal.addEventListener('click', onOverlay);
}

function updateHUD() {
  document.getElementById('money-display').textContent = `$${money.toLocaleString()}`;
  document.getElementById('date-display').textContent  = getDateLabel();

  const working = Staff.roster.filter(s => s.weeksOut === 0).length;
  const onLeave = Staff.roster.filter(s => s.weeksOut > 0).length;
  document.getElementById('staff-working-display').textContent = working;
  document.getElementById('staff-leave-display').textContent   = onLeave;

  const running = installedRides.filter(r => r.status === STATUS.ACTIVE).length;
  const stopped = installedRides.filter(r => r.status !== STATUS.ACTIVE).length;
  document.getElementById('rides-running-display').textContent = running;
  document.getElementById('rides-stopped-display').textContent = stopped;
  document.getElementById('forecast-next-week').textContent = nextWeekForecast;
  document.getElementById('forecast-future').textContent    = futurecastForecast;
  const badge = document.getElementById('stage-badge');
  badge.textContent = gameStage === STAGE.SETUP ? 'Setup' : 'Open';
  badge.className   = `stage-badge ${gameStage}`;

  if (gameStage === STAGE.SETUP) {
    const openBtn = document.getElementById('open-park-btn');
    const ready   = canOpenPark();
    openBtn.disabled = !ready;
    const hasEntrance = installedFacilities.some(f => f.facilityId === FACILITY_ID.PARK_ENTRANCE && f.status === STATUS.ACTIVE);
    openBtn.title = ready            ? ''
      : !hasEntrance                 ? 'Place a Park Entrance first'
      : 'Connect at least one ride to a path';
  }
  updateAchievementIndicators();
}

// ── Panel management ───────────────────────────────────────────────────────
function initPanelBtns() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => togglePanel(btn.dataset.panel));
  });
}

function updateLockedPanels() {
  const benefitsUnlocked = Research.completed.has(RESEARCH_ID.EMPLOYEE_BENEFITS);
  const benefitsBtn = document.querySelector('.staff-action-btn[data-view="benefits"]');
  if (benefitsBtn) {
    benefitsBtn.classList.toggle('hidden', !benefitsUnlocked);
    if (!benefitsUnlocked && Staff._activeView === 'benefits') Staff.setView('roster');
  }

  const demolishModeBtn = document.querySelector('.view-mode-btn[data-view-mode="demolish"]');
  if (demolishModeBtn) {
    const demolishLocked = Banking.hasActiveCovenant('NO_DEMOLISH');
    demolishModeBtn.disabled = demolishLocked;
    demolishModeBtn.title    = demolishLocked ? 'Locked by loan covenant' : '';
  }

  document.getElementById('weather-panel').classList.toggle('hidden', !Research.completed.has(RESEARCH_ID.WEATHER_SENSOR));
  document.getElementById('forecast-future-count').classList.toggle('hidden', !Research.completed.has(RESEARCH_ID.WEATHER_STATION));

  const staffingNavBtn = document.querySelector('.tool-btn[data-panel="staffing"]');
  if (staffingNavBtn) staffingNavBtn.classList.toggle('hidden', !Unlock.STAFFING);

  const inventoryNavBtn = document.querySelector('.tool-btn[data-panel="inventory"]');
  if (inventoryNavBtn) inventoryNavBtn.classList.toggle('hidden', !Unlock.MERCHANDISE);

  const shoppingTabBtn = document.querySelector('.cbar-tab-btn[data-cbar-tab="shopping"]');
  if (shoppingTabBtn) {
    const hideShoppingTab = !Unlock.FOOD && !Unlock.MERCHANDISE;
    shoppingTabBtn.classList.toggle('hidden', hideShoppingTab);
    if (hideShoppingTab && shoppingTabBtn.classList.contains('active')) {
      shoppingTabBtn.classList.remove('active');
      document.getElementById('shopping-panel').classList.add('hidden');
      const firstVisible = document.querySelector('.cbar-tab-btn:not(.hidden)');
      if (firstVisible) firstVisible.click();
    }
  }

  const securityNavBtn  = document.querySelector('.tool-btn[data-panel="security"]');
  if (securityNavBtn) securityNavBtn.classList.toggle('hidden', !Unlock.SECURITY);
  const securityModeBtn = document.querySelector('.view-mode-btn[data-view-mode="security"]');
  if (securityModeBtn) securityModeBtn.classList.toggle('hidden', !Unlock.SECURITY);

  const messModeBtn = document.querySelector('.view-mode-btn[data-view-mode="dirt"]');
  if (messModeBtn) messModeBtn.classList.toggle('hidden', !Unlock.MESSES);

  // Banking panel is hidden until the BANKING unlock is active.
  const bankingNavBtn = document.querySelector('.tool-btn[data-panel="banking"]');
  if (bankingNavBtn) bankingNavBtn.classList.toggle('hidden', !Unlock.BANKING);

  // Marketing panel is hidden until the MARKETING unlock is active.
  const marketingNavBtn = document.querySelector('.tool-btn[data-panel="marketing"]');
  if (marketingNavBtn) marketingNavBtn.classList.toggle('hidden', !Unlock.MARKETING);

  // Parking panel unlocks when the Parking Fees research is completed.
  const parkingNavBtn = document.querySelector('.tool-btn[data-panel="parking"]');
  if (parkingNavBtn) parkingNavBtn.classList.toggle('hidden', !Research.completed.has(RESEARCH_ID.PARKING_FEES));
}

function togglePanel(panelId) {
  if (activePanel === panelId) closePanels();
  else openPanel(panelId);
}

function openPanel(panelId) {
  if (activePanel && activePanel !== panelId) {
    document.getElementById(`panel-${activePanel}`).classList.add('closed');
    document.querySelector(`.tool-btn[data-panel="${activePanel}"]`)?.classList.remove('active');
    deselectItem();
  }
  activePanel = panelId;
  document.querySelector(`.tool-btn[data-panel="${panelId}"]`)?.classList.add('active');
  document.getElementById(`panel-${panelId}`).classList.remove('closed');
  if (panelId === 'rides')      buildRidesPanel();
  if (panelId === 'staffing')   Staff.openPanel();
  if (panelId === 'security')   Security.buildPanel();
  if (panelId === 'financial')  buildFinancialPanel();
  if (panelId === 'inventory')  buildInventoryPanel();
  if (panelId === 'survey')     Survey.buildPanel();
  if (panelId === 'research')        Research.buildPanel();
  if (panelId === 'awards')          Awards.buildPanel();
  if (panelId === 'marketing')       Marketing.buildPanel();
  if (panelId === 'visitor-profile') VisitorProfile.buildPanel();
  if (panelId === 'concessions')     Concessions.buildPanel();
  if (panelId === 'parking')         buildParkingPanel();
  if (panelId === 'banking')         buildBankingPanel();
  if (panelId === 'finance-menu')    FinanceMenu.buildPanel();
}

function closePanels() {
  if (!activePanel) return;
  document.getElementById(`panel-${activePanel}`).classList.add('closed');
  document.querySelector(`.tool-btn[data-panel="${activePanel}"]`)?.classList.remove('active');
  activePanel = null;
  deselectItem();
}

let _selectedRideId = null;

function buildRidesPanel() {
  const record = _selectedRideId
    ? installedRides.find(r => r.instanceId === _selectedRideId)
    : null;
  if (record) buildRideDetail(record);
  else         buildRideList();
}

function buildRideList() {
  const container = document.getElementById('rides-overview');

  // Park-wide operator staffing summary shown at the top of the list.
  const parkNeeded    = Staff.rideOperatorsNeeded();
  const parkActual    = Staff.roster.filter(s => s.jobId === JOB.RIDE_OPERATOR && s.weeksOut === 0).length;
  const understaffed  = parkActual < parkNeeded;
  const staffStatusCls   = understaffed ? 'ride-staff-under' : 'ride-staff-ok';
  const staffStatusLabel = understaffed ? 'Understaffed' : 'Fully staffed';
  const summaryHtml = `
    <div class="ride-list-staff-summary">
      <span class="ride-staff-status ${staffStatusCls}">
        Ride Operators: ${parkActual}/${parkNeeded} — ${staffStatusLabel}
      </span>
    </div>`;

  if (installedRides.length === 0) {
    container.innerHTML = summaryHtml + '<p class="empty-note">No rides placed yet.</p>';
    return;
  }
  const rows = installedRides.map(record => {
    const { label, cls } = getRideCondition(record);
    return `<div class="ride-list-row" data-id="${record.instanceId}">
      <span class="ride-list-name">${record.name}</span>
      <span class="cond-badge ${cls}">${label}</span>
    </div>`;
  }).join('');
  container.innerHTML = summaryHtml + `<div class="ride-list">${rows}</div>`;
  container.querySelectorAll('.ride-list-row').forEach(row =>
    row.addEventListener('click', () => {
      _selectedRideId = row.dataset.id;
      buildRidesPanel();
    })
  );
}

function buildRideDetail(record) {
  const container = document.getElementById('rides-overview');
  const { label, cls } = getRideCondition(record);
  const def = rides.find(r => r.id === record.rideId);

  // Wear as a percentage of MAX_EFFECTIVE_WEAR. Hidden when wear system is locked.
  const wearPct = Unlock.WEAR ? Math.min(100, Math.round((record.wear ?? 0) / MAX_EFFECTIVE_WEAR * 100)) : null;

  // Per-ride operator requirement.
  const rideNeeds = Staff.operatorsNeededForRide(record);
  const staffHtml = `
    <div class="ride-staff">
      <div class="ride-staff-needs">Needs ${rideNeeds} operator${rideNeeds !== 1 ? 's' : ''}</div>
    </div>`;

  let ridership = '';
  if (record.lastRoundCapacity != null) {
    const pct = record.lastRoundCapacity > 0
      ? Math.round(record.lastRoundRiders / record.lastRoundCapacity * 100)
      : 0;
    ridership = `
      <div class="ride-ridership">
        <div class="ride-ridership-label">Last Round Ridership</div>
        <div class="ride-ridership-bar-wrap">
          <div class="ride-ridership-bar" style="width:${pct}%"></div>
        </div>
        <div class="ride-ridership-nums">
          ${record.lastRoundRiders.toLocaleString()} / ${record.lastRoundCapacity.toLocaleString()} riders (${pct}%)
        </div>
      </div>`;
  }

  let actionsHtml = '';
  if (record.status === STATUS.UNDER_CONSTRUCTION) {
    const weeksLeft = record.weeksTotal - record.weeksCompleted;
    actionsHtml = `
      <p class="ride-detail-weeks">${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} remaining</p>
      <button class="ride-action-btn" id="rdx-pause">Pause Construction</button>`;
  } else if (record.status === STATUS.PAUSED_CONSTRUCTION) {
    const weeksLeft = record.weeksTotal - record.weeksCompleted;
    actionsHtml = `
      <p class="ride-detail-weeks">${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} remaining</p>
      <button class="ride-action-btn ride-action-resume" id="rdx-resume">Resume Construction</button>`;
  } else if (record.status === STATUS.ACTIVE) {
    actionsHtml = `<button class="ride-action-btn ride-action-danger" id="rdx-close">Close Ride</button>`;
  } else if (record.status === STATUS.CLOSED) {
    actionsHtml = `<button class="ride-action-btn ride-action-resume" id="rdx-reopen">Re-open Ride</button>`;
  } else if (record.status === STATUS.BROKEN_DOWN) {
    const wtr = record.weeksToRepair ?? 0;
    const repairMsg = wtr > 0
      ? `${wtr} week${wtr !== 1 ? 's' : ''} to repair`
      : 'assign an Engineer to begin repairs';
    actionsHtml = `<p class="ride-detail-weeks">Broken down — ${repairMsg}.</p>`;
  }

  container.innerHTML = `
    <div class="ride-detail">
      <button class="ride-back-btn" id="rdx-back">← Rides</button>
      <div class="ride-detail-name">${record.name}</div>
      <span class="cond-badge ${cls}">${label}</span>
      <div class="ride-utility-cost">Utility: $${(def?.utilityCost ?? 0).toLocaleString()}/wk</div>
      ${wearPct !== null ? `<div class="ride-wear">Wear: ${wearPct}%</div>` : ''}
      ${staffHtml}
      ${ridership}
      <div class="ride-detail-actions">${actionsHtml}</div>
    </div>`;

  document.getElementById('rdx-back').addEventListener('click', () => {
    _selectedRideId = null;
    buildRideList();
  });
  document.getElementById('rdx-pause')?.addEventListener('click',  () => { pauseRideConstruction(record.instanceId);  buildRideDetail(record); });
  document.getElementById('rdx-resume')?.addEventListener('click', () => { resumeRideConstruction(record.instanceId); buildRideDetail(record); });
  document.getElementById('rdx-close')?.addEventListener('click',  () => { closeRide(record.instanceId);              buildRideDetail(record); });
  document.getElementById('rdx-reopen')?.addEventListener('click', () => { reopenRide(record.instanceId);             buildRideDetail(record); });
}

function getRideCondition(record) {
  switch (record.status) {
    case STATUS.UNDER_CONSTRUCTION:  return { label: 'Under Construction', cls: 'cond-building'     };
    case STATUS.PAUSED_CONSTRUCTION: return { label: 'Paused',             cls: 'cond-paused'       };
    case STATUS.CLOSED:              return { label: 'Closed',             cls: 'cond-closed'       };
    case STATUS.BROKEN_DOWN:         return { label: 'Broken Down',        cls: 'cond-broken'       };
    case STATUS.DEMOLISHING:         return { label: 'Demolishing',        cls: 'cond-demolishing'  };
    case STATUS.ACTIVE:
      return isRideConnected(record)
        ? { label: 'Running',     cls: 'cond-running'     }
        : { label: 'Unconnected', cls: 'cond-unconnected' };
    default: return { label: record.status, cls: '' };
  }
}

function refreshRidesPanel() {
  if (activePanel === 'rides') buildRidesPanel();
}

// ── Financial panel ────────────────────────────────────────────────────────
const PRICE_ITEMS = [
  {
    key:       'gate',
    label:     'Regular Admission',
    unit:      '$/visitor',
    getValue:  () => Finance.gatePrice,
    setValue:  v => {
      Finance.gatePrice = v;
    },
  },
];

let _activeInvTab = 'stock';

/* Active banking sub-tab: 'investment' (savings + money market) or 'debt' (LoC + loans). */
let _activeBankingTab = 'investment';

// Human-readable labels for each merchandise category, used across inventory panel functions.
const MERCH_CATEGORY_LABELS = { toy: 'Toys', practical: 'Practical', apparel: 'Apparel', souvenir: 'Souvenirs' };

/* initInventoryPanel - wire up Stock / Purchasing tab switching */
function initInventoryPanel() {
  document.querySelectorAll('.inv-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeInvTab = btn.dataset.invTab;
      document.querySelectorAll('.inv-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('inv-stock-view').classList.toggle('hidden',      _activeInvTab !== 'stock');
      document.getElementById('inv-purchasing-view').classList.toggle('hidden', _activeInvTab !== 'purchasing');
      buildInventoryPanel();
    });
  });
}

/* buildInventoryPanel - dispatch to the active tab renderer */
function buildInventoryPanel() {
  if (_activeInvTab === 'stock')      _buildInvStockView();
  if (_activeInvTab === 'purchasing') _buildInvPurchasingView();
}

/* _buildInvStockView - read-only display of unlocked items: stock, sell price, last-week sales */
function _buildInvStockView() {
  const totalStock    = Shopping.merchandiseInventory.reduce((s, inv) => s + inv.count, 0);
  const capacity      = Shopping.calcInventoryCapacity();
  const pct           = capacity > 0 ? Math.min(100, Math.round(totalStock / capacity * 100)) : 0;
  const capacityLabel = capacity > 0 ? `${totalStock.toLocaleString()} / ${capacity.toLocaleString()}` : 'No shops open';

  const itemRows = ['toy', 'practical', 'apparel', 'souvenir'].map(cat => {
    const items = Shopping.merchandise
      .map((item, i) => ({ item, inv: Shopping.merchandiseInventory[i], stats: Shopping._roundItemStats[i] ?? { salesCount: 0, salesRevenue: 0 }, idx: i }))
      .filter(({ item }) => item.category === cat && Shopping.unlockedMerchandiseIds.has(item.id));
    const rows = items.map(({ item, inv, stats }) => {
      const shelfPrice = inv.price + Shopping.merchandiseUpcharge;
      const sold    = stats.salesCount;
      const revenue = stats.salesRevenue;
      return `<div class="inv-stock-row">
        <div class="inv-stock-main">
          <span class="inv-stock-name">${item.name}</span>
          <span class="inv-stock-count">${inv.count.toLocaleString()} in stock</span>
        </div>
        <div class="inv-stock-meta">
          <span class="inv-stock-price">$${shelfPrice} sell</span>
          <span class="inv-stock-sales">${sold > 0 ? `${sold} sold last week ($${revenue.toLocaleString()})` : 'No sales last week'}</span>
        </div>
      </div>`;
    }).join('');
    return `<div class="panel-section-header">${MERCH_CATEGORY_LABELS[cat]}</div>${rows}`;
  }).join('');

  const upcharge = Shopping.merchandiseUpcharge;

  const el = document.getElementById('inv-stock-view');
  el.innerHTML = `
    <div class="inv-capacity-wrap">
      <div class="inv-capacity-label">Storage: ${capacityLabel}</div>
      <div class="ride-ridership-bar-wrap">
        <div class="ride-ridership-bar" style="width:${pct}%"></div>
      </div>
      <div class="inv-capacity-pct">${pct}%</div>
    </div>
    <div class="financial-section">
      <div class="price-row">
        <div class="price-label">Merchandise Upcharge</div>
        <div class="price-unit">$/buyer</div>
        <div class="price-controls">
          <span class="price-current" id="merch-upcharge-current">$${upcharge}</span>
          <input class="price-input" id="merch-upcharge-input" type="number" min="0" value="${upcharge}">
          <button class="price-apply-btn" id="merch-upcharge-apply">Apply</button>
        </div>
      </div>
    </div>
    ${itemRows}`;

  document.getElementById('merch-upcharge-apply').addEventListener('click', () => {
    const v = Math.max(0, parseInt(document.getElementById('merch-upcharge-input').value) || 0);
    Shopping.merchandiseUpcharge = v;
    document.getElementById('merch-upcharge-current').textContent = `$${v}`;
    document.getElementById('merch-upcharge-input').value = v;
  });
}

/* _buildInvPurchasingView - per-category supplier selector and order interface */
function _buildInvPurchasingView() {
  const hasBulk = Research.completed.has(RESEARCH_ID.BULK_ORDERING);

  const catSections = ['toy', 'practical', 'apparel', 'souvenir'].map(cat => {
    const catSuppliers = Shopping.suppliers.filter(s => s.category === cat);
    const selectedId   = Shopping.selectedSupplierByCategory[cat];
    const supplier     = Shopping.suppliers.find(s => s.id === selectedId);

    // Supplier selector — three pill buttons per category.
    const selectorBtns = catSuppliers.map(s => {
      const unlocked    = Shopping.unlockedSupplierIds.has(s.id);
      const isSelected  = s.id === selectedId;
      return `<button class="inv-supplier-btn${isSelected ? ' active' : ''}${!unlocked ? ' locked' : ''}"
        ${unlocked && !isSelected ? `data-select-supplier="${s.id}" data-category="${cat}"` : ''}
        ${!unlocked ? 'disabled' : ''}
      >${unlocked ? s.name : '???'}</button>`;
    }).join('');

    // Progress bar toward unlocking the next supplier in this category (order-count gated).
    let nextSupplierHtml = '';
    const nextSupplier = catSuppliers.find(s => !Shopping.unlockedSupplierIds.has(s.id));
    if (nextSupplier) {
      const catOrders = Shopping.categoryOrderCount[cat] ?? 0;
      const threshold = nextSupplier.categoryOrderThreshold;
      const remaining = Math.max(0, threshold - catOrders);
      const pct       = Math.min(100, Math.round(catOrders / threshold * 100));
      nextSupplierHtml = `<div class="inv-next-supplier">
        <div class="inv-progress-label">Place ${remaining} more order${remaining !== 1 ? 's' : ''} in this category to unlock a new supplier</div>
        <div class="inv-unlock-bar-wrap"><div class="inv-unlock-bar" style="width:${pct}%"></div></div>
      </div>`;
    }

    // Item rows — unlocked items get buy buttons; locked items show unlock progress.
    const catItems = Shopping.merchandise
      .map((item, i) => ({ item, inv: Shopping.merchandiseInventory[i], idx: i }))
      .filter(({ item }) => item.category === cat);

    const itemsHtml = catItems.map(({ item, inv, idx }) => {
      if (!Shopping.unlockedMerchandiseIds.has(item.id)) {
        // Show spend progress toward unlocking this item based on total category spend.
        let unlockHint = '';
        if (item.spendThreshold) {
          const spent     = Shopping.categoryOrderSpend[cat] ?? 0;
          const remaining = Math.max(0, item.spendThreshold - spent);
          const pct       = Math.min(100, Math.round(spent / item.spendThreshold * 100));
          unlockHint = `<div class="inv-unlock-hint">Spend $${remaining.toLocaleString()} more on ${MERCH_CATEGORY_LABELS[cat].toLowerCase()} items to unlock</div>
            <div class="inv-unlock-bar-wrap"><div class="inv-unlock-bar" style="width:${pct}%"></div></div>`;
        }
        return `<div class="inv-purchase-item inv-purchase-locked">
          <div class="inv-purchase-item-name">${item.name} <span class="inv-locked-tag">Locked</span></div>
          ${unlockHint}
        </div>`;
      }

      // Unlocked — show buy buttons or pending order status.
      const pendingOrder = Shopping.orders.find(o => o.itemIndex === idx);
      let buyHtml;
      if (pendingOrder) {
        buyHtml = `<span class="inv-order-pending">Order pending: ${pendingOrder.count} units (${pendingOrder.weeksRemaining}w)</span>`;
      } else {
        buyHtml = [100, 500, 1000].map(qty => {
          if (qty === 1000 && !hasBulk) {
            return `<button class="inv-order-btn inv-order-locked" disabled title="Requires Bulk Ordering research">+1000 🔒</button>`;
          }
          const cost      = Math.round(qty * inv.price * Population.cumulativeInflation + (supplier?.surcharge ?? 0));
          const canAfford = money >= cost;
          return `<button class="inv-order-btn${canAfford ? '' : ' cant-afford'}"
            data-idx="${idx}" data-qty="${qty}" data-supplier="${selectedId}" data-category="${cat}"
          >+${qty} $${cost.toLocaleString()}</button>`;
        }).join('');
      }
      return `<div class="inv-purchase-item">
        <div class="inv-purchase-item-name">${item.name}</div>
        <div class="inv-purchase-item-stock">In stock: ${inv.count.toLocaleString()}</div>
        <div class="inv-order-btns">${buyHtml}</div>
      </div>`;
    }).join('');

    const surchargeStr = supplier?.surcharge > 0 ? ` · +$${supplier.surcharge} surcharge` : '';
    const supplierInfo = supplier
      ? `<div class="inv-supplier-info">${supplier.name} · ${supplier.deliveryTime}w delivery${surchargeStr}</div>`
      : '';

    return `<div class="inv-cat-section">
      <div class="panel-section-header">${MERCH_CATEGORY_LABELS[cat]}</div>
      <div class="inv-supplier-selector">${selectorBtns}</div>
      ${supplierInfo}
      ${nextSupplierHtml}
      <div class="inv-purchase-items">${itemsHtml}</div>
    </div>`;
  }).join('');

  const el = document.getElementById('inv-purchasing-view');
  el.innerHTML = catSections;

  // Supplier selector clicks — switch active supplier for that category.
  el.querySelectorAll('.inv-supplier-btn[data-select-supplier]').forEach(btn => {
    btn.addEventListener('click', () => {
      Shopping.selectedSupplierByCategory[btn.dataset.category] = btn.dataset.selectSupplier;
      _buildInvPurchasingView();
    });
  });

  // Order button clicks — place order, track spend, check unlocks.
  el.querySelectorAll('.inv-order-btn:not(.inv-order-locked):not(.cant-afford)').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx        = Number(btn.dataset.idx);
      const qty        = Number(btn.dataset.qty);
      const supplierId = btn.dataset.supplier;
      const cat        = btn.dataset.category;
      const sup        = Shopping.suppliers.find(s => s.id === supplierId);
      const cost       = Math.round(qty * Shopping.merchandiseInventory[idx].price * Population.cumulativeInflation + (sup?.surcharge ?? 0));
      if (money < cost) return;

      money -= cost;
      Finance.roundMerchandiseCosts += cost;
      Shopping.categoryOrderSpend[cat] = (Shopping.categoryOrderSpend[cat] ?? 0) + cost;
      Shopping.categoryOrderCount[cat] = (Shopping.categoryOrderCount[cat] ?? 0) + 1;
      Shopping.orders.push({ itemIndex: idx, itemName: Shopping.merchandise[idx].name, count: qty, weeksRemaining: sup?.deliveryTime ?? 1 });

      // Check all locked items in this category — unlock any whose spend threshold is now met.
      for (const m of Shopping.merchandise.filter(m => m.category === cat && m.spendThreshold)) {
        if (!Shopping.unlockedMerchandiseIds.has(m.id)
            && Shopping.categoryOrderSpend[cat] >= m.spendThreshold) {
          Shopping.unlockedMerchandiseIds.add(m.id);
          Notifications.push({
            label:   'New Item Unlocked',
            message: `${m.name} is now available to order.`,
            action:  () => { _activeInvTab = 'purchasing'; openPanel('inventory'); },
          });
        }
      }

      // Check if any next-tier supplier in this category is now unlocked (order-count gated).
      for (const s of Shopping.suppliers.filter(s => s.category === cat)) {
        if (s.categoryOrderThreshold != null && !Shopping.unlockedSupplierIds.has(s.id)
            && Shopping.categoryOrderCount[cat] >= s.categoryOrderThreshold) {
          Shopping.unlockedSupplierIds.add(s.id);
          Notifications.push({
            label:   'New Supplier',
            message: `${s.name} is now available for ${MERCH_CATEGORY_LABELS[cat]} orders.`,
            action:  () => { _activeInvTab = 'purchasing'; openPanel('inventory'); },
          });
        }
      }

      updateHUD();
      _buildInvPurchasingView();
    });
  });
}

// ── Parking panel ──────────────────────────────────────────────────────────
// Builds the parking management panel, showing price control, per-bracket
// affordability breakdown, and (if amenities research is done) one-time
// upgrade purchases. Unlocked by the Parking Fees research item.
function buildParkingPanel() {
  const body = document.getElementById('parking-panel-body');
  if (!body) return;

  const inflation  = Population.cumulativeInflation;
  const price      = Parking.parkingPrice;
  const brackets   = Population.INCOME_BRACKETS;

  // Returns the displayed max-price string for one income bracket.
  // Below 20% confidence: unknown (?). Above: stable wobble that shrinks toward
  // the true value as confidence approaches 100. sin() gives a consistent per-bracket
  // direction so the displayed value doesn't jump around on each render.
  function limitDisplay(trueLimit, i, confidence) {
    if (confidence < 20) return { text: '?', unknown: true };
    const dir    = Math.sin(i * 17 + 3);
    const wobble = dir * trueLimit * ((100 - confidence) / 100) * 0.5;
    return { text: `$${Math.max(1, Math.round(trueLimit + wobble))}`, unknown: false };
  }

  // Per-bracket status rows.
  const bracketRows = brackets.map((b, i) => {
    const limit      = Population.PARKING_PRICE_LIMITS[i] * inflation;
    const confidence = Population.confidence?.INCOME?.[i] ?? 0;
    const altRatio   = Population.PARKING_ALT_TRANSPORT_RATIO[i];
    const pricedOut  = price > limit;
    const status     = pricedOut
      ? `<span class="parking-priced-out">Priced out — ${Math.round(altRatio * 100)}% find a ride, ${Math.round((1 - altRatio) * 100)}% won't come</span>`
      : `<span class="parking-pays">Pays normally</span>`;
    const lim = limitDisplay(limit, i, confidence);
    return `
      <div class="parking-bracket-row">
        <span class="parking-bracket-name">${b.name}</span>
        <span class="parking-bracket-limit${lim.unknown ? ' parking-limit-unknown' : ''}">Max ${lim.text}</span>
        ${status}
      </div>`;
  }).join('');

  // Amenity cards — only shown once Parking Lot Amenities research is complete.
  const amenitiesUnlocked = Research.completed.has(RESEARCH_ID.PARKING_LOT_AMENITIES);
  const amenitySection = amenitiesUnlocked ? `
    <div class="parking-section">
      <div class="parking-section-title">Lot Amenities</div>
      <div class="parking-amenity-note">Each purchased amenity increases how much guests are willing to spend on parking.</div>
      ${Parking.PARKING_AMENITIES.map(a => {
        const owned = Parking.purchasedAmenities.has(a.id);
        const canAfford = money >= a.cost;
        return `
          <div class="parking-amenity-row${owned ? ' parking-amenity-owned' : ''}">
            <div class="parking-amenity-info">
              <span class="parking-amenity-label">${a.label}</span>
            </div>
            ${owned
              ? `<span class="parking-amenity-status">Installed</span>`
              : `<button class="parking-amenity-btn" data-amenity="${a.id}" ${canAfford ? '' : 'disabled'}>
                   $${a.cost.toLocaleString()}
                 </button>`}
          </div>`;
      }).join('')}
    </div>` : '';

  // Bus section — only shown once Bus Service research is complete.
  const busUnlocked = Research.completed.has(RESEARCH_ID.BUS_SERVICE);
  const busSection = busUnlocked ? `
    <div class="parking-section">
      <div class="parking-section-title">Bus Service</div>
      <div class="parking-amenity-note">
        Runs a free shuttle from distant pick-up points. Visitors who would skip the trip
        due to parking prices take the bus instead — they pay full gate admission and spend
        normally inside. Costs $${Parking.BUS_WEEKLY_COST.toLocaleString()}/week to operate.
      </div>
      <div class="parking-bus-row">
        <span class="parking-stat-label">Status</span>
        <button class="parking-bus-toggle ${Parking.busEnabled ? 'parking-bus-on' : 'parking-bus-off'}"
                id="parking-bus-toggle">
          ${Parking.busEnabled ? 'Running — click to stop' : 'Stopped — click to run'}
        </button>
      </div>
      <div class="parking-stat-row">
        <span class="parking-stat-label">Bus riders last round</span>
        <span class="parking-stat-value">${Parking.busRiders.toLocaleString()}</span>
      </div>
    </div>` : '';

  body.innerHTML = `
    <div class="parking-section">
      <div class="price-row">
        <div class="price-label">Parking Fee</div>
        <div class="price-unit">$/vehicle</div>
        <div class="price-controls">
          <span class="price-current" id="parking-price-current">$${price}</span>
          <input class="price-input" id="parking-price-input" type="number" min="0" value="${price}">
          <button class="price-apply-btn" id="parking-apply-btn">Apply</button>
        </div>
      </div>
      <div class="parking-threshold-note">
        ${Parking.knownFreeZone === null
          ? `Free zone: <span class="parking-limit-unknown">?</span> — charge a low price to find out.`
          : `Free zone: at least <strong>$${Parking.knownFreeZone}</strong> — last confirmed safe price.`}
      </div>
    </div>
    <div class="parking-section">
      <div class="parking-section-title">Visitor Affordability</div>
      ${bracketRows}
    </div>
    ${amenitySection}
    ${busSection}
    <div class="parking-section">
      <div class="parking-stat-row">
        <span class="parking-stat-label">Alt-transport visitors last round</span>
        <span class="parking-stat-value">${Parking.altTransportVisitors.toLocaleString()}</span>
      </div>
      <div class="parking-stat-row">
        <span class="parking-stat-label">Spending multiplier last round</span>
        <span class="parking-stat-value">${(Parking.parkingSpendingMultiplier * 100).toFixed(1)}%</span>
      </div>
    </div>
  `;

  document.getElementById('parking-apply-btn').addEventListener('click', () => {
    const v = parseFloat(document.getElementById('parking-price-input').value);
    if (!isNaN(v) && v >= 0) {
      Parking.parkingPrice = v;
      buildParkingPanel();
    }
  });

  body.querySelectorAll('.parking-amenity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (Parking.buyParkingAmenity(btn.dataset.amenity)) buildParkingPanel();
    });
  });

  document.getElementById('parking-bus-toggle')?.addEventListener('click', () => {
    Parking.busEnabled = !Parking.busEnabled;
    buildParkingPanel();
  });
}

/* Active tab in the Admission panel; persists across panel close/reopen. */
let _financialActiveTab = 'pricing';

/* buildFinancialPanel - renders the Admission panel with Pricing and Membership tabs */
function buildFinancialPanel() {
  document.querySelectorAll('.fin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => _switchFinancialTab(btn.dataset.finTab));
  });
  _switchFinancialTab(_financialActiveTab);
}

/* _switchFinancialTab - activates the given tab and builds its content */
function _switchFinancialTab(tab) {
  _financialActiveTab = tab;
  document.querySelectorAll('.fin-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.finTab === tab));
  document.querySelectorAll('.fin-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`fin-${tab}-view`).classList.remove('hidden');
  if (tab === 'pricing')    _buildPricingTab();
  if (tab === 'membership') Membership.buildSection();
}

/* _buildPricingTab - renders admission price controls then the discounts section below */
function _buildPricingTab() {
  const rows = PRICE_ITEMS.map(item => `
    <div class="price-row">
      <div class="price-label">${item.label}</div>
      <div class="price-unit">${item.unit}</div>
      <div class="price-controls">
        <span class="price-current" id="price-current-${item.key}">$${item.getValue()}</span>
        <input class="price-input" id="price-input-${item.key}"
               type="number" min="0" value="${item.getValue()}">
        <button class="price-apply-btn" data-key="${item.key}">Apply</button>
      </div>
    </div>`).join('');
  document.getElementById('fin-pricing-controls').innerHTML = `
    <div class="financial-section">
      <div class="financial-section-header">Pricing Controls</div>
      <div class="price-list">${rows}</div>
    </div>`;
  document.querySelectorAll('.price-apply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item   = PRICE_ITEMS.find(p => p.key === btn.dataset.key);
      const input  = document.getElementById(`price-input-${item.key}`);
      const newVal = Math.max(0, parseInt(input.value) || 0);
      item.setValue(newVal);
      document.getElementById(`price-current-${item.key}`).textContent = `$${item.getValue()}`;
      input.value = item.getValue();
    });
  });
  Discounts.buildPanel();
}

/* buildBankingPanel - renders the Banking panel: loan application and active loan status */
function buildBankingPanel() {
  const body = document.getElementById('banking-panel-body');
  if (!body) return;

  if (!Unlock.BANKING) {
    body.innerHTML = `<div class="financial-section"><p class="empty-note">Banking services are not yet available.</p></div>`;
    return;
  }

  const app       = Banking.loanApplication;
  const appStatus = app?.status ?? null;
  const locked    = app !== null;
  const dis       = locked ? 'disabled' : '';
  const purpose   = app?.purpose ?? 'new_rides';
  const purposeOptions = [
    ['new_rides',  'New Rides'],
    ['staffing',   'Staffing'],
    ['emergency',  'Emergency'],
    ['refinance',  'Refinance'],
  ].map(([v, l]) => `<option value="${v}"${v === purpose ? ' selected' : ''}>${l}</option>`).join('');

  const loanActionHtml = appStatus === LOAN_STATUS.OPEN
    ? `<button id="loan-apply-btn">Apply For Loan</button>`
    : appStatus === LOAN_STATUS.APPLYING
    ? `<span class="loan-approaching-label">Awaiting Offer…</span>`
    : locked
    ? `<span class="loan-approaching-label">Approaching Banks…</span>`
    : `<button id="loan-approach-btn">Approach Banks</button>`;

  const favorHtml = (appStatus === LOAN_STATUS.OPEN || appStatus === LOAN_STATUS.APPLYING || appStatus === LOAN_STATUS.OFFERED)
    ? (() => {
        const f    = app.bankFavor;
        const cls  = f >= 3 ? 'loan-favor-good' : f === 2 ? 'loan-favor-neutral' : 'loan-favor-bad';
        const text = f >= 3 ? 'The bank is favorable towards you.'
                   : f === 2 ? 'The bank is neutral toward you.'
                   :           'The bank views you unfavorably.';
        return `<div class="${cls}">${text}</div>`;
      })()
    : '';

  const loanSectionHtml = (() => {
    if (Banking.hasActiveCovenant('NO_NEW_LOANS') && !app)
      return `<div class="loan-covenant-block">An active loan covenant prohibits taking on new loans.</div>`;

    if (appStatus === LOAN_STATUS.OFFERED) {
      const { amount, term, rate, covenants, covenantPenaltyPct } = app;
      const canNegotiate = app.bankFavor > 0;
      const negBtn       = (id, extra = '') =>
        `<button class="negotiate-btn"${id ? ` id="${id}"` : ''} ${extra}>Negotiate</button>`;

      const covenantRows = covenants.map((c, i) => `
        <div class="loan-offer-covenant">
          <div class="loan-offer-covenant-header">
            <span class="loan-offer-covenant-desc">${c.description}</span>
            ${canNegotiate ? negBtn('', `data-covenant-index="${i}"`) : ''}
          </div>
        </div>`).join('');

      const penaltyAmt = covenants.length > 0 ? Math.round(amount * covenantPenaltyPct / 100) : 0;
      const feeRow = covenants.length > 0 ? `
        <div class="loan-offer-row">
          <span>Breach Fee</span>
          <div class="loan-offer-right">
            <span>${covenantPenaltyPct}% ($${penaltyAmt.toLocaleString()})</span>
            ${canNegotiate && covenantPenaltyPct > 5 ? negBtn('negotiate-fee-btn') : ''}
          </div>
        </div>` : '';

      return `
        <div class="posting-form">
          ${favorHtml}
          <div class="loan-offer-row"><span>Amount</span><span>$${amount.toLocaleString()}</span></div>
          <div class="loan-offer-row"><span>Term</span><span>${term} yr</span></div>
          <div class="loan-offer-row loan-offer-rate">
            <span>Interest Rate</span>
            <div class="loan-offer-right">
              <span>${rate}%</span>
              ${canNegotiate ? negBtn('negotiate-rate-btn') : ''}
            </div>
          </div>
          ${covenantRows}
          ${feeRow}
          <div class="form-actions">
            <button id="loan-reject-btn" class="loan-reject-btn">Reject</button>
            <button id="loan-accept-btn" class="loan-accept-btn">Accept</button>
          </div>
        </div>`;
    }

    if (appStatus === LOAN_STATUS.REVIEW) {
      const { amount, term, rate, reviewWeeksRemaining } = app;
      return `
        <div class="posting-form">
          <div class="loan-offer-row"><span>Amount</span><span>$${amount.toLocaleString()}</span></div>
          <div class="loan-offer-row"><span>Term</span><span>${term} yr</span></div>
          <div class="loan-offer-row loan-offer-rate"><span>Interest Rate</span><span>${rate}%</span></div>
          <div class="loan-approaching-label">
            Under Review — ${reviewWeeksRemaining} week${reviewWeeksRemaining !== 1 ? 's' : ''} remaining…
          </div>
        </div>`;
    }

    return `<div class="posting-form" id="loan-form">
      <div class="form-field">
        <label for="loan-amount">Desired Amount</label>
        <input id="loan-amount" type="number" min="0" step="1000" placeholder="$0"
               value="${app?.amount ?? ''}" ${dis}>
      </div>
      <div class="form-field">
        <label for="loan-purpose">Purpose</label>
        <select id="loan-purpose" ${dis}>${purposeOptions}</select>
      </div>
      <div class="form-field">
        <label for="loan-term">Term (Years)</label>
        <input id="loan-term" type="number" min="1" max="10" step="1" placeholder="1"
               value="${app?.term ?? ''}" ${dis}>
      </div>
      ${favorHtml}
      <div class="form-actions">${loanActionHtml}</div>
    </div>`;
  })();

  // ── Savings section HTML ──────────────────────────────────────────────────────
  const maxDeposit  = Math.floor(money / 1000) * 1000;
  const maxWithdraw = Math.floor(Banking.savingsBalance / 1000) * 1000;
  const savingsHtml = `
    <div class="posting-form">
      <div class="loan-offer-row">
        <span>Balance</span>
        <span>$${Banking.savingsBalance.toLocaleString()}</span>
      </div>
      <div class="loan-offer-row">
        <span>Interest Earned (all-time)</span>
        <span>$${Banking.totalInterestEarned.toLocaleString()}</span>
      </div>
      <div class="loan-offer-row">
        <span>Rate</span>
        <span>${(SAVINGS_ANNUAL_RATE * 100).toFixed(1)}% annual, compounded weekly</span>
      </div>
      <div class="form-field">
        <label for="savings-amount">Amount ($1,000 increments)</label>
        <input id="savings-amount" type="number" min="1000" step="1000" placeholder="$0">
      </div>
      <div class="form-actions">
        <button id="savings-deposit-btn" ${maxDeposit <= 0 ? 'disabled' : ''}>Deposit</button>
        <button id="savings-withdraw-btn" ${maxWithdraw <= 0 ? 'disabled' : ''}>Withdraw</button>
      </div>
    </div>`;

  // ── Money market section HTML ─────────────────────────────────────────────────
  const mmHtml = (() => {
    // Close-out confirmation state: show a warning and Proceed / Cancel buttons.
    if (Banking.mmCloseConfirmPending) {
      return `
        <div class="posting-form">
          <div class="loan-offer-row">
            <span>Balance</span>
            <span>$${Banking.mmBalance.toLocaleString()}</span>
          </div>
          <div class="loan-covenant-block">
            Withdrawing below the $${MM_MIN_BALANCE.toLocaleString()} minimum will close this account.
            Your full balance of $${Banking.mmBalance.toLocaleString()} will be returned to cash,
            and withdrawals will be locked for ${MM_WITHDRAWAL_COOLDOWN} rounds.
          </div>
          <div class="form-actions">
            <button id="mm-cancel-btn" class="loan-reject-btn">Cancel</button>
            <button id="mm-confirm-btn" class="loan-accept-btn">Proceed</button>
          </div>
        </div>`;
    }

    // Account not open: show an open-account form.
    if (Banking.mmBalance === 0) {
      const canOpen = Banking.mmWithdrawalCooldown === 0;
      return `
        <div class="posting-form">
          <div class="loan-offer-row">
            <span>Rate</span>
            <span>${(MM_ANNUAL_RATE * 100).toFixed(1)}% annual, compounded weekly</span>
          </div>
          <div class="loan-offer-row">
            <span>Minimum Balance</span>
            <span>$${MM_MIN_BALANCE.toLocaleString()}</span>
          </div>
          ${!canOpen ? `<div class="loan-approaching-label">Withdrawals locked — ${Banking.mmWithdrawalCooldown} round${Banking.mmWithdrawalCooldown !== 1 ? 's' : ''} remaining before reopening.</div>` : ''}
          <div class="form-field">
            <label for="mm-open-amount">Opening Deposit (min $${MM_MIN_BALANCE.toLocaleString()})</label>
            <input id="mm-open-amount" type="number" min="${MM_MIN_BALANCE}" step="1000"
                   placeholder="$${MM_MIN_BALANCE.toLocaleString()}" ${!canOpen ? 'disabled' : ''}>
          </div>
          <div class="form-actions">
            <button id="mm-open-btn" ${!canOpen ? 'disabled' : ''}>Open Account</button>
          </div>
        </div>`;
    }

    // Account open: show stats, deposit, and optional withdraw controls.
    const cooldown    = Banking.mmWithdrawalCooldown;
    const withdrawRow = cooldown > 0
      ? `<div class="loan-approaching-label">Withdrawals locked — ${cooldown} round${cooldown !== 1 ? 's' : ''} remaining.</div>`
      : `<div class="form-actions">
           <button id="mm-withdraw-btn">Withdraw</button>
         </div>`;

    return `
      <div class="posting-form">
        <div class="loan-offer-row">
          <span>Balance</span>
          <span>$${Banking.mmBalance.toLocaleString()}</span>
        </div>
        <div class="loan-offer-row">
          <span>Interest Earned (all-time)</span>
          <span>$${Banking.mmTotalInterestEarned.toLocaleString()}</span>
        </div>
        <div class="loan-offer-row">
          <span>Rate</span>
          <span>${(MM_ANNUAL_RATE * 100).toFixed(1)}% annual, compounded weekly</span>
        </div>
        <div class="loan-offer-row">
          <span>Minimum Balance</span>
          <span>$${MM_MIN_BALANCE.toLocaleString()}</span>
        </div>
        <div class="form-field">
          <label for="mm-amount">Amount ($1,000 increments)</label>
          <input id="mm-amount" type="number" min="1000" step="1000" placeholder="$0">
        </div>
        <div class="form-actions">
          <button id="mm-deposit-btn">Deposit</button>
        </div>
        ${withdrawRow}
      </div>`;
  })();

  // ── Line of credit section HTML ───────────────────────────────────────────────
  const locHtml = (() => {
    const loc = Banking.locApplication;
    const locStatus = loc?.status ?? null;

    // Active account: show balance, available credit, draw/repay controls.
    if (Banking.locActive) {
      const available = Banking.locLimit - Banking.locBalance;
      const canClose  = Banking.locBalance === 0;
      return `
        <div class="posting-form">
          <div class="loan-offer-row"><span>Credit Limit</span><span>$${Banking.locLimit.toLocaleString()}</span></div>
          <div class="loan-offer-row"><span>Available</span><span>$${available.toLocaleString()}</span></div>
          <div class="loan-offer-row"><span>Outstanding Balance</span><span>$${Banking.locBalance.toLocaleString()}</span></div>
          <div class="loan-offer-row"><span>Rate</span><span>${Banking.locRate}% annual</span></div>
          <div class="loan-offer-row"><span>Interest Paid (all-time)</span><span>$${Banking.locTotalInterestPaid.toLocaleString()}</span></div>
          <div class="form-field">
            <label for="loc-amount">Amount ($1,000 increments)</label>
            <input id="loc-amount" type="number" min="1000" step="1000" placeholder="$0">
          </div>
          <div class="form-actions">
            <button id="loc-repay-btn" ${Banking.locBalance === 0 ? 'disabled' : ''}>Repay</button>
            <button id="loc-draw-btn"  ${available === 0 ? 'disabled' : ''}>Draw</button>
          </div>
          ${canClose ? `<div class="form-actions"><button id="loc-close-btn" class="loan-reject-btn">Close Account</button></div>` : ''}
        </div>`;
    }

    // Offer on the table: show terms and accept/reject.
    if (locStatus === 'offered') {
      return `
        <div class="posting-form">
          <div class="loan-offer-row"><span>Credit Limit</span><span>$${loc.limit.toLocaleString()}</span></div>
          <div class="loan-offer-row loan-offer-rate"><span>Interest Rate</span><span>${loc.rate}% annual</span></div>
          <div class="form-actions">
            <button id="loc-reject-btn" class="loan-reject-btn">Reject</button>
            <button id="loc-accept-btn" class="loan-accept-btn">Accept</button>
          </div>
        </div>`;
    }

    // Application pending: waiting for the bank's response.
    if (locStatus === 'pending') {
      return `<div class="posting-form"><span class="loan-approaching-label">Application under review — available next round.</span></div>`;
    }

    // No account, no application: show the apply button.
    return `
      <div class="posting-form">
        <p class="empty-note" style="margin:0 0 8px">A revolving credit line lets you draw and repay funds freely up to an approved limit. Interest accrues only on the outstanding balance.</p>
        <div class="form-actions"><button id="loc-apply-btn">Apply</button></div>
      </div>`;
  })();

  // ── Active loans section HTML ─────────────────────────────────────────────────
  const activeLoansHtml = Banking.activeLoans.length === 0 ? '' : `
    <div class="financial-section">
      <div class="financial-section-header">Active Loans</div>
      ${Banking.activeLoans.map((loan, i) => {
        const { total: weeklyPayment } = Banking.calcLoanPayment(loan.balance, loan.rate, loan.weeksRemaining);
        const maxExtra = Math.floor(Math.min(money, loan.balance) / 500) * 500;
        const purposeLabel = { new_rides: 'New Rides', staffing: 'Staffing', emergency: 'Emergency', refinance: 'Refinance' }[loan.purpose] ?? loan.purpose;
        return `
          <div class="posting-form" style="margin-bottom:8px">
            <div class="loan-offer-row"><span>Purpose</span><span>${purposeLabel}</span></div>
            <div class="loan-offer-row"><span>Balance Remaining</span><span>$${loan.balance.toLocaleString()}</span></div>
            <div class="loan-offer-row"><span>Rate</span><span>${loan.rate}%</span></div>
            <div class="loan-offer-row"><span>Weekly Payment</span><span>$${weeklyPayment.toLocaleString()}</span></div>
            <div class="loan-offer-row"><span>Est. Weeks Remaining</span><span>${loan.weeksRemaining}</span></div>
            <div class="form-field">
              <label for="extra-payment-${i}">Extra Payment ($500 increments)</label>
              <input id="extra-payment-${i}" type="number" min="500" max="${maxExtra}" step="500"
                     placeholder="$0" ${maxExtra < 500 ? 'disabled' : ''} data-loan-index="${i}">
            </div>
            <div class="form-actions">
              <button class="extra-payment-btn" data-loan-index="${i}" ${maxExtra < 500 ? 'disabled' : ''}>Pay Extra</button>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  const givingHtml = CHARITIES.filter(c => Banking.unlockedCharityIds.has(c.id)).map(c => {
    const ytd       = (Banking.charityDonationsYTD[c.id]     ?? 0).toLocaleString();
    const allTimeAmt =  Banking.charityDonationsAllTime[c.id] ?? 0;
    const tier      = getSponsorshipTier(allTimeAmt);
    const tierBadge = tier
      ? `<span class="charity-tier-badge charity-tier-${tier.id}">${tier.emoji} ${tier.label}</span>`
      : '';
    return `
      <div class="charity-card">
        <div class="charity-card-header">
          <span class="charity-emoji">${c.emoji}</span>
          <div class="charity-info">
            <div class="charity-name">${c.name}</div>
            <div class="charity-blurb">${c.blurb}</div>
          </div>
        </div>
        ${tierBadge}
        <div class="loan-offer-row"><span>This Year</span><span>$${ytd}</span></div>
        <div class="loan-offer-row"><span>All-Time</span><span>$${allTimeAmt.toLocaleString()}</span></div>
        <div class="form-field">
          <label for="donate-${c.id}">Amount ($100 increments)</label>
          <input id="donate-${c.id}" type="number" min="100" step="100" placeholder="$0"
                 data-charity="${c.id}">
        </div>
        <div class="form-actions">
          <button class="donate-btn" data-charity="${c.id}" ${money < 100 ? 'disabled' : ''}>Donate</button>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div class="bank-sub-tabs">
      <button class="bank-tab-btn${_activeBankingTab === 'investment' ? ' active' : ''}" data-bank-tab="investment">Investment</button>
      <button class="bank-tab-btn${_activeBankingTab === 'debt' ? ' active' : ''}" data-bank-tab="debt">Debt</button>
      <button class="bank-tab-btn${_activeBankingTab === 'giving' ? ' active' : ''}" data-bank-tab="giving">Giving</button>
    </div>
    <div id="bank-investment-view" class="bank-view${_activeBankingTab !== 'investment' ? ' hidden' : ''}">
      <div class="financial-section">
        <div class="financial-section-header">Savings Account</div>
        ${savingsHtml}
      </div>
      <div class="financial-section">
        <div class="financial-section-header">Money Market Account</div>
        ${mmHtml}
      </div>
    </div>
    <div id="bank-debt-view" class="bank-view${_activeBankingTab !== 'debt' ? ' hidden' : ''}">
      <div class="financial-section">
        <div class="financial-section-header">Line of Credit</div>
        ${locHtml}
      </div>
      ${activeLoansHtml}
      <div class="financial-section">
        <div class="financial-section-header">Loan</div>
        ${loanSectionHtml}
      </div>
    </div>
    <div id="bank-giving-view" class="bank-view${_activeBankingTab !== 'giving' ? ' hidden' : ''}">
      ${givingHtml}
    </div>`;

  // Tab switching — no full rebuild needed, just toggle visibility.
  document.querySelectorAll('.bank-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeBankingTab = btn.dataset.bankTab;
      document.querySelectorAll('.bank-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('bank-investment-view').classList.toggle('hidden', _activeBankingTab !== 'investment');
      document.getElementById('bank-debt-view').classList.toggle('hidden', _activeBankingTab !== 'debt');
      document.getElementById('bank-giving-view').classList.toggle('hidden', _activeBankingTab !== 'giving');
    });
  });

  // Donate buttons — one per charity card.
  document.querySelectorAll('.donate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id     = btn.dataset.charity;
      const input  = document.querySelector(`input[data-charity="${id}"]`);
      const amount = Math.round(parseInt(input?.value) || 0);
      if (Banking.donate(id, amount)) buildBankingPanel();
    });
  });

  // Extra loan payment buttons.
  document.querySelectorAll('.extra-payment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i      = parseInt(btn.dataset.loanIndex);
      const input  = document.getElementById(`extra-payment-${i}`);
      const amount = Math.round(parseInt(input?.value) || 0);
      if (Banking.makeExtraPayment(i, amount)) buildBankingPanel();
    });
  });

  // Savings deposit / withdraw buttons.
  document.getElementById('savings-deposit-btn').addEventListener('click', () => {
    const amount = Math.round(parseInt(document.getElementById('savings-amount').value) || 0);
    if (Banking.deposit(amount)) { buildBankingPanel(); updateHUD(); }
  });
  document.getElementById('savings-withdraw-btn').addEventListener('click', () => {
    const amount = Math.round(parseInt(document.getElementById('savings-amount').value) || 0);
    if (Banking.withdraw(amount)) { buildBankingPanel(); updateHUD(); }
  });

  // Money market buttons — wired conditionally based on which state is rendered.
  document.getElementById('mm-open-btn')?.addEventListener('click', () => {
    const amount = Math.round(parseInt(document.getElementById('mm-open-amount').value) || 0);
    if (Banking.mmDeposit(amount)) { buildBankingPanel(); updateHUD(); }
  });
  document.getElementById('mm-deposit-btn')?.addEventListener('click', () => {
    const amount = Math.round(parseInt(document.getElementById('mm-amount').value) || 0);
    if (Banking.mmDeposit(amount)) { buildBankingPanel(); updateHUD(); }
  });
  document.getElementById('mm-withdraw-btn')?.addEventListener('click', () => {
    const amount = Math.round(parseInt(document.getElementById('mm-amount').value) || 0);
    const result = Banking.mmWithdraw(amount);
    // 'confirm' means the withdrawal would close the account — rebuild to show the prompt.
    if (result === true || result === 'confirm') { buildBankingPanel(); updateHUD(); }
  });
  document.getElementById('mm-confirm-btn')?.addEventListener('click', () => {
    Banking.mmConfirmClose();
    buildBankingPanel();
    updateHUD();
  });
  document.getElementById('mm-cancel-btn')?.addEventListener('click', () => {
    Banking.mmCancelClose();
    buildBankingPanel();
  });

  // Line of credit buttons.
  document.getElementById('loc-apply-btn')?.addEventListener('click', () => {
    Banking.submitLocApplication();
    buildBankingPanel();
  });
  document.getElementById('loc-accept-btn')?.addEventListener('click', () => {
    Banking.acceptLocOffer();
    buildBankingPanel();
  });
  document.getElementById('loc-reject-btn')?.addEventListener('click', () => {
    Banking.rejectLocOffer();
    buildBankingPanel();
  });
  document.getElementById('loc-draw-btn')?.addEventListener('click', () => {
    const amount = Math.round(parseInt(document.getElementById('loc-amount').value) || 0);
    if (Banking.locDraw(amount)) buildBankingPanel();
  });
  document.getElementById('loc-repay-btn')?.addEventListener('click', () => {
    const amount = Math.round(parseInt(document.getElementById('loc-amount').value) || 0);
    if (Banking.locRepay(amount)) buildBankingPanel();
  });
  document.getElementById('loc-close-btn')?.addEventListener('click', () => {
    if (Banking.closeLocAccount()) buildBankingPanel();
  });

  if (appStatus === null) {
    document.getElementById('loan-approach-btn').addEventListener('click', () => {
      const amount  = Math.max(0, parseInt(document.getElementById('loan-amount').value)  || 0);
      const purpose = document.getElementById('loan-purpose').value;
      const term    = Math.max(1, parseInt(document.getElementById('loan-term').value)    || 1);
      Banking.submitLoanApplication(amount, purpose, term);
      document.getElementById('loan-amount').disabled  = true;
      document.getElementById('loan-purpose').disabled = true;
      document.getElementById('loan-term').disabled    = true;
      document.querySelector('#loan-form .form-actions').innerHTML =
        `<span class="loan-approaching-label">Approaching Banks…</span>`;
    });
  }

  if (appStatus === LOAN_STATUS.OPEN) {
    document.getElementById('loan-apply-btn').addEventListener('click', () => {
      Banking.applyForLoan();
      document.querySelector('#loan-form .form-actions').innerHTML =
        `<span class="loan-approaching-label">Awaiting Offer…</span>`;
    });
  }

  if (appStatus === LOAN_STATUS.OFFERED) {
    document.getElementById('loan-reject-btn').addEventListener('click', () => {
      Banking.rejectOffer();
      buildBankingPanel();
    });
    document.getElementById('loan-accept-btn').addEventListener('click', () => {
      Banking.acceptOffer();
      buildBankingPanel();
    });
    document.getElementById('negotiate-rate-btn')?.addEventListener('click', () => {
      Banking.negotiateRate();
      buildBankingPanel();
    });
    document.getElementById('negotiate-fee-btn')?.addEventListener('click', () => {
      Banking.negotiateFee();
      buildBankingPanel();
    });
    document.querySelectorAll('[data-covenant-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        Banking.negotiateCovenant(parseInt(btn.dataset.covenantIndex));
        buildBankingPanel();
      });
    });
  }
}
