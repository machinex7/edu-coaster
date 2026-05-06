// pl-statement.js — Quarterly P&L statement exercise.
//
// Shows a drag-and-drop modal every 13 rounds. Students sort real quarterly
// totals (drawn from History) into Revenue or Expenses. Correct items lock
// in place; wrong ones return to the bank for another attempt. Continue only
// appears once every item is placed correctly.

const PLStatement = {

  // Set to true by hud.js at the end of each quarter; cleared when the modal opens.
  pending: false,

  // Keys of items the student has already placed correctly this session.
  _correctKeys: new Set(),

  // Line items for the exercise: label shown to the student, the correct
  // category, and the History.rounds field used to sum the quarterly total.
  ITEMS: [
    { key: 'gate',         label: 'Gate Admissions',  correct: 'revenue', histKey: 'gateIncome' },
    { key: 'parking',      label: 'Parking',           correct: 'revenue', histKey: 'parkingIncome' },
    { key: 'shop',         label: 'Merchandise Sales', correct: 'revenue', histKey: 'shopIncome' },
    { key: 'staff',        label: 'Staff Wages',       correct: 'expense', histKey: 'staffExpense' },
    { key: 'utilities',    label: 'Ride Utilities',    correct: 'expense', histKey: 'utilityExpense' },
    { key: 'construction', label: 'Construction',      correct: 'expense', histKey: 'constructionExpense' },
    { key: 'marketing',   label: 'Marketing',          correct: 'expense', histKey: 'marketingExpense' },
  ],

  // Wire up drag-and-drop listeners on the bank and both drop zones.
  // Called once from initHUD after the DOM is ready.
  init() {
    this._setupDropZone('pl-bank',         'pl-bank');
    this._setupDropZone('pl-zone-revenue', 'pl-zone-revenue-items');
    this._setupDropZone('pl-zone-expense', 'pl-zone-expense-items');
    document.getElementById('pl-submit-btn').addEventListener('click', () => this._submit());
    document.getElementById('pl-close-btn').addEventListener('click', () => this.hide());
  },

  // Attach dragover/dragleave/drop handlers so dropped items move into targetId.
  // Re-evaluates the submit button state after every drop.
  _setupDropZone(zoneId, targetId) {
    const zone   = document.getElementById(zoneId);
    const target = document.getElementById(targetId);
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('pl-zone-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('pl-zone-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('pl-zone-over');
      const key  = e.dataTransfer.getData('text/plain');
      const card = document.querySelector(`.pl-card-item[data-key="${key}"]`);
      if (card) {
        target.appendChild(card);
        this._updateSubmitState();
      }
    });
  },

  // Enable the submit button only when every item has been dragged out of the bank.
  _updateSubmitState() {
    const bankEmpty = document.getElementById('pl-bank').children.length === 0;
    document.getElementById('pl-submit-btn').disabled = !bankEmpty;
  },

  // Build and display the exercise for the quarter that just ended.
  show() {
    this.pending = false;
    const quarterNum = round / 13;
    const last13     = History.rounds.slice(-13);

    // Sum each line item over the last 13 rounds.
    const totals = {};
    for (const item of this.ITEMS) {
      totals[item.key] = last13.reduce((s, r) => s + (r[item.histKey] || 0), 0);
    }

    document.getElementById('pl-quarter-label').textContent = `Quarter ${quarterNum}`;

    // Populate the bank with shuffled item cards.
    const bank = document.getElementById('pl-bank');
    bank.innerHTML = '';
    const shuffled = [...this.ITEMS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const item of shuffled) {
      bank.appendChild(this._makeCard(item.key, item.label, totals[item.key]));
    }

    // Clear drop zones, correct-key tracking, and UI state for a fresh attempt.
    this._correctKeys = new Set();
    document.getElementById('pl-zone-revenue-items').innerHTML = '';
    document.getElementById('pl-zone-expense-items').innerHTML = '';
    document.getElementById('pl-result').classList.add('hidden');
    document.getElementById('pl-submit-btn').classList.remove('hidden');
    document.getElementById('pl-submit-btn').disabled = true; // bank is full at start
    document.getElementById('pl-close-btn').classList.add('hidden');

    document.getElementById('pl-modal').classList.remove('hidden');
  },

  // Create a single draggable item card.
  _makeCard(key, label, amount) {
    const card      = document.createElement('div');
    card.className  = 'pl-card-item';
    card.draggable  = true;
    card.dataset.key    = key;
    card.dataset.amount = amount;
    card.innerHTML = `
      <span class="pl-card-label">${label}</span>
      <span class="pl-card-amount">$${amount.toLocaleString()}</span>
      <span class="pl-card-status"></span>
    `;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', key);
      card.classList.add('pl-dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('pl-dragging'));
    return card;
  },

  // Check placements for any unlocked item. Correct ones lock in place with a
  // checkmark; incorrect ones return to the bank for another attempt. Continue
  // only appears once all items are placed correctly.
  _submit() {
    const revenueKeys = new Set(
      [...document.querySelectorAll('#pl-zone-revenue-items .pl-card-item')].map(c => c.dataset.key)
    );
    const expenseKeys = new Set(
      [...document.querySelectorAll('#pl-zone-expense-items .pl-card-item')].map(c => c.dataset.key)
    );
    const bank = document.getElementById('pl-bank');

    for (const item of this.ITEMS) {
      if (this._correctKeys.has(item.key)) continue; // already locked from a prior attempt
      const card   = document.querySelector(`.pl-card-item[data-key="${item.key}"]`);
      const placed = revenueKeys.has(item.key) ? 'revenue'
                   : expenseKeys.has(item.key) ? 'expense'
                   : null;
      if (placed === item.correct) {
        // Lock the card in place — can no longer be dragged.
        this._correctKeys.add(item.key);
        card.draggable = false;
        card.classList.add('pl-correct', 'pl-locked');
        card.querySelector('.pl-card-status').textContent = '✓';
      } else {
        // Return to bank for another attempt; strip any stale feedback classes.
        card.classList.remove('pl-correct', 'pl-incorrect');
        card.querySelector('.pl-card-status').textContent = '';
        bank.appendChild(card);
      }
    }

    const total    = this.ITEMS.length;
    const correct  = this._correctKeys.size;
    const resultEl = document.getElementById('pl-result');

    if (correct === total) {
      // All items correct — compute the net and reveal Continue.
      let totalRevenue = 0, totalExpense = 0;
      for (const item of this.ITEMS) {
        const amt = parseInt(document.querySelector(`.pl-card-item[data-key="${item.key}"]`).dataset.amount, 10);
        if (item.correct === 'revenue') totalRevenue += amt;
        else                            totalExpense  += amt;
      }
      const net      = totalRevenue - totalExpense;
      const netSign  = net >= 0 ? '+' : '−';
      const netClass = net >= 0 ? 'pl-net-pos' : 'pl-net-neg';
      const netLabel = net >= 0 ? 'Net Profit' : 'Net Loss';
      resultEl.innerHTML = `
        <div class="pl-score">All ${total} correct!</div>
        <div class="pl-net ${netClass}">${netLabel}: ${netSign}$${Math.abs(net).toLocaleString()}</div>
      `;
      document.getElementById('pl-submit-btn').classList.add('hidden');
      document.getElementById('pl-close-btn').classList.remove('hidden');
    } else {
      // Some items returned to bank — tell the student how many remain.
      const remaining = total - correct;
      resultEl.innerHTML = `
        <div class="pl-score">${correct} / ${total} correct — fix the ${remaining} item${remaining !== 1 ? 's' : ''} in the bank and try again.</div>
      `;
      // Bank now has cards, so submit re-disables until they are all placed again.
      this._updateSubmitState();
    }

    resultEl.classList.remove('hidden');
  },

  // Close the modal.
  hide() {
    document.getElementById('pl-modal').classList.add('hidden');
  },

};
