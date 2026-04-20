// history.js — Per-round records for future reports and graphs.
//
// All monetary values are whole dollars. Efficiency is 0–1.
// History.rounds is append-only; never mutate past entries.

const History = {

  rounds: [],

  record(report) {
    const avgMood = Staff.roster.length > 0
      ? Staff.roster.reduce((sum, s) => sum + s.mood, 0) / Staff.roster.length
      : 0;

    this.rounds.push({
      round,
      date:                getDateLabel(),
      attendance:          report.weeklyAttendance,
      gateIncome:          report.gateRevenue,
      shopIncome:          report.shopRevenue,
      staffExpense:        report.staffCosts,
      constructionExpense: report.constructionCosts,
      rideEfficiency:      report.rideEfficiency,
      staffCount:          Staff.roster.length,
      staffMood:           Math.round(avgMood),
      runningRides:        installedRides.filter(r => r.status === STATUS.ACTIVE && isRideConnected(r)).length,
      jobPostings:         Staff.postings.length,
      matchingCandidates:  Staff.candidates.filter(c => Staff.findMatchingPosting(c) !== null).length,
      theftLoss:           report.theftLoss,
      securityIncidents:   report.security.total,
      securityHandled:     report.security.handled,
      securityUnhandled:   report.security.unhandled,
      securityOpinion:     report.security.opinionAfter,
    });
  },

};
