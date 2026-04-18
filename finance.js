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

// Count of fully-built rides that are reachable via path.
// Re-run whenever round advances; other systems read parkExcitement directly.
function recalcExcitement() {
  parkExcitement = installedRides.filter(
    r => r.status === 'active' && isRideConnected(r)
  ).length;
}

// ── Attendance ─────────────────────────────────────────────────────────────

// How many people want to visit based on park appeal.
function calcDailyDemand() {
  return parkExcitement * 20;
}

// How many people can actually enter: booth attendants are the bottleneck.
// Mood scales throughput between 0.8× (miserable) and 1.2× (happy).
function calcGateThroughput() {
  const attendants = staff.filter(s => s.jobId === 'booth_attendant');
  if (attendants.length === 0) return 0;
  const avgMood       = attendants.reduce((sum, s) => sum + s.mood, 0) / attendants.length;
  const moodMultiplier = 0.8 + (avgMood / 100) * 0.4;
  return attendants.length * 500 * moodMultiplier;
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
  recalcExcitement();

  const daily = calcDailyAttendance();

  // Income
  money += calcGateRevenue(daily);

  // Costs
  money -= calcStaffCosts();
  processConstruction();
}
