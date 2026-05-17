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

// Visitor quote pools keyed by bracket name.
// Picked randomly when a discount fires to give texture to the round summary.
const DISCOUNT_QUOTES = {
  'Child (0–12)': [
    "Glad I could get my kids in free today!",
    "My little ones would never let me skip this place — the deal helps a lot.",
    "This is how you build a family tradition.",
    "Four kids is expensive. This discount makes it possible.",
  ],
  'Teen (13–17)': [
    "Finally, a place that doesn't charge us adult prices.",
    "Brought my whole friend group because of this deal.",
    "Nice to feel welcome for once.",
    "Told everyone at school about the teen discount.",
  ],
  'Young Adult (18–34)': [
    "Would not have come today at full price, honestly.",
    "This is how you get young people through the door.",
    "Great deal — I'm telling everyone about this.",
    "Came back again this month because of the deal.",
  ],
  'Adult (35–54)': [
    "Appreciate the deal — makes it worth the drive.",
    "Good value makes all the difference.",
    "We come every time there's a discount weekend.",
    "Nice that the park rewards people who actually show up.",
  ],
  'Senior (55+)': [
    "The senior discount really makes a difference on a fixed income.",
    "I always mention this to people at my community center.",
    "My friends and I plan our whole month around deals like this.",
    "At my age I appreciate every dollar saved.",
  ],
  'Disabled': [
    "It means a lot that this park offers an accessibility discount.",
    "The discount makes it possible for me to visit more often.",
    "Really appreciate being recognized — thank you.",
    "Not every park does this. Glad you do.",
  ],
  'Veteran': [
    "I appreciate the Veterans discount.",
    "Thank you for recognizing my service.",
    "Brought the whole family today because of this offer.",
    "A lot of places do this now — always means something.",
  ],
  'Disabled Veteran': [
    "This discount means more than you know.",
    "Thank you for honoring those who served.",
    "I appreciate every park that offers this.",
    "Told my VA group about this place.",
  ],
};

