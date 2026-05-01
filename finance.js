// finance.js — Round-by-round financial and attendance simulation.
//
// Adding new income sources:
//   1. Add a named property and a calc method.
//   2. Call the method in processRound and add the result to money.
//
// Adding new cost sources:
//   Same pattern — calc method, subtract in processRound.

// Each entry: { id, applicable: purpose[], generate(app) → covenant }
// covenant shape: { id, description, weeks, value }
//   weeks — duration or deadline in game-weeks
//   value — contextual threshold/target (amount, count, etc.)
const LOAN_COVENANT_TEMPLATES = [
  {
    id: 'MIN_CASH',
    applicable: ['new_rides', 'staffing', 'emergency'],
    generate(app) {
      const value = Math.max(1000, Math.round(app.amount * 0.15 / 1000) * 1000);
      return {
        id: 'MIN_CASH',
        description: `Maintain at least $${value.toLocaleString()} cash on hand`,
        weeks: app.term * WEEKS_PER_YEAR,
        value,
      };
    },
  },
  {
    id: 'NO_NEW_LOANS',
    applicable: ['new_rides', 'staffing', 'emergency'],
    generate(app) {
      return {
        id: 'NO_NEW_LOANS',
        description: 'Do not take on additional loans during the term',
        weeks: app.term * WEEKS_PER_YEAR,
        value: 1,
      };
    },
  },
  {
    id: 'COMPLETE_RIDE',
    applicable: ['new_rides'],
    generate(app) {
      const weeks = Math.max(8, Math.ceil(app.term * WEEKS_PER_YEAR * 0.25));
      return {
        id: 'COMPLETE_RIDE',
        description: `Complete construction of at least 1 new ride within ${weeks} weeks`,
        weeks,
        value: 1,
      };
    },
  },
  {
    id: 'NO_DEMOLISH',
    applicable: ['new_rides'],
    generate(app) {
      return {
        id: 'NO_DEMOLISH',
        description: 'Do not demolish any rides for the duration of the loan',
        weeks: app.term * WEEKS_PER_YEAR,
        value: 0,
      };
    },
  },
  {
    id: 'HIRE_STAFF',
    applicable: ['staffing'],
    generate(app) {
      const value = Math.max(2, Math.round(app.amount / 75000));
      const weeks = Math.max(8, Math.ceil(app.term * WEEKS_PER_YEAR * 0.25));
      return {
        id: 'HIRE_STAFF',
        description: `Hire at least ${value} new employee${value !== 1 ? 's' : ''} within ${weeks} weeks`,
        weeks,
        value,
      };
    },
  },
  {
    id: 'RIDERSHIP_FLOOR',
    applicable: ['new_rides', 'staffing'],
    generate(app) {
      const recent = History.rounds.slice(-4);
      const avg    = recent.length > 0
        ? recent.reduce((s, r) => s + r.attendance, 0) / recent.length
        : 500;
      const value = Math.max(100, Math.round(avg * 0.8 / 100) * 100);
      return {
        id: 'RIDERSHIP_FLOOR',
        description: `Maintain weekly attendance of at least ${value.toLocaleString()} visitors`,
        weeks: app.term * WEEKS_PER_YEAR,
        value,
      };
    },
  },
  {
    id: 'SECURITY_THRESHOLD',
    applicable: ['emergency'],
    generate(app) {
      const value = 10;
      return {
        id: 'SECURITY_THRESHOLD',
        description: `Keep security opinion below ${value} for the duration`,
        weeks: app.term * WEEKS_PER_YEAR,
        value,
      };
    },
  },
];

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
  // Population.calcDemandMultiplier() scales demand by the ratio of current
  // favorable population (chance × favor × count) to the neutral baseline.
  // Security and mess penalties are applied to excitement at end-of-round instead.
  calcDailyDemand() {
    const exhaustionFactor = Math.max(0, 1 - this.priceExhaustion / 100);
    const eventFactor      = Population.populationEvents.reduce((f, e) => f * (1 + e.modifier / 100), 1);
    const weatherFactor    = 1 - (WEATHER_DEMAND_REDUCTION[nextWeekForecast] ?? 0);
    return this.parkExcitement * exhaustionFactor * eventFactor * Population.calcDemandMultiplier() * weatherFactor;
  },

  // Recomputes parkExcitement at end of round for use next round.
  // Base = weekly attendance × (rides per person / desired rides), capped at 1.
  // Security opinion and mess density degrade the result.
  // Mess penalty: unhandled mess spread across path tiles; 1.25^(mess per path) as divisor.
  calcExcitement(weeklyAttendance) {
    const runningRides      = installedRides.filter(r => r.status === STATUS.ACTIVE && isRideConnected(r));
    const totalWeeklyRides  = runningRides.reduce((s, r) => s + (r.lastRoundRiders ?? 0) * rideAgeFactor(r), 0);
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
    const wearMult = WEATHER_WET_EMOJIS.includes(nextWeekForecast) ? WEATHER_WEAR_MULTIPLIER : 1;
    installedRides
      .filter(r => r.status === STATUS.CLOSED && isRideConnected(r))
      .forEach(r => { r.wear += 10 * wearMult; });
    installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
      .forEach(r => {
        r.wear += (r.lastRoundRiders ?? 0) * wearMult * rideWearFactor(r);
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

  calcMessGenerated(weeklyAttendance, mealsSold = 0) {
    const fromGuests   = weeklyAttendance * Population.MESS_GUEST_RATE;
    const fromShoppers = weeklyAttendance * Population.BUYER_RATE * Population.MESS_SHOPPER_RATE;
    const fromFood     = mealsSold * Population.MESS_FOOD_RATE;

    const fromExtremeRides = installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r)
                && rides.find(d => d.id === r.rideId)?.intensity === 'extreme')
      .reduce((sum, r) => {
        const dist = nearestBathroomDist(r);
        return sum + (r.lastRoundRiders ?? 0) * Population.MESS_EXTREME_RIDER_RATE * dist;
      }, 0);

    return Math.floor(fromGuests + fromShoppers + fromFood + fromExtremeRides);
  },

  // Sets each path facility's .mess to fromGuests divided equally across all paths.
  distributeMessToTiles(fromGuests) {
    const paths = installedFacilities.filter(f => f.facilityId === FACILITY_ID.PATH);
    if (paths.length === 0) return;
    const perTile = fromGuests / paths.length;
    for (const f of paths) f.mess = perTile;
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
  activeLoans: [],        // disbursed loans currently being repaid
  totalMissedPayments: 0, // cumulative across all loans; drives future rate/LTV penalties

  // Maximum loan-to-value ratio for each purpose, shrinking with missed payments.
  effectiveLtvCap(purpose) {
    const reduction = this.totalMissedPayments * MISSED_PAYMENT_LTV_PENALTY;
    if (purpose === 'emergency') return Math.max(0.05, 0.25 - reduction);
    if (purpose === 'staffing')  return Math.max(0.10, 0.50 - reduction);
    return Math.max(0.10, 1.00 - reduction);
  },

  hasActiveCovenant(id) {
    return this.activeLoans.some(loan =>
      loan.covenants?.some(c => c.id === id && !c.breached && !c.satisfied)
    );
  },

  submitLoanApplication(amount, purpose, term) {
    // Favor 1–3; upper limit shrinks by 1 per active loan (floored at 1).
    const maxFavor  = Math.max(1, 3 - this.activeLoans.length);
    const bankFavor = Math.floor(Math.random() * maxFavor) + 1;
    this.loanApplication = { amount, purpose, term, status: LOAN_STATUS.APPROACHING, bankFavor };
  },

  applyForLoan() {
    if (this.loanApplication?.status === LOAN_STATUS.OPEN)
      this.loanApplication.status = LOAN_STATUS.APPLYING;
  },

  // Mark a covenant as breached and warn the player. The fee is not taken
  // until the following round so the player sees it coming. Once the fee
  // is collected the covenant is retired and cannot fire again.
  breachCovenant(loan, covenant) {
    if (covenant.breachPending || covenant.breached || covenant.satisfied) return;
    covenant.breachPending = true;
    const penaltyAmt = Math.round(loan.amount * loan.covenantPenaltyPct / 100);
    Notifications.push({
      label:   'Covenant',
      message: `In breach: "${covenant.description}". A $${penaltyAmt.toLocaleString()} fee will be assessed next round.`,
      action:  () => openPanel('financial'),
    });
  },

  // Called each round. Collects any pending breach fees and retires those
  // covenants so they cannot be triggered again.
  processCovenantBreaches() {
    for (const loan of this.activeLoans) {
      for (const covenant of loan.covenants ?? []) {
        if (!covenant.breachPending) continue;
        const penaltyAmt = Math.round(loan.amount * loan.covenantPenaltyPct / 100);
        money -= penaltyAmt;
        covenant.breachPending = false;
        covenant.breached      = true;
        Notifications.push({
          label:   'Covenant',
          message: `Breach fee of $${penaltyAmt.toLocaleString()} assessed for: "${covenant.description}".`,
          action:  () => openPanel('financial'),
        });
      }
    }
  },

  // Check all active covenant conditions each round.
  // Achievement covenants (COMPLETE_RIDE, HIRE_STAFF) track a deadline and
  // can be satisfied. Ongoing covenants (RIDERSHIP_FLOOR, SECURITY_THRESHOLD)
  // breach the first time their condition is violated and are then retired.
  // All covenants in all active loans are evaluated independently each round.
  processActiveCovenants(weeklyAttendance) {
    for (const loan of this.activeLoans) {
      for (const covenant of loan.covenants ?? []) {
        if (covenant.breached || covenant.satisfied) continue;

        switch (covenant.id) {

          case 'COMPLETE_RIDE': {
            if (covenant.initialActiveRides === undefined) {
              covenant.initialActiveRides = installedRides.filter(r => r.status === STATUS.ACTIVE).length;
              covenant.weeksRemaining     = covenant.weeks;
            }
            const activeNow = installedRides.filter(r => r.status === STATUS.ACTIVE).length;
            if (activeNow >= covenant.initialActiveRides + covenant.value) {
              covenant.satisfied = true;
              Notifications.push({
                label:   'Covenant',
                message: `Covenant satisfied: "${covenant.description}".`,
                action:  () => openPanel('financial'),
              });
            } else {
              covenant.weeksRemaining--;
              if (covenant.weeksRemaining <= 0) this.breachCovenant(loan, covenant);
            }
            break;
          }

          case 'HIRE_STAFF': {
            if (covenant.initialRosterSize === undefined) {
              covenant.initialRosterSize = Staff.roster.length;
              covenant.weeksRemaining    = covenant.weeks;
            }
            if (Staff.roster.length >= covenant.initialRosterSize + covenant.value) {
              covenant.satisfied = true;
              Notifications.push({
                label:   'Covenant',
                message: `Covenant satisfied: "${covenant.description}".`,
                action:  () => openPanel('financial'),
              });
            } else {
              covenant.weeksRemaining--;
              if (covenant.weeksRemaining <= 0) this.breachCovenant(loan, covenant);
            }
            break;
          }

          case 'MIN_CASH':
            if (money < covenant.value)
              this.breachCovenant(loan, covenant);
            break;

          case 'RIDERSHIP_FLOOR':
            if (weeklyAttendance < covenant.value)
              this.breachCovenant(loan, covenant);
            break;

          case 'SECURITY_THRESHOLD':
            if (Security.opinion > covenant.value)
              this.breachCovenant(loan, covenant);
            break;
        }
      }
    }
  },

  pickCovenant(excludeIds = []) {
    const { purpose } = this.loanApplication;
    const pool = LOAN_COVENANT_TEMPLATES.filter(t =>
      t.applicable.includes(purpose) && !excludeIds.includes(t.id)
    );
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)].generate(this.loanApplication);
  },

  // ── Negotiation ──────────────────────────────────────────────────────────────
  // Each action costs 1 bank favor. Guards are no-ops if favor is exhausted.

  negotiateCovenant(index) {
    if (this.loanApplication.bankFavor <= 0) return;
    this.loanApplication.covenants.splice(index, 1);
    this.loanApplication.rate = Math.round((this.loanApplication.rate + 0.3) * 100) / 100;
    this.loanApplication.bankFavor--;
  },

  negotiateRate() {
    if (this.loanApplication.bankFavor <= 0) return;
    const { covenants } = this.loanApplication;
    if (covenants.length < 2) {
      const newCovenant = this.pickCovenant(covenants.map(c => c.id));
      if (newCovenant) {
        covenants.push(newCovenant);
        this.loanApplication.rate = Math.round((this.loanApplication.rate - 0.5) * 100) / 100;
      } else {
        this.loanApplication.rate = Math.round((this.loanApplication.rate - 0.2) * 100) / 100;
      }
    } else {
      this.loanApplication.rate = Math.round((this.loanApplication.rate - 0.2) * 100) / 100;
    }
    this.loanApplication.bankFavor--;
  },

  negotiateFee() {
    if (this.loanApplication.bankFavor <= 0) return;
    if (this.loanApplication.covenantPenaltyPct <= 5) return;
    this.loanApplication.covenantPenaltyPct -= 5;
    this.loanApplication.bankFavor--;
  },

  // Fixed weekly payment for an amortizing loan.
  // Uses the standard annuity formula: P × r(1+r)^n / ((1+r)^n − 1)
  // where r = annualRatePct / 100 / 52 and n = weeksRemaining.
  // Returns { total, principal } where total is the full payment (rounded up)
  // and principal is the portion reducing the balance (total minus interest this period).
  calcLoanPayment(principal, annualRatePct, weeksRemaining) {
    if (weeksRemaining <= 0) return { total: 0, principal: 0 };
    const r = annualRatePct / 100 / 52;
    if (r === 0) {
      const total = Math.ceil(principal / weeksRemaining);
      return { total, principal: total };
    }
    const factor    = Math.pow(1 + r, weeksRemaining);
    const total     = Math.ceil(principal * r * factor / (factor - 1));
    const interest  = principal * r;
    return { total, principal: total - interest };
  },

  rejectOffer() {
    if (this.loanApplication?.status !== LOAN_STATUS.OFFERED) return;
    this.loanApplication = null;
  },

  acceptOffer() {
    if (this.loanApplication?.status !== LOAN_STATUS.OFFERED) return;
    this.loanApplication.status = LOAN_STATUS.REVIEW;
    this.loanApplication.reviewWeeksRemaining = 2;
    Notifications.push({
      label:   'Loan',
      message: 'Loan accepted and under final review. Funds arrive in 2 weeks.',
      action:  () => openPanel('financial'),
    });
  },

  // Annual interest rate for the pending loan.
  // Base = inflation % + 1. Then premiums and adjustments:
  //   LTV             — loan amount as share of park value (collateral risk)
  //   Coverage        — recent operating income vs expenses (repayment risk)
  //   Term            — longer terms carry more uncertainty
  //   Favor           — bank's industry sentiment (-0.5 favorable → +0.5 unfavorable)
  //   Covenants       — COVENANT_RATE_DISCOUNT per covenant on the agreement
  //   Missed payments — MISSED_PAYMENT_RATE_PENALTY per historical missed payment
  calcLoanRate(covenants = []) {
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

    // Favor premium (1 unfavorable, 2 neutral, 3 favorable)
    const { bankFavor } = this.loanApplication;
    const favorPremium = bankFavor >= 3 ? -0.5 : bankFavor === 2 ? 0 : 0.5;

    // Covenant discount — each covenant the player accepts shaves off a fixed amount
    const covenantDiscount = covenants.length * COVENANT_RATE_DISCOUNT;

    // Missed payment penalty — compounds across all historical missed payments
    const missedPenalty = this.totalMissedPayments * MISSED_PAYMENT_RATE_PENALTY;

    return Math.round((baseRate + ltvPremium + coveragePremium + termPremium + favorPremium - covenantDiscount + missedPenalty) * 100) / 100;
  },

  // Called once per round. Drives the loan state machine one step forward.
  // Returns the transition that fired, or null if nothing was pending.
  processPendingLoan() {
    if (!this.loanApplication) return null;
    const { amount, purpose, status } = this.loanApplication;

    if (status === LOAN_STATUS.APPROACHING) {
      const netWorth = this.parkValue();
      const cap      = this.effectiveLtvCap(purpose);
      let ok = amount > 0 && amount < netWorth * cap;

      if (ok) {
        this.loanApplication.status = LOAN_STATUS.OPEN;
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

    if (status === LOAN_STATUS.APPLYING) {
      const covenants          = [this.pickCovenant()].filter(Boolean);
      const rate               = this.calcLoanRate(covenants);
      // Penalty for breaching any covenant: 5–20% of loan amount in 5% steps
      const covenantPenaltyPct = covenants.length > 0 ? (Math.floor(Math.random() * 4) + 1) * 5 : 0;
      this.loanApplication.status            = LOAN_STATUS.OFFERED;
      this.loanApplication.rate              = rate;
      this.loanApplication.covenants         = covenants;
      this.loanApplication.covenantPenaltyPct = covenantPenaltyPct;
      Notifications.push({
        label:   'Loan',
        message: `Bank offer: ${rate}% over ${this.loanApplication.term} yr — ${covenants.length} covenant${covenants.length !== 1 ? 's' : ''}.`,
        action:  () => openPanel('financial'),
      });
      return 'offered';
    }

    if (status === LOAN_STATUS.REVIEW) {
      this.loanApplication.reviewWeeksRemaining--;
      if (this.loanApplication.reviewWeeksRemaining > 0) return 'reviewing';

      // Disburse — credit cash, move to active loans, clear application
      const { amount, purpose, term, rate, covenants, covenantPenaltyPct } = this.loanApplication;
      money += amount;
      this.activeLoans.push({
        id: Date.now(),
        amount, purpose, term, rate, covenants, covenantPenaltyPct,
        balance:            amount,
        weeksRemaining:     term * WEEKS_PER_YEAR,
        totalInterestPaid:  0,
        totalPrincipalPaid: 0,
        missedPayments:     0,
      });
      this.loanApplication = null;
      Notifications.push({
        label:   'Loan',
        message: `$${amount.toLocaleString()} loan disbursed and now active.`,
        action:  () => openPanel('financial'),
      });
      return 'disbursed';
    }

    return null;
  },

  // ── Loan repayments ──────────────────────────────────────────────────────────
  // Deducts the weekly payment from cash, splits it into interest and principal,
  // and removes loans that have been fully repaid.
  // Returns total cash deducted this round across all loans.
  processLoanRepayments() {
    let paid = 0;
    for (let i = this.activeLoans.length - 1; i >= 0; i--) {
      const loan = this.activeLoans[i];
      const { total, principal } = this.calcLoanPayment(loan.balance, loan.rate, loan.weeksRemaining);
      if (money >= total) {
        money -= total;
        paid  += total;
        loan.balance           = Math.max(0, loan.balance - principal);
        loan.weeksRemaining--;
        loan.totalInterestPaid  += total - principal;
        loan.totalPrincipalPaid += principal;
        if (loan.weeksRemaining <= 0 || loan.balance <= 0) {
          this.activeLoans.splice(i, 1);
          Notifications.push({
            label:   'Loan',
            message: 'Loan fully repaid.',
            action:  () => openPanel('financial'),
          });
        }
      } else {
        loan.missedPayments++;
        this.totalMissedPayments++;
        Notifications.push({
          label:   'Loan',
          message: `Missed loan payment of $${total.toLocaleString()} — insufficient funds.`,
          action:  () => openPanel('financial'),
        });
      }
    }
    return paid;
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

    // Always at least 35 visitors per week — a few souls wander in regardless.
    const weeklyAttendance  = Math.max(35, Math.round(daily * 7));
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
    const loanRepayments    = this.processLoanRepayments();
    const staffCosts        = this.calcStaffCosts();
    const utilityCosts      = this.payUtilityCosts();
    const constructionCosts = processConstruction();  // skips progress on unaffordable builds
    processDemolition();              // advances demolition timers, clears finished structures
    this.processCovenantBreaches();   // collect any pending breach fees and retire those covenants
    this.processActiveCovenants(weeklyAttendance);  // check all active covenant conditions

    Staff.advanceMedicalInsurance();  // tick quote countdown; tick policy duration
    Staff.processSickness();          // roll for new illness, decrement existing sick time
    Staff.advanceExperience();        // increment weeksEmployed for all staff
    Staff.applyInflation();           // grow each employee's costOfLiving by one week of annual inflation
    Staff.updateMoods();              // recalculate mood from salary vs costOfLiving
    Staff.processQuits();             // remove employees whose mood hit 0
    Staff.advancePostings();          // increment weeksActive for all postings
    Staff.generateCandidates();       // new applicants per round when postings exist
    Staff.advanceCandidates();        // withdrawal check, then increment weeksAsCandidate
    this.weeklyNetMess = Math.max(0, this.calcMessGenerated(weeklyAttendance, food.mealsSold) - Staff.calcJanitorCapacity());
    this.distributeMessToTiles(weeklyAttendance * Population.MESS_GUEST_RATE);
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
      loanRepayments,
      totalExpenses: staffCosts + utilityCosts + constructionCosts + loanRepayments,
      rideEfficiency: this.rideOpinion,
      security: { ...security, opinionAfter: Security.opinion },
      food: { ...food, mealSatisfaction: this.mealSatisfaction },
      populationEvents,
    };
  },

};
