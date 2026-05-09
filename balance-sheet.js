// balance-sheet.js — Annual balance sheet exercise.
//
// Four progressive difficulty tiers, each unlocked after completing the previous:
//
//   D1: Two zones (Assets / Liabilities). Equity auto-revealed. No distractors.
//   D2: Two zones + Not Applicable zone. Income-statement distractors mixed in.
//       Equity auto-revealed.
//   D3: Four classified zones (Current Assets, Non-current Assets, Current
//       Liabilities, Long-term Liabilities). Student types Owner's Equity.
//       No distractors.
//   D4: Four classified zones + Not Applicable zone. Income-statement
//       distractors mixed in. Student types Owner's Equity.
//
// _difficulty starts at 1 and advances by 1 after each completion (capped at 4).

const BalanceSheet = {

  // Set to true by hud.js at the end of each year; cleared when the modal opens.
  pending: false,

  // Current difficulty tier; advances 1→2→3→4 (stays at 4).
  _difficulty: 1,

  // Keys of items the student has already placed correctly this session.
  _correctKeys: new Set(),

  // Line items built fresh each time show() is called from live game state.
  _items: [],

  // Computed totals held between _submit() and _checkEquity() for D3/D4 equity validation.
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
    'bs-zone-na-items':                 'na',
  },

  // Wire up drag-and-drop listeners on all zones across all difficulty tiers,
  // plus action button handlers. Called once from initHUD after the DOM is ready.
  init() {
    // Bank — shared by all difficulties.
    this._setupDropZone('bs-bank',                 'bs-bank');
    // D1/D2 zones.
    this._setupDropZone('bs-zone-asset',           'bs-zone-asset-items');
    this._setupDropZone('bs-zone-liability',        'bs-zone-liability-items');
    // D3/D4 zones.
    this._setupDropZone('bs-zone-current-asset',     'bs-zone-current-asset-items');
    this._setupDropZone('bs-zone-noncurrent-asset',  'bs-zone-noncurrent-asset-items');
    this._setupDropZone('bs-zone-current-liability', 'bs-zone-current-liability-items');
    this._setupDropZone('bs-zone-longterm-liability','bs-zone-longterm-liability-items');
    // N/A zone — shown for D2 and D4.
    this._setupDropZone('bs-zone-na',              'bs-zone-na-items');
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

  // Snapshot live game state into a values object used by all item builders.
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
    // Broken-down rides use the same 10%-per-repair-week discount as Finance.parkValue().
    let parkEquipmentValue = 0;
    let constructionValue  = 0;
    for (const record of [...installedRides, ...installedFacilities, ...Shopping.installed]) {
      if (record.status === STATUS.BROKEN_DOWN) {
        const def  = rides.find(r => r.id === record.rideId);
        const base = def?.buildCost ?? 0;
        parkEquipmentValue += Math.max(0, base * (1 - 0.1 * record.weeksToRepair));
      } else if (record.status === STATUS.ACTIVE || record.status === STATUS.CLOSED) {
        const def = record.rideId     ? rides.find(r => r.id === record.rideId)
                  : record.facilityId ? facilities.find(f => f.id === record.facilityId)
                  :                     Shopping.catalog.find(s => s.id === record.shopId);
        parkEquipmentValue += def?.buildCost ?? 0;
      } else if (record.status === STATUS.UNDER_CONSTRUCTION || record.status === STATUS.PAUSED_CONSTRUCTION) {
        constructionValue += record.weeksCompleted * record.weeklyPayment;
      }
    }

    // Split loan balance into current (due within 52 weeks) and long-term portions.
    // Uses weekly payment × 52 as an approximation of the current-year obligation.
    let currentLoanPortion  = 0;
    let longtermLoanPortion = 0;
    for (const loan of Banking.activeLoans) {
      if (loan.weeksRemaining <= 52) {
        currentLoanPortion += loan.balance;
      } else {
        const weeklyPayment  = Banking.calcLoanPayment(loan.balance, loan.rate, loan.weeksRemaining).total;
        const thisYearAmount = Math.min(weeklyPayment * 52, loan.balance);
        currentLoanPortion  += thisYearAmount;
        longtermLoanPortion += loan.balance - thisYearAmount;
      }
    }

    const savingsBalance = Banking.savingsBalance;
    const mmBalance      = Banking.mmBalance;

    const locBalance = Banking.locBalance;

    return {
      cash, savingsBalance, mmBalance, merchandiseValue, foodStockValue,
      parkEquipmentValue, constructionValue,
      currentLoanPortion, longtermLoanPortion,
      totalLoanBalance: currentLoanPortion + longtermLoanPortion,
      locBalance,
    };
  },

  // Build income-statement items as "Not Applicable" distractors for D2 and D4.
  // Only items with a non-zero year-to-date total are included.
  _computeDistractors() {
    const last52 = History.rounds.slice(-52);
    const sum    = key => last52.reduce((s, r) => s + (r[key] || 0), 0);
    return [
      { key: 'd-wages',     label: 'Staff Wages (Year to Date)',      correct: 'na', value: sum('staffExpense') },
      { key: 'd-utilities', label: 'Utilities (Year to Date)',        correct: 'na', value: sum('utilityExpense') },
      { key: 'd-marketing', label: 'Marketing (Year to Date)',        correct: 'na', value: sum('marketingExpense') },
      { key: 'd-gate',      label: 'Gate Revenue (Year to Date)',     correct: 'na', value: sum('gateIncome') },
    ].filter(item => Math.round(item.value) !== 0);
  },

  // D1: two zones (Assets / Liabilities), no distractors.
  // Items with a zero rounded value are excluded.
  _buildItemsD1(v) {
    const all = [
      { key: 'cash',         label: 'Cash on Hand',             correct: 'asset',     value: v.cash },
      { key: 'savings',      label: 'Savings Account',          correct: 'asset',     value: v.savingsBalance },
      { key: 'mm',           label: 'Money Market Account',     correct: 'asset',     value: v.mmBalance },
      { key: 'merchandise',  label: 'Merchandise Inventory',    correct: 'asset',     value: v.merchandiseValue },
      { key: 'equipment',    label: 'Park Equipment',           correct: 'asset',     value: v.parkEquipmentValue },
      { key: 'construction', label: 'Construction in Progress', correct: 'asset',     value: v.constructionValue },
      { key: 'loans',        label: 'Outstanding Loans',        correct: 'liability', value: v.totalLoanBalance },
      { key: 'loc',          label: 'Line of Credit Balance',   correct: 'liability', value: v.locBalance },
    ];
    if (Unlock.FOOD) {
      all.splice(3, 0, { key: 'food', label: 'Food & Beverage Stock', correct: 'asset', value: v.foodStockValue });
    }
    this._items = all.filter(item => Math.round(item.value) !== 0);
  },

  // D2: same balance sheet items as D1 plus income-statement distractors.
  _buildItemsD2(v) {
    this._buildItemsD1(v);
    this._items = [...this._items, ...this._computeDistractors()];
  },

  // D3: four classified zones (current/non-current split), no distractors.
  _buildItemsD3(v) {
    const all = [
      { key: 'cash',           label: 'Cash on Hand',             correct: 'current-asset',    value: v.cash },
      { key: 'savings',        label: 'Savings Account',          correct: 'current-asset',    value: v.savingsBalance },
      { key: 'mm',             label: 'Money Market Account',     correct: 'current-asset',    value: v.mmBalance },
      { key: 'merchandise',    label: 'Merchandise Inventory',    correct: 'current-asset',    value: v.merchandiseValue },
      { key: 'equipment',      label: 'Park Equipment',           correct: 'noncurrent-asset', value: v.parkEquipmentValue },
      { key: 'construction',   label: 'Construction in Progress', correct: 'noncurrent-asset', value: v.constructionValue },
      { key: 'current-loans',  label: 'Loan Payments Due (1 Yr)', correct: 'current-liability',  value: v.currentLoanPortion },
      { key: 'longterm-loans', label: 'Long-term Loan Balance',   correct: 'longterm-liability', value: v.longtermLoanPortion },
      { key: 'loc',            label: 'Line of Credit Balance',   correct: 'current-liability',  value: v.locBalance },
    ];
    if (Unlock.FOOD) {
      all.splice(3, 0, { key: 'food', label: 'Food & Beverage Stock', correct: 'current-asset', value: v.foodStockValue });
    }
    this._items = all.filter(item => Math.round(item.value) !== 0);
  },

  // D4: same classified items as D3 plus income-statement distractors.
  _buildItemsD4(v) {
    this._buildItemsD3(v);
    this._items = [...this._items, ...this._computeDistractors()];
  },

  // Snapshot live game state and display the exercise at the correct difficulty.
  show() {
    this.pending = false;
    const yearNum      = Math.floor(round / 52);
    const values       = this._computeValues();
    const isClassified = this._difficulty >= 3;
    const hasNA        = this._difficulty === 2 || this._difficulty === 4;
    const equityTyped  = this._difficulty >= 3;

    if      (this._difficulty === 1) this._buildItemsD1(values);
    else if (this._difficulty === 2) this._buildItemsD2(values);
    else if (this._difficulty === 3) this._buildItemsD3(values);
    else                             this._buildItemsD4(values);

    // Show the correct zone layout for this difficulty tier.
    document.getElementById('bs-zones-d1').classList.toggle('hidden', isClassified);
    document.getElementById('bs-zones-d2').classList.toggle('hidden', !isClassified);
    document.getElementById('bs-zone-na').classList.toggle('hidden', !hasNA);

    // Set instructions appropriate for the active difficulty tier.
    let instructions;
    if (isClassified && hasNA) {
      instructions = 'Drag each item into the correct section — or "Not Applicable" if it doesn\'t belong on the balance sheet.';
    } else if (isClassified) {
      instructions = 'Drag each item into the correct section — Current or Non-current Assets, Current or Long-term Liabilities.';
    } else if (hasNA) {
      instructions = 'Drag each item into the correct column — Assets, Liabilities, or Not Applicable if it doesn\'t belong on the balance sheet.';
    } else {
      instructions = 'Drag each item into the correct column — Assets or Liabilities.';
    }
    document.getElementById('bs-instructions').textContent = instructions;
    document.getElementById('bs-year-label').textContent = `Year ${yearNum} Annual Snapshot`;

    // Populate the bank with shuffled item cards (including distractors if any).
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

    // Clear all zone items (all difficulties) for a clean slate.
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
  // On full completion, reveals equity (D1/D2) or prompts the student to type it (D3/D4).
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
      // Compute totals; 'na' distractor items are excluded from both sums.
      let totalAssets = 0, totalLiabilities = 0;
      for (const item of this._items) {
        const amt = parseInt(document.querySelector(`.bs-card-item[data-key="${item.key}"]`).dataset.amount, 10);
        if      (item.correct.includes('asset'))     totalAssets      += amt;
        else if (item.correct.includes('liability')) totalLiabilities += amt;
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

      if (this._difficulty >= 3) {
        // D3/D4: let the student compute and type in Owner's Equity.
        document.getElementById('bs-equity-entry').classList.remove('hidden');
        document.getElementById('bs-equity-input').focus();
      } else {
        // D1/D2: reveal equity automatically, then advance difficulty and show Continue.
        const equity      = totalAssets - totalLiabilities;
        const equitySign  = equity >= 0 ? '+' : '−';
        const equityClass = equity >= 0 ? 'bs-equity-pos' : 'bs-equity-neg';
        resultEl.innerHTML += `
          <div class="bs-equity ${equityClass}">Owner's Equity: ${equitySign}$${Math.abs(equity).toLocaleString()}</div>
        `;
        FormsPanel.save({
          type:             'balance-sheet',
          label:            document.getElementById('bs-year-label').textContent,
          difficulty:       this._difficulty,
          items:            this._items.map(item => ({
            label:   item.label,
            correct: item.correct,
            value:   parseInt(document.querySelector(`.bs-card-item[data-key="${item.key}"]`).dataset.amount, 10),
          })),
          totalAssets,
          totalLiabilities,
          equity,
        });
        this._difficulty = Math.min(4, this._difficulty + 1);
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

  // Validate the typed Owner's Equity value (D3/D4 only).
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

    // Correct — append the formatted equity line, save, advance difficulty, show Continue.
    const equitySign  = expected >= 0 ? '+' : '−';
    const equityClass = expected >= 0 ? 'bs-equity-pos' : 'bs-equity-neg';
    document.getElementById('bs-result').innerHTML += `
      <div class="bs-equity ${equityClass}">Owner's Equity: ${equitySign}$${Math.abs(expected).toLocaleString()}</div>
    `;
    FormsPanel.save({
      type:             'balance-sheet',
      label:            document.getElementById('bs-year-label').textContent,
      difficulty:       this._difficulty,
      items:            this._items.map(item => ({
        label:   item.label,
        correct: item.correct,
        value:   parseInt(document.querySelector(`.bs-card-item[data-key="${item.key}"]`).dataset.amount, 10),
      })),
      totalAssets:      this._totalAssets,
      totalLiabilities: this._totalLiabilities,
      equity:           expected,
    });
    this._difficulty = Math.min(4, this._difficulty + 1);
    document.getElementById('bs-equity-entry').classList.add('hidden');
    document.getElementById('bs-close-btn').classList.remove('hidden');
  },

  // Close the modal and chain to the annual cash flow statement when due.
  hide() {
    document.getElementById('bs-modal').classList.add('hidden');
    if (CashFlow.pending) CashFlow.show();
  },

};
