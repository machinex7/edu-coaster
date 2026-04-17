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
function calcDailyAttendance() {
  return parkExcitement * 20;
}

// ── Income sources ─────────────────────────────────────────────────────────
const GATE_ADMISSION = 20; // $ per visitor per entry

function calcGateRevenue(dailyAttendance) {
  return GATE_ADMISSION * dailyAttendance * 7; // 7 days per round
}

// ── Round processing ───────────────────────────────────────────────────────
// Called once per round advancement. Order matters: collect income before
// deducting construction costs so the budget display reflects net change.
function processRound() {
  recalcExcitement();

  const daily = calcDailyAttendance();

  // Income
  money += calcGateRevenue(daily);

  // Costs
  processConstruction();
}
