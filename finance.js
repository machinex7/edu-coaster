// finance.js — Round-by-round financial and attendance simulation.
//
// Adding new income sources:
//   1. Add a named rate constant.
//   2. Write a calc function (e.g. calcShopRevenue).
//   3. Call it in processRound and add the result to money.
//
// Adding new cost sources (staff wages, maintenance, etc.):
//   Same pattern — calc function, subtract in processRound.

// ── Park metrics ───────────────────────────────────────────────────────────
let parkExcitement = 0;

// Smoothed 0–1 score of how well rides are serving current crowds.
// Starts at 1.0 (perfect); degrades when operators can't keep up with demand.
let rideOpinion = 1.0;

// Accumulated perception of danger. Rises by unhandled incident count each
// round; decays 20% per round (rounded up). Reduces demand via sqrt curve.
let securityOpinion = 0;

// How well-staffed running rides are vs the crowd trying to ride them.
// staffRatio = actual operators / needed operators (capped at 1).
// dailyRideCapacity = sum(ridesPerHour for Running rides) * staffRatio.
// score = min(1, dailyRideCapacity / dailyAttendance).
// rideOpinion is averaged with the new score so it shifts gradually.
function computeRideOpinion(dailyAttendance) {
  const runningRides = installedRides.filter(r => r.status === STATUS.ACTIVE && isRideConnected(r));
  if (runningRides.length === 0) return;

  const needed     = rideOperatorsNeeded();
  const actual     = staff.filter(s => s.jobId === JOB.RIDE_OPERATOR).length;
  const staffRatio = needed > 0 ? Math.min(1, actual / needed) : 1;

  let totalDailyCapacity = 0;
  runningRides.forEach(record => {
    const rph = rides.find(r => r.id === record.rideId)?.ridesPerHour ?? 0;
    totalDailyCapacity       += rph;
    record.lastRoundCapacity  = Math.round(rph * 7);           // weekly at full staff
    record.lastRoundRiders    = Math.round(rph * staffRatio * 7); // weekly actual
  });

  const score = dailyAttendance > 0 ? Math.min(1, totalDailyCapacity * staffRatio / dailyAttendance) : 1;
  rideOpinion = (rideOpinion + score) / 2;
}

// Running ride count, pulled down by rideOpinion when rides are underserved.
function recalcExcitement() {
  const runningCount = installedRides.filter(
    r => r.status === STATUS.ACTIVE && isRideConnected(r)
  ).length;
  parkExcitement = runningCount * rideOpinion;
}

// ── Attendance ─────────────────────────────────────────────────────────────

// How many people want to visit based on park appeal.
// priceExhaustion cuts demand by 1% per point (10 exhaustion = −10%).
// securityOpinion reduces demand via sqrt curve: 1 − √opinion/100.
function calcDailyDemand() {
  const exhaustionFactor = Math.max(0, 1 - priceExhaustion / 100);
  const securityFactor   = Math.max(0, 1 - Math.sqrt(securityOpinion) / 100);
  return parkExcitement * 20 * exhaustionFactor * securityFactor;
}

// How many people can actually enter: booth attendants are the bottleneck.
// Per attendant: base 500 × mood multiplier (0.8–1.2) × experience multiplier × skill modifier.
function calcGateThroughput() {
  const attendants = staff.filter(s => s.jobId === JOB.BOOTH_ATTENDANT);
  if (attendants.length === 0) return 0;
  return attendants.reduce((sum, s) => {
    const moodMult = 0.8 + (s.mood / 100) * 0.4;
    const { multiplier: expMult } = getExperienceTier(s.weeksEmployed);
    return sum + 500 * moodMult * expMult * s.skillModifier;
  }, 0);
}

// Actual daily attendance is whichever is smaller: demand or gate capacity.
function calcDailyAttendance() {
  return Math.min(calcDailyDemand(), calcGateThroughput());
}

// ── Pricing ────────────────────────────────────────────────────────────────
let gatePrice        = 20;  // $ per visitor
let parkingPrice     = 10;  // $ per vehicle
let foodUpcharge     = 0;   // $ added per food item sold

// Cumulative visitor price fatigue. Rises when prices increase, decays 1/round.
let priceExhaustion  = 0;

function advancePriceExhaustion() {
  priceExhaustion = Math.max(0, priceExhaustion - 1);
}

// Decay securityOpinion by 20% (rounded up) then add new unhandled incidents.
function advanceSecurityOpinion(unhandled) {
  const decay     = Math.ceil(securityOpinion * 0.20);
  securityOpinion = Math.max(0, securityOpinion - decay) + unhandled;
}

// ── Income sources ─────────────────────────────────────────────────────────
function calcGateRevenue(dailyAttendance) {
  return Math.round(gatePrice * dailyAttendance * 7);
}

