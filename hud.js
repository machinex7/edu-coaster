// ── HUD & stage management ─────────────────────────────────────────────────
function initHUD() {
  updateHUD();
  document.getElementById('open-park-btn').addEventListener('click', openPark);
  document.getElementById('next-round-btn').addEventListener('click', advanceRound);
}

function openPark() {
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
  const badge     = document.getElementById('stage-badge');
  badge.textContent = gameStage === STAGE_SETUP ? 'Setup' : 'Open';
  badge.className   = `stage-badge ${gameStage}`;
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
