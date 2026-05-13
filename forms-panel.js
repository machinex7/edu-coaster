// forms-panel.js — Review panel for completed educational forms.
//
// Stores the latest completed submission for each form type and renders
// a read-only summary with section subtotals and the final result.
// Forms save themselves by calling FormsPanel.save(record) on completion.

const FormsPanel = {

  // Latest completed record per form type, keyed by record.type.
  _records: {},

  // Section display order and header colour classes for each form variant.
  _SECTIONS: {
    pl: [
      { key: 'revenue', label: 'Revenue',  cls: 'fp-revenue' },
      { key: 'expense', label: 'Expenses', cls: 'fp-expense' },
    ],
    tax: [
      { key: 'income',    label: 'Income',     cls: 'fp-tax-income'    },
      { key: 'deduction', label: 'Deductions', cls: 'fp-tax-deduction' },
    ],
    'bs-d1': [
      { key: 'asset',     label: 'Assets',      cls: 'fp-asset'     },
      { key: 'liability', label: 'Liabilities', cls: 'fp-liability' },
    ],
    // D3 and D4 use a classified layout; 'na' distractor items are not rendered.
    'bs-d3': [
      { key: 'current-asset',     label: 'Current Assets',        cls: 'fp-asset'     },
      { key: 'noncurrent-asset',  label: 'Non-current Assets',    cls: 'fp-asset'     },
      { key: 'current-liability', label: 'Current Liabilities',   cls: 'fp-liability' },
      { key: 'longterm-liability',label: 'Long-term Liabilities', cls: 'fp-liability' },
    ],
    cf: [
      { key: 'operating', label: 'Operating Activities', cls: 'fp-cf-operating' },
      { key: 'investing',  label: 'Investing Activities', cls: 'fp-cf-investing'  },
      { key: 'financing',  label: 'Financing Activities', cls: 'fp-cf-financing'  },
    ],
  },

  // Save or replace the latest completion record for a form type.
  // Rebuilds the panel immediately if it is currently open.
  save(record) {
    this._records[record.type] = record;
    if (typeof activePanel !== 'undefined' && activePanel === 'forms') {
      this.buildPanel();
    }
  },

  // Render all form cards into the panel body.
  buildPanel() {
    document.getElementById('forms-panel-body').innerHTML = [
      this._renderBudgetCard('budget-tentative', 'Budget — Tentative'),
      this._renderBudgetCard('budget-revised',   'Budget — Revised'),
      this._renderPLCard(),
      this._renderBSCard(),
      this._renderCFCard(),
      this._renderTaxCard(),
    ].join('');
  },

  // Render a budget card (tentative or revised), or a placeholder if not yet completed.
  // typeKey matches the record.type saved by Budget._save(); title is the panel heading.
  _renderBudgetCard(typeKey, title) {
    const r   = this._records[typeKey];
    const hdr = `<div class="fp-form-title">${title}</div>`;
    if (!r) {
      return `<div class="fp-card">${hdr}<p class="fp-empty">Not yet completed.</p></div>`;
    }

    // Build Revenue section rows (skip zero-projected items).
    const revenueRows = Budget.ITEMS
      .filter(i => i.section === 'revenue' && (r.projection[i.key] || 0) !== 0)
      .map(i => `
        <div class="fp-item-row">
          <span class="fp-item-label">${i.label}</span>
          <span class="fp-item-amount">$${Math.round(r.projection[i.key] || 0).toLocaleString()}</span>
        </div>`).join('');

    // Build Expenses section rows (skip zero-projected items).
    const expenseRows = Budget.ITEMS
      .filter(i => i.section === 'expense' && (r.projection[i.key] || 0) !== 0)
      .map(i => `
        <div class="fp-item-row">
          <span class="fp-item-label">${i.label}</span>
          <span class="fp-item-amount">$${Math.round(r.projection[i.key] || 0).toLocaleString()}</span>
        </div>`).join('');

    const netSign  = r.netProjected >= 0 ? '+' : '−';
    const netClass = r.netProjected >= 0 ? 'fp-net-pos' : 'fp-neg';
    const netLabel = r.netProjected >= 0 ? 'Projected Profit' : 'Projected Loss';

    const sections = `
      <div class="fp-section">
        <div class="fp-section-header fp-revenue">Revenue</div>
        ${revenueRows || '<div class="fp-item-row"><span class="fp-item-label" style="color:#4b5563">None projected</span></div>'}
        <div class="fp-section-total">
          <span>Total</span>
          <span>$${Math.round(r.revenueTotal).toLocaleString()}</span>
        </div>
      </div>
      <div class="fp-section">
        <div class="fp-section-header fp-expense">Expenses</div>
        ${expenseRows || '<div class="fp-item-row"><span class="fp-item-label" style="color:#4b5563">None projected</span></div>'}
        <div class="fp-section-total">
          <span>Total</span>
          <span>$${Math.round(r.expenseTotal).toLocaleString()}</span>
        </div>
      </div>`;

    const footer = `
      <div class="fp-result-row ${netClass}">
        <span>${netLabel}</span>
        <span>${netSign}$${Math.abs(Math.round(r.netProjected)).toLocaleString()}</span>
      </div>`;

    return `<div class="fp-card">${hdr}<div class="fp-period">${r.label}</div>${sections}${footer}</div>`;
  },

  // Render the P&L review card, or a placeholder if not yet completed.
  _renderPLCard() {
    const r   = this._records.pl;
    const hdr = '<div class="fp-form-title">P&amp;L Statement</div>';
    if (!r) {
      return `<div class="fp-card">${hdr}<p class="fp-empty">Not yet completed.</p></div>`;
    }
    const sections = this._SECTIONS.pl.map(s => this._renderSection(s, r.items)).join('');
    const netSign  = r.net >= 0 ? '+' : '−';
    const netClass = r.net >= 0 ? 'fp-net-pos' : 'fp-neg';
    const netLabel = r.net >= 0 ? 'Net Profit' : 'Net Loss';
    const footer   = `
      <div class="fp-result-row ${netClass}">
        <span>${netLabel}</span>
        <span>${netSign}$${Math.abs(r.net).toLocaleString()}</span>
      </div>`;
    return `<div class="fp-card">${hdr}<div class="fp-period">${r.label}</div>${sections}${footer}</div>`;
  },

  // Render the balance sheet review card, or a placeholder if not yet completed.
  _renderBSCard() {
    const r   = this._records['balance-sheet'];
    const hdr = '<div class="fp-form-title">Balance Sheet</div>';
    if (!r) {
      return `<div class="fp-card">${hdr}<p class="fp-empty">Not yet completed.</p></div>`;
    }
    const sectionKey  = r.difficulty >= 3 ? 'bs-d3' : 'bs-d1';
    const sections    = this._SECTIONS[sectionKey].map(s => this._renderSection(s, r.items)).join('');
    const equitySign  = r.equity >= 0 ? '+' : '−';
    const equityClass = r.equity >= 0 ? 'fp-equity-pos' : 'fp-neg';
    const footer = `
      <div class="fp-result-row ${equityClass}">
        <span>Owner's Equity</span>
        <span>${equitySign}$${Math.abs(r.equity).toLocaleString()}</span>
      </div>`;
    return `<div class="fp-card">${hdr}<div class="fp-period">${r.label}</div>${sections}${footer}</div>`;
  },

  // Render the cash flow statement review card, or a placeholder if not yet completed.
  _renderCFCard() {
    const r   = this._records['cash-flow'];
    const hdr = '<div class="fp-form-title">Cash Flow Statement</div>';
    if (!r) {
      return `<div class="fp-card">${hdr}<p class="fp-empty">Not yet completed.</p></div>`;
    }

    const sections = this._SECTIONS.cf.map(s => this._renderCFSection(s, r.items)).join('');

    const _fmtNet = (n) => {
      const sign  = n >= 0 ? '+' : '−';
      const cls   = n >= 0 ? 'fp-net-pos' : 'fp-neg';
      return `<div class="fp-result-row ${cls}"><span>Net Cash Change</span><span>${sign}$${Math.abs(n).toLocaleString()}</span></div>`;
    };

    return `<div class="fp-card">${hdr}<div class="fp-period">${r.label}</div>${sections}${_fmtNet(r.netCF)}</div>`;
  },

  // Render one cash flow section (Operating / Investing / Financing) with sign-adjusted totals.
  _renderCFSection(sec, allItems) {
    const items = allItems.filter(i => i.correct === sec.key && Math.round(i.value) !== 0);
    if (items.length === 0) return '';
    const total = items.reduce((s, i) => s + (i.flow === 'in' ? i.value : -i.value), 0);
    const rows  = items.map(i => {
      const signed = i.flow === 'in' ? i.value : -i.value;
      const cls    = signed >= 0 ? 'fp-cf-inflow' : 'fp-cf-outflow';
      const sign   = signed >= 0 ? '' : '−';
      return `
        <div class="fp-item-row">
          <span class="fp-item-label">${i.label}</span>
          <span class="fp-item-amount ${cls}">${sign}$${Math.abs(Math.round(i.value)).toLocaleString()}</span>
        </div>`;
    }).join('');
    const totalSign  = total >= 0 ? '+' : '−';
    const totalClass = total >= 0 ? 'fp-net-pos' : 'fp-neg';
    return `
      <div class="fp-section">
        <div class="fp-section-header ${sec.cls}">${sec.label}</div>
        ${rows}
        <div class="fp-section-total ${totalClass}">
          <span>Net</span>
          <span>${totalSign}$${Math.abs(Math.round(total)).toLocaleString()}</span>
        </div>
      </div>`;
  },

  // Render the tax return review card, or a placeholder if not yet completed.
  _renderTaxCard() {
    const r   = this._records.tax;
    const hdr = '<div class="fp-form-title">Tax Return (BTR-1040)</div>';
    if (!r) {
      return `<div class="fp-card">${hdr}<p class="fp-empty">Not yet completed.</p></div>`;
    }

    // Render Income and Deductions sections using shared _renderSection helper.
    const sections = this._SECTIONS.tax.map(s => this._renderSection(s, r.items)).join('');

    // Taxable income and bracket breakdown rows.
    const bracketRows = (r.breakdown || []).map(b => `
      <div class="fp-item-row">
        <span class="fp-item-label fp-tax-bracket-label">${b.label}</span>
        <span class="fp-item-amount">$${Math.round(b.tax).toLocaleString()}</span>
      </div>`).join('');

    const taxableSign  = r.taxableIncome >= 0 ? '' : '−';
    const taxableClass = r.taxableIncome >= 0 ? '' : 'fp-net-pos';
    const taxableRow   = `
      <div class="fp-section">
        <div class="fp-section-header fp-tax-taxable">Part III — Tax Computation</div>
        <div class="fp-item-row">
          <span class="fp-item-label">Taxable Income</span>
          <span class="fp-item-amount ${taxableClass}">${taxableSign}$${Math.abs(Math.round(r.taxableIncome)).toLocaleString()}</span>
        </div>
        ${bracketRows}
      </div>`;

    const taxSign  = r.tax > 0 ? '' : '';
    const taxClass = r.tax > 0 ? 'fp-neg' : 'fp-net-pos';
    const taxLabel = r.tax > 0 ? 'Tax Owed' : 'No Tax Owed';
    const footer   = `
      <div class="fp-result-row ${taxClass}">
        <span>${taxLabel}</span>
        <span>$${Math.round(r.tax).toLocaleString()}</span>
      </div>`;

    return `<div class="fp-card">${hdr}<div class="fp-period">${r.label}</div>${sections}${taxableRow}${footer}</div>`;
  },

  // Render one section (e.g. Revenue, Assets) with its line items and a subtotal.
  _renderSection(sec, allItems) {
    const items = allItems.filter(i => i.correct === sec.key && Math.round(i.value) !== 0);
    if (items.length === 0) return '';
    const total = items.reduce((s, i) => s + i.value, 0);
    const rows  = items.map(i => `
      <div class="fp-item-row">
        <span class="fp-item-label">${i.label}</span>
        <span class="fp-item-amount">$${Math.round(i.value).toLocaleString()}</span>
      </div>`).join('');
    return `
      <div class="fp-section">
        <div class="fp-section-header ${sec.cls}">${sec.label}</div>
        ${rows}
        <div class="fp-section-total">
          <span>Total</span>
          <span>$${Math.round(total).toLocaleString()}</span>
        </div>
      </div>`;
  },

};
