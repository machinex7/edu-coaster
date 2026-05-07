// balance-sheet.js — Annual balance sheet exercise.
//
// Shows a drag-and-drop modal every 52 rounds (end of each in-game year).
// Students sort point-in-time asset and liability values (read from live game
// state) into the correct column. Correct items lock on placement; wrong ones
// return to the bank. Continue only appears once every item is placed correctly,
// at which point Owner's Equity (Assets − Liabilities) is revealed.

const BalanceSheet = {

  // Set to true by hud.js at the end of each year; cleared when the modal opens.
  pending: false,

  // Keys of items the student has already placed correctly this session.
  _correctKeys: new Set(),

  // Line items built fresh each time show() is called from live game state.
  _items: [],

  // Wire up drag-and-drop listeners on the bank and both drop zones.
  // Called once from initHUD after the DOM is ready.
  init() {
    this._setupDropZone('bs-bank',           'bs-bank');
    this._setupDropZone('bs-zone-asset',     'bs-zone-asset-items');
    this._setupDropZone('bs-zone-liability', 'bs-zone-liability-items');
    document.getElementById('bs-submit-btn').addEventListener('click', () => this._submit());
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

  // Snapshot live game state into line items and display the exercise.
  show() {
    this.pending = false;
    const yearNum = Math.floor(round / 52);

    // ── Compute asset values from live state ──────────────────────────────────

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

    const loanBalance = Finance.activeLoans.reduce((s, l) => s + l.balance, 0);

    // ── Build ordered item list ───────────────────────────────────────────────

    this._items = [
      { key: 'cash',         label: 'Cash on Hand',             correct: 'asset',     value: cash },
      { key: 'merchandise',  label: 'Merchandise Inventory',    correct: 'asset',     value: merchandiseValue },
      { key: 'equipment',    label: 'Park Equipment',           correct: 'asset',     value: parkEquipmentValue },
      { key: 'construction', label: 'Construction in Progress', correct: 'asset',     value: constructionValue },
      { key: 'loans',        label: 'Outstanding Loans',        correct: 'liability', value: loanBalance },
    ];

    // Only include food stock if the food system has been unlocked.
    if (Unlock.FOOD) {
      this._items.splice(2, 0, { key: 'food', label: 'Food & Beverage Stock', correct: 'asset', value: foodStockValue });
    }

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

    // Clear drop zones, correct-key tracking, and UI state for a fresh attempt.
    this._correctKeys = new Set();
    document.getElementById('bs-zone-asset-items').innerHTML     = '';
    document.getElementById('bs-zone-liability-items').innerHTML = '';
    document.getElementById('bs-result').classList.add('hidden');
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

  // Check placements for any unlocked item. Correct ones lock with a checkmark;
  // wrong ones return to the bank. Continue appears once all items are correct,
  // revealing the Owner's Equity balance.
  _submit() {
    const assetKeys = new Set(
      [...document.querySelectorAll('#bs-zone-asset-items .bs-card-item')].map(c => c.dataset.key)
    );
    const liabilityKeys = new Set(
      [...document.querySelectorAll('#bs-zone-liability-items .bs-card-item')].map(c => c.dataset.key)
    );
    const bank = document.getElementById('bs-bank');

    for (const item of this._items) {
      if (this._correctKeys.has(item.key)) continue;
      const card   = document.querySelector(`.bs-card-item[data-key="${item.key}"]`);
      const placed = assetKeys.has(item.key)     ? 'asset'
                   : liabilityKeys.has(item.key) ? 'liability'
                   : null;
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
      // All items correct — compute totals and reveal Owner's Equity.
      let totalAssets = 0, totalLiabilities = 0;
      for (const item of this._items) {
        const amt = parseInt(document.querySelector(`.bs-card-item[data-key="${item.key}"]`).dataset.amount, 10);
        if (item.correct === 'asset') totalAssets      += amt;
        else                          totalLiabilities += amt;
      }
      const equity      = totalAssets - totalLiabilities;
      const equitySign  = equity >= 0 ? '+' : '−';
      const equityClass = equity >= 0 ? 'bs-equity-pos' : 'bs-equity-neg';
      resultEl.innerHTML = `
        <div class="bs-score">All ${total} correct!</div>
        <div class="bs-totals">
          <span>Total Assets: $${totalAssets.toLocaleString()}</span>
          <span>Total Liabilities: $${totalLiabilities.toLocaleString()}</span>
        </div>
        <div class="bs-equity ${equityClass}">Owner's Equity: ${equitySign}$${Math.abs(equity).toLocaleString()}</div>
      `;
      document.getElementById('bs-submit-btn').classList.add('hidden');
      document.getElementById('bs-close-btn').classList.remove('hidden');
    } else {
      // Some items returned to bank — tell the student how many remain.
      const remaining = total - correct;
      resultEl.innerHTML = `
        <div class="bs-score">${correct} / ${total} correct — fix the ${remaining} item${remaining !== 1 ? 's' : ''} in the bank and try again.</div>
      `;
      this._updateSubmitState();
    }

    resultEl.classList.remove('hidden');
  },

  // Close the modal.
  hide() {
    document.getElementById('bs-modal').classList.add('hidden');
  },

};
