// ── HUD & stage management ─────────────────────────────────────────────────
let activePanel = null;

function initHUD() {
  updateHUD();
  document.getElementById('open-park-btn').addEventListener('click', openPark);
  document.getElementById('next-round-btn').addEventListener('click', advanceRound);
  document.getElementById('modal-close-btn').addEventListener('click', hideRoundSummary);
  Staff.initPanel();
  initInventoryPanel();
  Charts.initModal();
  initPanelBtns();
  updateLockedPanels();
}

function canOpenPark() {
  const hasEntrance     = installedFacilities.some(f => f.facilityId === FACILITY_ID.PARK_ENTRANCE && f.status === STATUS.ACTIVE);
  const hasConnectedRide = installedRides.some(r => r.status === STATUS.ACTIVE && isRideConnected(r));
  return hasEntrance && hasConnectedRide;
}

function openPark() {
  if (!canOpenPark()) return;
  gameStage = STAGE.PLAY;
  Population.populationEvents.push({ modifier: 50, comment: "Everyone is excited for the grand opening!" });
  document.getElementById('open-park-btn').classList.add('hidden');
  document.getElementById('next-round-btn').classList.remove('hidden');
  updateHUD();
  console.log('Park is now open — simulation started.');
}

function advanceRound() {
  round++;
  const report     = Finance.processRound();
  const loanResult = Finance.processPendingLoan();
  History.record(report);
  Research.tickResearch();
  if (round % 13 === 1 && round > 1) Awards.checkQuarterly();
  updateLockedPanels();
  updateHUD();
  refreshRidesPanel();
  Staff.refreshPanel();
  Security.refreshPanel();
  Research.refreshPanel();
  Awards.refreshPanel();
  if (loanResult && activePanel === 'financial') buildFinancialPanel();
  showRoundSummary(report);
  nextWeekForecast   = futurecastForecast;
  futurecastForecast = forecastForRound(round + 2);
}

function showRoundSummary(report) {
  const net = report.totalIncome - report.totalExpenses;
  document.getElementById('summary-date').textContent        = getDateLabel();
  document.getElementById('summary-attendance').textContent  = report.weeklyAttendance.toLocaleString();
  document.getElementById('summary-income').textContent         = `$${report.gateRevenue.toLocaleString()}`;
  document.getElementById('summary-parking-income').textContent = `$${report.parkingRevenue.toLocaleString()}`;
  document.getElementById('summary-shop-income').textContent    = `$${report.shopRevenue.toLocaleString()}`;
  document.getElementById('summary-expenses').textContent    = `$${(report.staffCosts + report.utilityCosts + report.constructionCosts).toLocaleString()}`;

  const netEl = document.getElementById('summary-net');
  netEl.textContent = (net >= 0 ? '+' : '\u2212') + `$${Math.abs(net).toLocaleString()}`;
  netEl.className   = net >= 0 ? 'summary-pos' : 'summary-neg';

  const eventsEl = document.getElementById('summary-events');
  if (report.populationEvents.length > 0) {
    eventsEl.innerHTML = report.populationEvents.map(e => `<div class="modal-event">${e.comment}</div>`).join('');
    eventsEl.classList.remove('hidden');
  } else {
    eventsEl.classList.add('hidden');
  }

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
}

// ── Panel management ───────────────────────────────────────────────────────
function initPanelBtns() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => togglePanel(btn.dataset.panel));
  });
}

