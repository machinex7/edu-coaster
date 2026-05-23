// shopping.js — Shop catalog, installed state, pricing, revenue, and theft.
//
// Adding a new income source or theft mechanic: add constants and a calc
// method here, then call it from Finance.processRound().

const Shopping = {

  // ── Catalog & placed shops ─────────────────────────────────────────────────
  catalog:   [],  // loaded from shops.json in game.js init()
  installed: [],  // placed shop records (same shape as installedRides)

  // ── Merchandise catalog & inventory ────────────────────────────────────────
  merchandise:          [],  // loaded from merchandise.json in game.js init()
  merchandiseInventory: [],  // parallel to merchandise: { count, price }

  // ── Suppliers ──────────────────────────────────────────────────────────────
  suppliers:                [],       // loaded from suppliers.json in game.js init()
  unlockedSupplierIds:      new Set(), // supplier IDs the player can currently use
  selectedSupplierByCategory: {},      // category → currently selected supplierId
  unlockedMerchandiseIds:   new Set(), // item IDs the player can stock and sell
  categoryOrderCount:       {},        // category → number of orders placed in that category
  categoryOrderSpend:       {},        // category → total $ spent on orders in that category
  orders:                   [],        // { itemIndex, itemName, count, weeksRemaining }

  // ── Pricing ────────────────────────────────────────────────────────────────
  merchandiseUpcharge: 5,  // $ added on top of BASE_SPEND per buyer

  // ── Constants ──────────────────────────────────────────────────────────────
  BASE_SPEND:              30,   // $ base spend per buyer (food/misc; not used in merch calcRevenue)
  WORKERS_PER_STORE:        2,   // merchandise attendants required per active store
  STORAGE_PER_SHOP:       6000,  // inventory slots provided per active merchandise tile
  WAREHOUSE_CAPACITY:    50000,  // inventory slots added per placed Storage Warehouse

  // Maximum price each income bracket will pay, positionally aligned to
  // Population.INCOME_BRACKETS (Low Income → High Income).
  // Raised by ~$10 to keep behaviour neutral at the default $20 gate price;
  // at runtime half the gate charge is subtracted (visitors spent on entry, so less for merch).
  INCOME_LIMITS: [16, 20, 30, 50, Infinity],

  // Total active tiles across all placed merchandise shops.
  // Used to scale revenue and theft: more floor space = more shoppers and more risk.
  calcMerchandiseTiles() {
    const merchandiseIds = new Set(this.catalog.filter(s => s.shopType === 'merchandise').map(s => s.id));
    return this.installed
      .filter(s => s.status === STATUS.ACTIVE && merchandiseIds.has(s.shopId))
      .reduce((sum, s) => sum + s.footprint.flat().filter(v => v === 1).length, 0);
  },

  // Bonus inventory slots from all placed Storage Warehouse facilities.
  // Warehouses add storage only — no theft risk, no staff requirement.
  calcWarehouseCapacity() {
    return installedFacilities
      .filter(f => f.facilityId === FACILITY_ID.STORAGE_WAREHOUSE && f.status === STATUS.ACTIVE)
      .length * this.WAREHOUSE_CAPACITY;
  },

  // Maximum total inventory items the park can hold: merchandise shop tiles
  // plus any Storage Warehouse bonuses.
  calcInventoryCapacity() {
    return this.calcMerchandiseTiles() * this.STORAGE_PER_SHOP + this.calcWarehouseCapacity();
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
    if (!Unlock.STAFFING) return { staffRatio: 1, theftMultiplier: 1 };
    const needed  = this.calcWorkersNeeded();
    const actual  = Staff.roster.filter(s => s.jobId === JOB.MERCHANDISE_ATTENDANT && s.weeksOut === 0).length;
    const deficit = Math.max(0, needed - actual);
    return {
      staffRatio:      needed > 0 ? Math.min(1, actual / needed) : 1,
      theftMultiplier: 1 + 0.25 * deficit,
    };
  },

  // ── Init ───────────────────────────────────────────────────────────────────
  // Derives inventory and supplier state from the loaded JSON data.
  // Called from game.js init() after merchandise and suppliers are fetched.
  init() {
    this.unlockedMerchandiseIds = new Set(this.merchandise.filter(m => m.startsUnlocked).map(m => m.id));
    this.merchandiseInventory = this.merchandise.map(item => ({
      count: this.unlockedMerchandiseIds.has(item.id) ? 500 : 0,
      price: item.basePrice,
    }));
    const starterSuppliers = this.suppliers.filter(s => s.categoryOrderThreshold === null);
    this.unlockedSupplierIds = new Set(starterSuppliers.map(s => s.id));
    this.selectedSupplierByCategory = Object.fromEntries(starterSuppliers.map(s => [s.category, s.id]));
    this.categoryOrderCount = { toy: 0, practical: 0, apparel: 0, souvenir: 0 };
    this.categoryOrderSpend = { toy: 0, practical: 0, apparel: 0, souvenir: 0 };
    this.orders = [];
  },

  // ── Per-round item stats (reset by calcRevenue at the start of each round) ──
  _roundItemStats: [],

  _resetRoundItemStats() {
    this._roundItemStats = this.merchandise.map(() => ({
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
    const desire = { toy: 0, practical: 0, apparel: 0, souvenir: 0 };
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
    desire.toy = 1 + desire.toy / bracketArrays.length; //normalize
    desire.practical = 1 + desire.toy / bracketArrays.length; //normalize
    desire.apparel = 1 + desire.toy / bracketArrays.length; //normalize
    desire.souvenir = 1 + desire.toy / bracketArrays.length; //normalize

    // Step 2 — per-item: affordability × desire → attempts → sell from stock.
    const weatherItemMults = WEATHER_MERCHANDISE_MULTIPLIERS[nextWeekForecast] ?? {};
    console.log('[Shopping.calcRevenue] desire by category:', JSON.stringify(desire));
    console.log('[Shopping.calcRevenue] weeklyAttendance:', weeklyAttendance, '| BUYER_RATE:', Population.BUYER_RATE, '| staffRatio:', staffRatio, '| forecast:', nextWeekForecast);
    let totalRevenue = 0;
    let totalSold    = 0;
    for (let i = 0; i < this.merchandise.length; i++) {
      const item = this.merchandise[i];
      const inv  = this.merchandiseInventory[i];
      if (!this.unlockedMerchandiseIds.has(item.id) || inv.count <= 0) continue;

      const shelfPrice = inv.price + this.merchandiseUpcharge;

      // Sum chance of income brackets whose limit covers the shelf price.
      // Limits scale with cumulative inflation (visitors' incomes rise with costs),
      // then half the gate charge is subtracted — visitors who already paid a
      // high entry fee have less disposable income for merch.
      const gateExhaustion = Finance.gatePrice / 2;
      let afford = 0;
      for (let j = 0; j < Population.INCOME_BRACKETS.length; j++) {
        if (shelfPrice <= this.INCOME_LIMITS[j] * Population.cumulativeInflation - gateExhaustion) {
          afford += Population.INCOME_BRACKETS[j].chance;
        }
      }
      if (afford === 0) continue;

      const weatherMult  = weatherItemMults[item.id] ?? 1;
      // parkingSpendingMultiplier reduces purchasing propensity when parking fees eat into visitor budgets.
      const parkingMult  = Parking.parkingSpendingMultiplier ?? 1;
      const rawAttempts  = desire[item.category] * afford * weeklyAttendance * Population.BUYER_RATE * staffRatio * weatherMult * parkingMult;
      const attempts = Math.round(rawAttempts);
      console.log(
        `[Shopping.calcRevenue] ${item.id} (${item.category}): desire=${desire[item.category].toFixed(4)}, afford=${afford.toFixed(4)}, attendance=${weeklyAttendance}, BUYER_RATE=${Population.BUYER_RATE}, staffRatio=${staffRatio.toFixed(4)}, weatherMult=${weatherMult}, parkingMult=${parkingMult.toFixed(4)} → raw=${rawAttempts.toFixed(2)}, attempts=${attempts}, stock=${inv.count}`
      );
      const sold    = Math.min(attempts, inv.count);
      inv.count    -= sold;
      totalRevenue += sold * shelfPrice;
      totalSold    += sold;
      this._roundItemStats[i].salesRevenue += sold * shelfPrice;
      this._roundItemStats[i].salesCount   += sold;

      // When weather boosts demand for this item, surface visitor reactions.
      if (weatherMult > 1 && attempts > 0) {
        if (attempts <= inv.count + sold) {
          // Stock was sufficient — happy buyers.
          Finance.feedback.push({ guestCount: sold, comment: `Glad I was able to buy a ${item.name}.` });
        } else {
          // More visitors wanted this item than stock could cover.
          const missed = attempts - sold;
          Finance.feedback.push({ guestCount: missed, comment: `I wish they hadn't run out of ${item.name} stock before I could buy one.` });
        }
      }
    }

    return { revenue: Math.round(totalRevenue), itemsSold: totalSold };
  },

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Advance all pending orders by one week. Returns { itemName, count }[] for
  // every order that arrived so the caller can notify the player.
  tickOrders() {
    const arrived = [];
    this.orders = this.orders.filter(order => {
      order.weeksRemaining--;
      if (order.weeksRemaining <= 0) {
        this.merchandiseInventory[order.itemIndex].count += order.count;
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
    if (!Unlock.MERCHANDISE) return 0;
    const tiles = this.calcMerchandiseTiles();
    if (tiles === 0) return 0;
    const { theftMultiplier } = this.calcStaffingState();
    const raw   = Math.floor(weeklyAttendance * (1 - Population.BUYER_RATE) * Population.THEFT_RATE * Math.sqrt(tiles) * theftMultiplier);
    const stock = this.merchandiseInventory.reduce((s, inv, i) =>
      this.unlockedMerchandiseIds.has(this.merchandise[i].id) ? s + inv.count : s, 0);
    return Math.min(raw, stock);
  },

  // Called by Security.calcIncidents() with the count of unhandled shop incidents.
  // Randomly removes one item per theft from in-stock inventory; returns the
  // total shelf value of everything stolen.
  handleThefts(count) {
    let totalValue   = 0;
    let itemsStolen  = 0;
    for (let i = 0; i < count; i++) {
      const eligible = this.merchandiseInventory
        .map((inv, idx) => ({ inv, idx }))
        .filter(({ inv, idx }) => this.unlockedMerchandiseIds.has(this.merchandise[idx].id) && inv.count > 0);
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

  // ── Construction panel ─────────────────────────────────────────────────────
  buildCatalog() {
    const list = document.getElementById('shop-list');
    this.catalog
      .filter(shop => (Unlock.FOOD || shop.shopType !== 'food') && (Unlock.MERCHANDISE || shop.shopType !== 'merchandise'))
      .forEach(shop => list.appendChild(createItemCard(shop, CATEGORY.SHOP)));
  },

};
