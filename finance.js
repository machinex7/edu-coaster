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

// Max Euclidean tile distance from a shop that receives IDW shopper mess.
const MAX_SHOP_MESS_RADIUS = 5;

const Finance = {

  // ── Park metrics ────────────────────────────────────────────────────────────
  parkExcitement:   500,  // satisfied-visitor count from last round; drives next round's demand
  weeklyNetMess:    0,    // unhandled mess from last round; subtracted from excitement
  mealSatisfaction: 1,    // 0.5–1; penalises excitement when food supply < demand

  // Accumulates campaign launch costs paid between round advances; reset each round.
  roundMarketingCosts: 0,
  // Accumulates merchandise order costs paid between round advances; reset each round.
  roundMerchandiseCosts: 0,
  // Accumulates parking lot amenity purchase costs paid between round advances; reset each round.
  roundParkingAmenityCosts: 0,

  // Smoothed 0–1 score of how well rides are serving current crowds.
  // Starts at 1.0 (perfect); degrades when operators can't keep up with demand.
  rideOpinion: 1.0,

  // Security.opinion is in security.js — read here by calcDailyDemand().

  // Guest ride satisfaction: did people get as many rides as they wanted?
  // staffRatio = actual operators / needed operators (capped at 1).
  // Each running ride contributes rph * staffRatio * 7 actual weekly riders,
  // discounted by rideAgeFactor (decays after 5 years). ridesPerPerson is that
  // total divided by weekly attendance. rideOpinion = min(1, ridesPerPerson /
  // DESIRED_RIDES) — 1.0 means guests rode at least as much as they wanted.
  computeRideOpinion(weeklyAttendance) {
    const runningRides = installedRides.filter(r => r.status === STATUS.ACTIVE && isRideConnected(r));
    if (runningRides.length === 0) return;

    const needed     = Staff.rideOperatorsNeeded();
    const actual     = Staff.roster.filter(s => s.jobId === JOB.RIDE_OPERATOR && s.weeksOut === 0).length;
    const staffRatio = !Unlock.STAFFING ? 1 : needed > 0 ? Math.min(1, actual / needed) : 1;

    let totalWeeklyRiders = 0;
    runningRides.forEach(record => {
      const rph = rides.find(r => r.id === record.rideId)?.ridesPerHour ?? 0;
      record.lastRoundCapacity  = Math.round(rph * 7);
      record.lastRoundRiders    = Math.round(rph * staffRatio * 7);
      totalWeeklyRiders        += record.lastRoundRiders * rideAgeFactor(record);
    });

    const ridesPerPerson = weeklyAttendance > 0 ? totalWeeklyRiders / weeklyAttendance : 0;
    this.rideOpinion = Math.min(1, ridesPerPerson / Population.DESIRED_RIDES);
    console.log(
      '[rides]',
      'staffRatio:', staffRatio.toFixed(4),
      '| operators:', actual + '/' + needed,
      '| ridesPerPerson:', ridesPerPerson.toFixed(4),
      '| rideOpinion:', this.rideOpinion.toFixed(4)
    );
  },

  // ── Attendance ──────────────────────────────────────────────────────────────

  // Returns how many people want to visit based on last round's excitement.
  // priceExhaustion cuts demand by 1% per point (10 exhaustion = −10%).
  // Population.calcDemandMultiplier() scales demand by the ratio of current
  // favorable population (chance × favor × count) to the neutral baseline.
  // Security and mess penalties are applied to excitement at end-of-round instead.
  calcDailyDemand() {
    const exhaustionFactor  = Math.max(0, 1 - this.priceExhaustion / 100);
    const eventFactor       = Population.populationEvents.reduce((f, e) => f * (1 + e.modifier / 100), 1);
    const weatherFactor     = 1 - (WEATHER_DEMAND_REDUCTION[nextWeekForecast] ?? 0);
    const demandMultiplier  = Population.calcDemandMultiplier();
    const result            = this.parkExcitement * exhaustionFactor * eventFactor * demandMultiplier * weatherFactor;
    console.log(
      '[demand]',
      'excitement:', this.parkExcitement.toFixed(2),
      '| exhaustion:', exhaustionFactor.toFixed(4),
      '| event:', eventFactor.toFixed(4),
      '| demandMult:', demandMultiplier.toFixed(4),
      '| weather:', weatherFactor.toFixed(4),
      '| dailyDemand:', result.toFixed(2)
    );
    return result;
  },

  // Recomputes parkExcitement at end of round for use next round.
  // Uses rideOpinion (set by computeRideOpinion this round) as the ride satisfaction factor.
  // Security opinion and mess density degrade the result.
  // Mess penalty: unhandled mess spread across path tiles; 1.25^(mess per path) as divisor.
  calcExcitement(weeklyAttendance) {
    const securityFactor = Unlock.SECURITY ? Math.max(0, 1 - Math.sqrt(Security.opinion) / 100) : 1;
    const messFactor     = Unlock.MESSES   ? this.calcMessFactor() : 1;
    this.parkExcitement  = Math.max(0, (weeklyAttendance * this.rideOpinion * securityFactor * this.mealSatisfaction) / messFactor);
  },

  // How many people can actually enter: booth attendants are the bottleneck.
  // Per attendant: base 500 × mood multiplier (0.8–1.2) × experience multiplier × skill modifier.
  calcGateThroughput() {
    if (!Unlock.STAFFING) return Infinity;
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
  parkingPrice: 10,  // $ per vehicle (only active after PARKING_FEES research)

  // Cumulative visitor price fatigue. Rises when prices increase, decays 1/round.
  priceExhaustion: 0,

  // Multiplier (0–1) applied to food and merchandise spending this round.
  // Drops below 1 when parking fees exceed the inflation-adjusted free threshold.
  parkingSpendingMultiplier: 1,

  // Count of visitors who arrived via alternative transport this round (no parking revenue).
  altTransportVisitors: 0,

  // Whether the park bus service is currently running. Toggled by the player in the Parking panel.
  // Requires BUS_SERVICE research. Deducts BUS_WEEKLY_COST each round when active.
  busEnabled: false,

  // Weekly operating cost of the bus service.
  BUS_WEEKLY_COST: 750,

  // Visitors who rode the park bus this round (converted from parking no-shows).
  busRiders: 0,

  // One-time parking lot upgrades that raise the free-zone threshold.
  // Each purchase permanently adds its bonus (in base $) to the threshold before inflation scaling.
  PARKING_AMENITIES: Object.freeze([
    { id: 'speakers', label: 'Speakers & Music',  cost: 6000,  bonus: 2 },
    { id: 'murals',   label: 'Murals',            cost: 9000,  bonus: 3 },
    { id: 'art',      label: 'Art Installations', cost: 15000, bonus: 4 },
  ]),

  // Set of amenity ids that have been purchased this game.
  purchasedAmenities: new Set(),

  // Sum of bonus dollars from all purchased amenities. Added to the $10 base threshold before
  // multiplying by cumulativeInflation, so the benefit compounds with visitor budget growth.
  parkingAmenityBonus: 0,

  // Purchase a parking amenity by id. Deducts cost from money immediately.
  // Returns false if already purchased, research not done, or insufficient funds.
  buyParkingAmenity(id) {
    const amenity = this.PARKING_AMENITIES.find(a => a.id === id);
    if (!amenity || this.purchasedAmenities.has(id)) return false;
    if (money < amenity.cost) return false;
    money -= amenity.cost;
    this.roundParkingAmenityCosts += amenity.cost;
    this.purchasedAmenities.add(id);
    this.parkingAmenityBonus += amenity.bonus;
    return true;
  },

  advancePriceExhaustion() {
    this.priceExhaustion = Math.max(0, this.priceExhaustion - 1);
  },

  // ── Income sources ───────────────────────────────────────────────────────────
  // Returns weekly gate revenue after applying any active discount rules.
  calcGateRevenue(dailyAttendance) {
    const weekly   = dailyAttendance * 7;
    const base     = Math.round(this.gatePrice * weekly);
    const discount = Discounts.calcGateCost(weekly, this.gatePrice);
    return base - discount;
  },

  // Computes parking revenue and side-effects for this round.
  // Returns { revenue, altTransportVisitors, noShowVisitors, busRiders, spendingMultiplier }.
  //
  // Three zones:
  //   ≤ threshold ($10+amenity bonus × inflation): everyone pays, no spending effect.
  //   > threshold:                   food/merch spending drops by (price − threshold)/4 percent.
  //   > bracket limit × inflation:   that income bracket is "priced out" — a fraction use
  //                                  alternative transport (still attend, no parking revenue),
  //                                  the rest would be no-shows. If the bus is running, those
  //                                  no-shows take the bus instead and attend at full spending.
  //
  // Spending multiplier is a weighted blend: parking-payers get the reduced rate, bus riders
  // and alt-transport visitors get full spending (they didn't pay the parking fee).
  calcParkingResult(dailyDemand) {
    if (!Research.completed.has(RESEARCH_ID.PARKING_FEES)) {
      return { revenue: 0, altTransportVisitors: 0, noShowVisitors: 0, busRiders: 0, spendingMultiplier: 1 };
    }

    const inflation       = Population.cumulativeInflation;
    const threshold       = (10 + this.parkingAmenityBonus) * inflation;
    const weeklyVehicles  = Math.floor(dailyDemand * 7 / 3);  // 1 vehicle per 3 visitors
    const busActive       = this.busEnabled && Research.completed.has(RESEARCH_ID.BUS_SERVICE);

    // Raw spending multiplier for visitors who paid for parking.
    const rawSpendingMult = this.parkingPrice > threshold
      ? Math.max(0, 1 - (this.parkingPrice - threshold) / 400)
      : 1;

    // Split weekly vehicles across income brackets proportionally by their attendance chance.
    const totalChance = Population.INCOME_BRACKETS.reduce((s, b) => s + b.chance, 0);
    let payingVehicles       = 0;
    let altTransportVehicles = 0;
    let noShowVehicles       = 0;

    for (let i = 0; i < Population.INCOME_BRACKETS.length; i++) {
      const bracket         = Population.INCOME_BRACKETS[i];
      const bracketLimit    = Population.PARKING_PRICE_LIMITS[i] * inflation;
      const bracketVehicles = Math.round(weeklyVehicles * (bracket.chance / totalChance));

      if (this.parkingPrice > bracketLimit) {
        // Priced out: split between alt-transport and no-show.
        const altRatio = Population.PARKING_ALT_TRANSPORT_RATIO[i];
        altTransportVehicles += Math.round(bracketVehicles * altRatio);
        noShowVehicles       += bracketVehicles - Math.round(bracketVehicles * altRatio);
      } else {
        payingVehicles += bracketVehicles;
      }
    }

    const revenue              = payingVehicles * this.parkingPrice;
    const altTransportVisitors = altTransportVehicles * 3;  // ~3 visitors per vehicle
    const rawNoShowVisitors    = noShowVehicles * 3;

    // Bus converts all no-shows into riders who attend at full spending.
    const busRiders      = busActive ? rawNoShowVisitors : 0;
    const noShowVisitors = busActive ? 0 : rawNoShowVisitors;

    // Blend the spending multiplier: parking-payers get rawSpendingMult, everyone else gets 1.
    // Bus riders and alt-transport visitors didn't pay parking so their spending is unaffected.
    const totalAttendees = payingVehicles * 3 + altTransportVisitors + busRiders;
    const payingVisitors = payingVehicles * 3;
    const spendingMultiplier = totalAttendees > 0
      ? (payingVisitors * rawSpendingMult + (altTransportVisitors + busRiders) * 1) / totalAttendees
      : rawSpendingMult;

    return { revenue, altTransportVisitors, noShowVisitors, busRiders, spendingMultiplier };
  },

  // ── Engineers ────────────────────────────────────────────────────────────────
  // Run at the very start of each round, before excitement recalc and wear.
  // Each engineer either repairs one broken ride (most-worn first) or, if
  // none are broken, reduces wear on the 2 most-worn running rides by
  // 500 × tier per ride. Completing a repair cuts the ride's wear to 15%.
  processEngineers() {
    if (!Unlock.STAFFING) {
      [...installedRides, ...installedFacilities, ...Shopping.installed]
        .filter(r => r.status === STATUS.UNDER_CONSTRUCTION)
        .forEach(target => {
          target.weeksCompleted++;
          if (target.weeksCompleted >= target.weeksTotal) completeConstruction(target);
        });
      return;
    }
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
            target.status       = STATUS.ACTIVE;
            target.weeksToRepair = 0;
            // Major overhaul on repair — severely cut accumulated wear.
            target.wear = Math.round(target.wear * 0.15);
          }
        } else {
          const { tier } = Staff.getExperienceTier(eng.weeksEmployed);
          installedRides
            .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
            .sort((a, b) => b.wear - a.wear)
            .slice(0, 2)
            .forEach(r => { r.wear = Math.max(0, r.wear - 500 * tier); });
        }
      });
  },

  // ── Wear & breakdown ─────────────────────────────────────────────────────────
  // Called each round after computeRideOpinion() so lastRoundRiders is current.
  // Accumulates rider wear then rolls for breakdown; probability = (wear/MAX_EFFECTIVE_WEAR)^2, reaching 100% at max.
  // No-ops when Unlock.WEAR is false — rides stay at 0 wear and never break down.
  processWear() {
    if (!Unlock.WEAR) return;
    const wearMult = WEATHER_WET_EMOJIS.includes(nextWeekForecast) ? WEATHER_WEAR_MULTIPLIER : 1;
    installedRides
      .filter(r => r.status === STATUS.CLOSED && isRideConnected(r))
      .forEach(r => { r.wear += 10 * wearMult; });
    installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
      .forEach(r => {
        r.wear += (r.lastRoundRiders ?? 0) * wearMult * rideWearFactor(r);
        if (Math.random() < (r.wear / MAX_EFFECTIVE_WEAR) ** 2) {
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

  calcMessGenerated(weeklyAttendance, mealsSold = 0, itemsSold = 0) {
    const fromGuests   = weeklyAttendance * Population.MESS_GUEST_RATE;
    const fromShoppers = itemsSold * Population.MESS_ITEM_RATE;
    const fromFood     = mealsSold * Population.MESS_FOOD_RATE;

    const fromExtremeRides = installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r)
                && rides.find(d => d.id === r.rideId)?.intensity === 'extreme')
      .reduce((sum, r) => {
        const { dist } = nearestBathroom(r);
        return sum + (r.lastRoundRiders ?? 0) * Population.MESS_EXTREME_RIDER_RATE * dist;
      }, 0);

    const fromHighRides = installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r)
                && rides.find(d => d.id === r.rideId)?.intensity === 'high')
      .reduce((sum, r) => {
        const { dist } = nearestBathroom(r);
        return sum + (r.lastRoundRiders ?? 0) * Population.MESS_HIGH_RIDER_RATE * dist;
      }, 0);

    return Math.floor(fromGuests + fromShoppers + fromFood + fromExtremeRides + fromHighRides);
  },

  // Distributes mess to path tiles each round.
  // fromGuests is split equally across all paths.
  // fromShoppers and fromFood each use IDW: each path tile is weighted by the
  // sum of 1/(dist+1)² over the relevant active shop cells within
  // MAX_SHOP_MESS_RADIUS tiles (Euclidean). Tiles outside that radius from
  // every shop of a given type receive none of that type's mess.
  // Extreme-ride mess is spread along the actual path to the nearest bathroom:
  // only tiles on that route receive mess, weighted by IDW from the ride so
  // the mess diminishes toward the bathroom end of the route.
  distributeMessToTiles(fromGuests, fromShoppers = 0, fromFood = 0) {
    const paths = installedFacilities.filter(f => f.facilityId === FACILITY_ID.PATH);
    if (paths.length === 0) return;

    const guestPerTile = fromGuests / paths.length;

    // Separate active shop cells by type.
    const foodIds = new Set(Shopping.catalog.filter(s => s.shopType === 'food').map(s => s.id));
    const merchCells = [];
    const foodCells  = [];
    for (const s of Shopping.installed) {
      if (s.status !== STATUS.ACTIVE) continue;
      const target = foodIds.has(s.shopId) ? foodCells : merchCells;
      for (let r = 0; r < s.footprint.length; r++) {
        for (let c = 0; c < s.footprint[r].length; c++) {
          if (s.footprint[r][c] === 1)
            target.push({ row: s.row + r, col: s.col + c });
        }
      }
    }

    // Returns an IDW weight array for the given source cells and radius.
    const idwWeights = (sourceCells, radius) => paths.map(p => {
      let w = 0;
      for (const sc of sourceCells) {
        const dist = Math.sqrt((p.row - sc.row) ** 2 + (p.col - sc.col) ** 2);
        if (dist <= radius) w += 1 / (dist + 1) ** 2;
      }
      return w;
    });

    const shopWeights = idwWeights(merchCells, MAX_SHOP_MESS_RADIUS);
    const foodWeights = idwWeights(foodCells,  MAX_SHOP_MESS_RADIUS);
    const totalShop   = shopWeights.reduce((a, b) => a + b, 0);
    const totalFood   = foodWeights.reduce((a, b) => a + b, 0);

    for (let i = 0; i < paths.length; i++) {
      const shopperShare = totalShop > 0 ? fromShoppers * shopWeights[i] / totalShop : 0;
      const foodShare    = totalFood > 0 ? fromFood    * foodWeights[i]  / totalFood  : 0;
      paths[i].mess = guestPerTile + shopperShare + foodShare;
    }

    // Extreme-ride mess: spread along the actual bathroom route using a
    // triangular weighting. Tile at path index i (0 = nearest ride exit)
    // gets weight (n - i), so the total is n*(n+1)/2 and mess diminishes
    // linearly from the ride toward the bathroom.
    // Extreme and high-intensity rides spread mess along the path to the nearest bathroom.
    // Extreme generates twice the mess of high (MESS_EXTREME_RIDER_RATE = 2× MESS_HIGH_RIDER_RATE).
    const activeIntenseRides = installedRides.filter(r => {
      const intensity = rides.find(d => d.id === r.rideId)?.intensity;
      return r.status === STATUS.ACTIVE && isRideConnected(r)
          && (intensity === 'extreme' || intensity === 'high');
    });
    for (const ride of activeIntenseRides) {
      const intensity = rides.find(d => d.id === ride.rideId)?.intensity;
      const rate      = intensity === 'extreme' ? Population.MESS_EXTREME_RIDER_RATE : Population.MESS_HIGH_RIDER_RATE;
      const { dist, path: bathroomPath } = nearestBathroom(ride);
      const amount = (ride.lastRoundRiders ?? 0) * rate * dist;
      if (amount <= 0 || bathroomPath.length === 0) continue;

      const n           = bathroomPath.length;
      const totalWeight = n * (n + 1) / 2;
      const routeIndex  = new Map(bathroomPath.map((t, i) => [`${t.row},${t.col}`, i]));

      for (const p of paths) {
        const i = routeIndex.get(`${p.row},${p.col}`);
        if (i === undefined) continue;
        p.mess += amount * (n - i) / totalWeight;
      }
    }
  },

  // ── Cost sources ─────────────────────────────────────────────────────────────
  // Deducts posting fees first, then pays each employee's salary + 401(k) match
  // if money allows (mood penalty event for any skipped paycheck), then attempts
  // to pay the medical premium — cancelling the policy immediately if funds are
  // insufficient. Returns the total amount actually deducted from money.
  calcStaffCosts() {
    if (!Unlock.STAFFING) return 0;
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

    const inventoryValue = Shopping.merchandiseInventory.reduce(
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
      action:  () => openPanel('banking'),
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
          action:  () => openPanel('banking'),
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
          action:  () => openPanel('banking'),
        });
        return 'approved';
      } else {
        this.loanApplication = null;
        Notifications.push({
          label:   'Loan',
          message: 'No banks wanted to pursue your offer at this time.',
          action:  () => openPanel('banking'),
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
        action:  () => openPanel('banking'),
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
        action:  () => openPanel('banking'),
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
            action:  () => openPanel('banking'),
          });
        }
      } else {
        loan.missedPayments++;
        this.totalMissedPayments++;
        Notifications.push({
          label:   'Loan',
          message: `Missed loan payment of $${total.toLocaleString()} — insufficient funds.`,
          action:  () => openPanel('banking'),
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

    this.computeRideOpinion(daily * 7); // updates rideOpinion for next round; sets lastRoundRiders
    this.processWear();               // accumulate wear then roll for breakdown

    // Parking: compute side-effects first so we can adjust attendance before shopping/food.
    const parking = this.calcParkingResult(dailyDemand);
    this.parkingSpendingMultiplier = parking.spendingMultiplier;
    this.altTransportVisitors      = parking.altTransportVisitors;
    this.busRiders                 = parking.busRiders;

    // Always at least 35 visitors per week — a few souls wander in regardless.
    // Subtract net no-shows (0 if bus is running) before downstream calculations.
    // Bus riders are added back in since they do attend.
    const weeklyAttendance  = Math.max(35, Math.round(daily * 7) - parking.noShowVisitors);
    const gateRevenue       = this.calcGateRevenue(daily);
    const parkingRevenue    = parking.revenue;
    const { revenue: shopRevenue, itemsSold: shopItemsSold } = Shopping.calcRevenue(weeklyAttendance);
    const food      = Concessions.calcFood(weeklyAttendance);
    const foodRevenue = food.revenue;
    const security = Security.calcIncidents(weeklyAttendance, dailyDemand, dailyThroughput);

    // Income
    money += gateRevenue;
    money += parkingRevenue;
    money += shopRevenue;
    money += foodRevenue;

    // Costs — income applied first so ability-to-pay reflects this week's revenue
    const busCost = (this.busEnabled && Research.completed.has(RESEARCH_ID.BUS_SERVICE))
      ? this.BUS_WEEKLY_COST : 0;
    money -= busCost;
    const loanRepayments    = this.processLoanRepayments();
    const staffCosts        = this.calcStaffCosts();
    const utilityCosts      = this.payUtilityCosts();
    const constructionCosts = processConstruction();  // skips progress on unaffordable builds
    processDemolition();              // advances demolition timers, clears finished structures
    this.processCovenantBreaches();   // collect any pending breach fees and retire those covenants
    this.processActiveCovenants(weeklyAttendance);  // check all active covenant conditions

    if (Unlock.STAFFING) {
      Staff.advanceMedicalInsurance();  // tick quote countdown; tick policy duration
      Staff.processSickness();          // roll for new illness, decrement existing sick time
      Staff.advanceExperience();        // increment weeksEmployed for all staff
      Staff.applyInflation();           // grow each employee's costOfLiving by one week of annual inflation
      Staff.updateMoods();              // recalculate mood from salary vs costOfLiving
      Staff.processQuits();             // remove employees whose mood hit 0
      Staff.advancePostings();          // increment weeksActive for all postings
      Staff.generateCandidates();       // new applicants per round when postings exist
      Staff.advanceCandidates();        // withdrawal check, then increment weeksAsCandidate
    }
    const merchItemsSold = Unlock.MERCHANDISE ? shopItemsSold : 0;
    this.weeklyNetMess = Math.max(0, this.calcMessGenerated(weeklyAttendance, food.mealsSold, merchItemsSold) - Staff.calcJanitorCapacity());
    this.distributeMessToTiles(
      weeklyAttendance * Population.MESS_GUEST_RATE,
      merchItemsSold * Population.MESS_ITEM_RATE,
      food.mealsSold * Population.MESS_FOOD_RATE
    );
    this.mealSatisfaction = !Unlock.FOOD ? 1
      : food.mealsWanted > 0
      ? Math.min(1, 0.5 + 0.5 * food.mealsServed / food.mealsWanted)
      : 0.5;
    this.calcExcitement(weeklyAttendance); // uses this round's mess, security, and meal satisfaction
    this.advancePriceExhaustion();    // decay price fatigue by 1
    if (Unlock.SECURITY) Security.advanceOpinion(security.unhandled); // decay then add unhandled incidents
    const populationEvents = Population.populationEvents.map(e => ({ ...e }));
    Population.tickEvents();          // tick population event modifiers toward 0
    Population.decayFavor();          // nudge all bracket favors back toward 1.0

    const marketingCosts          = this.roundMarketingCosts;
    this.roundMarketingCosts       = 0;
    const merchandiseCosts         = this.roundMerchandiseCosts;
    this.roundMerchandiseCosts     = 0;
    const parkingAmenityCosts      = this.roundParkingAmenityCosts;
    this.roundParkingAmenityCosts  = 0;
    Marketing.tickCampaigns();
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
      altTransportVisitors: parking.altTransportVisitors,
      busRiders:            parking.busRiders,
      busCost,
      parkingSpendingMultiplier: parking.spendingMultiplier,
      shopRevenue,
      foodRevenue,
      discountLoss: Discounts.lastRoundCost,
      totalIncome: gateRevenue + parkingRevenue + shopRevenue + foodRevenue,
      staffCosts,
      utilityCosts,
      constructionCosts,
      marketingCosts,
      merchandiseCosts,
      parkingAmenityCosts,
      shopItemsSold,
      loanRepayments,
      totalExpenses: staffCosts + utilityCosts + constructionCosts + busCost + marketingCosts + merchandiseCosts + parkingAmenityCosts + loanRepayments,
      rideEfficiency: this.rideOpinion,
      security: { ...security, opinionAfter: Security.opinion },
      food: { ...food, mealSatisfaction: this.mealSatisfaction },
      populationEvents,
    };
  },

};
