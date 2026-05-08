// budget.js — Quarterly budget projection exercise.
//
// Fires at round % 13 === 9 (four rounds before each quarter ends). Students
// enter projected revenue and expense totals for the current quarter. On
// subsequent firings, they first see how last quarter's actuals compared to
// their prior projection before setting the new quarter's budget.

const Budget = {

  // Set to true by hud.js at round % 13 === 9; cleared when the modal opens.
  pending: false,

  // Stored projections keyed by game-quarter number (1-based, across all years).
  // { 1: { gate: 50000, parking: 3000, ... }, 2: { ... }, ... }
  _projections: {},

  // All revenue and expense line items, matching PLStatement categories and histKeys.
  ITEMS: [
    { key: 'gate',           label: 'Gate Admissions',         section: 'revenue', histKey: 'gateIncome' },
    { key: 'parking',        label: 'Parking',                 section: 'revenue', histKey: 'parkingIncome' },
    { key: 'shop',           label: 'Merchandise Sales',       section: 'revenue', histKey: 'shopIncome' },
    { key: 'food',           label: 'Food & Beverage',         section: 'revenue', histKey: 'foodIncome' },
    { key: 'membership',     label: 'Memberships',             section: 'revenue', histKey: 'membershipIncome' },
    { key: 'savingsInterest',label: 'Savings Interest',        section: 'revenue', histKey: 'savingsInterestIncome' },
    { key: 'mmInterest',     label: 'Money Market Interest',   section: 'revenue', histKey: 'mmInterestIncome' },
    { key: 'staff',          label: 'Staff Wages',             section: 'expense', histKey: 'staffExpense' },
    { key: 'utilities',      label: 'Ride Utilities',          section: 'expense', histKey: 'utilityExpense' },
    { key: 'construction',   label: 'Construction',            section: 'expense', histKey: 'constructionExpense' },
    { key: 'marketing',      label: 'Marketing',               section: 'expense', histKey: 'marketingExpense' },
    { key: 'merchandise',    label: 'Merchandise Orders',      section: 'expense', histKey: 'merchandiseExpense' },
    { key: 'bus',            label: 'Bus Service',             section: 'expense', histKey: 'parkingBusCost' },
    { key: 'parkingAmenity', label: 'Parking Amenities',       section: 'expense', histKey: 'parkingAmenitySpend' },
    { key: 'memberBenefit',  label: 'Membership Benefits',     section: 'expense', histKey: 'memberBenefitExpense' },
    { key: 'locInterest',    label: 'Line of Credit Interest', section: 'expense', histKey: 'locInterestExpense' },
  ],

  // Wire up the Save button. Called once from initHUD after the DOM is ready.
  init() {
    document.getElementById('budget-save-btn').addEventListener('click', () => this._save());
  },

  // The current game-wide quarter number (1-based, increments every 13 rounds).
  _gameQuarterNum() {
    return Math.ceil(round / 13);
  },

  // Returns "Q3 2024" style label for the last calendar date in the given game quarter.
  // Mirrors the getDateLabel() calculation in hud.js using the quarter's last round.
  _calendarLabel(gameQNum) {
    const lastRound    = gameQNum * 13;
    const weekOfYear   = STARTING_WEEK_OF_YEAR + lastRound - 1;
    const yearsElapsed = Math.floor((weekOfYear - 1) / 52);
    const weekInYear   = ((weekOfYear - 1) % 52) + 1;
    const q            = Math.ceil(weekInYear / 13);
    const year         = STARTING_YEAR + yearsElapsed;
    return `Q${q} ${year}`;
  },

  // Sum a History histKey over a slice of round records.
  _sumSlice(slice, histKey) {
    return slice.reduce((s, r) => s + (r[histKey] || 0), 0);
  },

  // Build and display the modal for the current projection period.
  show() {
    this.pending = false;
    const qNum      = this._gameQuarterNum();
    const priorQNum = qNum - 1;

    // Retrieve the projection that was made for the quarter that just ended.
    const priorProj = priorQNum >= 1 ? (this._projections[priorQNum] || null) : null;

    // Prior quarter actuals: exactly the 13 History rounds for game Q(priorQNum).
    // Available only after at least one full quarter of play has been recorded.
    let priorActuals = null;
    if (priorQNum >= 1) {
      const startIdx = (priorQNum - 1) * 13;
      const endIdx   = priorQNum * 13;
      const slice    = History.rounds.slice(startIdx, endIdx);
      if (slice.length === 13) {
        priorActuals = {};
        for (const item of this.ITEMS) {
          priorActuals[item.key] = this._sumSlice(slice, item.histKey);
        }
      }
    }

    const hasComparison = priorProj !== null || priorActuals !== null;
    const currentLabel  = this._calendarLabel(qNum);
    const priorLabel    = priorQNum >= 1 ? this._calendarLabel(priorQNum) : '';

    document.getElementById('budget-quarter-label').textContent = `${currentLabel} Budget`;
    document.getElementById('budget-instructions').textContent  = hasComparison
      ? `Review last quarter's performance, then set your ${currentLabel} projections.`
      : `Set your projected revenue and expenses for ${currentLabel}.`;

    const wrapper = document.getElementById('budget-table-wrapper');
    wrapper.innerHTML = '';
    wrapper.appendChild(
      this._buildSection('revenue', 'Revenue', priorProj, priorActuals, priorLabel, hasComparison)
    );
    wrapper.appendChild(
      this._buildSection('expense', 'Expenses', priorProj, priorActuals, priorLabel, hasComparison)
    );

    // Net bar sits below both tables and updates live as the player types.
    const netBar = document.createElement('div');
    netBar.className = 'budget-net-bar';
    netBar.innerHTML = `
      <span class="budget-net-label">Projected Net</span>
      <span class="budget-net-value" id="budget-net-value"></span>`;
    wrapper.appendChild(netBar);

    this._bindTotals();
    document.getElementById('budget-modal').classList.remove('hidden');
  },

  // Build one section (Revenue or Expenses) as a table with optional comparison columns.
  // Includes a tfoot row showing column subtotals; the Projection total updates live.
  _buildSection(sectionKey, sectionLabel, priorProj, priorActuals, priorLabel, hasComparison) {
    const items    = this.ITEMS.filter(i => i.section === sectionKey);
    const hdrClass = sectionKey === 'revenue' ? 'budget-revenue-header' : 'budget-expense-header';
    const colClass = sectionKey === 'revenue' ? 'budget-input-hdr-revenue' : 'budget-input-hdr-expense';

    let extraHeaders = '';
    if (hasComparison) {
      extraHeaders = `
        <th class="budget-th">${priorLabel} Projection</th>
        <th class="budget-th">${priorLabel} Actual</th>`;
    }

    const rows = items.map(item => {
      const prevProj   = priorProj    ? (priorProj[item.key]    || 0) : null;
      const prevActual = priorActuals ? (priorActuals[item.key] || 0) : null;

      let comparisonCells = '';
      if (hasComparison) {
        const projStr   = prevProj   !== null ? `$${Math.round(prevProj).toLocaleString()}`   : '—';
        const actualStr = prevActual !== null ? `$${Math.round(prevActual).toLocaleString()}` : '—';

        let varianceEl = '';
        if (prevProj !== null && prevActual !== null) {
          const variance  = prevActual - prevProj;
          // Revenue: higher actual is favorable; expense: lower actual is favorable.
          const favorable = sectionKey === 'revenue' ? variance >= 0 : variance <= 0;
          const varClass  = favorable ? 'budget-var-favorable' : 'budget-var-unfavorable';
          const varSign   = variance >= 0 ? '+' : '−';
          varianceEl = `<span class="budget-variance ${varClass}">${varSign}$${Math.abs(Math.round(variance)).toLocaleString()}</span>`;
        }

        comparisonCells = `
          <td class="budget-td budget-td-num">${projStr}</td>
          <td class="budget-td budget-td-num">${actualStr}${varianceEl}</td>`;
      }

      // Pre-populate input with prior actuals as a planning baseline; default to 0.
      const defaultVal = prevActual !== null ? Math.round(prevActual) : 0;

      return `
        <tr class="budget-row">
          <td class="budget-td budget-td-label">${item.label}</td>
          ${comparisonCells}
          <td class="budget-td budget-td-input">
            <div class="budget-input-wrap">
              <span class="budget-dollar">$</span>
              <input type="number" class="budget-input" data-key="${item.key}" min="0" step="1" value="${defaultVal}" />
            </div>
          </td>
        </tr>`;
    }).join('');

    // Subtotals for the comparison columns (static; computed once at render time).
    const priorProjTotal   = priorProj    ? items.reduce((s, i) => s + (priorProj[i.key]    || 0), 0) : null;
    const priorActualTotal = priorActuals ? items.reduce((s, i) => s + (priorActuals[i.key] || 0), 0) : null;

    let totalComparisonCells = '';
    if (hasComparison) {
      const projTotalStr   = priorProjTotal   !== null ? `$${Math.round(priorProjTotal).toLocaleString()}`   : '—';
      const actualTotalStr = priorActualTotal !== null ? `$${Math.round(priorActualTotal).toLocaleString()}` : '—';

      let totalVarianceEl = '';
      if (priorProjTotal !== null && priorActualTotal !== null) {
        const variance  = priorActualTotal - priorProjTotal;
        const favorable = sectionKey === 'revenue' ? variance >= 0 : variance <= 0;
        const varClass  = favorable ? 'budget-var-favorable' : 'budget-var-unfavorable';
        const varSign   = variance >= 0 ? '+' : '−';
        totalVarianceEl = `<span class="budget-variance ${varClass}">${varSign}$${Math.abs(Math.round(variance)).toLocaleString()}</span>`;
      }

      totalComparisonCells = `
        <td class="budget-td budget-total-num">${projTotalStr}</td>
        <td class="budget-td budget-total-num">${actualTotalStr}${totalVarianceEl}</td>`;
    }

    const div = document.createElement('div');
    div.innerHTML = `
      <div class="budget-section">
        <table class="budget-table">
          <thead>
            <tr>
              <th class="budget-th budget-th-label ${hdrClass}">${sectionLabel}</th>
              ${extraHeaders}
              <th class="budget-th ${colClass}">Projection</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr class="budget-total-row">
              <td class="budget-td budget-total-label">Total</td>
              ${totalComparisonCells}
              <td class="budget-td budget-total-proj" id="budget-total-${sectionKey}">$0</td>
            </tr>
          </tfoot>
        </table>
      </div>`.trim();
    return div.firstElementChild;
  },

  // Wire input event listeners so the section totals and net bar update as the player types.
  _bindTotals() {
    document.querySelectorAll('#budget-table-wrapper .budget-input').forEach(input => {
      input.addEventListener('input', () => this._updateTotals());
    });
    this._updateTotals();
  },

  // Recompute section subtotals and the net bar from current input values.
  _updateTotals() {
    let revenueTotal = 0, expenseTotal = 0;
    document.querySelectorAll('#budget-table-wrapper .budget-input').forEach(input => {
      const val  = parseFloat(input.value) || 0;
      const item = this.ITEMS.find(i => i.key === input.dataset.key);
      if (item.section === 'revenue') revenueTotal += val;
      else                            expenseTotal += val;
    });

    const revEl = document.getElementById('budget-total-revenue');
    const expEl = document.getElementById('budget-total-expense');
    const netEl = document.getElementById('budget-net-value');

    if (revEl) revEl.textContent = `$${Math.round(revenueTotal).toLocaleString()}`;
    if (expEl) expEl.textContent = `$${Math.round(expenseTotal).toLocaleString()}`;

    if (netEl) {
      const net      = revenueTotal - expenseTotal;
      const netSign  = net >= 0 ? '+' : '−';
      const netClass = net >= 0 ? 'budget-net-pos' : 'budget-net-neg';
      netEl.textContent = `${netSign}$${Math.abs(Math.round(net)).toLocaleString()}`;
      netEl.className   = `budget-net-value ${netClass}`;
    }
  },

  // Collect input values, store under current quarter number, save to FormsPanel, and close.
  _save() {
    const qNum       = this._gameQuarterNum();
    const projection = {};
    document.querySelectorAll('#budget-table-wrapper .budget-input').forEach(input => {
      projection[input.dataset.key] = parseFloat(input.value) || 0;
    });
    this._projections[qNum] = projection;

    const revenueTotal = this.ITEMS
      .filter(i => i.section === 'revenue')
      .reduce((s, i) => s + (projection[i.key] || 0), 0);
    const expenseTotal = this.ITEMS
      .filter(i => i.section === 'expense')
      .reduce((s, i) => s + (projection[i.key] || 0), 0);

    FormsPanel.save({
      type:         'budget',
      label:        document.getElementById('budget-quarter-label').textContent,
      quarterNum:   qNum,
      projection,
      revenueTotal,
      expenseTotal,
      netProjected: revenueTotal - expenseTotal,
    });

    this.hide();
  },

  // Close the modal.
  hide() {
    document.getElementById('budget-modal').classList.add('hidden');
  },

};
