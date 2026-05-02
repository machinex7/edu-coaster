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
  MESS_SHOPPER_RATE:       0.20,  // 1 per 5 shoppers (guests × BUYER_RATE)
  MESS_EXTREME_RIDER_RATE: 0.05,  // 1 per 20 riders on each extreme-intensity ride

  // ── External economic conditions ───────────────────────────────────────────
  utilityMultiplier:    1,     // applied to all ride utility costs each round
  inflationRate:        0.02,  // annual rate; applied weekly to staff cost-of-living
  cumulativeInflation:  1,     // starts at 1; multiplied each round by (1 + inflationRate/52)

  // ── Demographics ──────────────────────────────────────────────────────────
  // Populated at init time from demographics.json.
  // Each entry: { name, chance, annualVisits, count, intensityBias?, favor }
  //   chance:        0–2 attendance propensity (0 = never, 1 = neutral, 2 = always attends if able)
  //   annualVisits:  expected visits per year given a good experience
  //   count:         number of people in this bracket in the surrounding population
  //   intensityBias: 0–2 ride intensity preference (0 = mild, 1 = moderate, 2 = extreme) — only on brackets where it correlates
  //   favor:         0–2 earned goodwill toward this park specifically — set at runtime via initDemographics()

  AGE_BRACKETS:       [],
  INCOME_BRACKETS:    [],
  // count = people who live within that distance band
  DISTANCE_BRACKETS:  [],
  // count = people who live in that household-size type (not number of households)
  // intensityBias pulled toward mild by youngest member present in family groups
  HOUSEHOLD_SIZES:    [],
  // Urban/suburban/rural reflects density and lifestyle, not just distance
  AREA_TYPES:         [],
  // Employment status affects both disposable income and schedule flexibility
  EMPLOYMENT_STATUS:  [],
  // Used for discount day eligibility modeling; disabled reflects accessibility barriers
  VISITOR_STATUS:     [],

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
    this.compositeFavor = 1.0;
  },

  // Weighted average favor for a single category.
  _categoryFavor(brackets) {
    const totalCount = brackets.reduce((s, b) => s + b.count, 0);
    return brackets.reduce((s, b) => s + b.favor * b.count, 0) / totalCount;
  },

  // Recompute and store compositeFavor. Call whenever any bracket's favor changes.
  // Result is an average of each category's weighted-average favor, so 1.0 = neutral baseline.
  calcCompositeFavor() {
    const categories = [
      this.AGE_BRACKETS,
      this.INCOME_BRACKETS,
      this.DISTANCE_BRACKETS,
      this.HOUSEHOLD_SIZES,
      this.AREA_TYPES,
      this.EMPLOYMENT_STATUS,
      this.VISITOR_STATUS,
    ];
    const sum = categories.reduce((s, cat) => s + this._categoryFavor(cat), 0);
    this.compositeFavor = sum / categories.length;
    return this.compositeFavor;
  },

};
