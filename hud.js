// ── HUD & stage management ─────────────────────────────────────────────────
let activePanel = null;

function initHUD() {
  updateHUD();
  document.getElementById('open-park-btn').addEventListener('click', openPark);
  document.getElementById('next-round-btn').addEventListener('click', advanceRound);
  initPanelBtns();
}

function canOpenPark() {
  const hasEntrance     = installedFacilities.some(f => f.facilityId === 'park_entrance' && f.status === 'active');
  const hasConnectedRide = installedRides.some(r => r.status === 'active' && isRideConnected(r));
  return hasEntrance && hasConnectedRide;
}

function openPark() {
  if (!canOpenPark()) return;
  gameStage = STAGE_PLAY;
  document.getElementById('open-park-btn').classList.add('hidden');
  document.getElementById('next-round-btn').classList.remove('hidden');
  updateHUD();
  console.log('Park is now open — simulation started.');
}

function advanceRound() {
  round++;
  processConstruction();
  updateHUD();
  refreshRidesPanel();
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
  badge.textContent = gameStage === STAGE_SETUP ? 'Setup' : 'Open';
  badge.className   = `stage-badge ${gameStage}`;

  if (gameStage === STAGE_SETUP) {
    const openBtn = document.getElementById('open-park-btn');
    const ready   = canOpenPark();
    openBtn.disabled = !ready;
    const hasEntrance = installedFacilities.some(f => f.facilityId === 'park_entrance' && f.status === 'active');
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
  if (panelId === 'rides') buildRidesPanel();
}

function closePanels() {
  if (!activePanel) return;
  document.getElementById(`panel-${activePanel}`).classList.add('closed');
  document.querySelector(`.tool-btn[data-panel="${activePanel}"]`)?.classList.remove('active');
  activePanel = null;
  deselectItem();
}

function buildRidesPanel() {
  const container = document.getElementById('rides-overview');
  if (installedRides.length === 0) {
    container.innerHTML = '<p class="empty-note">No rides placed yet.</p>';
    return;
  }
  const rows = installedRides.map(record => {
    const { label, cls } = getRideCondition(record);
    return `<tr><td>${record.name}</td><td><span class="cond-badge ${cls}">${label}</span></td></tr>`;
  }).join('');
  container.innerHTML = `<table class="rides-table"><thead><tr><th>Name</th><th>Condition</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function getRideCondition(record) {
  switch (record.status) {
    case 'under_construction': return { label: 'Under Construction', cls: 'cond-building'     };
    case 'active':
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
