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

// securityOpinion is declared in security.js — read here by calcDailyDemand().

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

// ── Income sources ─────────────────────────────────────────────────────────
function calcGateRevenue(dailyAttendance) {
  return Math.round(gatePrice * dailyAttendance * 7);
}

// ── Cost sources ───────────────────────────────────────────────────────────
function calcStaffCosts() {
  return totalWeeklySalary() + totalPostingCosts();
}

// calcSecurityIncidents() and advanceSecurityOpinion() are in security.js.

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
  const constructionCosts = [...installedRides, ...installedFacilities, ...installedShops]
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
