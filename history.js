// history.js — Per-round records for future reports and graphs.
//
// All monetary values are whole dollars. Efficiency is 0–1.
// roundHistory is append-only; never mutate past entries.

let roundHistory = [];

function recordRound(report) {
  roundHistory.push({
    round,
    date:                getDateLabel(),
    attendance:          report.weeklyAttendance,
    gateIncome:          report.gateRevenue,
    staffExpense:        report.staffCosts,
    constructionExpense: report.constructionCosts,
    rideEfficiency:      report.rideEfficiency,
  });
}
