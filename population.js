// population.js — Constants representing visitor behavior and external
// economic conditions. Update these to tune how the outside world affects
// the park simulation.

const Population = {

  // ── Labor ─────────────────────────────────────────────────────────────────
  MINIMUM_WAGE_HOURLY: 7.25,  // $ per hour
  MINIMUM_WAGE_WEEKLY: 290,   // $ per week (7.25 × 40 hrs)

  // ── Visitor behavior ───────────────────────────────────────────────────────
  BUYER_RATE:             0.15,   // fraction of visitors who purchase merchandise
  THEFT_RATE:             0.008,  // fraction of non-buyers who attempt to shoplift

  // Incident rates: how often frustrated or bored visitors cause trouble.
  OVERFLOW_INCIDENT_RATE: 0.05,   // fraction of turned-away visitors who cause incidents
  UNRIDDEN_INCIDENT_RATE: 0.20,   // fraction of visitors who rode nothing who cause incidents
  RANDOM_INCIDENT_RATE:   0.001,  // baseline incident chance per visitor per week

  // Mess generation rates (mess units per week).
  MESS_GUEST_RATE:         0.01,  // 1 per 100 guests
  MESS_SHOPPER_RATE:       0.20,  // 1 per 5 shoppers (guests × BUYER_RATE)
  MESS_EXTREME_RIDER_RATE: 0.05,  // 1 per 20 riders on each extreme-intensity ride

  // ── External economic conditions ───────────────────────────────────────────
  utilityMultiplier: 1,     // applied to all ride utility costs each round
  inflationRate:     0.02,  // annual rate; applied weekly to staff cost-of-living

  // ── Demographics ──────────────────────────────────────────────────────────
  // Each entry: { name, chance } where chance is a relative weight (0–1).
  // These represent the makeup of the surrounding population that might visit.

  AGE_BRACKETS: [
    { name: 'Child (0–12)',     chance: 0.12 },
    { name: 'Teen (13–17)',     chance: 0.10 },
    { name: 'Young Adult (18–34)', chance: 0.28 },
    { name: 'Adult (35–54)',    chance: 0.30 },
    { name: 'Senior (55+)',     chance: 0.20 },
  ],

  INCOME_BRACKETS: [
    { name: 'Low Income',       chance: 0.15 },
    { name: 'Lower-Middle',     chance: 0.25 },
    { name: 'Middle',           chance: 0.30 },
    { name: 'Upper-Middle',     chance: 0.20 },
    { name: 'High Income',      chance: 0.10 },
  ],

  DISTANCE_BRACKETS: [
    { name: 'Local (< 10 mi)',      chance: 0.35 },
    { name: 'Nearby (10–30 mi)',    chance: 0.30 },
    { name: 'Regional (30–100 mi)', chance: 0.25 },
    { name: 'Destination (100+ mi)',chance: 0.10 },
  ],

  HOUSEHOLD_SIZES: [
    { name: 'Solo (1)',         chance: 0.15 },
    { name: 'Couple (2)',       chance: 0.30 },
    { name: 'Small Family (3–4)', chance: 0.35 },
    { name: 'Large Family (5+)', chance: 0.20 },
  ],

  // ── Population events ──────────────────────────────────────────────────────
  // Each entry: { modifier: number, comment: string }
  // modifier is a percentage: 50 = +50% attendance, -20 = -20% attendance.
  // Each round, modifiers tick 2 toward 0; events with |modifier| < 2 are removed.
  populationEvents: [],

  tickEvents() {
    this.populationEvents = this.populationEvents
      .map(e => ({ ...e, modifier: e.modifier > 0 ? e.modifier - 2 : e.modifier + 2 }))
      .filter(e => Math.abs(e.modifier) >= 2);
  },

};
