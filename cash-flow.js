// cash-flow.js — Annual cash flow statement exercise.
//
// Shows a drag-and-drop modal every 52 rounds (after the balance sheet).
// Students sort annual cash movements into Operating, Investing, or Financing
// activities. The key educational insight: construction payments appear as
// P&L expenses but belong under Investing on the cash flow statement, which
// is why a profitable park can still have negative free cash flow — or why
// a "losing" year can have positive operating cash flow.

const CashFlow = {

  // Set to true by hud.js at the end of each year; cleared when the modal opens.
  pending: false,

  // Keys of items the student has already placed correctly this session.
  _correctKeys: new Set(),

  // Line items for the exercise: label, which CF section it belongs in,
  // the History.rounds field to sum, and whether it is a cash inflow or outflow.
  ITEMS: [
    // Operating activities — day-to-day park revenues
    { key: 'gate',           label: 'Gate Admissions',          correct: 'operating',  histKey: 'gateIncome',           flow: 'in'  },
    { key: 'parking',        label: 'Parking Revenue',          correct: 'operating',  histKey: 'parkingIncome',        flow: 'in'  },
    { key: 'shop',           label: 'Merchandise Sales',        correct: 'operating',  histKey: 'shopIncome',           flow: 'in'  },
    { key: 'food',           label: 'Food & Beverage',          correct: 'operating',  histKey: 'foodIncome',           flow: 'in'  },
    { key: 'membership',     label: 'Memberships',              correct: 'operating',  histKey: 'membershipIncome',     flow: 'in'  },
    { key: 'savingsInterest',label: 'Savings Interest',         correct: 'operating',  histKey: 'savingsInterestIncome',flow: 'in'  },
    { key: 'mmInterest',     label: 'Money Market Interest',    correct: 'operating',  histKey: 'mmInterestIncome',     flow: 'in'  },
    // Operating activities — day-to-day park expenses
    { key: 'staff',          label: 'Staff Wages',              correct: 'operating',  histKey: 'staffExpense',         flow: 'out' },
    { key: 'utilities',      label: 'Ride Utilities',           correct: 'operating',  histKey: 'utilityExpense',       flow: 'out' },
    { key: 'marketing',      label: 'Marketing',                correct: 'operating',  histKey: 'marketingExpense',     flow: 'out' },
    { key: 'merchandise',    label: 'Merchandise Orders',       correct: 'operating',  histKey: 'merchandiseExpense',   flow: 'out' },
    { key: 'bus',            label: 'Bus Service',              correct: 'operating',  histKey: 'parkingBusCost',       flow: 'out' },
    { key: 'memberBenefit',  label: 'Membership Benefits',      correct: 'operating',  histKey: 'memberBenefitExpense', flow: 'out' },
    { key: 'locInterest',    label: 'Line of Credit Interest',  correct: 'operating',  histKey: 'locInterestExpense',   flow: 'out' },
    { key: 'tax',            label: 'Income Tax Paid',          correct: 'operating',  histKey: 'taxExpense',           flow: 'out' },
    { key: 'donations',      label: 'Charitable Donations',     correct: 'operating',  histKey: 'donationExpense',      flow: 'out' },
    // Investing activities — capital expenditures (these appear on the P&L too — the key lesson)
    { key: 'construction',   label: 'Construction Payments',    correct: 'investing',  histKey: 'constructionExpense',  flow: 'out' },
    { key: 'parkingAmenity', label: 'Parking Lot Improvements', correct: 'investing',  histKey: 'parkingAmenitySpend',  flow: 'out' },
    // Financing activities — debt movements
    { key: 'loanRepayment',  label: 'Loan Repayments',          correct: 'financing',  histKey: 'loanRepayment',        flow: 'out' },
    { key: 'loanProceeds',   label: 'Loan Proceeds',            correct: 'financing',  histKey: 'loanDisbursement',     flow: 'in'  },
  ],

  // Active items for the current session — ITEMS filtered to non-zero annuals.
  _activeItems: [],

  // Wire up drag-and-drop listeners on the bank and all three drop zones.
  // Called once from initHUD after the DOM is ready.
  init() {
    this._setupDropZone('cf-bank',                    'cf-bank');
    this._setupDropZone('cf-zone-operating',          'cf-zone-operating-items');
    this._setupDropZone('cf-zone-investing',          'cf-zone-investing-items');
    this._setupDropZone('cf-zone-financing',          'cf-zone-financing-items');
    document.getElementById('cf-submit-btn').addEventListener('click', () => this._submit());
    document.getElementById('cf-close-btn').addEventListener('click',  () => this.hide());
  },

  // Attach dragover/dragleave/drop handlers so dropped items move into targetId.
  // Re-evaluates the submit button state after every drop.
  _setupDropZone(zoneId, targetId) {
    const zone   = document.getElementById(zoneId);
    const target = document.getElementById(targetId);
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('cf-zone-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('cf-zone-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('cf-zone-over');
      const key  = e.dataTransfer.getData('text/plain');
      const card = document.querySelector(`.cf-card-item[data-key="${key}"]`);
      if (card) {
        target.appendChild(card);
        this._updateSubmitState();
      }
    });
  },

  // Enable the submit button only when every item has been dragged out of the bank.
  _updateSubmitState() {
    const bankEmpty = document.getElementById('cf-bank').children.length === 0;
    document.getElementById('cf-submit-btn').disabled = !bankEmpty;
  },

  // Build and display the exercise for the year that just ended.
  show() {
    this.pending = false;
    const yearNum  = Math.floor(round / 52);
    const last52   = History.rounds.slice(-52);

    // Sum each line item over the last 52 rounds; exclude items with a zero total.
    const totals = {};
    for (const item of this.ITEMS) {
      totals[item.key] = last52.reduce((s, r) => s + (r[item.histKey] || 0), 0);
    }
    this._activeItems = this.ITEMS.filter(item => totals[item.key] !== 0);

    document.getElementById('cf-year-label').textContent = `Year ${yearNum}`;

    // Populate the bank with shuffled non-zero item cards.
    const bank      = document.getElementById('cf-bank');
    bank.innerHTML  = '';
    const shuffled  = [...this._activeItems];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const item of shuffled) {
      bank.appendChild(this._makeCard(item.key, item.label, totals[item.key]));
    }

    // Clear all drop zones and reset UI state for a fresh attempt.
    this._correctKeys = new Set();
    document.getElementById('cf-zone-operating-items').innerHTML = '';
    document.getElementById('cf-zone-investing-items').innerHTML = '';
    document.getElementById('cf-zone-financing-items').innerHTML = '';
    document.getElementById('cf-result').classList.add('hidden');
    document.getElementById('cf-submit-btn').classList.remove('hidden');
    document.getElementById('cf-submit-btn').disabled = true;
    document.getElementById('cf-close-btn').classList.add('hidden');

    document.getElementById('cf-modal').classList.remove('hidden');
  },

  // Create a single draggable item card.
  _makeCard(key, label, amount) {
    const item  = this.ITEMS.find(i => i.key === key);
    const arrow = item.flow === 'in' ? '▲' : '▼';
    const arrowCls = item.flow === 'in' ? 'cf-arrow-in' : 'cf-arrow-out';
    const card      = document.createElement('div');
    card.className  = 'cf-card-item';
    card.draggable  = true;
    card.dataset.key    = key;
    card.dataset.amount = amount;
    card.innerHTML = `
      <span class="cf-card-label">${label}</span>
      <span class="cf-card-amount">$${Math.round(amount).toLocaleString()}</span>
      <span class="cf-card-arrow ${arrowCls}">${arrow}</span>
      <span class="cf-card-status"></span>
    `;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', key);
      card.classList.add('cf-dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('cf-dragging'));
    return card;
  },

  // Check placements. Correct items lock; wrong ones return to the bank.
  // Continue appears once all items are correctly placed.
  _submit() {
    const operatingKeys = new Set(
      [...document.querySelectorAll('#cf-zone-operating-items .cf-card-item')].map(c => c.dataset.key)
    );
    const investingKeys = new Set(
      [...document.querySelectorAll('#cf-zone-investing-items .cf-card-item')].map(c => c.dataset.key)
    );
    const financingKeys = new Set(
      [...document.querySelectorAll('#cf-zone-financing-items .cf-card-item')].map(c => c.dataset.key)
    );
    const bank = document.getElementById('cf-bank');

    for (const item of this._activeItems) {
      if (this._correctKeys.has(item.key)) continue;
      const card = document.querySelector(`.cf-card-item[data-key="${item.key}"]`);
      const placed = operatingKeys.has(item.key) ? 'operating'
                   : investingKeys.has(item.key) ? 'investing'
                   : financingKeys.has(item.key) ? 'financing'
                   : null;
      if (placed === item.correct) {
        this._correctKeys.add(item.key);
        card.draggable = false;
        card.classList.add('cf-correct', 'cf-locked');
        card.querySelector('.cf-card-status').textContent = '✓';
      } else {
        card.classList.remove('cf-correct', 'cf-incorrect');
        card.querySelector('.cf-card-status').textContent = '';
        bank.appendChild(card);
      }
    }

    const total    = this._activeItems.length;
    const correct  = this._correctKeys.size;
    const resultEl = document.getElementById('cf-result');

    if (correct === total) {
      // Compute section subtotals — inflows positive, outflows negative.
      let operatingCF = 0, investingCF = 0, financingCF = 0;
      for (const item of this._activeItems) {
        const amt  = parseInt(document.querySelector(`.cf-card-item[data-key="${item.key}"]`).dataset.amount, 10);
        const sign = item.flow === 'in' ? 1 : -1;
        if      (item.correct === 'operating') operatingCF += sign * amt;
        else if (item.correct === 'investing') investingCF += sign * amt;
        else if (item.correct === 'financing') financingCF += sign * amt;
      }
      const netCF = operatingCF + investingCF + financingCF;

      const _fmt = (n) => {
        const sign = n >= 0 ? '+' : '−';
        const cls  = n >= 0 ? 'cf-net-pos' : 'cf-net-neg';
        return `<span class="${cls}">${sign}$${Math.abs(n).toLocaleString()}</span>`;
      };

      FormsPanel.save({
        type:        'cash-flow',
        label:       document.getElementById('cf-year-label').textContent,
        items:       this._activeItems.map(item => ({
          label:   item.label,
          correct: item.correct,
          flow:    item.flow,
          value:   parseInt(document.querySelector(`.cf-card-item[data-key="${item.key}"]`).dataset.amount, 10),
        })),
        operatingCF,
        investingCF,
        financingCF,
        netCF,
      });

      resultEl.innerHTML = `
        <div class="cf-score">All ${total} correct!</div>
        <div class="cf-totals">
          <div class="cf-totals-row"><span>Operating Cash Flow</span>${_fmt(operatingCF)}</div>
          <div class="cf-totals-row"><span>Investing Cash Flow</span>${_fmt(investingCF)}</div>
          <div class="cf-totals-row"><span>Financing Cash Flow</span>${_fmt(financingCF)}</div>
          <div class="cf-totals-divider"></div>
          <div class="cf-totals-row cf-totals-net"><span>Net Cash Change</span>${_fmt(netCF)}</div>
        </div>
      `;
      document.getElementById('cf-submit-btn').classList.add('hidden');
      document.getElementById('cf-close-btn').classList.remove('hidden');
    } else {
      const remaining = total - correct;
      resultEl.innerHTML = `
        <div class="cf-score">${correct} / ${total} correct — fix the ${remaining} item${remaining !== 1 ? 's' : ''} in the bank and try again.</div>
      `;
      this._updateSubmitState();
    }

    resultEl.classList.remove('hidden');
  },

  // Close the modal.
  hide() {
    document.getElementById('cf-modal').classList.add('hidden');
  },

};
