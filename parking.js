// parking.js — Parking fee pricing, lot amenities, and bus service.

const Parking = {

  // $ per vehicle; set by player in the Parking panel.
  parkingPrice: 1,

  // Highest parking price confirmed to be within the free zone (≤ inflation-adjusted threshold).
  // null = never confirmed. Advances each round the current price triggers no spending penalty.
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

  // Accumulates parking lot amenity purchase costs paid between round advances; reset each round.
  roundParkingAmenityCosts: 0,

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

};