function updateLockedPanels() {
  const surveyBtn = document.querySelector('.tool-btn[data-panel="survey"]');
  if (surveyBtn) surveyBtn.disabled = !Research.completed.has(RESEARCH_ID.SURVEYS);

  const benefitsUnlocked = Research.completed.has(RESEARCH_ID.EMPLOYEE_BENEFITS);
  const benefitsBtn = document.querySelector('.staff-action-btn[data-view="benefits"]');
  if (benefitsBtn) {
    benefitsBtn.classList.toggle('hidden', !benefitsUnlocked);
    if (!benefitsUnlocked && Staff._activeView === 'benefits') Staff.setView('roster');
  }

  const demolishBtn = document.querySelector('.tool-btn[data-panel="demolish"]');
  if (demolishBtn) {
    const demolishLocked = Finance.hasActiveCovenant('NO_DEMOLISH');
    demolishBtn.disabled = demolishLocked;
    demolishBtn.title    = demolishLocked ? 'Locked by loan covenant' : '';
  }

  document.getElementById('weather-panel').classList.toggle('hidden', !Research.completed.has(RESEARCH_ID.WEATHER_SENSOR));
  document.getElementById('forecast-future-count').classList.toggle('hidden', !Research.completed.has(RESEARCH_ID.WEATHER_STATION));
}

function togglePanel(panelId) {
  if (activePanel === panelId) closePanels();
  else openPanel(panelId);
}

function openPanel(panelId) {
  if (panelId === 'demolish' && Finance.hasActiveCovenant('NO_DEMOLISH')) {
    Notifications.push({ label: 'Covenant', message: 'Your loan covenant prohibits demolishing rides.' });
    return;
  }
  if (activePanel && activePanel !== panelId) {
    if (activePanel === 'demolish') setDemolishMode(false);
    else document.getElementById(`panel-${activePanel}`).classList.add('closed');
    document.querySelector(`.tool-btn[data-panel="${activePanel}"]`)?.classList.remove('active');
    deselectItem();
  }
  activePanel = panelId;
  document.querySelector(`.tool-btn[data-panel="${panelId}"]`)?.classList.add('active');
  if (panelId === 'demolish') { setDemolishMode(true); return; }
  document.getElementById(`panel-${panelId}`).classList.remove('closed');
  if (panelId === 'rides')      buildRidesPanel();
  if (panelId === 'staffing')   Staff.openPanel();
  if (panelId === 'security')   Security.buildPanel();
  if (panelId === 'financial')  buildFinancialPanel();
  if (panelId === 'inventory')  buildInventoryPanel();
  if (panelId === 'survey')     Survey.buildPanel();
  if (panelId === 'research')   Research.buildPanel();
  if (panelId === 'awards')     Awards.buildPanel();
}

function closePanels() {
  if (!activePanel) return;
  if (activePanel === 'demolish') setDemolishMode(false);
  else document.getElementById(`panel-${activePanel}`).classList.add('closed');
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
  const def = rides.find(r => r.id === record.rideId);

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
      <div class="ride-wear">Wear: ${(record.wear ?? 0).toLocaleString()}</div>
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

// ── Financial panel ────────────────────────────────────────────────────────
const PRICE_ITEMS = [
  {
    key:       'gate',
    label:     'Gate Admission',
    unit:      '$/visitor',
    getValue:  () => Finance.gatePrice,
    setValue:  v => {
      const delta = v - Finance.gatePrice;
      if (delta > 0) Finance.priceExhaustion += 2 * delta;
      Finance.gatePrice = v;
    },
  },
  {
    key:       'parking',
    label:     'Parking',
    unit:      '$/vehicle',
    getValue:  () => Finance.parkingPrice,
    setValue:  v => {
      const delta = v - Finance.parkingPrice;
      if (delta > 0) Finance.priceExhaustion += 1 * delta;
      Finance.parkingPrice = v;
    },
  },
  {
    key:       'food',
    label:     'Food Upcharge',
    unit:      '$/item',
    getValue:  () => Finance.foodUpcharge,
    setValue:  v => { Finance.foodUpcharge = v; },
  },
  {
    key:       'merchandise',
    label:     'Merchandise Upcharge',
    unit:      '$/buyer',
    getValue:  () => Shopping.merchandiseUpcharge,
    setValue:  v => { Shopping.merchandiseUpcharge = v; },
  },
];

let _activeInvTab = 'stock';

function initInventoryPanel() {
  document.querySelectorAll('.inv-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeInvTab = btn.dataset.invTab;
      document.querySelectorAll('.inv-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('inv-stock-view').classList.toggle('hidden',     _activeInvTab !== 'stock');
      document.getElementById('inv-suppliers-view').classList.toggle('hidden', _activeInvTab !== 'suppliers');
      buildInventoryPanel();
    });
  });
}

