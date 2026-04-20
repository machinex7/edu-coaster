// security.js — Security state, incident calculation, and panel UI.

const Security = {

  // ── State ──────────────────────────────────────────────────────────────────
  // Accumulated perception of danger. Rises by unhandled incident count each
  // round; decays 20% per round (rounded up). Reduces demand via sqrt curve.
  // Read by calcDailyDemand() in finance.js.
  opinion: 0,

  FOCUS_BONUS: 3, // extra incidents handled per focused guard

  FOCUS_META: [
    { focus: SECURITY_FOCUS.PATROL, label: 'Patrol', desc: 'Handles unridden visitor incidents' },
    { focus: SECURITY_FOCUS.GATE,   label: 'Gate',   desc: 'Handles gate overflow incidents'    },
    { focus: SECURITY_FOCUS.SHOP,   label: 'Shop',   desc: 'Handles shop theft (coming soon)'   },
  ],

  // ── Incident calculation ──────────────────────────────────────────────────
  // Two-phase handling:
  //   Phase 1 — Focus bonus: each guard with a matching focus handles FOCUS_BONUS
  //             extra incidents of that type, free (does not consume normal capacity).
  //   Phase 2 — Normal capacity: all guards' weekly quota (pooled) handles
  //             whatever incidents remain after bonuses.
  //
  // Weekly normal quota per guard: tier 1 → 28, tier 2 → 35, tier 3 → 42, tier 4 → 49.
  // Must be called after computeRideOpinion() so lastRoundRiders is current.
  calcIncidents(weeklyAttendance, dailyDemand, dailyThroughput) {
    const weeklyOverflow = Math.max(0, (dailyDemand - dailyThroughput) * 7);
    const fromOverflow   = Math.floor(weeklyOverflow * 0.05);

    const weeklyRiders   = installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
      .reduce((sum, r) => sum + (r.lastRoundRiders ?? 0), 0);
    const unridden       = Math.max(0, weeklyAttendance - weeklyRiders);
    const fromUnridden   = Math.floor(unridden * 0.20);

    const fromRandom     = Math.floor(weeklyAttendance * 0.001);
    const fromShop       = 0; // placeholder until shops are implemented

    const total = fromOverflow + fromUnridden + fromRandom + fromShop;

    const guards      = staff.filter(s => s.jobId === JOB.SECURITY);
    const gateCount   = guards.filter(s => s.focus === SECURITY_FOCUS.GATE).length;
    const patrolCount = guards.filter(s => s.focus === SECURITY_FOCUS.PATROL).length;
    const shopCount   = guards.filter(s => s.focus === SECURITY_FOCUS.SHOP).length;

    const overflowBonus = Math.min(fromOverflow, gateCount   * this.FOCUS_BONUS);
    const unriddenBonus = Math.min(fromUnridden, patrolCount * this.FOCUS_BONUS);
    const shopBonus     = Math.min(fromShop,     shopCount   * this.FOCUS_BONUS);
    const bonusHandled  = overflowBonus + unriddenBonus + shopBonus;

    const capacity      = guards.reduce((sum, s) => {
      const { tier } = getExperienceTier(s.weeksEmployed);
      return sum + (3 + tier) * 7;
    }, 0);
    const remaining     = total - bonusHandled;
    const normalHandled = Math.min(remaining, capacity);

    const handled   = bonusHandled + normalHandled;
    const unhandled = total - handled;

    return {
      fromOverflow, fromUnridden, fromRandom, fromShop, total,
      gateCount, patrolCount, shopCount,
      overflowBonus, unriddenBonus, shopBonus, bonusHandled,
      capacity, normalHandled,
      handled, unhandled,
    };
  },

  advanceOpinion(unhandled) {
    const decay  = Math.ceil(this.opinion * 0.20);
    this.opinion = Math.max(0, this.opinion - decay) + unhandled;
  },

  // ── Panel UI ────────────────────────────────────────────────────────────────
  buildPanel() {
    const container = document.getElementById('security-overview');
    const guards    = staff.filter(s => s.jobId === JOB.SECURITY);

    if (guards.length === 0) {
      container.innerHTML = '<p class="empty-note">No security guards hired. Visit Staffing to hire some.</p>';
      return;
    }

    const guardRows = guards.map(s => {
      const { label: expLabel, tier } = getExperienceTier(s.weeksEmployed);
      const weeklyCapacity = (3 + tier) * 7;
      const expBadge = expLabel
        ? `<span class="exp-badge exp-${expLabel.toLowerCase()}">${expLabel}</span>`
        : '';
      const focusBtns = this.FOCUS_META.map(m =>
        `<button class="sec-focus-btn${s.focus === m.focus ? ' active' : ''}"
                 data-id="${s.instanceId}" data-focus="${m.focus}">${m.label}</button>`
      ).join('');
      return `<div class="security-guard-row">
        <div class="sec-guard-info">
          <span class="sec-guard-name">${s.name} ${expBadge}</span>
          <span class="sec-guard-cap">${weeklyCapacity}/wk</span>
        </div>
        <div class="sec-focus-btns">${focusBtns}</div>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="sec-focus-legend">
        ${this.FOCUS_META.map(m => `<div class="sec-legend-row">
          <strong>${m.label}</strong> — ${m.desc}</div>`).join('')}
      </div>
      <div class="security-guard-list">${guardRows}</div>`;

    container.querySelectorAll('.sec-focus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const guard = staff.find(s => s.instanceId === btn.dataset.id);
        if (!guard) return;
        guard.focus = btn.dataset.focus;
        this.buildPanel();
      });
    });
  },

  refreshPanel() {
    if (activePanel === 'security') this.buildPanel();
  },

};
