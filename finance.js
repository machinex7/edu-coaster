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
    return this.parkExcitement * exhaustionFactor * eventFactor * Population.compositeFavor;
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
  // Total weekly staff outlay: wages + 401(k) employer match contribution +
  // job-posting fees + active medical insurance premiums.
  calcStaffCosts() {
    const wages = Staff.totalWeeklySalary();
    const matchContribution = Math.round(wages * Staff.RETIREMENT_MATCH_PCT / 100);
    return wages + matchContribution + Staff.totalPostingCosts() + Staff.calcMedicalCosts();
  },

  calcUtilityCosts() {
    const rideCosts = installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
      .reduce((sum, r) => {
        const def = rides.find(d => d.id === r.rideId);
        return sum + (def?.utilityCost ?? 0) * Population.utilityMultiplier;
      }, 0);
    const facilityCosts = installedFacilities
      .filter(f => f.status === STATUS.ACTIVE)
      .reduce((sum, f) => {
        const def = facilities.find(d => d.id === f.facilityId);
        return sum + (def?.utilityCost ?? 0) * Population.utilityMultiplier;
      }, 0);
    return rideCosts + facilityCosts;
  },

  // Security.calcIncidents() and Security.advanceOpinion() are in security.js.

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
    const staffCosts        = this.calcStaffCosts();
    const utilityCosts      = this.calcUtilityCosts();
    const constructionCosts = [...installedRides, ...installedFacilities, ...Shopping.installed]
      .filter(r => r.status === STATUS.UNDER_CONSTRUCTION)
      .reduce((sum, r) => sum + r.weeklyPayment, 0);

    const security = Security.calcIncidents(weeklyAttendance, dailyDemand, dailyThroughput);

    // Income
    money += gateRevenue;
    money += parkingRevenue;
    money += shopRevenue;
    money += foodRevenue;

    // Costs
    money -= staffCosts;
    money -= utilityCosts;
    money -= security.theftLoss;      // $50 per unhandled shoplifter
    processConstruction();            // deducts constructionCosts and advances build progress

    Staff.advanceMedicalInsurance();  // tick quote countdown; tick policy duration
    Staff.processSickness();          // roll for new illness, decrement existing sick time
    Staff.advanceExperience();        // increment weeksEmployed for all staff
    Staff.applyInflation();           // grow each employee's costOfLiving by one week of annual inflation
    Staff.updateMoods();              // recalculate mood from salary vs costOfLiving
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
      theftLoss:     security.theftLoss,
      totalExpenses: staffCosts + utilityCosts + constructionCosts + security.theftLoss,
      rideEfficiency: this.rideOpinion,
      security: { ...security, opinionAfter: Security.opinion },
      food: { ...food, mealSatisfaction: this.mealSatisfaction },
      populationEvents,
    };
  },

};
