// finance-menu.js — Full-screen Finance Menu panel.
//
// Three tabs: Budget (tabular actuals vs. budget), Graphs (placeholder), Forms (placeholder).
//
// Budget storage: FinanceMenu._budgets[qNum] is the canonical store for quarterly
// budgets. Players enter the upcoming quarter's budget via the inline input column
// while viewing the current quarter.
//
// Budget gate: when the current round is the last of a quarter (round % 13 === 0)
// and the next quarter's budget has not been saved, the Next Round button is
// disabled. refreshBudgetGate() re-checks after every save and after every round.

const FinanceMenu = {

  // All revenue and expense line items, matching P&L statement categories.
  ITEMS: [
    { key: 'gate',           label: 'Gate Admissions',         section: 'revenue', histKey: 'gateIncome'          },
    { key: 'parking',        label: 'Parking',                 section: 'revenue', histKey: 'parkingIncome'       },
    { key: 'shop',           label: 'Merchandise Sales',       section: 'revenue', histKey: 'shopIncome'          },
    { key: 'food',           label: 'Food & Beverage',         section: 'revenue', histKey: 'foodIncome'          },
    { key: 'membership',     label: 'Memberships',             section: 'revenue', histKey: 'membershipIncome'    },
    { key: 'savingsInterest',label: 'Savings Interest',        section: 'revenue', histKey: 'savingsInterestIncome'},
    { key: 'mmInterest',     label: 'Money Market Interest',   section: 'revenue', histKey: 'mmInterestIncome'    },
    { key: 'staff',          label: 'Staff Wages',             section: 'expense', histKey: 'staffExpense'        },
    { key: 'utilities',      label: 'Ride Utilities',          section: 'expense', histKey: 'utilityExpense'      },
    { key: 'construction',   label: 'Construction',            section: 'expense', histKey: 'constructionExpense' },
    { key: 'marketing',      label: 'Marketing',               section: 'expense', histKey: 'marketingExpense'    },
    { key: 'merchandise',    label: 'Merchandise Orders',      section: 'expense', histKey: 'merchandiseExpense'  },
    { key: 'bus',            label: 'Bus Service',             section: 'expense', histKey: 'parkingBusCost'      },
    { key: 'parkingAmenity', label: 'Parking Amenities',       section: 'expense', histKey: 'parkingAmenitySpend' },
    { key: 'memberBenefit',  label: 'Membership Benefits',     section: 'expense', histKey: 'memberBenefitExpense'},
    { key: 'locInterest',    label: 'Line of Credit Interest', section: 'expense', histKey: 'locInterestExpense'  },
    { key: 'donations',      label: 'Charitable Donations',    section: 'expense', histKey: 'donationExpense'     },
  ],

  // Currently active tab key.
  _activeTab: 'budget',

  // Which quarter is displayed in the Budget tab. Null until first open.
  _selectedQNum: null,

  // Per-quarter budget data keyed by qNum.
  // Each entry is a flat object mapping ITEMS keys to whole-dollar amounts.
  _budgets: {},

  // Key of the currently graphed metric in the Graphs tab.
  _selectedMetric: 'attendance',

  // Metric groups shown as a pill cloud in the Graphs tab.
  GRAPH_METRICS: [
    { group: 'Revenue', items: [
      { key: 'gateIncome',            label: 'Gate Admissions',       fmt: '$'   },
      { key: 'parkingIncome',         label: 'Parking Revenue',       fmt: '$'   },
      { key: 'shopIncome',            label: 'Merchandise Sales',     fmt: '$'   },
      { key: 'foodIncome',            label: 'Food & Beverage',       fmt: '$'   },
      { key: 'membershipIncome',      label: 'Memberships',           fmt: '$'   },
      { key: 'savingsInterestIncome', label: 'Savings Interest',      fmt: '$'   },
      { key: 'mmInterestIncome',      label: 'Money Market Interest', fmt: '$'   },
    ]},
    { group: 'Expenses', items: [
      { key: 'staffExpense',          label: 'Staff Wages',           fmt: '$'   },
      { key: 'utilityExpense',        label: 'Ride Utilities',        fmt: '$'   },
      { key: 'constructionExpense',   label: 'Construction',          fmt: '$'   },
      { key: 'marketingExpense',      label: 'Marketing',             fmt: '$'   },
      { key: 'merchandiseExpense',    label: 'Merchandise Orders',    fmt: '$'   },
      { key: 'parkingBusCost',        label: 'Bus Service',           fmt: '$'   },
      { key: 'parkingAmenitySpend',   label: 'Parking Amenities',     fmt: '$'   },
      { key: 'memberBenefitExpense',  label: 'Membership Benefits',   fmt: '$'   },
      { key: 'locInterestExpense',    label: 'LoC Interest',          fmt: '$'   },
      { key: 'donationExpense',       label: 'Donations',             fmt: '$'   },
      { key: 'taxExpense',            label: 'Tax',                   fmt: '$'   },
      { key: 'discountLoss',          label: 'Discount Losses',       fmt: '$'   },
    ]},
    { group: 'Attendance & Park', items: [
      { key: 'attendance',            label: 'Weekly Attendance',     fmt: 'num' },
      { key: 'parkAppeal',            label: 'Park Appeal',           fmt: 'num' },
      { key: 'weeklyNetMess',         label: 'Net Mess',              fmt: 'num' },
      { key: 'rideEfficiency',        label: 'Ride Efficiency',       fmt: 'pct' },
    ]},
    { group: 'Staff & Rides', items: [
      { key: 'staffCount',            label: 'Staff Count',           fmt: 'num' },
      { key: 'staffMood',             label: 'Staff Mood',            fmt: 'num' },
      { key: 'runningRides',          label: 'Running Rides',         fmt: 'num' },
      { key: 'brokenRides',           label: 'Broken Rides',          fmt: 'num' },
    ]},
    { group: 'Security', items: [
      { key: 'securityIncidents',     label: 'Total Incidents',       fmt: 'num' },
      { key: 'securityHandled',       label: 'Handled',               fmt: 'num' },
      { key: 'securityUnhandled',     label: 'Unhandled',             fmt: 'num' },
      { key: 'securityOpinion',       label: 'Opinion Score',         fmt: 'num' },
      { key: 'theftItemsStolen',      label: 'Items Stolen',          fmt: 'num' },
    ]},
    { group: 'Food', items: [
      { key: 'mealsWanted',           label: 'Meals Wanted',          fmt: 'num' },
      { key: 'mealsServed',           label: 'Meals Served',          fmt: 'num' },
      { key: 'mealSatisfaction',      label: 'Meal Satisfaction',     fmt: 'pct' },
    ]},
    { group: 'Banking', items: [
      { key: 'savingsBalance',        label: 'Savings Balance',       fmt: '$'   },
      { key: 'mmBalance',             label: 'Money Market Balance',  fmt: '$'   },
      { key: 'loanBalance',           label: 'Loan Balance',          fmt: '$'   },
      { key: 'locBalance',            label: 'LoC Balance',           fmt: '$'   },
    ]},
    { group: 'Inventory', items: [
      { key: 'shopItemsSold',         label: 'Items Sold',            fmt: 'num' },
      { key: 'totalInventory',        label: 'Total Inventory',       fmt: 'num' },
    ]},
  ],

  // Entry point called by openPanel() in hud.js.
  buildPanel() {
    // Default to the current quarter on first open.
    if (this._selectedQNum === null) this._selectedQNum = this._currentQNum();

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
    if (this._activeTab === 'graphs') this._buildGraphsTab();
    if (this._activeTab === 'forms')  FormsPanel.buildPanel();
  },

  // Current game quarter number (1-based).
  _currentQNum() {
    return Math.ceil(round / 13);
  },

  // Returns a "Q3 2024" style label for the calendar period of the given game quarter.
  _calendarLabel(gameQNum) {
    const lastRound    = gameQNum * 13;
    const weekOfYear   = STARTING_WEEK_OF_YEAR + lastRound - 1;
    const yearsElapsed = Math.floor((weekOfYear - 1) / 52);
    const weekInYear   = ((weekOfYear - 1) % 52) + 1;
    const q            = Math.ceil(weekInYear / 13);
    return `Q${q} ${STARTING_YEAR + yearsElapsed}`;
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
      <div id="fm-graphs-view" class="fm-view${hidden('graphs')}"></div>
      <div id="fm-forms-view"  class="fm-view${hidden('forms')}"></div>`;
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

    // Show a forecast column when the quarter is in progress (1–12 weeks played).
    // Forecast = (average of played weeks) × 13.
    const showForecast = rounds.length >= 1 && rounds.length < 13;

    const budgetData   = this._budgets[qNum] || null;
    const revenueItems = this.ITEMS.filter(i => i.section === 'revenue');
    const expenseItems = this.ITEMS.filter(i => i.section === 'expense');

    let html = this._quarterSelectorHTML(currentQ);
    html += '<div class="fm-table-scroll"><table class="fm-table">';
    html += this._tableHead(rounds, budgetData, qNum, inputQNum, showForecast);
    html += '<tbody>';
    html += this._sectionRows('REVENUE',  revenueItems, rounds, budgetData, inputQNum, showForecast);
    html += this._totalRow('Total Revenue',  revenueItems, rounds, budgetData, inputQNum, 'fm-input-rev-total', showForecast);
    html += this._sectionRows('EXPENSES', expenseItems, rounds, budgetData, inputQNum, showForecast);
    html += this._totalRow('Total Expenses', expenseItems, rounds, budgetData, inputQNum, 'fm-input-exp-total', showForecast);
    html += this._netRow(revenueItems, expenseItems, rounds, budgetData, inputQNum, showForecast);
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
    const revenueItems = this.ITEMS.filter(i => i.section === 'revenue');
    const expenseItems = this.ITEMS.filter(i => i.section === 'expense');
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
    const label = this._calendarLabel(qNum);
    return `
      <div class="fm-q-selector">
        <button class="fm-q-btn fm-q-prev"${qNum <= 1 ? ' disabled' : ''}>&laquo;</button>
        <span class="fm-q-label">${label}</span>
        <button class="fm-q-btn fm-q-next"${qNum >= currentQ ? ' disabled' : ''}>&raquo;</button>
      </div>`;
  },

  // Builds the <thead> row: Category | Budget | Wk N … | Total | [Forecast] | [Next Q Budget].
  _tableHead(rounds, budgetData, qNum, inputQNum, showForecast) {
    const budgetLabel = budgetData
      ? `Budget<br><span class="fm-th-sub">${this._calendarLabel(qNum)}</span>`
      : 'Budget';
    let html = '<thead><tr>';
    html += '<th class="fm-th-cat">Category</th>';
    html += `<th class="fm-th-num fm-th-budget">${budgetLabel}</th>`;
    rounds.forEach(r => {
      html += `<th class="fm-th-num">${this._shortDate(r)}</th>`;
    });
    html += '<th class="fm-th-num fm-th-total">Total</th>';
    if (showForecast) {
      html += '<th class="fm-th-num fm-th-forecast">Forecast<br><span class="fm-th-sub">13-wk</span></th>';
    }
    if (inputQNum) {
      html += `<th class="fm-th-num fm-th-input">Budget<br><span class="fm-th-sub">${this._calendarLabel(inputQNum)}</span></th>`;
    }
    html += '</tr></thead>';
    return html;
  },

  // One section-header row then one data row per item.
  _sectionRows(label, items, rounds, budgetData, inputQNum, showForecast) {
    const colspan = 3 + rounds.length + (showForecast ? 1 : 0) + (inputQNum ? 1 : 0);
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
      // Forecast: extrapolate the weekly average to a full 13-week quarter.
      if (showForecast) {
        const forecast = Math.round(rowTotal / rounds.length * 13);
        html += `<td class="fm-td-num fm-td-forecast">${forecast ? this._fmt(forecast) : '<span class="fm-zero">—</span>'}</td>`;
      }
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
  _totalRow(label, items, rounds, budgetData, inputQNum, inputCellId, showForecast) {
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
    if (showForecast) {
      const forecast = Math.round(grandTotal / rounds.length * 13);
      html += `<td class="fm-td-num fm-td-forecast fm-td-total">${this._fmt(forecast)}</td>`;
    }
    if (inputQNum) {
      const inputData = this._budgets[inputQNum] || {};
      const tot = items.reduce((s, i) => s + (inputData[i.key] || 0), 0);
      html += `<td class="fm-td-num fm-td-input fm-td-total" id="${inputCellId}">${this._fmt(tot)}</td>`;
    }
    html += '</tr>';
    return html;
  },

  // Net income row (revenue − expenses).
  _netRow(revenueItems, expenseItems, rounds, budgetData, inputQNum, showForecast) {
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
    if (showForecast) {
      const netForecast = Math.round(netTotal / rounds.length * 13);
      html += `<td class="fm-td-num fm-td-forecast fm-td-net ${netForecast >= 0 ? 'fm-pos' : 'fm-neg'}">${this._fmtNet(netForecast)}</td>`;
    }
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

  // Builds the Graphs tab: line chart + pill cloud selector.
  _buildGraphsTab() {
    const container = document.getElementById('fm-graphs-view');
    const metricKey = this._selectedMetric || 'attendance';
    const metric    = this._findMetric(metricKey);
    const data      = History.rounds.slice(-13);

    const graphHTML = data.length < 2
      ? `<div class="fg-graph-empty">Not enough data yet — play more rounds to see a graph.</div>`
      : `<div class="fg-canvas-wrap"><canvas id="fg-chart"></canvas><div id="fg-tooltip" class="fg-tooltip hidden"></div></div>`;

    container.innerHTML = `
      <div class="fg-graph-area">
        <div class="fg-graph-title">${metric.label} — Last ${data.length} Week${data.length !== 1 ? 's' : ''}</div>
        ${graphHTML}
      </div>
      <div class="fg-pill-cloud">${this._pillCloudHTML(metricKey)}</div>`;

    container.querySelectorAll('.fg-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        this._selectedMetric = pill.dataset.metric;
        this._buildGraphsTab();
      });
    });

    if (data.length >= 2) this._drawChart(data, metric);
  },

  // Draws the line chart onto the canvas element.
  _drawChart(data, metric) {
    const canvas = document.getElementById('fg-chart');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const W    = wrap.clientWidth || 660;
    const H    = 220;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const LP = 66, RP = 16, TP = 18, BP = 42;
    const cW = W - LP - RP;
    const cH = H - TP - BP;

    const vals  = data.map(r => typeof r[metric.key] === 'number' ? r[metric.key] : 0);
    const { yMin, yMax } = this._niceScale(vals, metric.fmt);
    const range = yMax - yMin || 1;

    // Maps data index → canvas X coordinate.
    const xOf = i => LP + (data.length < 2 ? cW / 2 : i / (data.length - 1) * cW);
    // Maps value → canvas Y coordinate.
    const yOf = v => TP + (1 - (v - yMin) / range) * cH;

    // Background fill.
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, W, H);

    // Horizontal grid lines + Y-axis labels.
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    const gridCount = 5;
    for (let t = 0; t <= gridCount; t++) {
      const v = yMin + (yMax - yMin) * t / gridCount;
      const y = yOf(v);
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(LP, y); ctx.lineTo(LP + cW, y); ctx.stroke();
      ctx.fillStyle  = '#6b7280';
      ctx.textAlign  = 'right';
      ctx.fillText(this._fmtMetricLabel(v, metric.fmt), LP - 6, y + 4);
    }

    // X-axis week labels — skip alternate labels when dense.
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    data.forEach((r, i) => {
      if (data.length <= 8 || i % 2 === 0 || i === data.length - 1)
        ctx.fillText(this._xLabel(r), xOf(i), H - BP + 16);
    });

    // Shaded area under the line.
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(vals[0]));
    vals.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
    ctx.lineTo(xOf(vals.length - 1), TP + cH);
    ctx.lineTo(xOf(0), TP + cH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.10)';
    ctx.fill();

    // Line.
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(vals[0]));
    vals.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.stroke();

    // Axis borders.
    ctx.strokeStyle = '#374151';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(LP, TP); ctx.lineTo(LP, TP + cH + 1);
    ctx.moveTo(LP, TP + cH); ctx.lineTo(LP + cW, TP + cH);
    ctx.stroke();

    // Data point dots.
    vals.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(xOf(i), yOf(v), 4, 0, Math.PI * 2);
      ctx.fillStyle   = '#3b82f6';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    });

    // Hover tooltip.
    const tooltip = document.getElementById('fg-tooltip');
    if (!tooltip) return;
    const stepW = data.length > 1 ? cW / (data.length - 1) : cW;

    canvas.addEventListener('mousemove', e => {
      const rect   = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mx     = (e.clientX - rect.left) * scaleX;
      const idx    = Math.round((mx - LP) / stepW);
      if (idx >= 0 && idx < data.length) {
        const v = vals[idx];
        tooltip.innerHTML =
          `<span class="fg-tt-date">${data[idx].date}</span>` +
          `<span class="fg-tt-val">${this._fmtMetricVal(v, metric.fmt)}</span>`;
        const tipX = xOf(idx) / scaleX;
        const tipY = yOf(v) / (H / rect.height);
        tooltip.style.left = Math.min(tipX + 10, rect.width - 130) + 'px';
        tooltip.style.top  = Math.max(tipY - 44, 0) + 'px';
        tooltip.classList.remove('hidden');
      } else {
        tooltip.classList.add('hidden');
      }
    });
    canvas.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
  },

  // Returns the pill cloud HTML for the Graphs tab, grouped by metric category.
  _pillCloudHTML(selectedKey) {
    return this.GRAPH_METRICS.map(group => {
      const pills = group.items.map(m =>
        `<button class="fg-pill${m.key === selectedKey ? ' active' : ''}" data-metric="${m.key}">${m.label}</button>`
      ).join('');
      return `<div class="fg-pill-group">
        <div class="fg-pill-group-label">${group.group}</div>
        <div class="fg-pills">${pills}</div>
      </div>`;
    }).join('');
  },

  // Finds a metric descriptor by its histKey, falling back to the first metric.
  _findMetric(key) {
    for (const group of this.GRAPH_METRICS) {
      const found = group.items.find(m => m.key === key);
      if (found) return found;
    }
    return this.GRAPH_METRICS[0].items[0];
  },

  // Computes a nice Y-axis scale for the given array of values.
  _niceScale(vals, fmt) {
    if (fmt === 'pct') return { yMin: 0, yMax: 1 };
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    if (rawMin === rawMax) {
      if (rawMax === 0) return { yMin: 0, yMax: 10 };
      const half = Math.abs(rawMax) * 0.5;
      return this._roundedBounds(Math.max(0, rawMax - half), rawMax + half);
    }
    return this._roundedBounds(Math.min(0, rawMin), rawMax * 1.08);
  },

  // Snaps min/max to a round step size suitable for a 5-gridline axis.
  _roundedBounds(min, max) {
    const range = max - min || 1;
    const rough = range / 5;
    const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm  = rough / mag;
    const step  = norm < 1.5 ? mag : norm < 3 ? 2 * mag : norm < 7 ? 5 * mag : 10 * mag;
    return { yMin: Math.floor(min / step) * step, yMax: Math.ceil(max / step) * step };
  },

  // Abbreviated value label for the Y-axis (e.g. "$12K", "34%").
  _fmtMetricLabel(val, fmt) {
    if (fmt === 'pct') return (val * 100).toFixed(0) + '%';
    const abs    = Math.abs(val);
    const prefix = fmt === '$' ? '$' : '';
    const sign   = val < 0 ? '−' : '';
    if (abs >= 1e6)  return sign + prefix + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1000) return sign + prefix + (abs / 1000).toFixed(0) + 'K';
    return sign + prefix + abs.toFixed(0);
  },

  // Full value format for the hover tooltip.
  _fmtMetricVal(val, fmt) {
    if (fmt === 'pct') return (val * 100).toFixed(1) + '%';
    if (fmt === '$')   return '$' + Math.round(val).toLocaleString();
    return Math.round(val).toLocaleString();
  },

  // Short week-in-quarter label for the X-axis (e.g. "W3").
  _xLabel(r) {
    const weekOfYear = STARTING_WEEK_OF_YEAR + r.round - 1;
    const weekInYear = ((weekOfYear - 1) % 52) + 1;
    const quarter    = Math.ceil(weekInYear / 13);
    const weekInQ    = weekInYear - (quarter - 1) * 13;
    return 'W' + weekInQ;
  },

};

