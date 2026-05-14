// finance-menu.js — Full-screen Finance Menu panel.
//
// Three tabs: Budget (tabular actuals vs. budget), Graphs (placeholder), Forms (placeholder).
//
// Budget storage: FinanceMenu._budgets[qNum] is the canonical store for quarterly
// budgets, independent of budget.js. On each open, _syncBudgetData() copies any
// newly submitted budget.js entries so data isn't lost during the transition period.
// When budget.js is eventually removed, _budgets will be populated by a new mechanism.

const FinanceMenu = {

  // Currently active tab key.
  _activeTab: 'budget',

  // Which quarter is displayed in the Budget tab. Null until first open.
  _selectedQNum: null,

  // Per-quarter budget data keyed by qNum — independent of budget.js.
  // Each entry is a flat object mapping Budget.ITEMS keys to dollar amounts.
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

    // Rounds that belong to this quarter (past quarters have all 13; current quarter
    // has only the rounds that have actually been played so far).
    const startRound = (qNum - 1) * 13 + 1;
    const endRound   = qNum === currentQ ? round : qNum * 13;
    const rounds     = History.rounds.filter(r => r.round >= startRound && r.round <= endRound);

    const budgetData   = this._budgets[qNum] || null;
    const revenueItems = Budget.ITEMS.filter(i => i.section === 'revenue');
    const expenseItems = Budget.ITEMS.filter(i => i.section === 'expense');

    let html = this._quarterSelectorHTML(currentQ);
    html += '<div class="fm-table-scroll"><table class="fm-table">';
    html += this._tableHead(rounds, budgetData, qNum);
    html += '<tbody>';
    html += this._sectionRows('REVENUE',  revenueItems, rounds, budgetData);
    html += this._totalRow('Total Revenue',  revenueItems, rounds, budgetData);
    html += this._sectionRows('EXPENSES', expenseItems, rounds, budgetData);
    html += this._totalRow('Total Expenses', expenseItems, rounds, budgetData);
    html += this._netRow(revenueItems, expenseItems, rounds, budgetData);
    html += '</tbody></table></div>';

    container.innerHTML = html;

    // Wire quarter navigation buttons.
    container.querySelector('.fm-q-prev').addEventListener('click', () => {
      if (this._selectedQNum > 1) { this._selectedQNum--; this._buildBudgetTab(); }
    });
    container.querySelector('.fm-q-next').addEventListener('click', () => {
      if (this._selectedQNum < currentQ) { this._selectedQNum++; this._buildBudgetTab(); }
    });
  },

  // Quarter selector bar: << label >>.
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

  // Builds the <thead> row: Category | Budget | Wk N … | Total.
  _tableHead(rounds, budgetData, qNum) {
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
    html += '</tr></thead>';
    return html;
  },

  // One section-header row then one data row per item.
  _sectionRows(label, items, rounds, budgetData) {
    const colspan = 3 + rounds.length;
    let html = `<tr class="fm-section-hdr"><td colspan="${colspan}">${label}</td></tr>`;
    items.forEach(item => {
      const rowTotal = rounds.reduce((s, r) => s + (r[item.histKey] || 0), 0);
      html += '<tr class="fm-row">';
      html += `<td class="fm-td-cat">${item.label}</td>`;
      // Budget cell.
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
      html += '</tr>';
    });
    return html;
  },

  // Subtotal row for a section.
  _totalRow(label, items, rounds, budgetData) {
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
    html += '</tr>';
    return html;
  },

  // Net income row (revenue − expenses).
  _netRow(revenueItems, expenseItems, rounds, budgetData) {
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
