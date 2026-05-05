// discounts.js — Discount Days panel: configure per-demographic gate discounts.

// Each discount type carries its display label, the fraction of gate price lost per
// affected visitor (BOGO = half because one ticket is free per pair on average),
// and the additive favor boost applied to the target bracket on active rounds.
const DISCOUNT_TYPES = [
  { value: '20pct', label: '20% off',        costFraction: 0.20, favorBoost: 0.10 },
  { value: 'half',  label: 'Half off',       costFraction: 0.50, favorBoost: 0.20 },
  { value: 'bogo',  label: 'BOGO',           costFraction: 0.50, favorBoost: 0.25 },
  { value: 'free',  label: 'Free Admission', costFraction: 1.00, favorBoost: 0.50 },
];

// Each frequency entry carries its display label and how many rounds elapse between
// applications (period: 1 = every round, 4 = roughly once a month, etc.).
const DISCOUNT_FREQS = [
  { value: 'weekly',   label: 'Every week',      period: 1  },
  { value: 'biweekly', label: 'Every 2 weeks',   period: 2  },
  { value: 'monthly',  label: 'Once a month',    period: 4  },
  { value: 'seasonal', label: 'Once per season', period: 13 },
];

// Ordered Sun–Sat entries for the day-of-week checkbox row.
const DISCOUNT_DAYS = [
  { value: 'sun', short: 'Sun' },
  { value: 'mon', short: 'Mon' },
  { value: 'tue', short: 'Tue' },
  { value: 'wed', short: 'Wed' },
  { value: 'thu', short: 'Thu' },
  { value: 'fri', short: 'Fri' },
  { value: 'sat', short: 'Sat' },
];