function buildInventoryPanel() {
  if (_activeInvTab === 'stock')     _buildInvStockView();
  if (_activeInvTab === 'suppliers') _buildInvSuppliersView();
}

function _buildInvStockView() {
  const totalStock    = merchandiseInventory.reduce((s, inv) => s + inv.count, 0);
  const capacity      = Shopping.calcInventoryCapacity();
  const pct           = capacity > 0 ? Math.min(100, Math.round(totalStock / capacity * 100)) : 0;
  const capacityLabel = capacity > 0 ? `${totalStock} / ${capacity}` : 'No shops open';

  const supplier     = suppliers.find(s => s.id === selectedSupplierId);
  const supplierCard = supplier ? `
    <div class="inv-supplier-card">
      <span class="inv-supplier-name">${supplier.name}</span>
      <span class="inv-supplier-meta">${supplier.deliveryTime}w delivery · +$${supplier.surcharge} surcharge</span>
    </div>` : '';

  const CATEGORY_LABELS = { toy: 'Toys', practical: 'Practical', apparel: 'Apparel', souvenir: 'Souvenirs' };
  const itemRows = ['toy', 'practical', 'apparel', 'souvenir'].map(cat => {
    const items = merchandise
      .map((item, i) => ({ item, inv: merchandiseInventory[i], idx: i }))
      .filter(({ item }) => item.category === cat);
    const rows = items.map(({ item, inv, idx }) => {
      const orderBtns = [10, 50, 100].map(qty => {
        const cost = Math.round(qty * inv.price * Population.cumulativeInflation + (supplier?.surcharge ?? 0));
        const canAfford = money >= cost;
        return `<button class="inv-order-btn${canAfford ? '' : ' cant-afford'}"
          data-idx="${idx}" data-qty="${qty}">+${qty} $${cost.toLocaleString()}</button>`;
      }).join('');
      return `
        <div class="inv-item-row">
          <div class="inv-item-header">
            <span class="price-label">${item.name}</span>
            <span class="price-value">${inv.count}</span>
          </div>
          <div class="inv-order-btns">${orderBtns}</div>
        </div>`;
    }).join('');
    return `<div class="panel-section-header">${CATEGORY_LABELS[cat]}</div>${rows}`;
  }).join('');

  const el = document.getElementById('inv-stock-view');
  el.innerHTML = `
    ${supplierCard}
    <div class="inv-capacity-wrap">
      <div class="inv-capacity-label">Storage: ${capacityLabel}</div>
      <div class="ride-ridership-bar-wrap">
        <div class="ride-ridership-bar" style="width:${pct}%"></div>
      </div>
      <div class="inv-capacity-pct">${pct}%</div>
    </div>
    ${itemRows}`;

  el.querySelectorAll('.inv-order-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = Number(btn.dataset.idx);
      const qty  = Number(btn.dataset.qty);
      const sup  = suppliers.find(s => s.id === selectedSupplierId);
      const cost = Math.round(qty * merchandiseInventory[idx].price * Population.cumulativeInflation + (sup?.surcharge ?? 0));
      if (money < cost) return;
      money -= cost;
      orders.push({ itemIndex: idx, itemName: merchandise[idx].name, count: qty, weeksRemaining: sup?.deliveryTime ?? 1 });
      updateHUD();
      _buildInvStockView();
    });
  });
}