// ── Cost sources ───────────────────────────────────────────────────────────
function calcStaffCosts() {
  return totalWeeklySalary() + totalPostingCosts();
}

// ── Security incidents ─────────────────────────────────────────────────────

// Weekly incident capacity per guard: tier 1 → 28, tier 2 → 35, tier 3 → 42, tier 4 → 49.
function calcCapacityForFocus(focus) {
  return staff
    .filter(s => s.jobId === JOB.SECURITY && s.focus === focus)
    .reduce((sum, s) => {
      const { tier } = getExperienceTier(s.weeksEmployed);
      return sum + (3 + tier) * 7;
    }, 0);
}

// Three incident sources. Each is handled only by guards with the matching focus:
//   Gate overflow  → GATE guards
//   Unridden       → PATROL guards (remaining patrol capacity then covers random)
//   Random         → PATROL guards (leftover after unridden)
//   Shop theft     → SHOP guards (no incidents yet; capacity tracked for future use)
// Must be called after computeRideOpinion() so lastRoundRiders is current.
function calcSecurityIncidents(weeklyAttendance, dailyDemand, dailyThroughput) {
  const weeklyOverflow  = Math.max(0, (dailyDemand - dailyThroughput) * 7);
  const fromOverflow    = Math.floor(weeklyOverflow * 0.05);

  const weeklyRiders    = installedRides
    .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
    .reduce((sum, r) => sum + (r.lastRoundRiders ?? 0), 0);
  const unridden        = Math.max(0, weeklyAttendance - weeklyRiders);
  const fromUnridden    = Math.floor(unridden * 0.20);

  const fromRandom      = Math.floor(weeklyAttendance * 0.001);
  const fromShop        = 0; // placeholder until shops are implemented

  const total           = fromOverflow + fromUnridden + fromRandom + fromShop;

  const gateCapacity    = calcCapacityForFocus(SECURITY_FOCUS.GATE);
  const patrolCapacity  = calcCapacityForFocus(SECURITY_FOCUS.PATROL);
  const shopCapacity    = calcCapacityForFocus(SECURITY_FOCUS.SHOP);

  const overflowHandled  = Math.min(fromOverflow, gateCapacity);
  const unriddenHandled  = Math.min(fromUnridden, patrolCapacity);
  const randomHandled    = Math.min(fromRandom, Math.max(0, patrolCapacity - unriddenHandled));
  const shopHandled      = Math.min(fromShop, shopCapacity);

  const handled  = overflowHandled + unriddenHandled + randomHandled + shopHandled;
  const unhandled = total - handled;

  return {
    fromOverflow, fromUnridden, fromRandom, fromShop, total,
    gateCapacity, patrolCapacity, shopCapacity,
    overflowHandled, unriddenHandled, randomHandled, shopHandled,
    handled, unhandled,
  };
}

// ── Round processing ───────────────────────────────────────────────────────
// Called once per round advancement. Order matters: collect income before
// deducting costs so the budget display reflects net change.
function processRound() {
  recalcExcitement();           // uses last round's rideOpinion

  const dailyDemand     = calcDailyDemand();
  const dailyThroughput = calcGateThroughput();
  const daily           = Math.min(dailyDemand, dailyThroughput);

  computeRideOpinion(daily);    // updates rideOpinion for next round; sets lastRoundRiders

  const weeklyAttendance  = Math.round(daily * 7);
  const gateRevenue       = calcGateRevenue(daily);
  const staffCosts        = calcStaffCosts();
  const constructionCosts = [...installedRides, ...installedFacilities]
    .filter(r => r.status === STATUS.UNDER_CONSTRUCTION)
    .reduce((sum, r) => sum + r.weeklyPayment, 0);

  const security = calcSecurityIncidents(weeklyAttendance, dailyDemand, dailyThroughput);

  // Income
  money += gateRevenue;

  // Costs
  money -= staffCosts;
  processConstruction();  // deducts constructionCosts and advances build progress

  advanceExperience();                            // increment weeksEmployed for all staff
  advancePostings();                              // increment weeksActive for all postings
  generateCandidates();                          // 4 new applicants per round when postings exist
  advanceCandidates();                           // withdrawal check, then increment weeksAsCandidate
  advancePriceExhaustion();                      // decay price fatigue by 1
  advanceSecurityOpinion(security.unhandled);    // decay then add unhandled incidents

  return {
    weeklyAttendance,
    gateRevenue,
    staffCosts,
    constructionCosts,
    totalExpenses: staffCosts + constructionCosts,
    rideEfficiency: rideOpinion,
    security: { ...security, opinionAfter: securityOpinion },
  };
}
