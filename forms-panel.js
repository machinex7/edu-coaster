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
    'bs-d1': [
      { key: 'asset',     label: 'Assets',      cls: 'fp-asset'     },
      { key: 'liability', label: 'Liabilities', cls: 'fp-liability' },
    ],
    'bs-d2': [
      { key: 'current-asset',     label: 'Current Assets',        cls: 'fp-asset'     },
      { key: 'noncurrent-asset',  label: 'Non-current Assets',    cls: 'fp-asset'     },
      { key: 'current-liability', label: 'Current Liabilities',   cls: 'fp-liability' },
      { key: 'longterm-liability',label: 'Long-term Liabilities', cls: 'fp-liability' },
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
      this._renderPLCard(),
      this._renderBSCard(),
    ].join('');
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
    const sectionKey  = r.difficulty >= 2 ? 'bs-d2' : 'bs-d1';
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

  // Render one section (e.g. Revenue, Assets) with its line items and a subtotal.
  _renderSection(sec, allItems) {
    const items = allItems.filter(i => i.correct === sec.key);
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