const Discounts = {

  // All active discount rules defined by the player.
  rules: [],

  // Total gate revenue lost in the most recent round. Set by calcGateCost().
  lastRoundCost: 0,

  // Monotonically increasing counter for assigning rule IDs.
  _nextId: 1,

  // Whether the new-discount form is currently expanded.
  _formOpen: false,

  // Returns the additive favor boost for a bracket this round, summed across all
  // active rules that target it (or target Everyone).
  getFavorBoost(catKey, bracketName) {
    let boost = 0;
    for (const rule of this.rules) {
      if (!this.isActiveThisRound(rule)) continue;
      // null demoKey means Everyone — boost every bracket.
      if (rule.demoKey !== null && (rule.demoKey !== catKey || rule.bracketName !== bracketName)) continue;
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
  // "Everyone" rules (demoKey null) apply to the full attendance. Bracket rules
  // estimate the affected slice via chance × favor weighting within that category.
  calcGateCost(weeklyAttendance, gatePrice) {
    let totalCost = 0;

    for (const rule of this.rules) {
      if (!this.isActiveThisRound(rule)) continue;

      const sched = DISCOUNT_SCHEDULES.find(s => s.value === rule.schedule) ?? DISCOUNT_SCHEDULES[0];

      let fraction;
      if (rule.demoKey === null) {
        fraction = 1;
      } else {
        const arrayKey    = rule.demoKey === 'AGE' ? 'AGE_BRACKETS' : 'VISITOR_STATUS';
        const brackets    = Population[arrayKey] || [];
        const totalWeight = brackets.reduce((s, b) => s + b.chance * b.favor, 0);
        if (totalWeight === 0) continue;
        const bracketIdx = brackets.findIndex(b => b.name === rule.bracketName);
        if (bracketIdx < 0) continue;
        const bracket = brackets[bracketIdx];
        fraction = (bracket.chance * bracket.favor) / totalWeight;

        // Visitors who redeemed the discount presented ID — direct demographic observation.
        const affected = Math.round(weeklyAttendance * fraction * sched.dayMult);
        Population.observeDiscount(rule.demoKey, bracketIdx, affected);
        this._pushFeedback(rule, affected);
      }

      const costFraction = DISCOUNT_TYPES.find(t => t.value === rule.discountType)?.costFraction ?? 0;
      const cost         = Math.round(weeklyAttendance * fraction * gatePrice * costFraction * sched.dayMult);

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

  // Returns the HTML string for the new-discount form.
  // The "Who" selector is a flat list of verifiable targets: Everyone, each Age bracket,
  // and each named Visitor Status bracket (excluding the unverifiable "None" entry).
  _formHtml() {
    const schedOpts = DISCOUNT_SCHEDULES.map(s =>
      `<option value="${s.value}">${s.label}</option>`
    ).join('');

    const typeOpts = DISCOUNT_TYPES.map(t =>
      `<option value="${t.value}">${t.label}</option>`
    ).join('');

    const ageOpts = Population.AGE_BRACKETS.map(b =>
      `<option value="AGE__${b.name}">${b.name}</option>`
    ).join('');

    const statusOpts = Population.VISITOR_STATUS
      .filter(b => b.name !== 'None')
      .map(b => `<option value="STATUS__${b.name}">${b.name}</option>`)
      .join('');

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
        <div class="form-field">
          <label>Who qualifies</label>
          <select id="df-target">
            <option value="all">Everyone</option>
            <optgroup label="Age">${ageOpts}</optgroup>
            <optgroup label="Visitor Status">${statusOpts}</optgroup>
          </select>
        </div>
        <div class="form-actions">
          <button id="df-save-btn" class="df-save-btn">Save Discount</button>
          <button id="df-cancel-btn" class="df-cancel-btn">Cancel</button>
        </div>
      </div>
    `;
  },

  // Wires the Save and Cancel buttons on the form.
  _wireFormActions() {

    document.getElementById('df-cancel-btn').addEventListener('click', () => {
      this._formOpen = false;
      this.buildPanel();
    });

    document.getElementById('df-save-btn').addEventListener('click', () => {
      const schedule     = document.getElementById('df-schedule').value;
      const typeVal      = document.getElementById('df-type').value;
      const targetVal    = document.getElementById('df-target').value;
      const discountType = DISCOUNT_TYPES.find(t => t.value === typeVal);

      let demoKey = null, bracketName = null, targetLabel = 'Everyone';
      if (targetVal !== 'all') {
        const sep = targetVal.indexOf('__');
        demoKey     = targetVal.slice(0, sep);
        bracketName = targetVal.slice(sep + 2);
        targetLabel = bracketName;
      }

      this.rules.push({
        id:            this._nextId++,
        schedule,
        discountType:  discountType.value,
        discountLabel: discountType.label,
        demoKey,
        bracketName,
        targetLabel,
        roundCreated:  round,
        moneyLost:     0,
      });

      this._formOpen = false;
      this.buildPanel();
    });
  },

  // Pushes a visitor-voice notification for a bracket discount that fired this round.
  // Picks a random quote from DISCOUNT_QUOTES for the bracket, and shows the
  // approximate number of visitors who used the discount as context.
  _pushFeedback(rule, affectedCount) {
    const quotes = DISCOUNT_QUOTES[rule.bracketName];
    if (!quotes || affectedCount < 1) return;
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    // Derive a short chip label from the bracket name (strip the age-range parenthetical).
    const label = rule.bracketName.includes('(')
      ? rule.bracketName.slice(0, rule.bracketName.indexOf('(')).trim()
      : rule.bracketName;
    const n = affectedCount.toLocaleString();
    Notifications.push({
      label,
      message: `~${n} ${rule.targetLabel} visitors used the ${rule.discountLabel} discount. "${quote}"`,
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
            <span class="discount-detail-val">${rule.targetLabel}</span>
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
