// discounts.js — Discount Days panel: configure per-demographic day/frequency discounts.

// Options for the day-of-week selector in the discount form.
const DISCOUNT_DAY_OPTIONS = [
  { value: 'all',      label: 'Every Day'  },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekends', label: 'Weekends (Sat–Sun)' },
  { value: 'mon',      label: 'Monday'     },
  { value: 'tue',      label: 'Tuesday'    },
  { value: 'wed',      label: 'Wednesday'  },
  { value: 'thu',      label: 'Thursday'   },
  { value: 'fri',      label: 'Friday'     },
  { value: 'sat',      label: 'Saturday'   },
  { value: 'sun',      label: 'Sunday'     },
];

// Options for how often a discount repeats.
const DISCOUNT_FREQ_OPTIONS = [
  { value: 'weekly',   label: 'Every week'      },
  { value: 'biweekly', label: 'Every 2 weeks'   },
  { value: 'monthly',  label: 'Once a month'    },
  { value: 'seasonal', label: 'Once per season' },
];

// Display labels for each DISCOUNT_APPLIES_TO value.
const DISCOUNT_APPLIES_TO_OPTIONS = [
  { value: DISCOUNT_APPLIES_TO.GATE,        label: 'Gate Admission' },
  { value: DISCOUNT_APPLIES_TO.PARKING,     label: 'Parking'        },
  { value: DISCOUNT_APPLIES_TO.MERCHANDISE, label: 'Merchandise'    },
  { value: DISCOUNT_APPLIES_TO.ALL,         label: 'All Prices'     },
];

const Discounts = {

  // All active discount rules defined by the player.
  rules: [],

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
      this._wireFormActions(body);
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
  _formHtml() {
    const firstCat   = this.DEMO_CATEGORIES[0];
    const brackets   = Population[firstCat.arrayKey] || [];

    const dayOpts = DISCOUNT_DAY_OPTIONS.map(d =>
      `<option value="${d.value}">${d.label}</option>`
    ).join('');

    const freqOpts = DISCOUNT_FREQ_OPTIONS.map(f =>
      `<option value="${f.value}">${f.label}</option>`
    ).join('');

    const catOpts = this.DEMO_CATEGORIES.map(c =>
      `<option value="${c.key}">${c.label}</option>`
    ).join('');

    const bracketOpts = brackets.map((b, i) =>
      `<option value="${i}">${b.name}</option>`
    ).join('');

    const appliesToOpts = DISCOUNT_APPLIES_TO_OPTIONS.map(a =>
      `<option value="${a.value}">${a.label}</option>`
    ).join('');

    return `
      <div class="posting-form discount-form" id="discount-form">
        <div class="discount-form-row">
          <div class="form-field">
            <label>Day of Week</label>
            <select id="df-day">${dayOpts}</select>
          </div>
          <div class="form-field">
            <label>Frequency</label>
            <select id="df-freq">${freqOpts}</select>
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
        <div class="discount-form-row">
          <div class="form-field">
            <label>Applies To</label>
            <select id="df-applies-to">${appliesToOpts}</select>
          </div>
          <div class="form-field">
            <label>Discount (%)</label>
            <input type="number" id="df-percent" min="1" max="100" value="10" />
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
      const brackets = cat ? (Population[cat.arrayKey] || []) : [];
      bracketSelect.innerHTML = brackets.map((b, i) =>
        `<option value="${i}">${b.name}</option>`
      ).join('');
    });
  },

  // Wires the Save and Cancel buttons on the form.
  _wireFormActions(body) {
    const errorEl = document.getElementById('df-error');

    document.getElementById('df-cancel-btn').addEventListener('click', () => {
      this._formOpen = false;
      this.buildPanel();
    });

    document.getElementById('df-save-btn').addEventListener('click', () => {
      const day        = document.getElementById('df-day').value;
      const freq       = document.getElementById('df-freq').value;
      const catKey     = document.getElementById('df-category').value;
      const bracketIdx = parseInt(document.getElementById('df-bracket').value, 10);
      const appliesTo  = document.getElementById('df-applies-to').value;
      const percent    = parseInt(document.getElementById('df-percent').value, 10);

      if (isNaN(percent) || percent < 1 || percent > 100) {
        errorEl.textContent = 'Discount must be between 1% and 100%.';
        errorEl.classList.remove('hidden');
        return;
      }

      const cat     = this.DEMO_CATEGORIES.find(c => c.key === catKey);
      const bracket = cat ? (Population[cat.arrayKey] || [])[bracketIdx] : null;
      if (!bracket) return;

      this.rules.push({
        id:          this._nextId++,
        day,
        freq,
        demoKey:     catKey,
        demoLabel:   cat.label,
        bracketIdx,
        bracketName: bracket.name,
        appliesTo,
        percent,
      });

      this._formOpen = false;
      this.buildPanel();
    });
  },

  // Returns the HTML string for a single discount rule card.
  _ruleCardHtml(rule) {
    const dayLabel  = (DISCOUNT_DAY_OPTIONS.find(d => d.value === rule.day)          || {}).label || rule.day;
    const freqLabel = (DISCOUNT_FREQ_OPTIONS.find(f => f.value === rule.freq)         || {}).label || rule.freq;
    const appLabel  = (DISCOUNT_APPLIES_TO_OPTIONS.find(a => a.value === rule.appliesTo) || {}).label || rule.appliesTo;

    return `
      <div class="discount-card">
        <div class="discount-card-header">
          <span class="discount-percent-badge">${rule.percent}% off</span>
          <span class="discount-applies-label">${appLabel}</span>
        </div>
        <div class="discount-card-details">
          <div class="discount-detail-row">
            <span class="discount-detail-key">Who</span>
            <span class="discount-detail-val">${rule.demoLabel}: ${rule.bracketName}</span>
          </div>
          <div class="discount-detail-row">
            <span class="discount-detail-key">When</span>
            <span class="discount-detail-val">${dayLabel} &middot; ${freqLabel}</span>
          </div>
        </div>
        <button class="discount-delete-btn cancel-posting-btn" data-id="${rule.id}">Remove</button>
      </div>
    `;
  },
};
