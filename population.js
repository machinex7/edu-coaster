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
  // Each entry: { name, chance, annualVisits, count }
  //   chance: 0–2 attendance propensity (0 = never, 1 = neutral, 2 = always attends if able)
  //   annualVisits: expected visits per year given a good experience
  //   count: number of people in this bracket in the surrounding population (~500k total per category)

  AGE_BRACKETS: [
    { name: 'Child (0–12)',        chance: 1.6, annualVisits: 4.0, count:  80_000 },
    { name: 'Teen (13–17)',        chance: 1.3, annualVisits: 2.5, count:  30_000 },
    { name: 'Young Adult (18–34)', chance: 1.2, annualVisits: 2.0, count: 110_000 },
    { name: 'Adult (35–54)',       chance: 1.1, annualVisits: 1.5, count: 125_000 },
    { name: 'Senior (55+)',        chance: 0.5, annualVisits: 0.1, count: 155_000 },
  ],

  INCOME_BRACKETS: [
    { name: 'Low Income',    chance: 0.5, annualVisits: 0.5, count:  80_000 },
    { name: 'Lower-Middle',  chance: 0.9, annualVisits: 0.8, count: 125_000 },
    { name: 'Middle',        chance: 1.2, annualVisits: 1.5, count: 165_000 },
    { name: 'Upper-Middle',  chance: 1.5, annualVisits: 2.5, count:  95_000 },
    { name: 'High Income',   chance: 1.6, annualVisits: 3.0, count:  35_000 },
  ],

  // count = people who live within that distance band
  DISTANCE_BRACKETS: [
    { name: 'Local (< 10 mi)',       chance: 1.8, annualVisits: 6.0, count:  75_000 },
    { name: 'Nearby (10–30 mi)',     chance: 1.4, annualVisits: 3.0, count: 150_000 },
    { name: 'Regional (30–100 mi)',  chance: 0.9, annualVisits: 1.0, count: 175_000 },
    { name: 'Destination (100+ mi)', chance: 0.5, annualVisits: 0.2, count: 100_000 },
  ],

  // count = people who live in that household-size type (not number of households)
  HOUSEHOLD_SIZES: [
    { name: 'Solo (1)',          chance: 0.7, annualVisits: 1.0, count:  75_000 },
    { name: 'Couple (2)',        chance: 1.1, annualVisits: 1.5, count: 150_000 },
    { name: 'Small Family (3–4)',chance: 1.6, annualVisits: 2.5, count: 200_000 },
    { name: 'Large Family (5+)', chance: 1.4, annualVisits: 2.0, count:  75_000 },
  ],

  // Urban/suburban/rural reflects density and lifestyle, not just distance
  AREA_TYPES: [
    { name: 'Urban',    chance: 0.8, annualVisits: 1.2, count: 125_000 },
    { name: 'Suburban', chance: 1.4, annualVisits: 2.5, count: 275_000 },
    { name: 'Rural',    chance: 0.9, annualVisits: 1.0, count: 100_000 },
  ],

  // Employment status affects both disposable income and schedule flexibility
  EMPLOYMENT_STATUS: [
    { name: 'Employed (Full-Time)', chance: 1.1, annualVisits: 1.5, count: 235_000 },
    { name: 'Employed (Part-Time)', chance: 1.2, annualVisits: 2.0, count:  65_000 },
    { name: 'Student',              chance: 1.4, annualVisits: 3.0, count:  75_000 },
    { name: 'Retired',              chance: 0.8, annualVisits: 0.8, count:  80_000 },
    { name: 'Unemployed',           chance: 0.5, annualVisits: 0.5, count:  45_000 },
  ],

  // Used for discount day eligibility modeling; disabled reflects accessibility barriers
  VISITOR_STATUS: [
    { name: 'None',             chance: 1.0, annualVisits: 1.5, count: 375_000 },
    { name: 'Disabled',         chance: 0.6, annualVisits: 0.7, count:  80_000 },
    { name: 'Veteran',          chance: 1.0, annualVisits: 1.4, count:  30_000 },
    { name: 'Disabled Veteran', chance: 0.5, annualVisits: 0.6, count:  15_000 },
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
