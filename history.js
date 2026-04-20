// history.js — Per-round records for future reports and graphs.
//
// All monetary values are whole dollars. Efficiency is 0–1.
// roundHistory is append-only; never mutate past entries.

let roundHistory = [];

function recordRound(report) {
  const avgMood = staff.length > 0
    ? staff.reduce((sum, s) => sum + s.mood, 0) / staff.length
    : 0;

  roundHistory.push({
    round,
    date:                getDateLabel(),
    attendance:          report.weeklyAttendance,
    gateIncome:          report.gateRevenue,
    staffExpense:        report.staffCosts,
    constructionExpense: report.constructionCosts,
    rideEfficiency:      report.rideEfficiency,
    staffCount:          staff.length,
    staffMood:           Math.round(avgMood),
    runningRides:        installedRides.filter(r => r.status === STATUS.ACTIVE && isRideConnected(r)).length,
    jobPostings:         postings.length,
    matchingCandidates:  candidates.filter(c => findMatchingPosting(c) !== null).length,
    securityIncidents:   report.security.total,
    securityHandled:     report.security.handled,
    securityUnhandled:   report.security.unhandled,
    securityOpinion:     report.security.opinionAfter,
  });
}
