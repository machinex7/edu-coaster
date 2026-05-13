// tax-form.js — Annual business income tax return exercise.
//
// Opens on week 4 of each game year starting in year 2 (rounds 56, 108, 160...).
// Students classify the prior year's financial items as Income or Deductions.
// A live tax calculation panel shows progressive bracket math in real time so
// students see how taxable income translates to a bill before they submit.
//
// Trigger:  round % 52 === 4 && round > 52  (set in hud.js advanceRound)
// Chaining: tax form does not chain to another form on close.
// Payment:  TaxForm.taxOwed is set on submission for the future week-15 deduction.
//
// Depreciation mirrors the rideAgeFactor mechanic: rides older than 5 years
// lose 2% of purchase cost per year, consistent with how guest excitement decays.

const TaxForm = {

  // Set to true by hud.js at round % 52 === 4 && round > 52; cleared in show().
  pending: false,

  // Final tax owed after student submits; available for the future payment mechanic.
  taxOwed: 0,

  // Tax year (1-based) whose data is currently displayed.
  _taxYear: 0,

  // Keys the student has placed correctly this session.
  _correctKeys: new Set(),

  // Non-zero draggable items built in show().
  _activeItems: [],

  // Progressive income tax brackets.
  // upTo is the top of the bracket (inclusive); Infinity catches the remainder.
  _BRACKETS: [
    { upTo: 50_000,   rate: 0.15, label: 'First $50,000 @ 15%'  },
    { upTo: 100_000,  rate: 0.25, label: 'Next $50,000 @ 25%'   },
    { upTo: Infinity, rate: 0.34, label: 'Remainder @ 34%'       },
  ],

  // Maps the items-container element ID to the correct zone string.
  _ZONE_MAP: {
    'tf-zone-income-items':    'income',
    'tf-zone-deduction-items': 'deduction',
  },

  // Wire up drag-and-drop listeners on the bank and both drop zones.
  // Called once from initHUD after the DOM is ready.
  init() {
    this._setupDropZone('tf-bank',           'tf-bank');
    this._setupDropZone('tf-zone-income',    'tf-zone-income-items');
    this._setupDropZone('tf-zone-deduction', 'tf-zone-deduction-items');
    document.getElementById('tf-submit-btn').addEventListener('click', () => this._submit());
    document.getElementById('tf-close-btn').addEventListener('click',  () => this.hide());
  },

  // Attach dragover / dragleave / drop handlers so cards move into targetId.
  // Refreshes the live tax preview and submit-button state after every drop.
  _setupDropZone(zoneId, targetId) {
    const zone   = document.getElementById(zoneId);
    const target = document.getElementById(targetId);
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('tf-zone-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('tf-zone-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('tf-zone-over');
      const key  = e.dataTransfer.getData('text/plain');
      const card = document.querySelector(`.tf-card-item[data-key="${key}"]`);
      if (card) {
        target.appendChild(card);
        this._updateTaxPreview();
        this._updateSubmitState();
      }
    });
  },

  // Enable the submit button only once every draggable card has left the bank.
  _updateSubmitState() {
    const remaining = document.querySelectorAll('#tf-bank .tf-card-item[draggable="true"]').length;
    document.getElementById('tf-submit-btn').disabled = remaining > 0;
  },

  // Build and display the exercise for the year that just ended.
  show() {
    this.pending  = false;
    // Tax year 1 fires at round 56, year 2 at round 108, etc.
    this._taxYear = Math.floor((round - 4) / 52);

    // Slice the 52 history records that cover the prior tax year.
    const yearStartIdx = History.rounds.length - 56;
    const priorYear    = History.rounds.slice(yearStartIdx, yearStartIdx + 52);

    // Sum a named field across all rounds in the prior year.
    const sum = key => priorYear.reduce((s, r) => s + (r[key] || 0), 0);

    // ── Income ────────────────────────────────────────────────────────────────
    const gateIncome       = sum('gateIncome');
    const parkingIncome    = sum('parkingIncome');
    const foodIncome       = sum('foodIncome');
    const shopIncome       = sum('shopIncome');
    const membershipIncome = sum('membershipIncome');
    const interestIncome   = sum('savingsInterestIncome') + sum('mmInterestIncome');

    // ── Deductions ────────────────────────────────────────────────────────────
    const staffExpense         = sum('staffExpense');
    const utilityExpense       = sum('utilityExpense');
    const inventoryExpense     = sum('merchandiseExpense');
    const marketingExpense     = sum('marketingExpense');
    const memberBenefitExpense = sum('memberBenefitExpense');
    const loanInterestExpense  = sum('loanInterestExpense');
    const locInterestExpense   = sum('locInterestExpense');
    const depreciation         = this._calcDepreciation();

    // Charitable contributions: placeholder — always $0 until the giving UI is added.
    // Rendered as a locked pre-placed card to introduce the concept.
    const charitable = 0;

    // Build items; filter to non-zero values so only active line items appear.
    const allItems = [
      { key: 'gate',        label: 'Gate Admissions',          correct: 'income',    value: gateIncome },
      { key: 'parking',     label: 'Parking Revenue',           correct: 'income',    value: parkingIncome },
      { key: 'food',        label: 'Food & Beverage Revenue',   correct: 'income',    value: foodIncome },
      { key: 'shop',        label: 'Merchandise Revenue',       correct: 'income',    value: shopIncome },
      { key: 'membership',  label: 'Membership Revenue',        correct: 'income',    value: membershipIncome },
      { key: 'interest',    label: 'Interest Income',           correct: 'income',    value: interestIncome },
      { key: 'staff',       label: 'Wages & Salaries',          correct: 'deduction', value: staffExpense },
      { key: 'utilities',   label: 'Ride Utilities',            correct: 'deduction', value: utilityExpense },
      { key: 'inventory',   label: 'Inventory & Supplies',      correct: 'deduction', value: inventoryExpense },
      { key: 'marketing',   label: 'Marketing',                 correct: 'deduction', value: marketingExpense },
      { key: 'benefits',    label: 'Membership Benefits',       correct: 'deduction', value: memberBenefitExpense },
      { key: 'loanInt',     label: 'Loan Interest',             correct: 'deduction', value: loanInterestExpense },
      { key: 'locInt',      label: 'Line of Credit Interest',   correct: 'deduction', value: locInterestExpense },
      { key: 'depreciation',label: 'Ride Depreciation',         correct: 'deduction', value: depreciation },
    ];
    this._activeItems = allItems.filter(i => i.value > 0);

    // ── Set form header ───────────────────────────────────────────────────────
    document.getElementById('tf-year-label').textContent  = `Tax Year ${this._taxYear}`;

    // ── Populate bank with shuffled draggable cards ───────────────────────────
    const bank = document.getElementById('tf-bank');
    bank.innerHTML = '';
    const shuffled = [...this._activeItems];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const item of shuffled) {
      bank.appendChild(this._makeCard(item.key, item.label, item.value, true));
    }

    // ── Clear drop zones; pre-place the charitable-contributions placeholder ──
    document.getElementById('tf-zone-income-items').innerHTML = '';
    const dedZone = document.getElementById('tf-zone-deduction-items');
    dedZone.innerHTML = '';
    dedZone.appendChild(this._makeCard('charitable', 'Charitable Contributions', charitable, false));

    // ── Reset UI state ────────────────────────────────────────────────────────
    this._correctKeys = new Set();
    document.getElementById('tf-result').classList.add('hidden');
    document.getElementById('tf-submit-btn').classList.remove('hidden');
    document.getElementById('tf-submit-btn').disabled = true;
    document.getElementById('tf-close-btn').classList.add('hidden');
    this._updateTaxPreview();

    document.getElementById('tf-modal').classList.remove('hidden');
  },

  // Create a draggable card (draggable=true) or a locked placeholder (draggable=false).
  _makeCard(key, label, amount, draggable) {
    const card     = document.createElement('div');
    card.className = draggable ? 'tf-card-item' : 'tf-card-item tf-card-locked';
    card.draggable = draggable;
    card.dataset.key    = key;
    card.dataset.amount = amount;
    card.innerHTML = `
      <span class="tf-card-label">${label}</span>
      <span class="tf-card-amount">$${amount.toLocaleString()}</span>
      <span class="tf-card-status">${draggable ? '' : '(future)'}</span>
    `;
    if (draggable) {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', key);
        card.classList.add('tf-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('tf-dragging'));
    }
    return card;
  },

  // Compute annual depreciation for rides older than 5 years.
  // Mirrors rideAgeFactor: 2% of original build cost per year past the 5-year mark.
  // A ride's age is measured at the end of the prior tax year (round - 4).
  _calcDepreciation() {
    const priorYearEndRound = round - 4;
    let total = 0;
    for (const rec of installedRides) {
      if (rec.installedRound == null) continue;
      const ageAtYearEnd = (priorYearEndRound - rec.installedRound) / 52;
      if (ageAtYearEnd > 5) total += (rec.buildCost || 0) * 0.02;
    }
    return Math.round(total);
  },

  // Compute tax under the progressive bracket schedule.
  // Returns { tax, breakdown[] } where each entry has { label, inBracket, rate, tax }.
  _calcTax(taxableIncome) {
    if (taxableIncome <= 0) return { tax: 0, breakdown: [] };
    let prev     = 0;
    let totalTax = 0;
    const breakdown = [];
    for (const bracket of this._BRACKETS) {
      const cap       = bracket.upTo === Infinity ? taxableIncome : Math.min(taxableIncome, bracket.upTo);
      const inBracket = cap - prev;
      if (inBracket <= 0) break;
      const tax   = Math.round(inBracket * bracket.rate);
      totalTax   += tax;
      breakdown.push({ label: bracket.label, inBracket, rate: bracket.rate, tax });
      prev = cap;
      if (cap >= taxableIncome) break;
    }
    return { tax: totalTax, breakdown };
  },

  // Recompute the live tax estimate from current card placements and render it.
  // Called after every drop and at show() time.
  _updateTaxPreview() {
    let totalIncome     = 0;
    let totalDeductions = 0;

    for (const item of this._activeItems) {
      const card     = document.querySelector(`.tf-card-item[data-key="${item.key}"]`);
      if (!card) continue;
      const parentId = card.parentElement?.id;
      if (parentId === 'tf-zone-income-items')    totalIncome      += item.value;
      if (parentId === 'tf-zone-deduction-items') totalDeductions  += item.value;
    }

    const taxableIncome    = totalIncome - totalDeductions;
    const { tax, breakdown } = this._calcTax(taxableIncome);
    const fmtUSD = n => `$${Math.abs(Math.round(n)).toLocaleString()}`;

    const bracketRows = breakdown.map(b => `
      <div class="tf-preview-bracket">
        <span class="tf-pb-label">${b.label}</span>
        <span class="tf-pb-amount">${fmtUSD(b.tax)}</span>
      </div>`).join('');

    const taxableClass = taxableIncome >= 0 ? 'tf-preview-pos' : 'tf-preview-neg';
    const taxableSign  = taxableIncome < 0  ? '−' : '';

    document.getElementById('tf-tax-preview').innerHTML = `
      <div class="tf-preview-heading">Tax Calculation</div>
      <div class="tf-preview-row">
        <span>Total Income</span><span>${fmtUSD(totalIncome)}</span>
      </div>
      <div class="tf-preview-row">
        <span>Total Deductions</span><span>${fmtUSD(totalDeductions)}</span>
      </div>
      <div class="tf-preview-divider"></div>
      <div class="tf-preview-row tf-preview-taxable ${taxableClass}">
        <span>Taxable Income</span><span>${taxableSign}${fmtUSD(taxableIncome)}</span>
      </div>
      ${taxableIncome > 0
        ? `<div class="tf-preview-brackets">
             ${bracketRows || ''}
           </div>
           <div class="tf-preview-divider"></div>
           <div class="tf-preview-row tf-preview-owed">
             <span>Tax Owed</span><span>${fmtUSD(tax)}</span>
           </div>`
        : `<div class="tf-preview-row tf-preview-none">
             <span>No Tax Owed</span><span>—</span>
           </div>`
      }
    `;
  },

  // Validate placements: lock correct items, return wrong ones to the bank.
  // On a perfect score, compute final tax, persist to FormsPanel, and show Continue.
  _submit() {
    const bank = document.getElementById('tf-bank');

    for (const item of this._activeItems) {
      if (this._correctKeys.has(item.key)) continue;
      const card     = document.querySelector(`.tf-card-item[data-key="${item.key}"]`);
      if (!card) continue;
      const parentId = card.parentElement?.id;
      const placed   = this._ZONE_MAP[parentId] ?? null;

      if (placed === item.correct) {
        this._correctKeys.add(item.key);
        card.draggable = false;
        card.classList.add('tf-correct', 'tf-locked');
        card.querySelector('.tf-card-status').textContent = '✓';
      } else {
        card.classList.remove('tf-correct', 'tf-incorrect');
        card.querySelector('.tf-card-status').textContent = '';
        bank.appendChild(card);
      }
    }

    const total    = this._activeItems.length;
    const correct  = this._correctKeys.size;
    const resultEl = document.getElementById('tf-result');

    if (correct === total) {
      // Compute final tax from the now-locked placements.
      let totalIncome     = 0;
      let totalDeductions = 0;
      for (const item of this._activeItems) {
        if (item.correct === 'income')    totalIncome     += item.value;
        else                              totalDeductions  += item.value;
      }
      const taxableIncome      = totalIncome - totalDeductions;
      const { tax, breakdown } = this._calcTax(taxableIncome);
      this.taxOwed = tax;

      // Persist snapshot for the Forms review panel.
      FormsPanel.save({
        type:           'tax',
        label:          `Tax Year ${this._taxYear}`,
        items:          this._activeItems.map(item => ({
          label:   item.label,
          correct: item.correct,
          value:   item.value,
        })),
        totalIncome,
        totalDeductions,
        taxableIncome,
        tax,
        breakdown,
      });

      const taxClass = tax > 0 ? 'tf-owed-pos' : 'tf-owed-zero';
      const taxLine  = tax > 0
        ? `Tax Owed: $${tax.toLocaleString()}`
        : 'No Tax Owed';
      resultEl.innerHTML = `
        <div class="tf-score">All ${total} correct!</div>
        <div class="tf-owed ${taxClass}">${taxLine}</div>
        <div class="tf-owed-note">This amount will be due on Week 15 of Year ${this._taxYear + 1}.</div>
      `;
      document.getElementById('tf-submit-btn').classList.add('hidden');
      document.getElementById('tf-close-btn').classList.remove('hidden');
    } else {
      const remaining = total - correct;
      resultEl.innerHTML = `
        <div class="tf-score">${correct} / ${total} correct — fix the ${remaining} item${remaining !== 1 ? 's' : ''} in the bank and try again.</div>
      `;
      this._updateSubmitState();
    }

    resultEl.classList.remove('hidden');
  },

  // Close the modal. Tax form does not chain to another form.
  hide() {
    document.getElementById('tf-modal').classList.add('hidden');
  },

};