const Discounts = {

  // All active discount rules defined by the player.
  rules: [],

  // Total gate revenue lost in the most recent round. Set by calcGateCost().
  lastRoundCost: 0,

  // Monotonically increasing counter for assigning rule IDs.
  _nextId: 1,

  // Whether the new-discount form is currently expanded.
  _formOpen: false,

  // Maps demographic category keys to their Population array name and display label.
  DEMO_CATEGORIES: [
    { key: 'AGE',        label: 'Age Group',         arrayKey: 'AGE_BRACKETS'      },
    { key: 'INCOME',     label: 'Income Level',      arrayKey: 'INCOME_BRACKETS'   },
    { key: 'DISTANCE',   label: 'Home Distance',     arrayKey: 'DISTANCE_BRACKETS' },
    { key: 'HOUSEHOLD',  label: 'Household Size',    arrayKey: 'HOUSEHOLD_SIZES'   },
    { key: 'AREA',       label: 'Area Type',         arrayKey: 'AREA_TYPES'        },
    { key: 'EMPLOYMENT', label: 'Employment Status', arrayKey: 'EMPLOYMENT_STATUS' },
    { key: 'STATUS',     label: 'Visitor Status',    arrayKey: 'VISITOR_STATUS'    },
  ],

  // Returns the additive favor boost for a bracket this round, summed across all
  // active discount rules that target it. Returns 0 if none apply.
  getFavorBoost(catKey, bracketName) {
    let boost = 0;
    for (const rule of this.rules) {
      if (rule.demoKey !== catKey || rule.bracketName !== bracketName) continue;
      if (!this.isActiveThisRound(rule)) continue;
      boost += DISCOUNT_TYPES.find(t => t.value === rule.discountType)?.favorBoost ?? 0;
    }
    return boost;
  },

  // Returns true if rule should apply this round based on its frequency.
  // Uses (round - roundCreated) % period so the rule fires on the round it was
  // created and then repeats at the correct cadence from that anchor point.
  isActiveThisRound(rule) {
    const period = DISCOUNT_FREQS.find(f => f.value === rule.freq)?.period ?? 1;
    return (round - rule.roundCreated) % period === 0;
  },

  // Calculates the total gate revenue lost this round across all discount rules.
  // For each rule: estimates the fraction of weeklyAttendance in that bracket using
  // chance × favor weights, then applies the discount's cost fraction to that slice.
  // Increments rule.moneyLost and returns the total deduction.
  calcGateCost(weeklyAttendance, gatePrice) {
    let totalCost = 0;

    for (const rule of this.rules) {
      if (!this.isActiveThisRound(rule)) continue;

      const cat = this.DEMO_CATEGORIES.find(c => c.key === rule.demoKey);
      if (!cat) continue;

      const brackets    = Population[cat.arrayKey] || [];
      const totalWeight = brackets.reduce((s, b) => s + b.chance * b.favor, 0);
      if (totalWeight === 0) continue;

      const bracket = brackets.find(b => b.name === rule.bracketName);
      if (!bracket) continue;

      const dayMultiplier = rule.days.length / 7;
      const fraction      = (bracket.chance * bracket.favor) / totalWeight;
      const affected      = weeklyAttendance * fraction;
      const costFraction  = DISCOUNT_TYPES.find(t => t.value === rule.discountType)?.costFraction ?? 0;
      const cost          = Math.round(affected * gatePrice * costFraction * dayMultiplier);

      rule.moneyLost += cost;
      totalCost      += cost;
    }

    this.lastRoundCost = totalCost;
    return totalCost;
  },

  // Entry point called by openPanel() in hud.js.
  buildPanel() {
    const body = document.getElementById('discounts-panel-body');
    this._render(body);
  },

  // Rebuilds the full panel content and re-wires all event listeners.
  _render(body) {
    const listHtml = this.rules.length === 0
      ? '<p class="empty-note">No discounts set up yet.</p>'
      : this.rules.map(r => this._ruleCardHtml(r)).join('');

    body.innerHTML = `
      <div class="discounts-toolbar">
        <button id="new-discount-btn" class="new-discount-btn${this._formOpen ? ' open' : ''}">
          ${this._formOpen ? '✕ Cancel' : '+ New Discount'}
        </button>
      </div>
      ${this._formOpen ? this._formHtml() : ''}
      <div class="discounts-list">${listHtml}</div>
    `;

    document.getElementById('new-discount-btn').addEventListener('click', () => {
      this._formOpen = !this._formOpen;
      this.buildPanel();
    });

    if (this._formOpen) {
      this._wireCategoryChange();
      this._wireFormActions();
    }

    body.querySelectorAll('.discount-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        this.rules = this.rules.filter(r => r.id !== id);
        this.buildPanel();
      });
    });
  },

  // Returns the brackets for a category, excluding any that make no sense as discount targets.
  _bracketsFor(cat) {
    const brackets = Population[cat.arrayKey] || [];
    if (cat.key === 'STATUS') return brackets.filter(b => b.name !== 'None');
    return brackets;
  },

  // Returns the HTML string for the new-discount form.
  _formHtml() {
    const firstCat = this.DEMO_CATEGORIES[0];
    const brackets = this._bracketsFor(firstCat);

    const dayChips = DISCOUNT_DAYS.map(d =>
      `<label class="day-chip">
        <input type="checkbox" name="df-day" value="${d.value}">
        <span>${d.short}</span>
      </label>`
    ).join('');

    const freqOpts = DISCOUNT_FREQS.map(f =>
      `<option value="${f.value}">${f.label}</option>`
    ).join('');

    const typeOpts = DISCOUNT_TYPES.map(t =>
      `<option value="${t.value}">${t.label}</option>`
    ).join('');

    const catOpts = this.DEMO_CATEGORIES.map(c =>
      `<option value="${c.key}">${c.label}</option>`
    ).join('');

    const bracketOpts = brackets.map(b =>
      `<option value="${b.name}">${b.name}</option>`
    ).join('');

    return `
      <div class="posting-form discount-form" id="discount-form">
        <div class="form-field">
          <label>Days</label>
          <div class="discount-day-picker">${dayChips}</div>
        </div>
        <div class="discount-form-row">
          <div class="form-field">
            <label>Frequency</label>
            <select id="df-freq">${freqOpts}</select>
          </div>
          <div class="form-field">
            <label>Discount Type</label>
            <select id="df-type">${typeOpts}</select>
          </div>
        </div>
        <div class="discount-form-row">
          <div class="form-field">
            <label>Demographic Group</label>
            <select id="df-category">${catOpts}</select>
          </div>
          <div class="form-field">
            <label>Bracket</label>
            <select id="df-bracket">${bracketOpts}</select>
          </div>
        </div>
        <div class="form-error hidden" id="df-error"></div>
        <div class="form-actions">
          <button id="df-save-btn" class="df-save-btn">Save Discount</button>
          <button id="df-cancel-btn" class="df-cancel-btn">Cancel</button>
        </div>
      </div>
    `;
  },

  // Wires the demographic category dropdown to repopulate the bracket dropdown.
  _wireCategoryChange() {
    const catSelect     = document.getElementById('df-category');
    const bracketSelect = document.getElementById('df-bracket');
    if (!catSelect || !bracketSelect) return;

    catSelect.addEventListener('change', () => {
      const cat      = this.DEMO_CATEGORIES.find(c => c.key === catSelect.value);
      const brackets = cat ? this._bracketsFor(cat) : [];
      bracketSelect.innerHTML = brackets.map(b =>
        `<option value="${b.name}">${b.name}</option>`
      ).join('');
    });
  },

  // Wires the Save and Cancel buttons on the form.
  _wireFormActions() {
    const errorEl = document.getElementById('df-error');

    document.getElementById('df-cancel-btn').addEventListener('click', () => {
      this._formOpen = false;
      this.buildPanel();
    });

    document.getElementById('df-save-btn').addEventListener('click', () => {
      const days = Array.from(
        document.querySelectorAll('input[name="df-day"]:checked')
      ).map(cb => cb.value);

      const freq        = document.getElementById('df-freq').value;
      const typeVal     = document.getElementById('df-type').value;
      const catKey      = document.getElementById('df-category').value;
      const bracketName = document.getElementById('df-bracket').value;

      if (days.length === 0) {
        errorEl.textContent = 'Select at least one day.';
        errorEl.classList.remove('hidden');
        return;
      }

      const cat          = this.DEMO_CATEGORIES.find(c => c.key === catKey);
      const bracket      = cat ? (Population[cat.arrayKey] || []).find(b => b.name === bracketName) : null;
      if (!bracket) return;

      const discountType = DISCOUNT_TYPES.find(t => t.value === typeVal);

      this.rules.push({
        id:            this._nextId++,
        days,
        freq,
        discountType:  discountType.value,
        discountLabel: discountType.label,
        demoKey:       catKey,
        demoLabel:     cat.label,
        bracketName:   bracket.name,
        roundCreated:  round,
        moneyLost:     0,
      });

      this._formOpen = false;
      this.buildPanel();
    });
  },

  // Returns a short human-readable summary of which days are active.
  _daysLabel(days) {
    if (days.length === 7) return 'Every day';
    return days.map(v => DISCOUNT_DAYS.find(d => d.value === v)?.short || v).join(', ');
  },

  // Returns the HTML string for a single discount rule card.
  _ruleCardHtml(rule) {
    const freqLabel = DISCOUNT_FREQS.find(f => f.value === rule.freq)?.label || rule.freq;

    return `
      <div class="discount-card">
        <div class="discount-card-header">
          <span class="discount-badge">${rule.discountLabel}</span>
        </div>
        <div class="discount-card-details">
          <div class="discount-detail-row">
            <span class="discount-detail-key">Who</span>
            <span class="discount-detail-val">${rule.demoLabel}: ${rule.bracketName}</span>
          </div>
          <div class="discount-detail-row">
            <span class="discount-detail-key">Days</span>
            <span class="discount-detail-val">${this._daysLabel(rule.days)}</span>
          </div>
          <div class="discount-detail-row">
            <span class="discount-detail-key">Freq</span>
            <span class="discount-detail-val">${freqLabel}</span>
          </div>
          <div class="discount-detail-row">
            <span class="discount-detail-key">Since</span>
            <span class="discount-detail-val">Round ${rule.roundCreated}</span>
          </div>
          <div class="discount-detail-row">
            <span class="discount-detail-key">Cost</span>
            <span class="discount-detail-val">$${rule.moneyLost.toLocaleString()}</span>
          </div>
        </div>
        <button class="discount-delete-btn cancel-posting-btn" data-id="${rule.id}">Remove</button>
      </div>
    `;
  },
};
