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
      parkingIncome:       report.parkingRevenue,
      shopIncome:          report.shopRevenue,
      foodIncome:          report.foodRevenue,
      membershipIncome:    report.membershipRevenue,
      memberBenefitExpense: report.memberBenefitLoss,
      staffExpense:        report.staffCosts,
      utilityExpense:      report.utilityCosts,
      constructionExpense: report.constructionCosts,
      marketingExpense:    report.marketingCosts,
      merchandiseExpense:  report.merchandiseCosts,
      rideEfficiency:      report.rideEfficiency,
      staffCount:          Staff.roster.length,
      staffMood:           Math.round(avgMood),
      runningRides:        installedRides.filter(r => r.status === STATUS.ACTIVE && isRideConnected(r)).length,
      brokenRides:         installedRides.filter(r => r.status === STATUS.BROKEN_DOWN).length,
      jobPostings:         Staff.postings.length,
      matchingCandidates:  Staff.candidates.filter(c => Staff.findMatchingPosting(c) !== null).length,
      shopItemsSold:       report.shopItemsSold,
      totalInventory:      Shopping.merchandiseInventory.reduce((s, inv) => s + inv.count, 0),
      itemStats:           Shopping._roundItemStats.map((stats, i) => ({
        itemName:     Shopping.merchandise[i].name,
        count:        Shopping.merchandiseInventory[i].count,
        salesRevenue: Math.round(stats.salesRevenue),
        salesCount:   stats.salesCount,
        theftValue:   Math.round(stats.theftValue),
        theftCount:   stats.theftCount,
      })),
      discountLoss:        report.discountLoss,
      savingsInterestIncome: report.savingsInterestIncome,
      savingsBalance:        Banking.savingsBalance,
      mmInterestIncome:      report.mmInterestIncome,
      mmBalance:             Banking.mmBalance,
      locInterestExpense:    report.locInterestExpense,
      locBalance:            Banking.locBalance,
      loanBalance:         Banking.activeLoans.reduce((s, l) => s + l.balance, 0),
      loanInterestPaid:    Banking.activeLoans.reduce((s, l) => s + l.totalInterestPaid, 0),
      loanPrincipalPaid:   Banking.activeLoans.reduce((s, l) => s + l.totalPrincipalPaid, 0),
      weeklyNetMess:       Finance.weeklyNetMess,
      theftItemsStolen:    report.security.theftItemsStolen,
      securityIncidents:   report.security.total,
      securityHandled:     report.security.handled,
      securityUnhandled:   report.security.unhandled,
      securityOpinion:     report.security.opinionAfter,
      mealsWanted:         report.food.mealsWanted,
      mealsServed:         report.food.mealsServed,
      mealSatisfaction:    report.food.mealSatisfaction,
      parkingPrice:           Finance.parkingPrice,
      parkingAmenityBonus:    Finance.parkingAmenityBonus,
      parkingAmenitySpend:    report.parkingAmenityCosts,
      parkingAltTransport:    report.altTransportVisitors,
      parkingBusRiders:       report.busRiders,
      parkingBusCost:         report.busCost,
      parkingSpendingMult:    report.parkingSpendingMultiplier,
      loanRepayment:       report.loanRepayments,
      loanDisbursement:    Banking.roundDisbursement,
      surveys:             Survey.drainPending(),
    });
    Banking.roundDisbursement = 0;
  },

};