function _buildInvSuppliersView() {
  const rows = suppliers.map(s => {
    const unlocked = unlockedSupplierIds.has(s.id);
    const selected = s.id === selectedSupplierId;
    return `
      <div class="inv-supplier-row${selected ? ' selected' : ''}${!unlocked ? ' locked' : ''}"
           ${unlocked && !selected ? `data-supplier-id="${s.id}"` : ''}>
        <div class="inv-supplier-row-name">${unlocked ? s.name : '???'}</div>
        <div class="inv-supplier-row-meta">
          ${unlocked
            ? `${s.deliveryTime}w delivery · +$${s.surcharge} surcharge`
            : 'Locked'}
        </div>
        ${selected  ? '<div class="inv-supplier-badge">In use</div>'    : ''}
        ${!unlocked ? '<div class="inv-supplier-badge locked">Locked</div>' : ''}
      </div>`;
  }).join('');
  const el = document.getElementById('inv-suppliers-view');
  el.innerHTML = `<div class="inv-supplier-list">${rows}</div>`;
  el.querySelectorAll('.inv-supplier-row[data-supplier-id]').forEach(row => {
    row.addEventListener('click', () => {
      selectedSupplierId = row.dataset.supplierId;
      _buildInvSuppliersView();
    });
  });
}

function buildFinancialPanel() {
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

  const app     = Finance.loanApplication;
  const appStatus = app?.status ?? null;
  const locked  = app !== null;
  const dis     = locked ? 'disabled' : '';
  const purpose = app?.purpose ?? 'new_rides';
  const purposeOptions = [
    ['new_rides', 'New Rides'],
    ['staffing',  'Staffing'],
    ['emergency', 'Emergency'],
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
    if (Finance.hasActiveCovenant('NO_NEW_LOANS') && !app)
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

  document.getElementById('financial-panel-body').innerHTML = `
    <div class="financial-section">
      <div class="financial-section-header">Pricing Controls</div>
      <div class="price-list">${rows}</div>
    </div>
    <div class="financial-section">
      <div class="financial-section-header">Loan</div>
      ${loanSectionHtml}
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

  if (appStatus === null) {
    document.getElementById('loan-approach-btn').addEventListener('click', () => {
      const amount  = Math.max(0, parseInt(document.getElementById('loan-amount').value)  || 0);
      const purpose = document.getElementById('loan-purpose').value;
      const term    = Math.max(1, parseInt(document.getElementById('loan-term').value)    || 1);
      Finance.submitLoanApplication(amount, purpose, term);
      document.getElementById('loan-amount').disabled  = true;
      document.getElementById('loan-purpose').disabled = true;
      document.getElementById('loan-term').disabled    = true;
      document.querySelector('#loan-form .form-actions').innerHTML =
        `<span class="loan-approaching-label">Approaching Banks…</span>`;
    });
  }

  if (appStatus === LOAN_STATUS.OPEN) {
    document.getElementById('loan-apply-btn').addEventListener('click', () => {
      Finance.applyForLoan();
      document.querySelector('#loan-form .form-actions').innerHTML =
        `<span class="loan-approaching-label">Awaiting Offer…</span>`;
    });
  }

  if (appStatus === LOAN_STATUS.OFFERED) {
    document.getElementById('loan-reject-btn').addEventListener('click', () => {
      Finance.rejectOffer();
      buildFinancialPanel();
    });
    document.getElementById('loan-accept-btn').addEventListener('click', () => {
      Finance.acceptOffer();
      buildFinancialPanel();
    });
    document.getElementById('negotiate-rate-btn')?.addEventListener('click', () => {
      Finance.negotiateRate();
      buildFinancialPanel();
    });
    document.getElementById('negotiate-fee-btn')?.addEventListener('click', () => {
      Finance.negotiateFee();
      buildFinancialPanel();
    });
    document.querySelectorAll('[data-covenant-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        Finance.negotiateCovenant(parseInt(btn.dataset.covenantIndex));
        buildFinancialPanel();
      });
    });
  }
}
