// finance.js — Round-by-round financial and attendance simulation.
//
// Adding new income sources:
//   1. Add a named property and a calc method.
//   2. Call the method in processRound and add the result to money.
//
// Adding new cost sources:
//   Same pattern — calc method, subtract in processRound.

// Max Euclidean tile distance from a shop that receives IDW shopper mess.
const MAX_SHOP_MESS_RADIUS = 5;

const Finance = {

  // ── Park metrics ────────────────────────────────────────────────────────────
  parkSatisfaction:        500,  // satisfied-visitor count from last round; drives next round's demand
  cumulativeAttendance:  0,    // total visitors ever; sqrt of this adds a renown bonus to daily demand
  weeklyNetMess:         0,    // unhandled mess from last round; subtracted from excitement
  mealSatisfaction:      1,    // 0.5–1; penalises excitement when food supply < demand

  // Accumulates campaign launch costs paid between round advances; reset each round.
  roundMarketingCosts: 0,
  // Accumulates merchandise order costs paid between round advances; reset each round.
  roundMerchandiseCosts: 0,
  // Accumulates parking lot amenity purchase costs paid between round advances; reset each round.
  roundParkingAmenityCosts: 0,

  // Smoothed 0–1 score of how well rides are serving current crowds.
  // Starts at 1.0 (perfect); degrades when operators can't keep up with demand.
  rideOpinion: 1.0,

  // Overheard guest comments collected during the round. Each entry is
  // { guestCount, comment }. Cleared at the start of every round.
  feedback: [],

  // instanceId of the security guard drafted as a booth attendant this round, or null.
  // Set by calcGateThroughput() when all booth attendants are out; cleared when they return.
  // Security.calcIncidents() and calcCoverage() skip this guard to avoid double-counting.
  boothFallbackGuardId: null,

  // Security.opinion is in security.js — read here by calcDailyDemand().

  // Guest ride satisfaction: did people get as many rides as they wanted?
  // staffRatio = actual operators / needed operators (capped at 1).
  // Each running ride contributes rph * staffRatio * 7 actual weekly riders,
  // discounted by rideAgeFactor (decays after 5 years). ridesPerPerson is that
  // total divided by weekly attendance. rideOpinion = min(1, ridesPerPerson /
  // DESIRED_RIDES) — 1.0 means guests rode at least as much as they wanted.
  computeRideOpinion(weeklyAttendance) {
    // Broken-down rides had riders last time they ran; zero them out so the display is accurate.
    installedRides
      .filter(r => r.status === STATUS.BROKEN_DOWN)
      .forEach(r => { r.lastRoundRiders = 0; r.lastRoundCapacity = 0; });

    const runningRides = installedRides.filter(r => r.status === STATUS.ACTIVE && isRideConnected(r));
    if (runningRides.length === 0) return;

    const needed     = Staff.rideOperatorsNeeded();
    const actual     = Staff.roster.filter(s => s.jobId === JOB.RIDE_OPERATOR && s.weeksOut === 0).length;
    const staffRatio = !Unlock.STAFFING ? 1 : needed > 0 ? Math.min(1, actual / needed) : 1;

    let totalWeeklyRiders = 0;
    runningRides.forEach(record => {
      const def = rides.find(r => r.id === record.rideId);
      const rph = def?.ridesPerHour ?? 0;
      const cap = def?.riderCapacity ?? 1;
      // Weekly riders = cycles/hr × riders/cycle × park hours/day × 7 days
      record.lastRoundCapacity  = Math.round(rph * cap * PARK_HOURS_PER_DAY * 7);
      record.lastRoundRiders    = Math.round(rph * cap * staffRatio * PARK_HOURS_PER_DAY * 7);
      totalWeeklyRiders        += record.lastRoundRiders * rideAgeFactor(record);
    });

    const ridesPerPerson = weeklyAttendance > 0 ? totalWeeklyRiders / weeklyAttendance : 0;
    // No visitors this round means no bad experiences — keep opinion at perfect.
    this.rideOpinion = weeklyAttendance === 0 ? 1 : Math.min(1, ridesPerPerson / Population.DESIRED_RIDES);

    // Guests who didn't get enough rides become overheard complaints.
    if (weeklyAttendance > 0 && ridesPerPerson < Population.DESIRED_RIDES) {
      const guestCount = Math.round((Population.DESIRED_RIDES - ridesPerPerson) * weeklyAttendance);
      this.feedback.push({ guestCount, comment: "We didn't get to ride as much as we wanted to." });
    }

    console.log(
      '[rides]',
      'weeklyAttendance (param):', weeklyAttendance,
      '| runningRides:', runningRides.length,
      '| totalWeeklyRiders:', totalWeeklyRiders.toFixed(1),
      '| staffRatio:', staffRatio.toFixed(4),
      '| operators:', actual + '/' + needed,
      '| ridesPerPerson:', ridesPerPerson.toFixed(4),
      '| rideOpinion:', this.rideOpinion.toFixed(4)
    );
  },

  // ── Attendance ──────────────────────────────────────────────────────────────

  // Returns how many people want to visit based on last round's excitement.
  // Population.calcDemandMultiplier() scales demand by the ratio of current
  // favorable population (chance × favor × count) to the neutral baseline.
  // Security and mess penalties are applied to excitement at end-of-round instead.
  calcDailyDemand() {
    const eventFactor       = Population.populationEvents.reduce((f, e) => f * (1 + e.modifier / 100), 1);
    const weatherFactor     = 1 - (WEATHER_DEMAND_REDUCTION[nextWeekForecast] ?? 0);
    const demandMultiplier  = Population.calcDemandMultiplier();
    const incidentFactor    = Incidents.demandMultiplier;
    // Renown bonus: word-of-mouth from everyone who has ever visited grows the potential
    // audience over time. Grows as sqrt so early visits matter most and the bonus tapers off.
    const renownBonus       = Math.sqrt(this.cumulativeAttendance);
    const base              = this.parkSatisfaction + renownBonus;
    // Test Runs phase: curious onlookers watching the ride cycle boost attendance slightly.
    const testRunsCount     = installedRides.filter(r =>
      r.status === STATUS.UNDER_CONSTRUCTION && getConstructionPhase(r).phase === 'test_runs'
    ).length;
    const testRunsFactor    = 1 + testRunsCount * 0.04;
    const result            = base * eventFactor * demandMultiplier * weatherFactor * incidentFactor * testRunsFactor;

    if (weatherFactor < 1) {
      const guestCount = Math.round((1 - weatherFactor) * result);
      this.feedback.push({ guestCount, comment: "Wish the weather was better today!" });
    }

    console.log(
      '[demand]',
      'excitement:', this.parkSatisfaction.toFixed(2),
      '| renownBonus:', renownBonus.toFixed(2),
      '| base:', base.toFixed(2),
      '| event:', eventFactor.toFixed(4),
      '| demandMult:', demandMultiplier.toFixed(4),
      '| weather:', weatherFactor.toFixed(4),
      '| incident:', incidentFactor.toFixed(4),
      '| testRuns:', testRunsFactor.toFixed(4),
      '| dailyDemand:', result.toFixed(2)
    );
    return result;
  },

  // Recomputes parkSatisfaction at end of round for use next round.
  // Uses rideOpinion (set by computeRideOpinion this round) as the ride satisfaction factor.
  // Park appeal supplements rideOpinion: 100 appeal points = 1/DESIRED_RIDES bonus, capped at 1.
  // Security opinion and mess density degrade the result.
  // Mess penalty: unhandled mess spread across path tiles; 1.25^(mess per path) as divisor.
  calcExcitement(weeklyAttendance) {
    const appealBonus          = this.calcParkAppeal() / (100 * Population.DESIRED_RIDES);
    // Incident ride multiplier suppresses ride interest (e.g. nausea plague); clamped to [0, 1].
    const rideIncidentMult     = Math.min(1, Math.max(0, Incidents.rideExcitementMultiplier));
    const effectiveRideOpinion = Math.min(1, (this.rideOpinion + appealBonus) * rideIncidentMult);
    const securityFactor       = Unlock.SECURITY ? Math.max(0, 1 - Math.sqrt(Security.opinion) / 100) : 1;
    const messFactor           = Unlock.MESSES   ? this.calcMessFactor() : 1;
    const rawExcitement        = Math.max(0, (weeklyAttendance * effectiveRideOpinion * securityFactor * this.mealSatisfaction) / messFactor);
    // Smooth excitement changes by averaging with the prior week's value.
    const smoothed             = (this.parkSatisfaction + rawExcitement) / 2;
    // Each charity's sponsorship tier contributes 1–5% excitement; charities promote the park to their audience.
    const charityBoostPct      = CHARITIES.reduce((sum, c) => {
      const tier = getSponsorshipTier(Banking.charityDonationsAllTime[c.id] ?? 0);
      return sum + (tier?.boost ?? 0);
    }, 0);
    this.parkSatisfaction      = smoothed * (1 + charityBoostPct / 100);
    console.log(
      '[excitement]',
      'attendance:', weeklyAttendance.toFixed(2),
      '| rideOpinion:', this.rideOpinion.toFixed(4),
      '| appealBonus:', appealBonus.toFixed(4),
      '| rideIncidentMult:', rideIncidentMult.toFixed(4),
      '| effectiveRideOpinion:', effectiveRideOpinion.toFixed(4),
      '| securityFactor:', securityFactor.toFixed(4),
      '| mealSatisfaction:', this.mealSatisfaction.toFixed(4),
      '| messFactor:', messFactor.toFixed(4),
      '| rawExcitement:', rawExcitement.toFixed(2),
      '| charityBoost:', charityBoostPct.toFixed(1) + '%',
      '| parkSatisfaction (smoothed):', this.parkSatisfaction.toFixed(2)
    );
  },

  // How many people can actually enter: booth attendants are the bottleneck.
  // Per attendant: base 500 × mood multiplier (0.8–1.2) × experience multiplier × skill modifier.
  // If all booth attendants are out, the first available security guard steps in at half efficiency;
  // that guard is excluded from security capacity for the round (boothFallbackGuardId tracks them).
  calcGateThroughput() {
    if (!Unlock.STAFFING) return Infinity;
    const attendants = Staff.roster.filter(s => s.jobId === JOB.BOOTH_ATTENDANT && s.weeksOut === 0);
    if (attendants.length > 0) {
      this.boothFallbackGuardId = null;
      return attendants.reduce((sum, s) => {
        const moodMult = 0.8 + (s.mood / 100) * 0.4;
        const { multiplier: expMult } = Staff.getExperienceTier(s.weeksEmployed);
        return sum + 500 * moodMult * expMult * s.skillModifier;
      }, 0);
    }
    // Draft one security guard as a half-efficiency booth attendant.
    const fallback = Staff.roster.find(s => s.jobId === JOB.SECURITY && s.weeksOut === 0);
    if (!fallback) {
      this.boothFallbackGuardId = null;
      return 0;
    }
    this.boothFallbackGuardId = fallback.instanceId;
    const moodMult = 0.8 + (fallback.mood / 100) * 0.4;
    const { multiplier: expMult } = Staff.getExperienceTier(fallback.weeksEmployed);
    return 500 * 0.5 * moodMult * expMult * fallback.skillModifier;
  },

  // Actual daily attendance is whichever is smaller: demand or gate capacity.
  calcDailyAttendance() {
    return Math.min(this.calcDailyDemand(), this.calcGateThroughput());
  },

  // ── Pricing ─────────────────────────────────────────────────────────────────
  gatePrice:    20,  // $ per visitor
  parkingPrice: 10,  // $ per vehicle (only active after PARKING_FEES research)

  // Highest parking price the player has charged that was confirmed to be within the
  // free zone (≤ inflation-adjusted threshold). null = never confirmed. Updated each
  // round when the current price doesn't exceed the threshold.
  knownFreeZone: null,

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
        r.wear += (r.lastRoundRiders ?? 0) * WEAR_PER_RIDER * wearMult * rideWearFactor(r);
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

  // Sum of appeal values across all installed facilities.
  // Each facility's appeal is defined in facilities.json; omitted entries contribute 0.
  calcParkAppeal() {
    return installedFacilities.reduce((sum, f) => {
      const def = facilities.find(d => d.id === f.facilityId);
      return sum + (def?.appeal ?? 0);
    }, 0);
  },

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
        // When bathrooms are disabled by an incident, they provide no proximity benefit —
        // treat every ride as if no bathroom is reachable (maximum distance = GRID_COLS).
        const { dist: realDist } = nearestBathroom(r);
        const dist = Incidents.bathroomsDisabled ? GRID_COLS : realDist;
        return sum + (r.lastRoundRiders ?? 0) * Population.MESS_EXTREME_RIDER_RATE * dist;
      }, 0);

    const fromHighRides = installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r)
                && rides.find(d => d.id === r.rideId)?.intensity === 'high')
      .reduce((sum, r) => {
        const { dist: realDist } = nearestBathroom(r);
        const dist = Incidents.bathroomsDisabled ? GRID_COLS : realDist;
        return sum + (r.lastRoundRiders ?? 0) * Population.MESS_HIGH_RIDER_RATE * dist;
      }, 0);

    const fromConstruction = this.calcFoundationMess();

    return Math.floor(fromGuests + fromShoppers + fromFood + fromExtremeRides + fromHighRides + fromConstruction);
  },

  // Extra mess from rides in Foundation phase: debris on adjacent path/bridge tiles.
  // Only active when the Messes system is unlocked.
  calcFoundationMess() {
    if (!Unlock.MESSES) return 0;
    return installedRides
      .filter(r => r.status === STATUS.UNDER_CONSTRUCTION && getConstructionPhase(r).phase === 'foundation')
      .reduce((sum, record) => sum + countAdjacentPathBridgeTiles(record) * FOUNDATION_MESS_PER_PATH, 0);
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
      const cost = (def?.utilityCost ?? 0) * Population.utilityMultiplier * Incidents.utilityCostMultiplier;
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
      const cost = (def?.utilityCost ?? 0) * Population.utilityMultiplier * Incidents.utilityCostMultiplier;
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

    return buildingValue + inventoryValue + money + Banking.savingsBalance + Banking.mmBalance;
  },

  // ── Round processing ─────────────────────────────────────────────────────────
  // Called once per round advancement. Order matters: collect income before
  // deducting costs so the budget display reflects net change.
  processRound() {
    this.feedback = [];               // clear overheard comments from previous round

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

    // Track the highest price confirmed to be within the free zone so the panel
    // can reveal it progressively. Only advance when the current price didn't
    // trigger a spending penalty (i.e. it was ≤ the real threshold).
    if (Research.completed.has(RESEARCH_ID.PARKING_FEES) && parking.spendingMultiplier >= 1) {
      this.knownFreeZone = Math.max(this.knownFreeZone ?? 0, this.parkingPrice);
    }

    // Always at least 35 visitors per week — a few souls wander in regardless.
    // Subtract net no-shows (0 if bus is running) before downstream calculations.
    // Bus riders are added back in since they do attend.
    // Paying visitors only — gate revenue is calculated on this figure.
    const weeklyAttendance  = Math.max(35, Math.round(daily * 7) - parking.noShowVisitors);

    // Members enter free (no gate charge) and free-parking plans skip parking fees.
    // Add their headcount so shopping, food, security, and excitement all see the
    // full park population this round.
    const { attendance: memberAttendance } = Membership.calcMemberAttendance();
    const totalAttendance   = weeklyAttendance + memberAttendance;
    this.cumulativeAttendance += totalAttendance;

    const gateRevenue       = this.calcGateRevenue(daily);
    // Non-free-parking members drive in and pay the standard rate; they're
    // committed visitors so there's no price-sensitivity or no-show risk.
    // Only applies once parking fees research is unlocked (same gate as paying visitors).
    const memberParkingRevenue = Research.completed.has(RESEARCH_ID.PARKING_FEES)
      ? Membership.paidParkingVehiclesThisRound * this.parkingPrice : 0;
    const parkingRevenue    = parking.revenue + memberParkingRevenue;
    const { revenue: shopRevenue, itemsSold: shopItemsSold } = Shopping.calcRevenue(totalAttendance);
    const food      = Concessions.calcFood(totalAttendance);
    const foodRevenue = food.revenue;
    const security = Security.calcIncidents(totalAttendance, dailyDemand, dailyThroughput);
    // Store for the presidential-visit challenge condition evaluated next round.
    Incidents.lastRoundUnhandled = security.unhandled;

    // ── Membership benefit costs ──────────────────────────────────────────────
    // The park foregoes revenue on four fronts for members.  Each is computed as
    // a gross benefit value so the income lines stay at full-price amounts and the
    // membership program's total cost appears as a single opposing expense.
    //
    //   Admission  — members enter free; gross up gate revenue then subtract.
    //   Parking    — free-parking plans skip the fee; gross up parking then subtract.
    //   Food       — discount pct applied to members' proportional share of food revenue.
    //   Merch      — same pattern for merchandise revenue.
    const memberFraction        = totalAttendance > 0 ? memberAttendance / totalAttendance : 0;
    const memberAdmissionLoss   = Math.round(memberAttendance * this.gatePrice);
    const freeParkingLoss       = Research.completed.has(RESEARCH_ID.PARKING_FEES)
      ? Math.round(Membership.freeParkingVisitsThisRound * this.parkingPrice) : 0;
    const memberFoodDiscountLoss  = Math.round(foodRevenue * memberFraction * Membership.foodDiscountFractionThisRound);
    const memberMerchDiscountLoss = Math.round(shopRevenue * memberFraction * Membership.merchDiscountFractionThisRound);
    const memberBenefitLoss     = memberAdmissionLoss + freeParkingLoss + memberFoodDiscountLoss + memberMerchDiscountLoss;

    // Gross revenues — what each stream would earn if members paid full price.
    const grossGateRevenue    = gateRevenue + memberAdmissionLoss;
    const grossParkingRevenue = parkingRevenue + freeParkingLoss;

    // Income — gross amounts added, all benefit costs subtracted as one line item
    money += grossGateRevenue;
    money += grossParkingRevenue;
    money += shopRevenue;
    money += foodRevenue;
    money -= memberBenefitLoss;

    // Costs — income applied first so ability-to-pay reflects this week's revenue
    const busCost = (this.busEnabled && Research.completed.has(RESEARCH_ID.BUS_SERVICE))
      ? this.BUS_WEEKLY_COST : 0;
    money -= busCost;
    const loanRepayments    = Banking.processLoanRepayments();
    const locInterestExpense = Banking.processLocInterest();
    const staffCosts        = this.calcStaffCosts();
    const utilityCosts      = this.payUtilityCosts();
    const constructionCosts = processConstruction();  // skips progress on unaffordable builds
    processDemolition();              // advances demolition timers, clears finished structures
    Banking.processCovenantBreaches();   // collect any pending breach fees and retire those covenants
    Banking.processActiveCovenants(totalAttendance);   // check all active covenant conditions

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
    this.weeklyNetMess = Math.max(0, this.calcMessGenerated(totalAttendance, food.mealsSold, merchItemsSold) - Staff.calcJanitorCapacity());
    this.distributeMessToTiles(
      totalAttendance * Population.MESS_GUEST_RATE,
      merchItemsSold * Population.MESS_ITEM_RATE,
      food.mealsSold * Population.MESS_FOOD_RATE
    );
    this.mealSatisfaction = !Unlock.FOOD ? 1
      : food.mealsWanted > 0
      ? Math.min(1, 0.5 + 0.5 * food.mealsServed / food.mealsWanted)
      : 0.5;
    this.calcExcitement(totalAttendance); // uses this round's mess, security, and meal satisfaction

    // Membership sales: must run after calcExcitement() so Finance.parkSatisfaction
    // already reflects this round's visitor experience (not last round's).
    // Uses paying attendance only — existing members can't rebuy their own plan.
    const membershipRevenue = Membership.calcSales(weeklyAttendance);
    money += membershipRevenue;

    // Savings and money market interest: credited to each account balance, not to cash directly.
    const savingsInterestIncome = Banking.processSavingsInterest();
    const mmInterestIncome      = Banking.processMmInterest();

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
      weeklyAttendance: totalAttendance,
      memberAttendance,
      gateRevenue:   grossGateRevenue,
      parkingRevenue: grossParkingRevenue,
      altTransportVisitors: parking.altTransportVisitors,
      busRiders:            parking.busRiders,
      busCost,
      parkingSpendingMultiplier: parking.spendingMultiplier,
      shopRevenue,
      foodRevenue,
      discountLoss: Discounts.lastRoundCost,
      membershipRevenue,
      memberBenefitLoss,
      savingsInterestIncome,
      mmInterestIncome,
      totalIncome: grossGateRevenue + grossParkingRevenue + shopRevenue + foodRevenue + membershipRevenue + savingsInterestIncome + mmInterestIncome,
      staffCosts,
      utilityCosts,
      constructionCosts,
      marketingCosts,
      merchandiseCosts,
      parkingAmenityCosts,
      shopItemsSold,
      loanRepayments,
      locInterestExpense,
      totalExpenses: staffCosts + utilityCosts + constructionCosts + busCost + marketingCosts + merchandiseCosts + parkingAmenityCosts + loanRepayments + locInterestExpense + memberBenefitLoss,
      rideEfficiency: this.rideOpinion,
      security: { ...security, opinionAfter: Security.opinion },
      food: { ...food, mealSatisfaction: this.mealSatisfaction },
      populationEvents,
    };
  },

};
