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

// Schedule options combine day coverage and frequency into one choice.
// dayMult is the fraction of the week the discount covers; period is rounds between activations.
const DISCOUNT_SCHEDULES = [
  { value: 'weekends', label: 'Weekends',        period: 1, dayMult: 2 / 7 },
  { value: 'weekdays', label: 'Weekdays',        period: 1, dayMult: 5 / 7 },
  { value: 'monthly',  label: 'One Day a Month', period: 4, dayMult: 1 / 7 },
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

  // Returns true if rule should apply this round based on its schedule's period.
  // Uses (round - roundCreated) % period so the rule fires on the round it was
  // created and then repeats at the correct cadence from that anchor point.
  isActiveThisRound(rule) {
    const sched = DISCOUNT_SCHEDULES.find(s => s.value === rule.schedule) ?? DISCOUNT_SCHEDULES[0];
    return (round - rule.roundCreated) % sched.period === 0;
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

      const sched        = DISCOUNT_SCHEDULES.find(s => s.value === rule.schedule) ?? DISCOUNT_SCHEDULES[0];
      const fraction     = (bracket.chance * bracket.favor) / totalWeight;
      const affected     = weeklyAttendance * fraction;
      const costFraction = DISCOUNT_TYPES.find(t => t.value === rule.discountType)?.costFraction ?? 0;
      const cost         = Math.round(affected * gatePrice * costFraction * sched.dayMult);

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

    const schedOpts = DISCOUNT_SCHEDULES.map(s =>
      `<option value="${s.value}">${s.label}</option>`
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
        <div class="discount-form-row">
          <div class="form-field">
            <label>Schedule</label>
            <select id="df-schedule">${schedOpts}</select>
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
      const schedule    = document.getElementById('df-schedule').value;
      const typeVal     = document.getElementById('df-type').value;
      const catKey      = document.getElementById('df-category').value;
      const bracketName = document.getElementById('df-bracket').value;

      const cat          = this.DEMO_CATEGORIES.find(c => c.key === catKey);
      const bracket      = cat ? (Population[cat.arrayKey] || []).find(b => b.name === bracketName) : null;
      if (!bracket) return;

      const discountType = DISCOUNT_TYPES.find(t => t.value === typeVal);

      this.rules.push({
        id:            this._nextId++,
        schedule,
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

  // Returns the HTML string for a single discount rule card.
  _ruleCardHtml(rule) {
    const schedLabel = DISCOUNT_SCHEDULES.find(s => s.value === rule.schedule)?.label || rule.schedule;

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
            <span class="discount-detail-key">Schedule</span>
            <span class="discount-detail-val">${schedLabel}</span>
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
