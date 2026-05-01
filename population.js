// population.js — Constants representing visitor behavior and external
// economic conditions. Update these to tune how the outside world affects
// the park simulation.

const Population = {

  // ── Labor ─────────────────────────────────────────────────────────────────
  MINIMUM_WAGE_HOURLY: 7.25,  // $ per hour
  MINIMUM_WAGE_WEEKLY: 290,   // $ per week (7.25 × 40 hrs)

  // ── Visitor behavior ───────────────────────────────────────────────────────
  BUYER_RATE:             0.015,  // fraction of visitors who purchase merchandise
  THEFT_RATE:             0.008,  // fraction of non-buyers who attempt to shoplift
  DESIRED_RIDES:          4,      // rides per visit a guest needs for a satisfying trip

  // Incident rates: how often frustrated or bored visitors cause trouble.
  OVERFLOW_INCIDENT_RATE: 0.05,   // fraction of turned-away visitors who cause incidents
  UNRIDDEN_INCIDENT_RATE: 0.20,   // fraction of visitors who rode nothing who cause incidents
  RANDOM_INCIDENT_RATE:   0.001,  // baseline incident chance per visitor per week

  // Mess generation rates (mess units per week).
  MESS_GUEST_RATE:         0.01,  // 1 per 100 guests
  MESS_ITEM_RATE:          0.05,  // 1 per 20 merchandise items sold
  MESS_EXTREME_RIDER_RATE: 0.05,  // 1 per 20 riders on each extreme-intensity ride
  MESS_FOOD_RATE:          0.10,  // 1 per 10 meals sold

  // ── Demographic confidence ────────────────────────────────────────────────
  // Total visitor-observations needed for a category to reach 100% confidence.
  // Scales naturally with attendance: more visitors per week → faster learning.
  CONFIDENCE_VISIT_CAPACITY: 5000,

  // ── External economic conditions ───────────────────────────────────────────
  utilityMultiplier:    1,     // applied to all ride utility costs each round
  inflationRate:        0.02,  // annual rate; applied weekly to staff cost-of-living
  cumulativeInflation:  1,     // starts at 1; multiplied each round by (1 + inflationRate/52)

  // ── Demographics ──────────────────────────────────────────────────────────
  // Each entry: { name, chance, annualVisits, count, intensityBias?, favor }
  //   chance:        0–2 attendance propensity (0 = never, 1 = neutral, 2 = always attends if able)
  //   annualVisits:  expected visits per year given a good experience
  //   count:         number of people in this bracket in the surrounding population (~500k total per category)
  //   intensityBias: 0–2 ride intensity preference (0 = mild, 1 = moderate, 2 = extreme) — only on brackets where it correlates
  //   favor:         0–2 earned goodwill toward this park specifically — set at runtime via initDemographics()

  AGE_BRACKETS: [
    { name: 'Child (0–12)',        short: 'Child',       chance: 1.6, annualVisits: 4.0, count:  80_000, intensityBias: 0.7, preferredCategory: 'toy' },
    { name: 'Teen (13–17)',        short: 'Teen',        chance: 1.3, annualVisits: 2.5, count:  30_000, intensityBias: 1.8, preferredCategory: 'apparel' },
    { name: 'Young Adult (18–34)', short: 'Young Adult', chance: 1.2, annualVisits: 2.0, count: 110_000, intensityBias: 1.5, preferredCategory: 'practical' },
    { name: 'Adult (35–54)',       short: 'Adult',       chance: 1.1, annualVisits: 1.5, count: 125_000, intensityBias: 1.0, preferredCategory: 'souvenir' },
    { name: 'Senior (55+)',        short: 'Senior',      chance: 0.5, annualVisits: 0.1, count: 155_000, intensityBias: 0.4, preferredCategory: 'souvenir' },
  ],

  INCOME_BRACKETS: [
    { name: 'Low Income',    short: 'Low',     chance: 0.5, annualVisits: 0.5, count:  80_000, preferredCategory: 'practical' },
    { name: 'Lower-Middle',  short: 'Low-Mid', chance: 0.9, annualVisits: 0.8, count: 125_000, preferredCategory: 'toy' },
    { name: 'Middle',        short: 'Mid',     chance: 1.2, annualVisits: 1.5, count: 165_000, preferredCategory: 'souvenir' },
    { name: 'Upper-Middle',  short: 'Up-Mid',  chance: 1.5, annualVisits: 2.5, count:  95_000, preferredCategory: 'apparel' },
    { name: 'High Income',   short: 'High',    chance: 1.6, annualVisits: 3.0, count:  35_000, preferredCategory: 'souvenir' },
  ],

  // count = people who live within that distance band
  DISTANCE_BRACKETS: [
    { name: 'Local (< 10 mi)',       short: 'Local',    chance: 1.8, annualVisits: 6.0, count:  75_000, preferredCategory: 'practical' },
    { name: 'Nearby (10–30 mi)',     short: 'Nearby',   chance: 1.4, annualVisits: 3.0, count: 150_000, preferredCategory: 'toy' },
    { name: 'Regional (30–100 mi)',  short: 'Regional', chance: 0.9, annualVisits: 1.0, count: 175_000, preferredCategory: 'apparel' },
    { name: 'Destination (100+ mi)', short: 'Dest.',    chance: 0.5, annualVisits: 0.2, count: 100_000, preferredCategory: 'souvenir' },
  ],

  // count = people who live in that household-size type (not number of households)
  // intensityBias pulled toward mild by youngest member present in family groups
  HOUSEHOLD_SIZES: [
    { name: 'Solo (1)',          short: 'Solo',    chance: 0.7, annualVisits: 1.0, count:  75_000, intensityBias: 1.3, preferredCategory: 'practical' },
    { name: 'Couple (2)',        short: 'Couple',  chance: 1.1, annualVisits: 1.5, count: 150_000, intensityBias: 1.2, preferredCategory: 'souvenir' },
    { name: 'Small Family (3–4)',short: 'Sm. Fam', chance: 1.6, annualVisits: 2.5, count: 200_000, intensityBias: 0.9, preferredCategory: 'toy' },
    { name: 'Large Family (5+)', short: 'Lg. Fam', chance: 1.4, annualVisits: 2.0, count:  75_000, intensityBias: 0.7, preferredCategory: 'apparel' },
  ],

  // Urban/suburban/rural reflects density and lifestyle, not just distance
  AREA_TYPES: [
    { name: 'Urban',    short: 'Urban',    chance: 0.8, annualVisits: 1.2, count: 125_000, preferredCategory: 'practical' },
    { name: 'Suburban', short: 'Suburban', chance: 1.4, annualVisits: 2.5, count: 275_000, preferredCategory: 'toy' },
    { name: 'Rural',    short: 'Rural',    chance: 0.9, annualVisits: 1.0, count: 100_000, preferredCategory: 'souvenir' },
  ],

  // Employment status affects both disposable income and schedule flexibility
  EMPLOYMENT_STATUS: [
    { name: 'Employed (Full-Time)', chance: 1.1, annualVisits: 1.5, count: 235_000, preferredCategory: 'practical' },
    { name: 'Employed (Part-Time)', chance: 1.2, annualVisits: 2.0, count:  65_000, preferredCategory: 'apparel' },
    { name: 'Student',              chance: 1.4, annualVisits: 3.0, count:  75_000, preferredCategory: 'toy' },
    { name: 'Retired',              chance: 0.8, annualVisits: 0.8, count:  80_000, preferredCategory: 'souvenir' },
    { name: 'Unemployed',           chance: 0.5, annualVisits: 0.5, count:  45_000, preferredCategory: 'practical' },
  ],

  // Used for discount day eligibility modeling; disabled reflects accessibility barriers
  VISITOR_STATUS: [
    { name: 'None',             chance: 1.0, annualVisits: 1.5, count: 375_000, preferredCategory: 'souvenir' },
    { name: 'Disabled',         chance: 0.6, annualVisits: 0.7, count:  80_000, preferredCategory: 'practical' },
    { name: 'Veteran',          chance: 1.0, annualVisits: 1.4, count:  30_000, preferredCategory: 'apparel' },
    { name: 'Disabled Veteran', chance: 0.5, annualVisits: 0.6, count:  15_000, preferredCategory: 'practical' },
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
    this.cumulativeInflation *= (1 + this.inflationRate / 52);
  },

  // Call once at game start (and again on reset) to initialize mutable demographic state.
  initDemographics() {
    const allBrackets = [
      ...this.AGE_BRACKETS,
      ...this.INCOME_BRACKETS,
      ...this.DISTANCE_BRACKETS,
      ...this.HOUSEHOLD_SIZES,
      ...this.AREA_TYPES,
      ...this.EMPLOYMENT_STATUS,
      ...this.VISITOR_STATUS,
    ];
    for (const bracket of allBrackets) bracket.favor = 1.0;

    // Parallel confidence arrays for each category (0–100 %).
    // Separate from the bracket objects because this is runtime-observed state.
    this.confidence = {
      HOUSEHOLD:  Array(this.HOUSEHOLD_SIZES.length).fill(0),
      DISTANCE:   Array(this.DISTANCE_BRACKETS.length).fill(0),
      AGE:        Array(this.AGE_BRACKETS.length).fill(0),
      INCOME:     Array(this.INCOME_BRACKETS.length).fill(0),
      AREA:       Array(this.AREA_TYPES.length).fill(0),
      EMPLOYMENT: Array(this.EMPLOYMENT_STATUS.length).fill(0),
      STATUS:     Array(this.VISITOR_STATUS.length).fill(0),
    };

    // How well we understand each bracket's ride-intensity preference (0–100).
    // Populated by Security.calcIncidents() when guards have surplus capacity.
    // Parallel to AGE_BRACKETS and HOUSEHOLD_SIZES respectively.
    this.observedIntensity = {
      AGE:       Array(this.AGE_BRACKETS.length).fill(0),
      HOUSEHOLD: Array(this.HOUSEHOLD_SIZES.length).fill(0),
    };

    // Store the neutral baseline so calcDemandMultiplier() can normalise against it.
    this.baselineFavorablePopulation = this.calcFavorablePopulation();
  },

  // Sum of (chance × favor × count) across every bracket in every category,
  // divided by 7 because each person appears once per category.
  // At neutral (all favors = 1.0) this reflects the raw chance-weighted market size.
  // As favor changes, high-chance and high-count brackets move the result more.
  calcFavorablePopulation() {
    const categories = [
      this.AGE_BRACKETS,
      this.INCOME_BRACKETS,
      this.DISTANCE_BRACKETS,
      this.HOUSEHOLD_SIZES,
      this.AREA_TYPES,
      this.EMPLOYMENT_STATUS,
      this.VISITOR_STATUS,
    ];
    const total = categories.reduce((s, cat) =>
      s + cat.reduce((cs, b) => cs + b.chance * b.favor * b.count, 0), 0);
    return total / categories.length;
  },

  // Demand multiplier: ratio of current favorable population to the neutral baseline.
  // 1.0 at a neutral park; rises when high-chance, high-count brackets gain favor.
  calcDemandMultiplier() {
    return this.calcFavorablePopulation() / this.baselineFavorablePopulation;
  },

  // Tick all brackets in one category toward 100% confidence.
  // delta scales with weekly attendance so busier parks learn faster.
  tickConfidence(categoryKey, weeklyAttendance) {
    const delta = (weeklyAttendance / this.CONFIDENCE_VISIT_CAPACITY) * 100;
    this.confidence[categoryKey] = this.confidence[categoryKey]
      .map(c => Math.min(100, c + delta));
  },

};
