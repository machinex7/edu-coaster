// balance-sheet.js — Annual balance sheet exercise.
//
// Difficulty 1 (first year): two columns — Assets vs Liabilities.
// Owner's Equity is revealed automatically on completion.
//
// Difficulty 2 (subsequent years): four sections — Current Assets,
// Non-current Assets, Current Liabilities, Long-term Liabilities.
// Students must also type in Owner's Equity before Continue unlocks.
//
// _difficulty increments from 1 to 2 after the first successful completion
// and stays at 2 from then on.

const BalanceSheet = {

  // Set to true by hud.js at the end of each year; cleared when the modal opens.
  pending: false,

  // Starts at 1; advances to 2 after the first completion, then stays at 2.
  _difficulty: 1,

  // Keys of items the student has already placed correctly this session.
  _correctKeys: new Set(),

  // Line items built fresh each time show() is called from live game state.
  _items: [],

  // Computed totals held between _submit() and _checkEquity() for D2 equity validation.
  _totalAssets:      0,
  _totalLiabilities: 0,

  // Maps zone-items element IDs to the correct-value strings used in _items.
  _ZONE_MAP: {
    'bs-zone-asset-items':              'asset',
    'bs-zone-liability-items':          'liability',
    'bs-zone-current-asset-items':      'current-asset',
    'bs-zone-noncurrent-asset-items':   'noncurrent-asset',
    'bs-zone-current-liability-items':  'current-liability',
    'bs-zone-longterm-liability-items': 'longterm-liability',
  },

  // Wire up drag-and-drop listeners on all zones for both difficulties,
  // plus action button handlers. Called once from initHUD after the DOM is ready.
  init() {
    // Bank — shared by both difficulties.
    this._setupDropZone('bs-bank', 'bs-bank');
    // Difficulty-1 zones.
    this._setupDropZone('bs-zone-asset',     'bs-zone-asset-items');
    this._setupDropZone('bs-zone-liability', 'bs-zone-liability-items');
    // Difficulty-2 zones.
    this._setupDropZone('bs-zone-current-asset',     'bs-zone-current-asset-items');
    this._setupDropZone('bs-zone-noncurrent-asset',  'bs-zone-noncurrent-asset-items');
    this._setupDropZone('bs-zone-current-liability', 'bs-zone-current-liability-items');
    this._setupDropZone('bs-zone-longterm-liability','bs-zone-longterm-liability-items');
    document.getElementById('bs-submit-btn').addEventListener('click', () => this._submit());
    document.getElementById('bs-equity-check-btn').addEventListener('click', () => this._checkEquity());
    document.getElementById('bs-equity-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._checkEquity();
    });
    document.getElementById('bs-close-btn').addEventListener('click', () => this.hide());
  },

  // Attach dragover/dragleave/drop handlers so dropped items move into targetId.
  // Re-evaluates the submit button state after every drop.
  _setupDropZone(zoneId, targetId) {
    const zone   = document.getElementById(zoneId);
    const target = document.getElementById(targetId);
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('bs-zone-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('bs-zone-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('bs-zone-over');
      const key  = e.dataTransfer.getData('text/plain');
      const card = document.querySelector(`.bs-card-item[data-key="${key}"]`);
      if (card) {
        target.appendChild(card);
        this._updateSubmitState();
      }
    });
  },

  // Enable the submit button only when every item has been dragged out of the bank.
  _updateSubmitState() {
    const bankEmpty = document.getElementById('bs-bank').children.length === 0;
    document.getElementById('bs-submit-btn').disabled = !bankEmpty;
  },

  // Snapshot live game state into a values object used by both item builders.
  _computeValues() {
    const cash = money;

    const merchandiseValue = Shopping.merchandiseInventory.reduce(
      (sum, inv) => sum + inv.count * inv.price, 0
    );

    // Food stock valued at wholesale cost (what we paid), not sale price.
    const foodStockValue = Unlock.FOOD
      ? Concessions.stock.reduce((sum, qty, i) => sum + qty * (Concessions.menuItems[i]?.cost ?? 0), 0)
      : 0;

    // Separate completed park buildings from work still in progress.
    let parkEquipmentValue = 0;
    let constructionValue  = 0;
    for (const record of [...installedRides, ...installedFacilities, ...Shopping.installed]) {
      if ([STATUS.ACTIVE, STATUS.CLOSED, STATUS.BROKEN_DOWN].includes(record.status)) {
        const def = record.rideId     ? rides.find(r => r.id === record.rideId)
                  : record.facilityId ? facilities.find(f => f.id === record.facilityId)
                  :                     Shopping.catalog.find(s => s.id === record.shopId);
        parkEquipmentValue += def?.buildCost ?? 0;
      } else if ([STATUS.UNDER_CONSTRUCTION, STATUS.PAUSED_CONSTRUCTION].includes(record.status)) {
        constructionValue += record.weeksCompleted * record.weeklyPayment;
      }
    }

    // Split loan balance into current (due within 52 weeks) and long-term portions.
    // Uses weekly payment × 52 as an approximation of the current-year obligation.
    let currentLoanPortion  = 0;
    let longtermLoanPortion = 0;
    for (const loan of Finance.activeLoans) {
      if (loan.weeksRemaining <= 52) {
        currentLoanPortion += loan.balance;
      } else {
        const weeklyPayment  = Finance.calcLoanPayment(loan.balance, loan.rate, loan.weeksRemaining).total;
        const thisYearAmount = Math.min(weeklyPayment * 52, loan.balance);
        currentLoanPortion  += thisYearAmount;
        longtermLoanPortion += loan.balance - thisYearAmount;
      }
    }

    return {
      cash, merchandiseValue, foodStockValue,
      parkEquipmentValue, constructionValue,
      currentLoanPortion, longtermLoanPortion,
      totalLoanBalance: currentLoanPortion + longtermLoanPortion,
    };
  },

  // Build the two-column (D1) item list: asset vs liability.
  _buildItemsD1(v) {
    this._items = [
      { key: 'cash',         label: 'Cash on Hand',             correct: 'asset',     value: v.cash },
      { key: 'merchandise',  label: 'Merchandise Inventory',    correct: 'asset',     value: v.merchandiseValue },
      { key: 'equipment',    label: 'Park Equipment',           correct: 'asset',     value: v.parkEquipmentValue },
      { key: 'construction', label: 'Construction in Progress', correct: 'asset',     value: v.constructionValue },
      { key: 'loans',        label: 'Outstanding Loans',        correct: 'liability', value: v.totalLoanBalance },
    ];
    if (Unlock.FOOD) {
      this._items.splice(2, 0, { key: 'food', label: 'Food & Beverage Stock', correct: 'asset', value: v.foodStockValue });
    }
  },

  // Build the four-section (D2) item list: current/non-current split within each column.
  _buildItemsD2(v) {
    this._items = [
      { key: 'cash',           label: 'Cash on Hand',             correct: 'current-asset',    value: v.cash },
      { key: 'merchandise',    label: 'Merchandise Inventory',    correct: 'current-asset',    value: v.merchandiseValue },
      { key: 'equipment',      label: 'Park Equipment',           correct: 'noncurrent-asset', value: v.parkEquipmentValue },
      { key: 'construction',   label: 'Construction in Progress', correct: 'noncurrent-asset', value: v.constructionValue },
      { key: 'current-loans',  label: 'Loan Payments Due (1 Yr)', correct: 'current-liability',  value: v.currentLoanPortion },
      { key: 'longterm-loans', label: 'Long-term Loan Balance',   correct: 'longterm-liability', value: v.longtermLoanPortion },
    ];
    if (Unlock.FOOD) {
      this._items.splice(2, 0, { key: 'food', label: 'Food & Beverage Stock', correct: 'current-asset', value: v.foodStockValue });
    }
  },

  // Snapshot live game state and display the exercise at the correct difficulty.
  show() {
    this.pending = false;
    const yearNum = Math.floor(round / 52);
    const values  = this._computeValues();
    const isD2    = this._difficulty >= 2;

    if (isD2) {
      this._buildItemsD2(values);
    } else {
      this._buildItemsD1(values);
    }

    // Show the correct zone layout and set instructions accordingly.
    document.getElementById('bs-zones-d1').classList.toggle('hidden', isD2);
    document.getElementById('bs-zones-d2').classList.toggle('hidden', !isD2);
    document.getElementById('bs-instructions').textContent = isD2
      ? 'Drag each item into the correct section — Current or Non-current Assets, Current or Long-term Liabilities.'
      : 'Drag each item into the correct column — Assets or Liabilities.';

    document.getElementById('bs-year-label').textContent = `Year ${yearNum} Annual Snapshot`;

    // Populate the bank with shuffled item cards.
    const bank     = document.getElementById('bs-bank');
    bank.innerHTML = '';
    const shuffled = [...this._items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const item of shuffled) {
      bank.appendChild(this._makeCard(item.key, item.label, item.value));
    }

    // Clear all zone items (both D1 and D2) for a clean slate.
    for (const id of Object.keys(this._ZONE_MAP)) {
      document.getElementById(id).innerHTML = '';
    }

    // Reset all UI state for a fresh attempt.
    this._correctKeys = new Set();
    document.getElementById('bs-result').classList.add('hidden');
    document.getElementById('bs-equity-entry').classList.add('hidden');
    document.getElementById('bs-equity-input').value = '';
    document.getElementById('bs-equity-feedback').textContent = '';
    document.getElementById('bs-submit-btn').classList.remove('hidden');
    document.getElementById('bs-submit-btn').disabled = true;
    document.getElementById('bs-close-btn').classList.add('hidden');

    document.getElementById('bs-modal').classList.remove('hidden');
  },

  // Create a single draggable item card.
  _makeCard(key, label, amount) {
    const card     = document.createElement('div');
    card.className = 'bs-card-item';
    card.draggable = true;
    card.dataset.key    = key;
    card.dataset.amount = Math.round(amount);
    card.innerHTML = `
      <span class="bs-card-label">${label}</span>
      <span class="bs-card-amount">$${Math.round(amount).toLocaleString()}</span>
      <span class="bs-card-status"></span>
    `;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', key);
      card.classList.add('bs-dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('bs-dragging'));
    return card;
  },

  // Check placements. Correct items lock; wrong ones return to the bank.
  // On full completion, reveals equity automatically (D1) or prompts for entry (D2).
  _submit() {
    const bank = document.getElementById('bs-bank');

    for (const item of this._items) {
      if (this._correctKeys.has(item.key)) continue;
      const card   = document.querySelector(`.bs-card-item[data-key="${item.key}"]`);
      const placed = this._ZONE_MAP[card?.parentElement?.id] ?? null;
      if (placed === item.correct) {
        this._correctKeys.add(item.key);
        card.draggable = false;
        card.classList.add('bs-correct', 'bs-locked');
        card.querySelector('.bs-card-status').textContent = '✓';
      } else {
        card.classList.remove('bs-correct', 'bs-incorrect');
        card.querySelector('.bs-card-status').textContent = '';
        bank.appendChild(card);
      }
    }

    const total    = this._items.length;
    const correct  = this._correctKeys.size;
    const resultEl = document.getElementById('bs-result');

    if (correct === total) {
      // Compute totals — correct field contains 'asset' or ends with '-asset' for assets.
      let totalAssets = 0, totalLiabilities = 0;
      for (const item of this._items) {
        const amt = parseInt(document.querySelector(`.bs-card-item[data-key="${item.key}"]`).dataset.amount, 10);
        if (item.correct.includes('asset')) totalAssets      += amt;
        else                                totalLiabilities += amt;
      }
      this._totalAssets      = totalAssets;
      this._totalLiabilities = totalLiabilities;

      resultEl.innerHTML = `
        <div class="bs-score">All ${total} correct!</div>
        <div class="bs-totals">
          <span>Total Assets: $${totalAssets.toLocaleString()}</span>
          <span>Total Liabilities: $${totalLiabilities.toLocaleString()}</span>
        </div>
      `;
      resultEl.classList.remove('hidden');
      document.getElementById('bs-submit-btn').classList.add('hidden');

      if (this._difficulty >= 2) {
        // D2: let the student compute and type in Owner's Equity.
        document.getElementById('bs-equity-entry').classList.remove('hidden');
        document.getElementById('bs-equity-input').focus();
      } else {
        // D1: reveal equity automatically, advance difficulty, show Continue.
        const equity      = totalAssets - totalLiabilities;
        const equitySign  = equity >= 0 ? '+' : '−';
        const equityClass = equity >= 0 ? 'bs-equity-pos' : 'bs-equity-neg';
        resultEl.innerHTML += `
          <div class="bs-equity ${equityClass}">Owner's Equity: ${equitySign}$${Math.abs(equity).toLocaleString()}</div>
        `;
        this._difficulty = 2;
        document.getElementById('bs-close-btn').classList.remove('hidden');
      }
    } else {
      // Some items returned to bank — tell the student how many remain.
      const remaining = total - correct;
      resultEl.innerHTML = `
        <div class="bs-score">${correct} / ${total} correct — fix the ${remaining} item${remaining !== 1 ? 's' : ''} in the bank and try again.</div>
      `;
      resultEl.classList.remove('hidden');
      this._updateSubmitState();
    }
  },

  // Validate the typed Owner's Equity value (D2 only).
  // Accepts answers within $1 of the expected value to absorb display rounding.
  _checkEquity() {
    const input    = document.getElementById('bs-equity-input');
    const feedback = document.getElementById('bs-equity-feedback');
    const entered  = Math.round(parseFloat(input.value));
    const expected = this._totalAssets - this._totalLiabilities;

    if (isNaN(entered) || Math.abs(entered - expected) > 1) {
      feedback.textContent = 'Not quite — check your math and try again.';
      feedback.className   = 'bs-equity-feedback bs-equity-wrong';
      input.select();
      return;
    }

    // Correct — append the formatted equity line and show Continue.
    const equitySign  = expected >= 0 ? '+' : '−';
    const equityClass = expected >= 0 ? 'bs-equity-pos' : 'bs-equity-neg';
    document.getElementById('bs-result').innerHTML += `
      <div class="bs-equity ${equityClass}">Owner's Equity: ${equitySign}$${Math.abs(expected).toLocaleString()}</div>
    `;
    document.getElementById('bs-equity-entry').classList.add('hidden');
    document.getElementById('bs-close-btn').classList.remove('hidden');
  },

  // Close the modal.
  hide() {
    document.getElementById('bs-modal').classList.add('hidden');
  },

};
