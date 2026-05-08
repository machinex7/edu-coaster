// membership.js — Membership Plans: data model, sales simulation, and Admission-panel UI.
// Plans let visitors pay an annual fee in exchange for free gate admission,
// optional free parking, and percentage discounts on food and merchandise.

// Fraction of eligible visitor-instances that convert to a membership purchase each week,
// before value and excitement modifiers are applied. Tune this to control market pace.
const MEMBERSHIP_BUY_RATE = 0.04;

// Hard cap on purchase probability per visitor-instance per week.
// Prevents runaway sales on extremely good-value plans at low attendance.
const MEMBERSHIP_MAX_PROB = 0.10;

// Highest annualVisits value across all HOUSEHOLD_SIZES brackets (Small Family = 2.5).
// Used to normalise household visit-motivation to a 0–1 scale.
const MEMBERSHIP_MAX_HOUSEHOLD_VISITS = 2.5;

const Membership = {

  // All player-created membership plans.
  plans: [],

  // Monotonically increasing counter for assigning unique plan IDs.
  _nextId: 1,

  // Whether the new-plan creation form is currently visible.
  _formOpen: false,

  // Round totals set by calcMemberAttendance() so other systems can reference them.
  memberAttendanceThisRound:    0,
  freeParkingVisitsThisRound:   0,  // vehicle-trips from free-parking plans (no revenue)
  paidParkingVehiclesThisRound: 0,  // vehicle-trips from non-free-parking plans (pay standard rate)
  // Weighted-average discount fractions (0–1) across all member visits this round.
  // Finance multiplies these by the member share of revenue to compute discount losses.
  foodDiscountFractionThisRound:  0,
  merchDiscountFractionThisRound: 0,

  // ── Sales simulation ────────────────────────────────────────────────────────

  // Called once per round by Finance.processRound() before shopping/food/security.
  // Returns { attendance, freeParkingVisits, paidParkingVehicles } and caches all on the object.
  //
  // For each plan we estimate how many of its active members visit this week,
  // then multiply by the plan's guestCount (each membership covers that many people).
  //
  // We don't know exactly which distance bracket each member came from — we only
  // stored the aggregate activeMembers count.  So we distribute members across
  // brackets using the same chance×favor weights used when they bought, which is
  // the best available approximation of the actual breakdown.
  //
  // Vehicle counting: membersInBracket × weeklyVisitRate represents household-unit
  // visits, i.e. one vehicle per visit.  Free-parking plans are tracked so Finance
  // can skip charging them; non-free-parking plans pay the standard parking rate.
  //
  // Discount fractions: each plan's attendance share is weighted by its discount pcts
  // to produce a single average fraction Finance can multiply against revenue.
  calcMemberAttendance() {
    let attendance          = 0;
    let freeParkingVisits   = 0;
    let paidParkingVehicles = 0;
    let foodDiscountSum     = 0;  // sum of (planAttendance × foodDiscountPct/100)
    let merchDiscountSum    = 0;  // sum of (planAttendance × merchDiscountPct/100)

    const distanceTotalWeight = Population.DISTANCE_BRACKETS.reduce(
      (s, d) => s + d.chance * d.favor, 0,
    );

    for (const plan of this.plans) {
      if (plan.activeMembers === 0) continue;

      for (const D of Population.DISTANCE_BRACKETS) {
        // Estimated share of this plan's active members who live in this bracket.
        // High-chance, high-favor brackets are over-represented among buyers,
        // so weighting by chance×favor is more accurate than chance alone.
        const dFraction        = (D.chance * D.favor) / distanceTotalWeight;
        const membersInBracket = plan.activeMembers * dFraction;

        // D.annualVisits / 52 converts a yearly visit rate into a per-week
        // probability.  Multiply by guestCount because each membership admits
        // that many people in a single visit.
        const weeklyVisitRate  = D.annualVisits / 52;
        const planAttendance   = membersInBracket * weeklyVisitRate * plan.guestCount;
        attendance            += planAttendance;

        // Accumulate discount weight so Finance can compute a single weighted-average
        // fraction: foodDiscountSum / totalAttendance = avg discount rate across members.
        foodDiscountSum  += planAttendance * plan.foodDiscountPct  / 100;
        merchDiscountSum += planAttendance * plan.merchDiscountPct / 100;

        // Each household visit = one vehicle trip.  Route to the appropriate counter.
        if (plan.freeParking) {
          freeParkingVisits   += membersInBracket * weeklyVisitRate;
        } else {
          paidParkingVehicles += membersInBracket * weeklyVisitRate;
        }
      }
    }

    this.memberAttendanceThisRound    = Math.round(attendance);
    this.freeParkingVisitsThisRound   = Math.round(freeParkingVisits);
    this.paidParkingVehiclesThisRound = Math.round(paidParkingVehicles);
    // Weighted-average fraction of revenue foregone due to discounts.
    // Dividing by raw attendance (pre-rounding) keeps precision for small member counts.
    this.foodDiscountFractionThisRound  = attendance > 0 ? foodDiscountSum  / attendance : 0;
    this.merchDiscountFractionThisRound = attendance > 0 ? merchDiscountSum / attendance : 0;
    return {
      attendance:          this.memberAttendanceThisRound,
      freeParkingVisits:   this.freeParkingVisitsThisRound,
      paidParkingVehicles: this.paidParkingVehiclesThisRound,
    };
  },

  // Called once per round by Finance.processRound() after calcExcitement() runs.
  // Returns total membership revenue earned this round (caller adds it to money).
  calcSales(weeklyAttendance) {
    if (this.plans.length === 0 || weeklyAttendance <= 0) return 0;

    // ── Per-visitor satisfaction score ──────────────────────────────────────
    // Finance.parkExcitement = weeklyAttendance × rideOpinion × securityFactor
    //                         × mealSatisfaction / messFactor
    // Dividing by weeklyAttendance cancels attendance out, leaving a pure
    // quality-per-visitor ratio.  A well-run park ≈ 0.6–0.9; excellent ≈ 1.0+.
    // The happier each visitor was, the more likely they are to buy a pass.
    const satisfactionPerVisitor = Finance.parkExcitement / weeklyAttendance;

    // ── Attendance-composition weights (chance × favor) ─────────────────────
    // The demand model weights each bracket by chance × favor, not chance alone.
    // Favor represents earned goodwill; high-favor brackets are over-represented
    // in who actually showed up this round, so we use the same weighting here.
    const distanceTotalWeight  = Population.DISTANCE_BRACKETS.reduce((s, d) => s + d.chance * d.favor, 0);
    const householdTotalWeight = Population.HOUSEHOLD_SIZES.reduce((s, h) => s + h.chance * h.favor, 0);

    let totalRevenue = 0;

    for (const plan of this.plans) {
      // Find the single household-size bracket this plan is designed for.
      // Households only buy a plan that covers their group size — a couple won't
      // pay for unused slots, and a family of 5 won't buy a 2-person plan.
      const hBracket = this._householdBracketFor(plan.guestCount);
      if (!hBracket) { plan.salesThisRound = 0; continue; }

      // Fraction of weekly visitors whose household size matches this plan.
      const hFraction = (hBracket.chance * hBracket.favor) / householdTotalWeight;

      // How motivated this household type is to buy a recurring pass, normalised
      // to 0–1.  Small families (2.5 visits/yr) score higher than solos (1.0/yr).
      const propensity = hBracket.annualVisits / MEMBERSHIP_MAX_HOUSEHOLD_VISITS;

      let newSales = 0;

      for (const D of Population.DISTANCE_BRACKETS) {
        // ── Break-even check ───────────────────────────────────────────────
        // A household only buys the plan if it saves them money vs. paying gate
        // each visit.  annualVisits tells us how often a household at this
        // distance actually comes, so it determines whether the plan pays off.
        const admissionSavings = D.annualVisits * Finance.gatePrice * plan.guestCount;
        const parkingSavings   = plan.freeParking ? D.annualVisits * Finance.parkingPrice : 0;
        const netValue         = admissionSavings + parkingSavings - plan.annualPrice;

        // No financial incentive for this distance band — skip entirely.
        if (netValue <= 0) continue;

        // ── Value ratio ────────────────────────────────────────────────────
        // How good a deal is the plan relative to its cost?
        // netValue = $400 on a $200 plan → ratio = 2.0 (saves twice what it costs).
        // A ratio near 0 means marginal savings; higher means compelling value.
        const valueRatio = netValue / plan.annualPrice;

        // ── Distance-bracket attendance fraction ───────────────────────────
        const dFraction = (D.chance * D.favor) / distanceTotalWeight;

        // ── Per-visitor-instance purchase probability ──────────────────────
        // We multiply by RATE then divide by D.annualVisits to de-duplicate
        // repeat visitors.  A Local household (6 visits/yr) shows up in 6 weekly
        // attendance samples over the year.  Without the division we'd sell them
        // a membership up to 6× as often as intended.  Dividing converts
        // "probability per visitor-instance" into "probability per unique household
        // per visit", so the annual conversion rate works out correctly regardless
        // of how often that household visits.
        const prob = Math.min(
          valueRatio * satisfactionPerVisitor * propensity * MEMBERSHIP_BUY_RATE / D.annualVisits,
          MEMBERSHIP_MAX_PROB,
        );

        // ── Expected new sales from this (distance × household) cell ───────
        newSales += weeklyAttendance * dFraction * hFraction * prob;
      }

      plan.salesThisRound = Math.floor(newSales);

      // Slide the 52-week window: push this week's sales in, evict the entry
      // from one year ago once the history is full.  The running sum is the
      // number of memberships that are still within their one-year term — i.e.
      // currently active.  Weeks with zero sales are stored so the window
      // always advances even in quiet rounds.
      plan.salesHistory.push(plan.salesThisRound);
      if (plan.salesHistory.length > 52) plan.salesHistory.shift();
      plan.activeMembers = plan.salesHistory.reduce((s, n) => s + n, 0);

      plan.totalMembers += plan.salesThisRound;
      totalRevenue      += plan.salesThisRound * plan.annualPrice;
    }

    return totalRevenue;
  },

  // Maps a plan's guestCount to the matching HOUSEHOLD_SIZES bracket.
  // Solo=1, Couple=2, Small Family=3–4, Large Family=5+.
  _householdBracketFor(guestCount) {
    if (guestCount === 1) return Population.HOUSEHOLD_SIZES.find(h => h.name.startsWith('Solo'));
    if (guestCount === 2) return Population.HOUSEHOLD_SIZES.find(h => h.name.startsWith('Couple'));
    if (guestCount <= 4)  return Population.HOUSEHOLD_SIZES.find(h => h.name.includes('Small'));
    return Population.HOUSEHOLD_SIZES.find(h => h.name.includes('Large'));
  },

  // ── Panel UI ────────────────────────────────────────────────────────────────

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
        salesThisRound:  0,
        salesHistory:    [],   // rolling 52-week window; sum = activeMembers
        activeMembers:   0,
        totalMembers:    0,
      });

      this._formOpen = false;
      this._render(section);
    });
  },

  // Returns HTML for a single membership plan card, including this-round sales stats.
  _planCardHtml(plan) {
    const coverageLabel = `${plan.guestCount} ${plan.guestCount === 1 ? 'person' : 'people'}`;

    const perks = [
      plan.freeParking      ? `<div class="plan-detail-row"><span class="plan-detail-key">Parking</span><span class="plan-detail-val plan-perk-yes">Included</span></div>` : '',
      plan.foodDiscountPct  > 0 ? `<div class="plan-detail-row"><span class="plan-detail-key">Food</span><span class="plan-detail-val">${plan.foodDiscountPct}% off</span></div>` : '',
      plan.merchDiscountPct > 0 ? `<div class="plan-detail-row"><span class="plan-detail-key">Merch</span><span class="plan-detail-val">${plan.merchDiscountPct}% off</span></div>` : '',
    ].join('');

    const statsHtml = plan.totalMembers > 0
      ? `<div class="plan-stats">
           <span class="plan-stat">${plan.activeMembers.toLocaleString()} active</span>
           <span class="plan-stat">${plan.totalMembers.toLocaleString()} all-time</span>
           ${plan.salesThisRound > 0 ? `<span class="plan-stat-new">+${plan.salesThisRound} this week</span>` : ''}
         </div>`
      : '';

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
        ${statsHtml}
        <button class="plan-delete-btn cancel-posting-btn" data-id="${plan.id}">Remove</button>
      </div>
    `;
  },
};
