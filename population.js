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
  MESS_HIGH_RIDER_RATE:   0.025, // 1 per 40 riders on each high-intensity ride (half of extreme)
  MESS_FOOD_RATE:          0.10,  // 1 per 10 meals sold

  // ── Demographic confidence ────────────────────────────────────────────────
  // Total visitor-observations needed for a category to reach 100% confidence.
  // Scales naturally with attendance: more visitors per week → faster learning.
  CONFIDENCE_VISIT_CAPACITY: 100_000,

  // ── Favor decay ───────────────────────────────────────────────────────────
  // Exponential decay of the deviation from baseline (1.0) each round.
  // favor > 1: excess shrinks by FAVOR_DECAY_RATE each week → asymptotes to 1, never overshoots.
  // favor < 1: deficit shrinks by FAVOR_RECOVERY_RATE each week → asymptotes to 1, never overshoots.
  FAVOR_DECAY_RATE:    0.10,  // fraction of excess above 1 lost per round
  FAVOR_RECOVERY_RATE: 0.10,  // fraction of deficit below 1 recovered per round

  // ── External economic conditions ───────────────────────────────────────────
  utilityMultiplier:    1,     // applied to all ride utility costs each round
  inflationRate:        0.02,  // annual rate; applied weekly to staff cost-of-living
  cumulativeInflation:  1,     // starts at 1; multiplied each round by (1 + inflationRate/52)

  // ── Parking behavior ──────────────────────────────────────────────────────
  // Maximum parking price (before inflation) each income bracket will pay before being "priced out".
  // Indexed to match INCOME_BRACKETS order: Low, Lower-Mid, Middle, Upper-Mid, High.
  PARKING_PRICE_LIMITS: [8, 15, 25, 40, 100],

  // Fraction of priced-out visitors in each bracket who use alternative transport (rideshare, carpool,
  // walking) instead of skipping the visit entirely. Remainder don't attend at all.
  // Lower income brackets are more willing to find an alternative; higher brackets simply don't come.
  PARKING_ALT_TRANSPORT_RATIO: [0.70, 0.50, 0.35, 0.20, 0.10],

  // ── Demographics ──────────────────────────────────────────────────────────
  // Loaded from demographics.json by game.js at startup via Object.assign(Population, data).
  // Each entry: { name, chance, annualVisits, count, intensityBias?, preferredCategory, favor }
  //   chance:            0–2 attendance propensity (0 = never, 1 = neutral, 2 = always attends if able)
  //   annualVisits:      expected visits per year given a good experience
  //   count:             number of people in this bracket in the US population
  //   intensityBias:     0–2 ride intensity preference (0 = mild, 2 = extreme) — only on brackets where it correlates
  //   preferredCategory: merchandise category this bracket favors
  //   favor:             0–2 earned goodwill toward this park — set at runtime via initDemographics()

  AGE_BRACKETS:        [],
  INCOME_BRACKETS:     [],
  DISTANCE_BRACKETS:   [],
  HOUSEHOLD_SIZES:     [],
  AREA_TYPES:          [],
  EMPLOYMENT_STATUS:   [],
  VISITOR_STATUS:      [],

  // ── Population events ──────────────────────────────────────────────────────
  // Each entry: { modifier: number, comment: string }
  // modifier is a percentage: 50 = +50% attendance, -20 = -20% attendance.
  // Each round, modifiers tick 4 toward 0; events with |modifier| < 4 are removed.
  populationEvents: [],

  tickEvents() {
    this.populationEvents = this.populationEvents
      .map(e => ({ ...e, modifier: e.modifier > 0 ? e.modifier - 4 : e.modifier + 4 }))
      .filter(e => Math.abs(e.modifier) >= 4);
    this.cumulativeInflation *= (1 + this.inflationRate / 52);
  },

  // Exponentially decays every bracket's favor toward 1.0 each round.
  // Operates on the deviation from baseline so it can never overshoot in either direction.
  decayFavor() {
    const all = [
      ...this.AGE_BRACKETS, ...this.INCOME_BRACKETS, ...this.DISTANCE_BRACKETS,
      ...this.HOUSEHOLD_SIZES, ...this.AREA_TYPES, ...this.EMPLOYMENT_STATUS,
      ...this.VISITOR_STATUS,
    ];
    for (const b of all) {
      if (b.favor > 1) {
        b.favor -= (b.favor - 1) * this.FAVOR_DECAY_RATE;
      } else if (b.favor < 1) {
        b.favor += (1 - b.favor) * this.FAVOR_RECOVERY_RATE;
      }
    }
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
  // Active discounts inject a temporary per-bracket favor boost via Discounts.getFavorBoost,
  // which increases that bracket's contribution to attendance without mutating stored favor.
  // Active incidents can inject a temporary favor boost via Incidents.getFavorBoost (by index).
  calcDemandMultiplier() {
    const KEYS = ['AGE', 'INCOME', 'DISTANCE', 'HOUSEHOLD', 'AREA', 'EMPLOYMENT', 'STATUS'];
    const cats  = [
      this.AGE_BRACKETS, this.INCOME_BRACKETS, this.DISTANCE_BRACKETS,
      this.HOUSEHOLD_SIZES, this.AREA_TYPES, this.EMPLOYMENT_STATUS, this.VISITOR_STATUS,
    ];
    const total = cats.reduce((s, cat, i) =>
      s + cat.reduce((cs, b, j) =>
        cs + b.chance * (b.favor + Discounts.getFavorBoost(KEYS[i], b.name) + Incidents.getFavorBoost(KEYS[i], j)) * b.count, 0), 0);
    return (total / cats.length) / this.baselineFavorablePopulation;
  },

  // Tick all brackets in one category toward 100% confidence.
  // delta scales with weekly attendance so busier parks learn faster.
  // When brackets have a count, each bracket's delta is further scaled by
  // avgCount / bracket.count so larger populations accrue confidence more slowly.
  tickConfidence(categoryKey, weeklyAttendance) {
    const bracketMap = {
      HOUSEHOLD: this.HOUSEHOLD_SIZES,
      DISTANCE:  this.DISTANCE_BRACKETS,
    };
    const brackets  = bracketMap[categoryKey];
    const baseRate  = weeklyAttendance / this.CONFIDENCE_VISIT_CAPACITY;
    const avgCount  = brackets.reduce((s, b) => s + b.count, 0) / brackets.length;
    this.confidence[categoryKey] = this.confidence[categoryKey]
      .map((c, i) => {
        const scale = avgCount / brackets[i].count;
        return Math.min(100, c + baseRate * scale * 100);
      });
  },

};
