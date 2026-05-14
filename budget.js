// budget.js — Two-phase quarterly budget projection exercise.
//
// Phase 1 — Tentative: fires at round % 13 === 11 (two rounds before quarter
// end). Shows the last fully completed quarter's actuals as a planning reference;
// student forecasts the upcoming quarter before seeing the P&L.
//
// Phase 2 — Revised: fires at round % 13 === 1 (one week after the P&L,
// round > 1). Shows the tentative budget and last quarter's actuals side by
// side; student refines with full information.

const Budget = {

  // Set to true by hud.js; cleared when the modal opens.
  pendingTentative: false,
  pendingRevised:   false,

  // Tentative budgets keyed by target game-quarter number (1-based, game-wide).
  _tentative: {},

  // Revised budgets keyed by target game-quarter number.
  _revised: {},

  // Active phase and target quarter; set in show(), read in _save().
  _currentPhase:      null,
  _currentTargetQNum: null,

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
    { key: 'donations',      label: 'Charitable Donations',    section: 'expense', histKey: 'donationExpense' },
  ],

  // Wire up the Save button. Called once from initHUD after the DOM is ready.
  init() {
    document.getElementById('budget-save-btn').addEventListener('click', () => this._save());
  },

  // The current game-wide quarter number (1-based, increments every 13 rounds).
  _gameQuarterNum() {
    return Math.ceil(round / 13);
  },

  // Returns "Q3 2024" style label for the calendar period of the given game quarter.
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

  // Build and display the modal for the given phase ('tentative' or 'revised').
  show(phase) {
    this.pendingTentative = false;
    this.pendingRevised   = false;

    const currentQNum = this._gameQuarterNum();

    // Tentative: projecting the NEXT quarter (about to start).
    // Revised: refining the CURRENT quarter (just started after the P&L).
    const targetQNum  = phase === 'tentative' ? currentQNum + 1 : currentQNum;
    const targetLabel = this._calendarLabel(targetQNum);

    const compCols     = this._buildCompCols(phase, targetQNum);
    const hasComp      = compCols.length > 0;

    // Instructions vary by phase and whether comparison data is available.
    let instructions;
    if (phase === 'tentative') {
      instructions = hasComp
        ? `Review last quarter's actuals, then enter your tentative ${targetLabel} projections before seeing the final P&L.`
        : `Enter your tentative revenue and expense projections for ${targetLabel}.`;
    } else {
      instructions = hasComp
        ? `You've seen the P&L — review your tentative budget and last quarter's actuals, then revise your ${targetLabel} projections.`
        : `Now that you've seen the P&L, enter your revised ${targetLabel} budget.`;
    }

    document.getElementById('budget-quarter-label').textContent = `${targetLabel} ${phase === 'tentative' ? 'Tentative' : 'Revised'} Budget`;
    document.getElementById('budget-instructions').textContent  = instructions;

    // Revised phase pre-populates inputs from the tentative values; tentative starts at 0.
    const inputDefaults = phase === 'revised' ? (this._tentative[targetQNum] || null) : null;

    const wrapper = document.getElementById('budget-table-wrapper');
    wrapper.innerHTML = '';
    wrapper.appendChild(this._buildSection('revenue', 'Revenue',  compCols, inputDefaults));
    wrapper.appendChild(this._buildSection('expense', 'Expenses', compCols, inputDefaults));

    const netBar = document.createElement('div');
    netBar.className = 'budget-net-bar';
    netBar.innerHTML = `
      <span class="budget-net-label">Projected Net</span>
      <span class="budget-net-value" id="budget-net-value"></span>`;
    wrapper.appendChild(netBar);

    this._currentPhase      = phase;
    this._currentTargetQNum = targetQNum;
    this._bindTotals();
    document.getElementById('budget-modal').classList.remove('hidden');
  },

  // Assemble the read-only comparison column definitions for the given phase.
  // Each column: { header: string, values: { key: number } }
  _buildCompCols(phase, targetQNum) {
    const cols = [];

    if (phase === 'tentative') {
      // Show the last fully completed quarter's actuals so the student has a concrete
      // scale reference when forecasting. targetQNum - 2 is the last completed quarter
      // because targetQNum - 1 is still two rounds from ending when the tentative fires.
      const priorQNum = targetQNum - 2;
      if (priorQNum >= 1) {
        const startIdx = (priorQNum - 1) * 13;
        const endIdx   = priorQNum * 13;
        const slice    = History.rounds.slice(startIdx, endIdx);
        if (slice.length === 13) {
          const actuals = {};
          for (const item of this.ITEMS) {
            actuals[item.key] = this._sumSlice(slice, item.histKey);
          }
          cols.push({
            header: `${this._calendarLabel(priorQNum)} Actual`,
            values: actuals,
          });
        }
      }
    } else {
      // Revised: show the tentative budget they submitted before the P&L.
      const tentative = this._tentative[targetQNum];
      if (tentative) {
        cols.push({ header: 'Tentative Budget', values: tentative });
      }

      // Also show last quarter's actuals as a calibration reference.
      const priorQNum = targetQNum - 1;
      if (priorQNum >= 1) {
        const startIdx = (priorQNum - 1) * 13;
        const endIdx   = priorQNum * 13;
        const slice    = History.rounds.slice(startIdx, endIdx);
        if (slice.length === 13) {
          const actuals = {};
          for (const item of this.ITEMS) {
            actuals[item.key] = this._sumSlice(slice, item.histKey);
          }
          cols.push({
            header: `${this._calendarLabel(priorQNum)} Actual`,
            values: actuals,
          });
        }
      }
    }

    return cols;
  },

  // Build one section (Revenue or Expenses) as a table with any number of
  // read-only comparison columns followed by the live projection input column.
  _buildSection(sectionKey, sectionLabel, compCols, inputDefaults) {
    const items    = this.ITEMS.filter(i => i.section === sectionKey);
    const hdrClass = sectionKey === 'revenue' ? 'budget-revenue-header' : 'budget-expense-header';
    const colClass = sectionKey === 'revenue' ? 'budget-input-hdr-revenue' : 'budget-input-hdr-expense';

    const extraHeaders = compCols
      .map(col => `<th class="budget-th">${col.header}</th>`)
      .join('');

    const rows = items.map(item => {
      const compCells = compCols.map(col => {
        const val = col.values ? (col.values[item.key] || 0) : 0;
        return `<td class="budget-td budget-td-num">$${Math.round(val).toLocaleString()}</td>`;
      }).join('');

      // Revised phase starts from tentative values (stored in full dollars, displayed in thousands).
      // Tentative starts blank (0). Divide by 1000 since inputs represent thousands.
      const defaultVal = inputDefaults ? Math.round((inputDefaults[item.key] || 0) / 1000) : 0;

      return `
        <tr class="budget-row">
          <td class="budget-td budget-td-label">${item.label}</td>
          ${compCells}
          <td class="budget-td budget-td-input">
            <div class="budget-input-wrap">
              <span class="budget-dollar">$</span>
              <input type="number" class="budget-input" data-key="${item.key}" min="0" step="1" value="${defaultVal}" />
              <span class="budget-thousands">000</span>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Static subtotals for each comparison column.
    const totalCompCells = compCols.map(col => {
      const total = col.values
        ? items.reduce((s, i) => s + (col.values[i.key] || 0), 0)
        : 0;
      return `<td class="budget-td budget-total-num">$${Math.round(total).toLocaleString()}</td>`;
    }).join('');

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
              ${totalCompCells}
              <td class="budget-td budget-total-proj" id="budget-total-${sectionKey}">$0</td>
            </tr>
          </tfoot>
        </table>
      </div>`.trim();
    return div.firstElementChild;
  },

  // Wire input event listeners so section totals and the net bar update as the player types.
  _bindTotals() {
    document.querySelectorAll('#budget-table-wrapper .budget-input').forEach(input => {
      input.addEventListener('input', () => this._updateTotals());
    });
    this._updateTotals();
  },

  // Recompute section subtotals and the net bar from current input values.
  // Inputs are in thousands of dollars, so multiply by 1000 for display totals.
  _updateTotals() {
    let revenueTotal = 0, expenseTotal = 0;
    document.querySelectorAll('#budget-table-wrapper .budget-input').forEach(input => {
      const val  = (parseFloat(input.value) || 0) * 1000;
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

  // Collect input values, store to the correct phase dict, save to FormsPanel, and close.
  // Inputs are in thousands; multiply by 1000 to store in full dollars.
  _save() {
    const phase      = this._currentPhase;
    const qNum       = this._currentTargetQNum;
    const projection = {};
    document.querySelectorAll('#budget-table-wrapper .budget-input').forEach(input => {
      projection[input.dataset.key] = (parseFloat(input.value) || 0) * 1000;
    });

    if (phase === 'tentative') this._tentative[qNum] = projection;
    else                       this._revised[qNum]   = projection;

    const revenueTotal = this.ITEMS
      .filter(i => i.section === 'revenue')
      .reduce((s, i) => s + (projection[i.key] || 0), 0);
    const expenseTotal = this.ITEMS
      .filter(i => i.section === 'expense')
      .reduce((s, i) => s + (projection[i.key] || 0), 0);

    FormsPanel.save({
      type:         `budget-${phase}`,
      phase,
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
