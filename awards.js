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
      message: `Award earned: ${def.name}`,
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
      body.innerHTML = '<div class="awards-empty">No awards yet.<br>Build qualifying rides and complete a quarter to be evaluated.</div>';
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
// Each award is tied to a specific qualifying ride being active at quarter-end.
// Stats come from rides.json. The winning ride for each category is noted inline.

const AWARD_DEFS = [
  {
    // Mega Coaster: 210 ft — tallest structure of any ride in the park roster.
    id:          AWARD_ID.HIGHEST_RIDE,
    name:        'Tallest Ride in the Region',
    description: 'Home of the Mega Coaster — standing 210 ft tall, the highest ride in the region.',
    check:       () => installedRides.some(r => r.rideId === 'mega_coaster' && r.status === STATUS.ACTIVE),
  },
  {
    // Log Flume: 3,400 ft of winding water channel — longer than any coaster in the roster.
    id:          AWARD_ID.LONGEST_RIDE,
    name:        'Longest Ride in the Region',
    description: 'Our Log Flume winds through 3,400 ft of twisting waterway — the longest ride in the region.',
    check:       () => installedRides.some(r => r.rideId === 'log_flume' && r.status === STATUS.ACTIVE),
  },
  {
    // Mega Coaster: 72 mph top speed — fastest of any ride in the roster.
    id:          AWARD_ID.FASTEST_RIDE,
    name:        'Fastest Ride in the Region',
    description: 'The Mega Coaster hits 72 mph — the fastest ride in the region.',
    check:       () => installedRides.some(r => r.rideId === 'mega_coaster' && r.status === STATUS.ACTIVE),
  },
  {
    // Boomerang Coaster: 6 inversions — launches forward through 3 loops, then backward through all 3 again.
    id:          AWARD_ID.MOST_LOOPS,
    name:        'Most Loops in the Region',
    description: 'The Boomerang Coaster delivers 6 heart-stopping inversions in a single ride — more than any ride in the region.',
    check:       () => installedRides.some(r => r.rideId === 'boomerang_coaster' && r.status === STATUS.ACTIVE),
  },
  {
    // Drop Tower: 165 ft of free fall — the pure vertical drop specialist.
    id:          AWARD_ID.LONGEST_DROP,
    name:        'Longest Drop in the Region',
    description: 'Our Drop Tower sends you into 165 ft of free fall — the longest drop of any ride in the region.',
    check:       () => installedRides.some(r => r.rideId === 'drop_tower' && r.status === STATUS.ACTIVE),
  },
];
