// membership.js — Membership Plans: data model and Admission-panel section UI.
// Plans let visitors pay an annual fee in exchange for free gate admission,
// optional free parking, and percentage discounts on food and merchandise.

const Membership = {

  // All player-created membership plans.
  plans: [],

  // Monotonically increasing counter for assigning unique plan IDs.
  _nextId: 1,

  // Whether the new-plan creation form is currently visible.
  _formOpen: false,

  // Populates #membership-section inside the Admission panel.
  // Called by buildFinancialPanel() in hud.js after the pricing controls render.
  buildSection() {
    const section = document.getElementById('membership-section');
    if (section) this._render(section);
  },

  // Rebuilds section innerHTML and re-wires all event listeners.
  // Closes over section so inner callbacks can re-render without a global lookup.
  _render(section) {
    const listHtml = this.plans.length === 0
      ? '<p class="empty-note">No membership plans yet.</p>'
      : this.plans.map(p => this._planCardHtml(p)).join('');

    section.innerHTML = `
      <div class="financial-section-header">Membership Plans</div>
      <div class="membership-toolbar">
        <button id="new-plan-btn" class="new-plan-btn${this._formOpen ? ' open' : ''}">
          ${this._formOpen ? '✕ Cancel' : '+ New Plan'}
        </button>
      </div>
      ${this._formOpen ? this._formHtml() : ''}
      <div class="membership-list">${listHtml}</div>
    `;

    section.querySelector('#new-plan-btn').addEventListener('click', () => {
      this._formOpen = !this._formOpen;
      this._render(section);
    });

    if (this._formOpen) this._wireFormActions(section);

    section.querySelectorAll('.plan-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.plans = this.plans.filter(p => p.id !== parseInt(btn.dataset.id, 10));
        this._render(section);
      });
    });
  },

  // Returns HTML for the new-plan creation form.
  _formHtml() {
    return `
      <div class="posting-form membership-form" id="membership-form">
        <div class="form-field">
          <label for="mp-name">Plan Name</label>
          <input id="mp-name" type="text" placeholder="e.g. Family Pass">
        </div>
        <div class="membership-form-row">
          <div class="form-field">
            <label for="mp-price">Annual Price ($)</label>
            <input id="mp-price" type="number" min="0" step="1" placeholder="0">
          </div>
          <div class="form-field">
            <label for="mp-guests">People Covered</label>
            <input id="mp-guests" type="number" min="1" max="20" step="1" placeholder="1">
          </div>
        </div>
        <div class="membership-form-row">
          <div class="form-field">
            <label for="mp-food">Food Discount (%)</label>
            <input id="mp-food" type="number" min="0" max="100" step="1" placeholder="0">
          </div>
          <div class="form-field">
            <label for="mp-merch">Merch Discount (%)</label>
            <input id="mp-merch" type="number" min="0" max="100" step="1" placeholder="0">
          </div>
        </div>
        <div class="form-field">
          <label class="membership-checkbox-label">
            <input id="mp-parking" type="checkbox">
            <span>Free Parking Included</span>
          </label>
        </div>
        <div class="form-error hidden" id="mp-error"></div>
        <div class="form-actions">
          <button id="mp-save-btn">Save Plan</button>
          <button id="mp-cancel-btn">Cancel</button>
        </div>
      </div>
    `;
  },

  // Wires Save and Cancel buttons; validates inputs before pushing to plans[].
  _wireFormActions(section) {
    const errorEl = document.getElementById('mp-error');

    document.getElementById('mp-cancel-btn').addEventListener('click', () => {
      this._formOpen = false;
      this._render(section);
    });

    document.getElementById('mp-save-btn').addEventListener('click', () => {
      const name        = document.getElementById('mp-name').value.trim();
      const annualPrice = Math.max(0, parseInt(document.getElementById('mp-price').value)  || 0);
      const guestCount  = Math.min(20, Math.max(1, parseInt(document.getElementById('mp-guests').value) || 1));
      const foodPct     = Math.min(100, Math.max(0, parseInt(document.getElementById('mp-food').value)  || 0));
      const merchPct    = Math.min(100, Math.max(0, parseInt(document.getElementById('mp-merch').value) || 0));
      const freeParking = document.getElementById('mp-parking').checked;

      if (!name) {
        errorEl.textContent = 'Plan name is required.';
        errorEl.classList.remove('hidden');
        return;
      }

      this.plans.push({
        id:              this._nextId++,
        name,
        annualPrice,
        guestCount,
        freeParking,
        foodDiscountPct:  foodPct,
        merchDiscountPct: merchPct,
      });

      this._formOpen = false;
      this._render(section);
    });
  },

  // Returns HTML for a single membership plan card.
  _planCardHtml(plan) {
    const coverageLabel = `${plan.guestCount} ${plan.guestCount === 1 ? 'person' : 'people'}`;

    const perks = [
      plan.freeParking      ? `<div class="plan-detail-row"><span class="plan-detail-key">Parking</span><span class="plan-detail-val plan-perk-yes">Included</span></div>` : '',
      plan.foodDiscountPct  > 0 ? `<div class="plan-detail-row"><span class="plan-detail-key">Food</span><span class="plan-detail-val">${plan.foodDiscountPct}% off</span></div>` : '',
      plan.merchDiscountPct > 0 ? `<div class="plan-detail-row"><span class="plan-detail-key">Merch</span><span class="plan-detail-val">${plan.merchDiscountPct}% off</span></div>` : '',
    ].join('');

    return `
      <div class="membership-card">
        <div class="membership-card-header">
          <span class="membership-card-name">${plan.name}</span>
          <span class="membership-card-price">$${plan.annualPrice.toLocaleString()}/yr</span>
        </div>
        <div class="membership-card-details">
          <div class="plan-detail-row">
            <span class="plan-detail-key">Covers</span>
            <span class="plan-detail-val">${coverageLabel}</span>
          </div>
          ${perks}
        </div>
        <button class="plan-delete-btn cancel-posting-btn" data-id="${plan.id}">Remove</button>
      </div>
    `;
  },
};
