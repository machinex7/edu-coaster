// shopping.js — Shop catalog, installed state, pricing, revenue, and theft.
//
// Adding a new income source or theft mechanic: add constants and a calc
// method here, then call it from Finance.processRound().

const Shopping = {

  // ── Catalog & placed shops ─────────────────────────────────────────────────
  catalog:   [],  // loaded from shops.json in init()
  installed: [],  // placed shop records (same shape as installedRides)

  // ── Pricing ────────────────────────────────────────────────────────────────
  merchandiseUpcharge: 0,  // $ added on top of BASE_SPEND per buyer

  // ── Constants ──────────────────────────────────────────────────────────────
  BASE_SPEND:              30,   // $ base spend per buyer (food/misc; not used in merch calcRevenue)
  WORKERS_PER_STORE:        2,   // merchandise attendants required per active store
  STORAGE_PER_SHOP:       200,   // inventory slots provided per active merchandise tile
  EXPECTED_MEALS_PER_DAY:   2,   // meals a visitor wants to eat per day
  MEALS_PER_WORKER_PER_DAY: 250, // meals a concessions worker can serve per day (base)
  MEAL_BASE_PRICE:          10,  // $ base price per meal sold

  // Maximum price each income bracket will pay, positionally aligned to
  // Population.INCOME_BRACKETS (Low Income → High Income).
  INCOME_LIMITS: [6, 10, 20, 40, Infinity],

  // Total active tiles across all placed merchandise shops.
  // Used to scale revenue and theft: more floor space = more shoppers and more risk.
  calcMerchandiseTiles() {
    const merchandiseIds = new Set(this.catalog.filter(s => s.shopType === 'merchandise').map(s => s.id));
    return this.installed
      .filter(s => s.status === STATUS.ACTIVE && merchandiseIds.has(s.shopId))
      .reduce((sum, s) => sum + s.footprint.flat().filter(v => v === 1).length, 0);
  },

  // Maximum total inventory items the park can hold across all merchandise tiles.
  calcInventoryCapacity() {
    return this.calcMerchandiseTiles() * this.STORAGE_PER_SHOP;
  },

  // Workers needed to fully staff all active merchandise shops.
  calcWorkersNeeded() {
    const merchandiseIds = new Set(this.catalog.filter(s => s.shopType === 'merchandise').map(s => s.id));
    const numStores = this.installed.filter(s => s.status === STATUS.ACTIVE && merchandiseIds.has(s.shopId)).length;
    return numStores * this.WORKERS_PER_STORE;
  },

  // staffRatio: 0–1, cuts revenue proportionally when understaffed.
  // theftMultiplier: ≥1, each missing worker adds 25% to the theft rate.
  calcStaffingState() {
    const needed  = this.calcWorkersNeeded();
    const actual  = Staff.roster.filter(s => s.jobId === JOB.MERCHANDISE_ATTENDANT && s.weeksOut === 0).length;
    const deficit = Math.max(0, needed - actual);
    return {
      staffRatio:      needed > 0 ? Math.min(1, actual / needed) : 1,
      theftMultiplier: 1 + 0.25 * deficit,
    };
  },

  // ── Per-round item stats (reset by calcRevenue at the start of each round) ──
  _roundItemStats: [],

  _resetRoundItemStats() {
    this._roundItemStats = merchandise.map(() => ({
      salesRevenue: 0, salesCount: 0, theftValue: 0, theftCount: 0,
    }));
  },

  // ── Revenue ────────────────────────────────────────────────────────────────
  // Demand-driven: desire per category (from demographics) × affordability
  // (income brackets that can cover the shelf price) → purchase attempts per
  // item → sell from inventory, deducting stock and accumulating revenue.
  calcRevenue(weeklyAttendance) {
    this._resetRoundItemStats();
    if (this.calcMerchandiseTiles() === 0) return { revenue: 0, itemsSold: 0 };
    const { staffRatio } = this.calcStaffingState();

    // Step 1 — category desire: flat 1 baseline + demographic contributions.
    const desire = { toy: 1, practical: 1, apparel: 1, souvenir: 1 };
    const bracketArrays = [
      Population.AGE_BRACKETS,
      Population.INCOME_BRACKETS,
      Population.DISTANCE_BRACKETS,
      Population.HOUSEHOLD_SIZES,
      Population.AREA_TYPES,
      Population.EMPLOYMENT_STATUS,
      Population.VISITOR_STATUS,
    ];
    for (const arr of bracketArrays) {
      for (const bracket of arr) {
        desire[bracket.preferredCategory] += bracket.chance * (bracket.favor ?? 1);
      }
    }

    // Step 2 — per-item: affordability × desire → attempts → sell from stock.
    const weatherItemMults = WEATHER_MERCHANDISE_MULTIPLIERS[nextWeekForecast] ?? {};
    let totalRevenue = 0;
    let totalSold    = 0;
    for (let i = 0; i < merchandise.length; i++) {
      const item = merchandise[i];
      const inv  = merchandiseInventory[i];
      if (inv.count <= 0) continue;

      const shelfPrice = inv.price + this.merchandiseUpcharge;

      // Sum chance of income brackets whose limit covers the shelf price.
      let afford = 0;
      for (let j = 0; j < Population.INCOME_BRACKETS.length; j++) {
        if (shelfPrice <= this.INCOME_LIMITS[j]) {
          afford += Population.INCOME_BRACKETS[j].chance;
        }
      }
      if (afford === 0) continue;

      const weatherMult = weatherItemMults[item.id] ?? 1;
      const attempts = Math.round(
        desire[item.category] * afford * weeklyAttendance * Population.BUYER_RATE * staffRatio * weatherMult
      );
      const sold    = Math.min(attempts, inv.count);
      inv.count    -= sold;
      totalRevenue += sold * shelfPrice;
      totalSold    += sold;
      this._roundItemStats[i].salesRevenue += sold * shelfPrice;
      this._roundItemStats[i].salesCount   += sold;
    }

    return { revenue: Math.round(totalRevenue), itemsSold: totalSold };
  },

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Advance all pending orders by one week. Returns { itemName, count }[] for
  // every order that arrived so the caller can notify the player.
  tickOrders() {
    const arrived = [];
    orders = orders.filter(order => {
      order.weeksRemaining--;
      if (order.weeksRemaining <= 0) {
        merchandiseInventory[order.itemIndex].count += order.count;
        arrived.push({ itemName: order.itemName, count: order.count });
        return false;
      }
      return true;
    });
    return arrived;
  },

  // ── Theft ──────────────────────────────────────────────────────────────────
  // Called by Security.calcIncidents() to get the raw shoplifter count.
  // Capped at total stock — can't steal what isn't there.
  calcTheftIncidents(weeklyAttendance) {
    const tiles = this.calcMerchandiseTiles();
    if (tiles === 0) return 0;
    const { theftMultiplier } = this.calcStaffingState();
    const raw   = Math.floor(weeklyAttendance * (1 - Population.BUYER_RATE) * Population.THEFT_RATE * Math.sqrt(tiles) * theftMultiplier);
    const stock = merchandiseInventory.reduce((s, inv) => s + inv.count, 0);
    return Math.min(raw, stock);
  },

  // Called by Security.calcIncidents() with the count of unhandled shop incidents.
  // Randomly removes one item per theft from in-stock inventory; returns the
  // total shelf value of everything stolen.
  handleThefts(count) {
    let totalValue   = 0;
    let itemsStolen  = 0;
    for (let i = 0; i < count; i++) {
      const eligible = merchandiseInventory
        .map((inv, idx) => ({ inv, idx }))
        .filter(({ inv }) => inv.count > 0);
      if (eligible.length === 0) break;
      const { inv, idx } = eligible[Math.floor(Math.random() * eligible.length)];
      const stolenPrice   = inv.price + this.merchandiseUpcharge;
      inv.count = Math.max(0, inv.count - 1);
      totalValue += stolenPrice;
      itemsStolen++;
      this._roundItemStats[idx].theftValue += stolenPrice;
      this._roundItemStats[idx].theftCount++;
    }
    return { value: totalValue, itemsStolen };
  },

  // ── Food ───────────────────────────────────────────────────────────────────
  calcFoodTiles() {
    const foodIds = new Set(this.catalog.filter(s => s.shopType === 'food').map(s => s.id));
    return this.installed
      .filter(s => s.status === STATUS.ACTIVE && foodIds.has(s.shopId))
      .reduce((sum, s) => sum + s.footprint.flat().filter(v => v === 1).length, 0);
  },

  // Returns mealsWanted (demand) and mealsServed (capacity).
  // Effective workers = min(active concessions workers, food tiles), picking the
  // most experienced workers first. Each worker contributes MEALS_PER_WORKER_PER_DAY
  // boosted by 20% per experience tier (tier 1–4 → 1.2×–1.8×).
  calcFood(weeklyAttendance) {
    const mealsWanted = weeklyAttendance * this.EXPECTED_MEALS_PER_DAY;

    const foodTiles = this.calcFoodTiles();
    const workers = Staff.roster
      .filter(s => s.jobId === JOB.CONCESSIONS_WORKER && s.weeksOut === 0)
      .sort((a, b) => Staff.getExperienceTier(b.weeksEmployed).tier - Staff.getExperienceTier(a.weeksEmployed).tier);

    const effectiveCount = Math.min(workers.length, foodTiles);
    const mealsServed = Math.floor(
      workers.slice(0, effectiveCount).reduce((sum, s) => {
        const { tier } = Staff.getExperienceTier(s.weeksEmployed);
        return sum + this.MEALS_PER_WORKER_PER_DAY * (1 + 0.2 * tier);
      }, 0)
    );

    const mealsSold = Math.min(mealsWanted, mealsServed);
    return { mealsWanted, mealsServed, mealsSold };
  },

  // ── Construction panel ─────────────────────────────────────────────────────
  buildCatalog() {
    const list = document.getElementById('shop-list');
    this.catalog.forEach(shop => list.appendChild(createItemCard(shop, CATEGORY.SHOP)));
  },

};
