// ── HUD & stage management ─────────────────────────────────────────────────
let activePanel = null;

function initHUD() {
  updateHUD();
  document.getElementById('open-park-btn').addEventListener('click', openPark);
  document.getElementById('next-round-btn').addEventListener('click', advanceRound);
  document.getElementById('modal-close-btn').addEventListener('click', hideRoundSummary);
  initStaffPanel();
  initPanelBtns();
}

function canOpenPark() {
  const hasEntrance     = installedFacilities.some(f => f.facilityId === FACILITY_ID.PARK_ENTRANCE && f.status === STATUS.ACTIVE);
  const hasConnectedRide = installedRides.some(r => r.status === STATUS.ACTIVE && isRideConnected(r));
  return hasEntrance && hasConnectedRide;
}

function openPark() {
  if (!canOpenPark()) return;
  gameStage = STAGE.PLAY;
  document.getElementById('open-park-btn').classList.add('hidden');
  document.getElementById('next-round-btn').classList.remove('hidden');
  updateHUD();
  console.log('Park is now open — simulation started.');
}

function advanceRound() {
  round++;
  const report = processRound();
  recordRound(report);
  updateHUD();
  refreshRidesPanel();
  refreshStaffPanel();
  refreshSecurityPanel();
  showRoundSummary(report);
}

function showRoundSummary(report) {
  const net = report.gateRevenue - report.totalExpenses;
  document.getElementById('summary-date').textContent       = getDateLabel();
  document.getElementById('summary-attendance').textContent = report.weeklyAttendance.toLocaleString();
  document.getElementById('summary-income').textContent     = `$${report.gateRevenue.toLocaleString()}`;
  document.getElementById('summary-expenses').textContent   = `$${report.totalExpenses.toLocaleString()}`;
  const netEl = document.getElementById('summary-net');
  netEl.textContent = (net >= 0 ? '+' : '\u2212') + `$${Math.abs(net).toLocaleString()}`;
  netEl.className   = net >= 0 ? 'summary-pos' : 'summary-neg';

  const sec = report.security;
  document.getElementById('summary-incidents').textContent    = sec.total.toLocaleString();
  document.getElementById('summary-inc-overflow').textContent = sec.fromOverflow.toLocaleString();
  document.getElementById('summary-inc-unridden').textContent = sec.fromUnridden.toLocaleString();
  document.getElementById('summary-inc-random').textContent   = sec.fromRandom.toLocaleString();
  document.getElementById('summary-sec-capacity').textContent = sec.capacity.toLocaleString();
  document.getElementById('summary-sec-handled').textContent  = sec.handled.toLocaleString();
  const unhandledEl = document.getElementById('summary-sec-unhandled');
  unhandledEl.textContent = sec.unhandled.toLocaleString();
  unhandledEl.className   = `modal-stat-value${sec.unhandled > 0 ? ' expense' : ''}`;
  document.getElementById('summary-sec-opinion').textContent = sec.opinionAfter.toLocaleString();

  document.getElementById('round-modal').classList.remove('hidden');
}

function hideRoundSummary() {
  document.getElementById('round-modal').classList.add('hidden');
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

function updateHUD() {
  document.getElementById('money-display').textContent = `$${money.toLocaleString()}`;
  document.getElementById('date-display').textContent  = getDateLabel();
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
}

// ── Panel management ───────────────────────────────────────────────────────
function initPanelBtns() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => togglePanel(btn.dataset.panel));
  });
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
  document.getElementById(`panel-${panelId}`).classList.remove('closed');
  document.querySelector(`.tool-btn[data-panel="${panelId}"]`)?.classList.add('active');
  if (panelId === 'rides')    buildRidesPanel();
  if (panelId === 'staffing') openStaffPanel();
  if (panelId === 'security') buildSecurityPanel();
  if (panelId === 'pricing')  buildPricingPanel();
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
  if (installedRides.length === 0) {
    container.innerHTML = '<p class="empty-note">No rides placed yet.</p>';
    return;
  }
  const rows = installedRides.map(record => {
    const { label, cls } = getRideCondition(record);
    return `<div class="ride-list-row" data-id="${record.instanceId}">
      <span class="ride-list-name">${record.name}</span>
      <span class="cond-badge ${cls}">${label}</span>
    </div>`;
  }).join('');
  container.innerHTML = `<div class="ride-list">${rows}</div>`;
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
  }

  container.innerHTML = `
    <div class="ride-detail">
      <button class="ride-back-btn" id="rdx-back">← Rides</button>
      <div class="ride-detail-name">${record.name}</div>
      <span class="cond-badge ${cls}">${label}</span>
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

// ── Sidebar sub-tabs ───────────────────────────────────────────────────────
function initSubTabs() {
  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-panel`).classList.remove('hidden');
      deselectItem();
    });
  });
}

// ── Pricing panel ──────────────────────────────────────────────────────────
const PRICE_ITEMS = [
  {
    key:       'gate',
    label:     'Gate Admission',
    unit:      '$/visitor',
    getValue:  () => gatePrice,
    setValue:  v => {
      const delta = v - gatePrice;
      if (delta > 0) priceExhaustion += 2 * delta;
      gatePrice = v;
    },
  },
  {
    key:       'parking',
    label:     'Parking',
    unit:      '$/vehicle',
    getValue:  () => parkingPrice,
    setValue:  v => {
      const delta = v - parkingPrice;
      if (delta > 0) priceExhaustion += 1 * delta;
      parkingPrice = v;
    },
  },
  {
    key:       'food',
    label:     'Food Upcharge',
    unit:      '$/item',
    getValue:  () => foodUpcharge,
    setValue:  v => { foodUpcharge = v; },
  },
];

function buildPricingPanel() {
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

  document.getElementById('pricing-panel-body').innerHTML = `
    <div class="price-list">${rows}</div>`;

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
}
