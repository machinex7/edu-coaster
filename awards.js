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

  // Called at quarter-end. Reads the last 13 rounds from History for criteria
  // that span the whole quarter (mess, incidents, peak attendance).
  checkQuarterly() {
    const qr = History.rounds.slice(-13);
    for (const def of AWARD_DEFS) {
      if (!this.earned.has(def.id) && def.check(qr)) {
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
// check(qr) receives History.rounds.slice(-13) — the last 13 recorded rounds.
// Ride-record awards ignore qr and check current installed rides instead.

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
  {
    // All 11 rides active simultaneously.
    id:          AWARD_ID.MOST_RIDES,
    name:        'Most Rides in the Region',
    description: 'With all 11 rides running, we offer more attractions than any other park in the region.',
    check:       () => installedRides.filter(r => r.status === STATUS.ACTIVE).length >= 11,
  },
  {
    // No excess mess in any round of the quarter.
    id:          AWARD_ID.CLEANEST_PARK,
    name:        'Cleanest Park in the Region',
    description: 'Not a trace of litter all quarter — the cleanest park in the region.',
    check:       (qr) => qr.length > 0 && qr.every(r => !r.weeklyNetMess),
  },
  {
    // Zero security incidents in every round of the quarter.
    id:          AWARD_ID.SAFEST_PARK,
    name:        'Safest Park in the Region',
    description: 'Zero security incidents all quarter — the safest park in the region.',
    check:       (qr) => qr.length > 0 && qr.every(r => r.securityIncidents === 0),
  },
  {
    // Peak weekly attendance hit 10,000 in at least one round this quarter.
    id:          AWARD_ID.MOST_GUESTS,
    name:        'Most Guests in the Region',
    description: 'Welcomed 10,000 guests in a single week — more than any park in the region.',
    check:       (qr) => qr.some(r => r.attendance >= 10_000),
  },
  {
    // 10 or more bathrooms installed and active.
    id:          AWARD_ID.MOST_BATHROOMS,
    name:        'Most Bathrooms in the Region',
    description: 'With 10 bathrooms on the grounds, nobody has ever waited in line — probably.',
    check:       () => installedFacilities.filter(f => f.facilityId === FACILITY_ID.BATHROOM && f.status === STATUS.ACTIVE).length >= 10,
  },
];
