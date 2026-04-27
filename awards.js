// awards.js — Quarter-end award system.
// Awards are checked at the end of every quarter (every 13 rounds in Play mode).
// Each award is earned at most once and kept permanently.

const Awards = {
  list:   [],         // earned awards: { id, name, description, date }
  earned: new Set(),  // fast membership check

  earn(def) {
    if (this.earned.has(def.id)) return;
    this.earned.add(def.id);
    this.list.push({ id: def.id, name: def.name, description: def.description, date: getDateLabel() });
    Notifications.push({
      label:   'Award',
      message: `You earned: ${def.name}`,
      action:  () => openPanel('awards'),
    });
  },

  // Called at quarter-end. Passes the last round's Finance report for per-week criteria.
  checkQuarterly(report) {
    for (const def of AWARD_DEFS) {
      if (!this.earned.has(def.id) && def.check(report)) {
        this.earn(def);
      }
    }
  },

  buildPanel() {
    const body = document.getElementById('awards-panel-body');
    if (this.list.length === 0) {
      body.innerHTML = '<div class="awards-empty">No awards earned yet.<br>Complete a quarter to be evaluated.</div>';
      return;
    }
    body.innerHTML = this.list.map(a => `
      <div class="award-card">
        <div class="award-card-name">🏆 ${a.name}</div>
        <div class="award-card-desc">${a.description}</div>
        <div class="award-card-date">Earned ${a.date}</div>
      </div>`).join('');
  },

  refreshPanel() {
    if (activePanel === 'awards') this.buildPanel();
  },
};

// ── Award definitions ────────────────────────────────────────────────────────
// check(report) → true if the condition is met at quarter-end.
// report fields: weeklyAttendance, gateRevenue, parkingRevenue, shopRevenue,
//   foodRevenue, totalIncome, totalExpenses, staffCosts, utilityCosts,
//   constructionCosts, loanRepayments, rideEfficiency, security, food, populationEvents.
// Global state also available: money, round, installedRides, Staff.roster,
//   Security.opinion, Finance.parkExcitement.

const AWARD_DEFS = [
  {
    id:          AWARD_ID.FIRST_QUARTER,
    name:        'First Quarter Complete',
    description: 'Completed your first full quarter running the park.',
    check:       () => true,
  },
  {
    id:          AWARD_ID.CROWD_PLEASER,
    name:        'Crowd Pleaser',
    description: 'Welcomed at least 2,000 visitors in a single week.',
    check:       (r) => r.weeklyAttendance >= 2000,
  },
  {
    id:          AWARD_ID.IN_THE_BLACK,
    name:        'In the Black',
    description: 'Finished a week with positive net income.',
    check:       (r) => r.totalIncome > r.totalExpenses,
  },
  {
    id:          AWARD_ID.SHOP_STAR,
    name:        'Shop Star',
    description: 'Generated $20,000 or more from merchandise in a single week.',
    check:       (r) => r.shopRevenue >= 20_000,
  },
  {
    id:          AWARD_ID.SAFE_PARK,
    name:        'Safe Park',
    description: 'Kept security opinion at or below 20 at the end of a quarter.',
    check:       () => Security.opinion <= 20,
  },
  {
    id:          AWARD_ID.GROWING_TEAM,
    name:        'Growing Team',
    description: 'Employed at least 8 staff members at once.',
    check:       () => Staff.roster.length >= 8,
  },
  {
    id:          AWARD_ID.RIDE_HEAVEN,
    name:        'Ride Heaven',
    description: 'Had at least 5 active rides running simultaneously.',
    check:       () => installedRides.filter(r => r.status === STATUS.ACTIVE).length >= 5,
  },
  {
    id:          AWARD_ID.MONEY_MAKER,
    name:        'Money Maker',
    description: 'Grew the park balance to $1,500,000.',
    check:       () => money >= 1_500_000,
  },
];
