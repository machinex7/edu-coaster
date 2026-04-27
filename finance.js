// finance.js — Round-by-round financial and attendance simulation.
//
// Adding new income sources:
//   1. Add a named property and a calc method.
//   2. Call the method in processRound and add the result to money.
//
// Adding new cost sources:
//   Same pattern — calc method, subtract in processRound.

const Finance = {

  // ── Park metrics ────────────────────────────────────────────────────────────
  parkExcitement:   500,  // satisfied-visitor count from last round; drives next round's demand
  weeklyNetMess:    0,    // unhandled mess from last round; subtracted from excitement
  mealSatisfaction: 1,    // 0.5–1; penalises excitement when food supply < demand

  // Smoothed 0–1 score of how well rides are serving current crowds.
  // Starts at 1.0 (perfect); degrades when operators can't keep up with demand.
  rideOpinion: 1.0,

  // Security.opinion is in security.js — read here by calcDailyDemand().

  // How well-staffed running rides are vs the crowd trying to ride them.
  // staffRatio = actual operators / needed operators (capped at 1).
  // dailyRideCapacity = sum(ridesPerHour for Running rides) * staffRatio.
  // score = min(1, dailyRideCapacity / dailyAttendance).
  // rideOpinion is averaged with the new score so it shifts gradually.
  computeRideOpinion(dailyAttendance) {
    const runningRides = installedRides.filter(r => r.status === STATUS.ACTIVE && isRideConnected(r));
    if (runningRides.length === 0) return;

    const needed     = Staff.rideOperatorsNeeded();
    const actual     = Staff.roster.filter(s => s.jobId === JOB.RIDE_OPERATOR && s.weeksOut === 0).length;
    const staffRatio = needed > 0 ? Math.min(1, actual / needed) : 1;

    let totalDailyCapacity = 0;
    runningRides.forEach(record => {
      const rph = rides.find(r => r.id === record.rideId)?.ridesPerHour ?? 0;
      totalDailyCapacity       += rph;
      record.lastRoundCapacity  = Math.round(rph * 7);
      record.lastRoundRiders    = Math.round(rph * staffRatio * 7);
    });

    const score = dailyAttendance > 0 ? Math.min(1, totalDailyCapacity * staffRatio / dailyAttendance) : 1;
    this.rideOpinion = (this.rideOpinion + score) / 2;
  },

  // ── Attendance ──────────────────────────────────────────────────────────────

  // Returns how many people want to visit based on last round's excitement.
  // priceExhaustion cuts demand by 1% per point (10 exhaustion = −10%).
  // Population.compositeFavor scales demand by earned demographic goodwill.
  // Security and mess penalties are applied to excitement at end-of-round instead.
  calcDailyDemand() {
    const exhaustionFactor = Math.max(0, 1 - this.priceExhaustion / 100);
    const eventFactor      = Population.populationEvents.reduce((f, e) => f * (1 + e.modifier / 100), 1);
    const weatherFactor    = 1 - (WEATHER_DEMAND_REDUCTION[nextWeekForecast] ?? 0);
    return this.parkExcitement * exhaustionFactor * eventFactor * Population.compositeFavor * weatherFactor;
  },

  // Recomputes parkExcitement at end of round for use next round.
  // Base = weekly attendance × (rides per person / desired rides), capped at 1.
  // Security opinion and mess density degrade the result.
  // Mess penalty: unhandled mess spread across path tiles; 1.25^(mess per path) as divisor.
  calcExcitement(weeklyAttendance) {
    const runningRides      = installedRides.filter(r => r.status === STATUS.ACTIVE && isRideConnected(r));
    const totalWeeklyRides  = runningRides.reduce((s, r) => s + (r.lastRoundRiders ?? 0), 0);
    const ridesPerPerson    = weeklyAttendance > 0 ? totalWeeklyRides / weeklyAttendance : 0;
    const satisfactionRatio = Math.min(1, ridesPerPerson / Population.DESIRED_RIDES);
    const securityFactor    = Math.max(0, 1 - Math.sqrt(Security.opinion) / 100);

    this.parkExcitement = Math.max(0, (weeklyAttendance * satisfactionRatio * securityFactor * this.mealSatisfaction) / this.calcMessFactor());
  },

  // How many people can actually enter: booth attendants are the bottleneck.
  // Per attendant: base 500 × mood multiplier (0.8–1.2) × experience multiplier × skill modifier.
  calcGateThroughput() {
    const attendants = Staff.roster.filter(s => s.jobId === JOB.BOOTH_ATTENDANT && s.weeksOut === 0);
    if (attendants.length === 0) return 0;
    return attendants.reduce((sum, s) => {
      const moodMult = 0.8 + (s.mood / 100) * 0.4;
      const { multiplier: expMult } = Staff.getExperienceTier(s.weeksEmployed);
      return sum + 500 * moodMult * expMult * s.skillModifier;
    }, 0);
  },

  // Actual daily attendance is whichever is smaller: demand or gate capacity.
  calcDailyAttendance() {
    return Math.min(this.calcDailyDemand(), this.calcGateThroughput());
  },

  // ── Pricing ─────────────────────────────────────────────────────────────────
  gatePrice:    20,  // $ per visitor
  parkingPrice: 10,  // $ per vehicle
  foodUpcharge:  0,  // $ added per food item sold

  // Cumulative visitor price fatigue. Rises when prices increase, decays 1/round.
  priceExhaustion: 0,

  advancePriceExhaustion() {
    this.priceExhaustion = Math.max(0, this.priceExhaustion - 1);
  },

  // ── Income sources ───────────────────────────────────────────────────────────
  calcGateRevenue(dailyAttendance) {
    return Math.round(this.gatePrice * dailyAttendance * 7);
  },

  // 1 vehicle per 3 visitors who want to come (based on demand, not throughput).
  calcParkingRevenue(dailyDemand) {
    return Math.floor(dailyDemand * 7 / 3) * this.parkingPrice;
  },

  // ── Engineers ────────────────────────────────────────────────────────────────
  // Run at the very start of each round, before excitement recalc and wear.
  // Each engineer either repairs one broken ride (most-worn first) or, if
  // none are broken, reduces wear on the 2 most-worn running rides by
  // 100 × tier per ride.
  processEngineers() {
    Staff.roster
      .filter(s => s.jobId === JOB.ENGINEER && s.weeksOut === 0)
      .forEach(eng => {
        if (eng.focus === ENGINEER_FOCUS.CONSTRUCTION) {
          const underConstruction = [...installedRides, ...installedFacilities, ...Shopping.installed]
            .filter(r => r.status === STATUS.UNDER_CONSTRUCTION)
            .sort((a, b) => b.weeksCompleted - a.weeksCompleted);
          if (underConstruction.length > 0) {
            const target = underConstruction[0];
            target.weeksCompleted++;
            if (target.weeksCompleted >= target.weeksTotal) completeConstruction(target);
            return;
          }
          // Nothing under construction — fall through to repair/maintenance
        }

        const broken = installedRides.filter(r => r.status === STATUS.BROKEN_DOWN);
        if (broken.length > 0) {
          broken.sort((a, b) => b.wear - a.wear);
          const target = broken[0];
          target.weeksToRepair--;
          if (target.weeksToRepair <= 0) {
            target.status = STATUS.ACTIVE;
            target.weeksToRepair = 0;
          }
        } else {
          const { tier } = Staff.getExperienceTier(eng.weeksEmployed);
          installedRides
            .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
            .sort((a, b) => b.wear - a.wear)
            .slice(0, 2)
            .forEach(r => { r.wear = Math.max(0, r.wear - 100 * tier); });
        }
      });
  },

  // ── Wear & breakdown ─────────────────────────────────────────────────────────
  // Called each round after computeRideOpinion() so lastRoundRiders is current.
  // Accumulates rider wear then rolls for breakdown; probability reaches 100% at MAX_EFFECTIVE_WEAR.
  processWear() {
    installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
      .forEach(r => {
        r.wear += r.lastRoundRiders ?? 0;
        if (Math.random() < r.wear / MAX_EFFECTIVE_WEAR) {
          r.status        = STATUS.BROKEN_DOWN;
          // Repair time scales with wear: more wear = longer repair, minimum 1 week.
          r.weeksToRepair = Math.floor(Math.random() * Math.floor(r.wear / 100)) + 1;
          Notifications.push({
            label:   'Ride',
            message: `${r.name} broke down — ${r.weeksToRepair} week${r.weeksToRepair !== 1 ? 's' : ''} to repair.`,
            action:  () => openPanel('rides'),
          });
        }
      });
  },

  // ── Mess generation ──────────────────────────────────────────────────────────

  // Exponential penalty from unhandled mess spread across path and decorative tiles.
  // Decorative tiles (fountain, garden, statue) count as 2 paths each.
  // Returns a divisor ≥ 1; higher = more excitement lost.
  calcMessFactor() {
    const pathTiles = installedFacilities.filter(f => f.facilityId === FACILITY_ID.PATH).length;
    const decoTiles = installedFacilities.filter(f =>
      f.facilityId === FACILITY_ID.FOUNTAIN ||
      f.facilityId === FACILITY_ID.GARDEN   ||
      f.facilityId === FACILITY_ID.STATUE
    ).length;
    const effectivePaths = pathTiles + decoTiles * 2;
    const messPerPath    = effectivePaths > 0 ? this.weeklyNetMess / effectivePaths : this.weeklyNetMess;
    return Math.pow(1.25, messPerPath);
  },

  calcMessGenerated(weeklyAttendance) {
    const fromGuests   = weeklyAttendance * Population.MESS_GUEST_RATE;
    const fromShoppers = weeklyAttendance * Population.BUYER_RATE * Population.MESS_SHOPPER_RATE;

    const fromExtremeRides = installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r)
                && rides.find(d => d.id === r.rideId)?.intensity === 'extreme')
      .reduce((sum, r) => {
        const dist = nearestBathroomDist(r);
        return sum + (r.lastRoundRiders ?? 0) * Population.MESS_EXTREME_RIDER_RATE * dist;
      }, 0);

    return Math.floor(fromGuests + fromShoppers + fromExtremeRides);
  },

  // ── Cost sources ─────────────────────────────────────────────────────────────
  // Deducts posting fees first, then pays each employee's salary + 401(k) match
  // if money allows (mood penalty event for any skipped paycheck), then attempts
  // to pay the medical premium — cancelling the policy immediately if funds are
  // insufficient. Returns the total amount actually deducted from money.
  calcStaffCosts() {
    let paid = 0;

    const postingCosts = Staff.totalPostingCosts();
    if (postingCosts > 0) {
      if (money >= postingCosts) {
        money -= postingCosts;
        paid += postingCosts;
      } else {
        Staff.postings = [];
        Notifications.push({
          label:   'Hiring',
          message: 'All job postings were cancelled — insufficient funds to cover posting fees.',
          action:  () => { openPanel('staffing'); Staff.setView('postings'); },
        });
      }
    }

    for (const s of Staff.roster) {
      const matchContrib = Math.round(s.salary * Staff.RETIREMENT_MATCH_PCT / 100);
      const cost = s.salary + matchContrib;
      if (money >= cost) {
        money -= cost;
        paid += cost;
      } else {
        s.events.push({ moodModifier: -20, comment: 'Angry that a paycheck was skipped.' });
      }
    }

    const medicalCost = Staff.calcMedicalCosts();
    if (medicalCost > 0) {
      if (money >= medicalCost) {
        money -= medicalCost;
        paid += medicalCost;
      } else {
        Staff.medicalPolicy = null;
        Notifications.push({
          label:   'Med.',
          message: 'Medical insurance policy was cancelled — insufficient funds to cover the premium.',
          action:  () => { openPanel('staffing'); Staff.setView('benefits'); },
        });
      }
    }

    return paid;
  },

  payUtilityCosts() {
    let paid = 0;
    let closedCount = 0;

    for (const r of installedRides) {
      if (r.status !== STATUS.ACTIVE || !isRideConnected(r)) continue;
      const def = rides.find(d => d.id === r.rideId);
      const cost = (def?.utilityCost ?? 0) * Population.utilityMultiplier;
      if (money >= cost) {
        money -= cost;
        paid += cost;
      } else {
        r.status = STATUS.CLOSED;
        closedCount++;
      }
    }

    for (const f of installedFacilities) {
      if (f.status !== STATUS.ACTIVE) continue;
      const def = facilities.find(d => d.id === f.facilityId);
      const cost = (def?.utilityCost ?? 0) * Population.utilityMultiplier;
      if (money >= cost) {
        money -= cost;
        paid += cost;
      } else {
        f.status = STATUS.CLOSED;
        closedCount++;
      }
    }

    if (closedCount > 0) {
      Notifications.push({
        label:   'Utilities',
        message: `${closedCount} ride${closedCount !== 1 ? 's/facilities' : '/facility'} closed — insufficient funds to cover utility costs.`,
      });
    }

    return paid;
  },

  // Security.calcIncidents() and Security.advanceOpinion() are in security.js.

  // ── Park valuation ───────────────────────────────────────────────────────────
  // Completed buildings count at full buildCost; broken-down rides are discounted
  // 10% per week of repairs remaining (floored at 0).
  // In-construction (and paused) buildings count at money spent so far.
  // Demolishing buildings are excluded.
  // Inventory is valued at current shelf price × stock count.
  parkValue() {
    let buildingValue = 0;
    for (const record of [...installedRides, ...installedFacilities, ...Shopping.installed]) {
      if (record.status === STATUS.ACTIVE || record.status === STATUS.CLOSED) {
        const def = record.rideId     ? rides.find(r => r.id === record.rideId)
                  : record.facilityId ? facilities.find(f => f.id === record.facilityId)
                  :                     Shopping.catalog.find(s => s.id === record.shopId);
        buildingValue += def?.buildCost ?? 0;
      } else if (record.status === STATUS.BROKEN_DOWN) {
        const def = rides.find(r => r.id === record.rideId);
        const base = def?.buildCost ?? 0;
        buildingValue += Math.max(0, base * (1 - 0.1 * record.weeksToRepair));
      } else if (record.status === STATUS.UNDER_CONSTRUCTION || record.status === STATUS.PAUSED_CONSTRUCTION) {
        buildingValue += record.weeksCompleted * record.weeklyPayment;
      }
    }

    const inventoryValue = merchandiseInventory.reduce(
      (sum, inv) => sum + inv.count * inv.price, 0
    );

    return buildingValue + inventoryValue + money;
  },

  // ── Loan applications ────────────────────────────────────────────────────────
  // status lifecycle:
  //   null          → no application
  //   'approaching' → initial check pending (1 round)
  //   'open'        → bank accepted; player can click Apply For Loan
  //   'applying'    → rate calculation pending (1 round)
  //   'offered'     → bank has posted a rate offer
  loanApplication: null,

  submitLoanApplication(amount, purpose, term) {
    const bankFavor = Math.floor(Math.random() * 3);  // 0 unfavorable, 1 neutral, 2 favorable
    this.loanApplication = { amount, purpose, term, status: 'approaching', bankFavor };
  },

  applyForLoan() {
    if (this.loanApplication?.status === 'open')
      this.loanApplication.status = 'applying';
  },

  // Annual interest rate for the pending loan.
  // Base = inflation % + 1. Then four additive premiums:
  //   LTV         — loan amount as share of park value (collateral risk)
  //   Coverage    — recent operating income vs expenses (repayment risk)
  //   Term        — longer terms carry more uncertainty
  //   Favor       — bank's industry sentiment (-0.5 favorable, 0 neutral, +0.5 unfavorable)
  calcLoanRate() {
    const { amount, term } = this.loanApplication;
    const baseRate = Population.inflationRate * 100 + 1;

    // LTV premium
    const netWorth = this.parkValue();
    const ltv      = netWorth > 0 ? amount / netWorth : 1;
    const ltvPremium = ltv < 0.25 ? 0
                     : ltv < 0.50 ? 0.75
                     : ltv < 0.75 ? 1.75
                     :              3.5;

    // Coverage premium — avg operating income vs avg operating expenses (last 4 rounds)
    const recent = History.rounds.slice(-4);
    let coveragePremium;
    if (recent.length === 0) {
      coveragePremium = 0.5;
    } else {
      const avgIncome = recent.reduce((s, r) => s + r.gateIncome + r.parkingIncome + r.shopIncome, 0) / recent.length;
      const avgOpEx   = recent.reduce((s, r) => s + r.staffExpense + r.utilityExpense, 0) / recent.length;
      const ratio     = avgOpEx > 0 ? avgIncome / avgOpEx : (avgIncome > 0 ? 2 : 0);
      coveragePremium = ratio >= 2.0 ? -0.5
                      : ratio >= 1.5 ?  0
                      : ratio >= 1.0 ?  0.5
                      : ratio >= 0.5 ?  1.5
                      :                 3.0;
    }

    // Term premium
    const termPremium = term <= 2 ? 0 : term <= 5 ? 0.25 : 0.75;

    // Favor premium
    const { bankFavor } = this.loanApplication;
    const favorPremium = bankFavor >= 2 ? -0.5 : bankFavor === 1 ? 0 : 0.5;

    return Math.round((baseRate + ltvPremium + coveragePremium + termPremium + favorPremium) * 100) / 100;
  },

  // Called once per round. Drives the loan state machine one step forward.
  // Returns the transition that fired, or null if nothing was pending.
  processPendingLoan() {
    if (!this.loanApplication) return null;
    const { amount, purpose, status } = this.loanApplication;

    if (status === 'approaching') {
      const netWorth = this.parkValue();
      let ok = amount > 0 && amount < netWorth;
      if (ok && purpose === 'emergency') ok = amount < netWorth * 0.25;
      if (ok && purpose === 'staffing')  ok = amount < netWorth * 0.50;

      if (ok) {
        this.loanApplication.status = 'open';
        Notifications.push({
          label:   'Loan',
          message: 'A bank is open for applications on your requested loan.',
          action:  () => openPanel('financial'),
        });
        return 'approved';
      } else {
        this.loanApplication = null;
        Notifications.push({
          label:   'Loan',
          message: 'No banks wanted to pursue your offer at this time.',
          action:  () => openPanel('financial'),
        });
        return 'rejected';
      }
    }

    if (status === 'applying') {
      const rate = this.calcLoanRate();
      this.loanApplication.status = 'offered';
      this.loanApplication.rate   = rate;
      Notifications.push({
        label:   'Loan',
        message: `Bank offer: ${rate}% annual interest over ${this.loanApplication.term} yr.`,
        action:  () => openPanel('financial'),
      });
      return 'offered';
    }

    return null;
  },

  // ── Round processing ─────────────────────────────────────────────────────────
  // Called once per round advancement. Order matters: collect income before
  // deducting costs so the budget display reflects net change.
  processRound() {
    this.processEngineers();          // repair broken rides / reduce wear before anything else

    const dailyDemand     = this.calcDailyDemand();
    const dailyThroughput = this.calcGateThroughput();
    const daily           = Math.min(dailyDemand, dailyThroughput);

    this.computeRideOpinion(daily);   // updates rideOpinion for next round; sets lastRoundRiders
    this.processWear();               // accumulate wear then roll for breakdown

    const weeklyAttendance  = Math.round(daily * 7);
    const gateRevenue       = this.calcGateRevenue(daily);
    const parkingRevenue    = this.calcParkingRevenue(dailyDemand);
    const { revenue: shopRevenue, itemsSold: shopItemsSold } = Shopping.calcRevenue(weeklyAttendance);
    const food              = Shopping.calcFood(weeklyAttendance);
    const foodRevenue       = Math.round(food.mealsSold * (Shopping.MEAL_BASE_PRICE + this.foodUpcharge));
    const security = Security.calcIncidents(weeklyAttendance, dailyDemand, dailyThroughput);

    // Income
    money += gateRevenue;
    money += parkingRevenue;
    money += shopRevenue;
    money += foodRevenue;

    // Costs — income applied first so ability-to-pay reflects this week's revenue
    const staffCosts        = this.calcStaffCosts();
    const utilityCosts      = this.payUtilityCosts();
    const constructionCosts = processConstruction();  // skips progress on unaffordable builds
    processDemolition();              // advances demolition timers, clears finished structures

    Staff.advanceMedicalInsurance();  // tick quote countdown; tick policy duration
    Staff.processSickness();          // roll for new illness, decrement existing sick time
    Staff.advanceExperience();        // increment weeksEmployed for all staff
    Staff.applyInflation();           // grow each employee's costOfLiving by one week of annual inflation
    Staff.updateMoods();              // recalculate mood from salary vs costOfLiving
    Staff.processQuits();             // remove employees whose mood hit 0
    Staff.advancePostings();          // increment weeksActive for all postings
    Staff.generateCandidates();       // new applicants per round when postings exist
    Staff.advanceCandidates();        // withdrawal check, then increment weeksAsCandidate
    this.weeklyNetMess = Math.max(0, this.calcMessGenerated(weeklyAttendance) - Staff.calcJanitorCapacity());
    this.mealSatisfaction = food.mealsWanted > 0
      ? Math.min(1, 0.5 + 0.5 * food.mealsServed / food.mealsWanted)
      : 0.5;
    this.calcExcitement(weeklyAttendance); // uses this round's mess, security, and meal satisfaction
    this.advancePriceExhaustion();    // decay price fatigue by 1
    Security.advanceOpinion(security.unhandled); // decay then add unhandled incidents
    const populationEvents = Population.populationEvents.map(e => ({ ...e }));
    Population.tickEvents();          // tick population event modifiers toward 0

    const arrivedOrders = Shopping.tickOrders();
    if (arrivedOrders.length > 0) {
      const detail = arrivedOrders.map(o => `${o.count}× ${o.itemName}`).join(', ');
      Notifications.push({
        label:   'Delivery',
        message: `Orders arrived: ${detail}`,
        action:  () => openPanel('inventory'),
      });
    }

    return {
      weeklyAttendance,
      gateRevenue,
      parkingRevenue,
      shopRevenue,
      foodRevenue,
      totalIncome: gateRevenue + parkingRevenue + shopRevenue + foodRevenue,
      staffCosts,
      utilityCosts,
      constructionCosts,
      shopItemsSold,
      totalExpenses: staffCosts + utilityCosts + constructionCosts,
      rideEfficiency: this.rideOpinion,
      security: { ...security, opinionAfter: Security.opinion },
      food: { ...food, mealSatisfaction: this.mealSatisfaction },
      populationEvents,
    };
  },

};
