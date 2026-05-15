// finance-menu.js — Full-screen Finance Menu panel.
//
// Three tabs: Budget (tabular actuals vs. budget), Graphs (placeholder), Forms (placeholder).
//
// Budget storage: FinanceMenu._budgets[qNum] is the canonical store for quarterly
// budgets, independent of budget.js. On each open, _syncBudgetData() copies any
// newly submitted budget.js entries so data isn't lost during the transition period.
// When budget.js is eventually removed, _budgets will be populated solely by the
// inline editing column in the Budget tab.
//
// Budget gate: when the current round is the last of a quarter (round % 13 === 0)
// and the next quarter's budget has not been saved, the Next Round button is
// disabled. refreshBudgetGate() re-checks after every save and after every round.

const FinanceMenu = {

  // Currently active tab key.
  _activeTab: 'budget',

  // Which quarter is displayed in the Budget tab. Null until first open.
  _selectedQNum: null,

  // Per-quarter budget data keyed by qNum — independent of budget.js.
  // Each entry is a flat object mapping Budget.ITEMS keys to whole-dollar amounts.
  _budgets: {},

  // Entry point called by openPanel() in hud.js.
  buildPanel() {
    // Default to the current quarter on first open.
    if (this._selectedQNum === null) this._selectedQNum = this._currentQNum();

    // Pull in any budget.js submissions we haven't seen yet.
    this._syncBudgetData();

    const body = document.getElementById('finance-menu-body');
    body.innerHTML = this._tabBarHTML() + this._viewsHTML();

    // Wire tab buttons.
    body.querySelectorAll('.fm-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.fmTab;
        this.buildPanel();
      });
    });

    if (this._activeTab === 'budget') this._buildBudgetTab();
  },

  // Current game quarter number (1-based).
  _currentQNum() {
    return Math.ceil(round / 13);
  },

  // Copy budget.js data into _budgets for any quarter we don't have yet.
  // Revised takes precedence over tentative; existing _budgets entries are never overwritten.
  _syncBudgetData() {
    const maxQ = this._currentQNum();
    for (let q = 1; q <= maxQ; q++) {
      if (!this._budgets[q]) {
        const src = Budget._revised[q] || Budget._tentative[q] || null;
        if (src) this._budgets[q] = Object.assign({}, src);
      }
    }
  },

  // Enable or disable the Next Round button based on whether the budget gate is active.
  // Call this after any save and after each round advances.
  refreshBudgetGate() {
    if (typeof gameStage === 'undefined' || gameStage !== STAGE.PLAY) return;
    const locked = this._isGateActive();
    const btn = document.getElementById('next-round-btn');
    if (!btn) return;
    btn.disabled = locked;
    btn.classList.toggle('fm-gate-locked', locked);
  },

  // Returns true when the player must submit the next quarter's budget before advancing.
  _isGateActive() {
    if (round % 13 !== 0) return false;
    const nextQ = this._currentQNum() + 1;
    return !this._budgets[nextQ];
  },

  // Renders the three-tab bar.
  _tabBarHTML() {
    const tabs = [
      { key: 'budget', label: 'Budget' },
      { key: 'graphs', label: 'Graphs' },
      { key: 'forms',  label: 'Forms'  },
    ];
    const btns = tabs.map(t =>
      `<button class="fm-tab-btn${this._activeTab === t.key ? ' active' : ''}" data-fm-tab="${t.key}">${t.label}</button>`
    ).join('');
    return `<div class="fm-tab-bar">${btns}</div>`;
  },

  // Renders all three view containers; only the active one is visible.
  _viewsHTML() {
    const hidden = key => this._activeTab !== key ? ' hidden' : '';
    return `
      <div id="fm-budget-view" class="fm-view${hidden('budget')}"></div>
      <div id="fm-graphs-view" class="fm-view${hidden('graphs')}">
        <p class="fm-placeholder">Graphs — coming soon.</p>
      </div>
      <div id="fm-forms-view"  class="fm-view${hidden('forms')}">
        <p class="fm-placeholder">Forms — coming soon.</p>
      </div>`;
  },

  // Builds the Budget tab: quarter selector + scrollable actuals table.
  _buildBudgetTab() {
    const container  = document.getElementById('fm-budget-view');
    const currentQ   = this._currentQNum();
    const qNum       = this._selectedQNum;

    // Rounds belonging to this quarter. Current quarter is capped at rounds played so far.
    const startRound = (qNum - 1) * 13 + 1;
    const endRound   = qNum === currentQ ? round : qNum * 13;
    const rounds     = History.rounds.filter(r => r.round >= startRound && r.round <= endRound);

    // The input column shows when viewing the current quarter; it lets the player
    // enter the budget for the upcoming quarter.
    const inputQNum = (qNum === currentQ) ? currentQ + 1 : null;

    const budgetData   = this._budgets[qNum] || null;
    const revenueItems = Budget.ITEMS.filter(i => i.section === 'revenue');
    const expenseItems = Budget.ITEMS.filter(i => i.section === 'expense');

    let html = this._quarterSelectorHTML(currentQ);
    html += '<div class="fm-table-scroll"><table class="fm-table">';
    html += this._tableHead(rounds, budgetData, qNum, inputQNum);
    html += '<tbody>';
    html += this._sectionRows('REVENUE',  revenueItems, rounds, budgetData, inputQNum);
    html += this._totalRow('Total Revenue',  revenueItems, rounds, budgetData, inputQNum, 'fm-input-rev-total');
    html += this._sectionRows('EXPENSES', expenseItems, rounds, budgetData, inputQNum);
    html += this._totalRow('Total Expenses', expenseItems, rounds, budgetData, inputQNum, 'fm-input-exp-total');
    html += this._netRow(revenueItems, expenseItems, rounds, budgetData, inputQNum);
    html += '</tbody></table></div>';

    container.innerHTML = html;

    // Wire quarter navigation buttons.
    container.querySelector('.fm-q-prev').addEventListener('click', () => {
      if (this._selectedQNum > 1) { this._selectedQNum--; this._buildBudgetTab(); }
    });
    container.querySelector('.fm-q-next').addEventListener('click', () => {
      if (this._selectedQNum < currentQ) { this._selectedQNum++; this._buildBudgetTab(); }
    });

    // Wire budget input auto-save.
    if (inputQNum) {
      container.querySelectorAll('.fm-budget-input').forEach(inp => {
        inp.addEventListener('input', () => this._saveInputBudget(inputQNum, container));
      });
    }
  },

  // Collects all input values from the DOM and saves them to _budgets[qNum],
  // then refreshes the live totals cells and the Next Round gate.
  _saveInputBudget(qNum, container) {
    const data = {};
    container.querySelectorAll('.fm-budget-input').forEach(inp => {
      data[inp.dataset.key] = Math.max(0, parseInt(inp.value) || 0);
    });
    this._budgets[qNum] = data;
    this._updateInputTotals(qNum, container);
    this.refreshBudgetGate();
  },

  // Updates the three total cells in the input column without a full re-render.
  _updateInputTotals(qNum, container) {
    const data         = this._budgets[qNum] || {};
    const revenueItems = Budget.ITEMS.filter(i => i.section === 'revenue');
    const expenseItems = Budget.ITEMS.filter(i => i.section === 'expense');
    const rev = revenueItems.reduce((s, i) => s + (data[i.key] || 0), 0);
    const exp = expenseItems.reduce((s, i) => s + (data[i.key] || 0), 0);
    const net = rev - exp;
    const revEl = container.querySelector('#fm-input-rev-total');
    const expEl = container.querySelector('#fm-input-exp-total');
    const netEl = container.querySelector('#fm-input-net-total');
    if (revEl) revEl.textContent = this._fmt(rev);
    if (expEl) expEl.textContent = this._fmt(exp);
    if (netEl) {
      netEl.textContent = this._fmtNet(net);
      netEl.className   = `fm-td-num fm-td-input fm-td-net ${net >= 0 ? 'fm-pos' : 'fm-neg'}`;
    }
  },

  // Quarter selector bar: « label ».
  _quarterSelectorHTML(currentQ) {
    const qNum  = this._selectedQNum;
    const label = Budget._calendarLabel(qNum);
    return `
      <div class="fm-q-selector">
        <button class="fm-q-btn fm-q-prev"${qNum <= 1 ? ' disabled' : ''}>&laquo;</button>
        <span class="fm-q-label">${label}</span>
        <button class="fm-q-btn fm-q-next"${qNum >= currentQ ? ' disabled' : ''}>&raquo;</button>
      </div>`;
  },

  // Builds the <thead> row: Category | Budget | Wk N … | Total | [Next Q Budget].
  _tableHead(rounds, budgetData, qNum, inputQNum) {
    const budgetLabel = budgetData
      ? `Budget<br><span class="fm-th-sub">${Budget._calendarLabel(qNum)}</span>`
      : 'Budget';
    let html = '<thead><tr>';
    html += '<th class="fm-th-cat">Category</th>';
    html += `<th class="fm-th-num fm-th-budget">${budgetLabel}</th>`;
    rounds.forEach(r => {
      html += `<th class="fm-th-num">${this._shortDate(r)}</th>`;
    });
    html += '<th class="fm-th-num fm-th-total">Total</th>';
    if (inputQNum) {
      html += `<th class="fm-th-num fm-th-input">Budget<br><span class="fm-th-sub">${Budget._calendarLabel(inputQNum)}</span></th>`;
    }
    html += '</tr></thead>';
    return html;
  },

  // One section-header row then one data row per item.
  _sectionRows(label, items, rounds, budgetData, inputQNum) {
    const colspan = 3 + rounds.length + (inputQNum ? 1 : 0);
    let html = `<tr class="fm-section-hdr"><td colspan="${colspan}">${label}</td></tr>`;
    const inputData = inputQNum ? (this._budgets[inputQNum] || {}) : null;
    items.forEach(item => {
      const rowTotal = rounds.reduce((s, r) => s + (r[item.histKey] || 0), 0);
      html += '<tr class="fm-row">';
      html += `<td class="fm-td-cat">${item.label}</td>`;
      // Current quarter's committed budget.
      if (budgetData && budgetData[item.key] != null) {
        html += `<td class="fm-td-num fm-td-budget">${this._fmt(budgetData[item.key])}</td>`;
      } else {
        html += '<td class="fm-td-num fm-td-empty">—</td>';
      }
      // One cell per historical round.
      rounds.forEach(r => {
        const val = r[item.histKey] || 0;
        html += `<td class="fm-td-num">${val ? this._fmt(val) : '<span class="fm-zero">—</span>'}</td>`;
      });
      // Row total.
      html += `<td class="fm-td-num fm-td-rowtotal">${rowTotal ? this._fmt(rowTotal) : '<span class="fm-zero">—</span>'}</td>`;
      // Editable input cell for the upcoming quarter.
      if (inputQNum) {
        const inputVal = inputData[item.key] != null ? inputData[item.key] : 0;
        html += `<td class="fm-td-num fm-td-input"><input class="fm-budget-input" type="number" min="0" step="1" data-key="${item.key}" value="${inputVal}"></td>`;
      }
      html += '</tr>';
    });
    return html;
  },

  // Subtotal row for a section.
  _totalRow(label, items, rounds, budgetData, inputQNum, inputCellId) {
    const grandTotal = rounds.reduce((s, r) =>
      s + items.reduce((si, i) => si + (r[i.histKey] || 0), 0), 0);
    let html = '<tr class="fm-total-row">';
    html += `<td class="fm-td-cat">${label}</td>`;
    if (budgetData) {
      const tot = items.reduce((s, i) => s + (budgetData[i.key] || 0), 0);
      html += `<td class="fm-td-num fm-td-budget fm-td-total">${this._fmt(tot)}</td>`;
    } else {
      html += '<td class="fm-td-num fm-td-empty">—</td>';
    }
    rounds.forEach(r => {
      const tot = items.reduce((s, i) => s + (r[i.histKey] || 0), 0);
      html += `<td class="fm-td-num fm-td-total">${this._fmt(tot)}</td>`;
    });
    html += `<td class="fm-td-num fm-td-total fm-td-rowtotal">${this._fmt(grandTotal)}</td>`;
    if (inputQNum) {
      const inputData = this._budgets[inputQNum] || {};
      const tot = items.reduce((s, i) => s + (inputData[i.key] || 0), 0);
      html += `<td class="fm-td-num fm-td-input fm-td-total" id="${inputCellId}">${this._fmt(tot)}</td>`;
    }
    html += '</tr>';
    return html;
  },

  // Net income row (revenue − expenses).
  _netRow(revenueItems, expenseItems, rounds, budgetData, inputQNum) {
    const netTotal = rounds.reduce((s, r) => {
      const rev = revenueItems.reduce((sr, i) => sr + (r[i.histKey] || 0), 0);
      const exp = expenseItems.reduce((se, i) => se + (r[i.histKey] || 0), 0);
      return s + (rev - exp);
    }, 0);
    let html = '<tr class="fm-net-row">';
    html += '<td class="fm-td-cat">Net Income</td>';
    if (budgetData) {
      const rev = revenueItems.reduce((s, i) => s + (budgetData[i.key] || 0), 0);
      const exp = expenseItems.reduce((s, i) => s + (budgetData[i.key] || 0), 0);
      const net = rev - exp;
      html += `<td class="fm-td-num fm-td-budget fm-td-net ${net >= 0 ? 'fm-pos' : 'fm-neg'}">${this._fmtNet(net)}</td>`;
    } else {
      html += '<td class="fm-td-num fm-td-empty">—</td>';
    }
    rounds.forEach(r => {
      const rev = revenueItems.reduce((s, i) => s + (r[i.histKey] || 0), 0);
      const exp = expenseItems.reduce((s, i) => s + (r[i.histKey] || 0), 0);
      const net = rev - exp;
      html += `<td class="fm-td-num fm-td-net ${net >= 0 ? 'fm-pos' : 'fm-neg'}">${this._fmtNet(net)}</td>`;
    });
    html += `<td class="fm-td-num fm-td-net fm-td-rowtotal ${netTotal >= 0 ? 'fm-pos' : 'fm-neg'}">${this._fmtNet(netTotal)}</td>`;
    if (inputQNum) {
      const inputData = this._budgets[inputQNum] || {};
      const rev = revenueItems.reduce((s, i) => s + (inputData[i.key] || 0), 0);
      const exp = expenseItems.reduce((s, i) => s + (inputData[i.key] || 0), 0);
      const net = rev - exp;
      html += `<td class="fm-td-num fm-td-input fm-td-net ${net >= 0 ? 'fm-pos' : 'fm-neg'}" id="fm-input-net-total">${this._fmtNet(net)}</td>`;
    }
    html += '</tr>';
    return html;
  },

  // Compact two-line column header from a history record's round number.
  _shortDate(r) {
    const weekOfYear   = STARTING_WEEK_OF_YEAR + r.round - 1;
    const yearsElapsed = Math.floor((weekOfYear - 1) / 52);
    const weekInYear   = ((weekOfYear - 1) % 52) + 1;
    const quarter      = Math.ceil(weekInYear / 13);
    const weekInQ      = weekInYear - (quarter - 1) * 13;
    const yr           = String(STARTING_YEAR + yearsElapsed).slice(-2);
    return `Wk ${weekInQ}<br><span class="fm-th-sub">Q${quarter} '${yr}</span>`;
  },

  // Formats a positive dollar amount.
  _fmt(val) {
    return `$${Math.round(val).toLocaleString()}`;
  },

  // Formats a net value; uses − prefix for negatives.
  _fmtNet(val) {
    const abs = Math.abs(Math.round(val));
    return val < 0 ? `−$${abs.toLocaleString()}` : `$${abs.toLocaleString()}`;
  },

};
