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

// How well-staffed running rides are vs the crowd trying to ride them.
// staffRatio = actual operators / needed operators (capped at 1).
// dailyRideCapacity = sum(ridesPerHour for Running rides) * staffRatio.
// score = min(1, dailyRideCapacity / dailyAttendance).
// rideOpinion is averaged with the new score so it shifts gradually.
function computeRideOpinion(dailyAttendance) {
  const runningRides = installedRides.filter(r => r.status === 'active' && isRideConnected(r));
  if (runningRides.length === 0) return;

  const needed     = rideOperatorsNeeded();
  const actual     = staff.filter(s => s.jobId === 'ride_operator').length;
  const staffRatio = needed > 0 ? Math.min(1, actual / needed) : 1;

  const dailyRideCapacity = runningRides.reduce((sum, record) => {
    const ride = rides.find(r => r.id === record.rideId);
    return sum + (ride?.ridesPerHour ?? 0);
  }, 0) * staffRatio;

  const score = dailyAttendance > 0 ? Math.min(1, dailyRideCapacity / dailyAttendance) : 1;
  rideOpinion = (rideOpinion + score) / 2;
}

// Running ride count, pulled down by rideOpinion when rides are underserved.
function recalcExcitement() {
  const runningCount = installedRides.filter(
    r => r.status === 'active' && isRideConnected(r)
  ).length;
  parkExcitement = runningCount * rideOpinion;
}

// ── Attendance ─────────────────────────────────────────────────────────────

// How many people want to visit based on park appeal.
function calcDailyDemand() {
  return parkExcitement * 20;
}

// How many people can actually enter: booth attendants are the bottleneck.
// Per attendant: base 500 × mood multiplier (0.8–1.2) × experience multiplier.
function calcGateThroughput() {
  const attendants = staff.filter(s => s.jobId === 'booth_attendant');
  if (attendants.length === 0) return 0;
  return attendants.reduce((sum, s) => {
    const moodMult = 0.8 + (s.mood / 100) * 0.4;
    const { multiplier: expMult } = getExperienceTier(s.weeksEmployed);
    return sum + 500 * moodMult * expMult;
  }, 0);
}

// Actual daily attendance is whichever is smaller: demand or gate capacity.
function calcDailyAttendance() {
  return Math.min(calcDailyDemand(), calcGateThroughput());
}

// ── Income sources ─────────────────────────────────────────────────────────
const GATE_ADMISSION = 20; // $ per visitor per entry

function calcGateRevenue(dailyAttendance) {
  return GATE_ADMISSION * dailyAttendance * 7; // 7 days per round
}

// ── Cost sources ───────────────────────────────────────────────────────────
function calcStaffCosts() {
  return totalWeeklySalary();
}

// ── Round processing ───────────────────────────────────────────────────────
// Called once per round advancement. Order matters: collect income before
// deducting costs so the budget display reflects net change.
function processRound() {
  recalcExcitement();           // uses last round's rideOpinion

  const daily = calcDailyAttendance();

  computeRideOpinion(daily);    // updates rideOpinion for next round

  const weeklyAttendance  = Math.round(daily * 7);
  const gateRevenue       = calcGateRevenue(daily);
  const staffCosts        = calcStaffCosts();
  const constructionCosts = [...installedRides, ...installedFacilities]
    .filter(r => r.status === 'under_construction')
    .reduce((sum, r) => sum + r.weeklyPayment, 0);

  // Income
  money += gateRevenue;

  // Costs
  money -= staffCosts;
  processConstruction();  // deducts constructionCosts and advances build progress

  advanceExperience();    // increment weeksEmployed for all staff

  return {
    weeklyAttendance,
    gateRevenue,
    staffCosts,
    constructionCosts,
    totalExpenses: staffCosts + constructionCosts,
    rideEfficiency: rideOpinion,
  };
}
