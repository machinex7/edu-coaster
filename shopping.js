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
  BASE_SPEND:              30,   // $ base spend per buyer
  THEFT_LOSS_PER:          50,   // $ lost per unhandled shoplifter
  WORKERS_PER_STORE:        2,   // merchandise attendants required per active store
  EXPECTED_MEALS_PER_DAY:   2,   // meals a visitor wants to eat per day
  MEALS_PER_WORKER_PER_DAY: 250, // meals a concessions worker can serve per day (base)
  MEAL_BASE_PRICE:          10,  // $ base price per meal sold

  // Total active tiles across all placed merchandise shops.
  // Used to scale revenue and theft: more floor space = more shoppers and more risk.
  calcMerchandiseTiles() {
    const merchandiseIds = new Set(this.catalog.filter(s => s.shopType === 'merchandise').map(s => s.id));
    return this.installed
      .filter(s => s.status === STATUS.ACTIVE && merchandiseIds.has(s.shopId))
      .reduce((sum, s) => sum + s.footprint.flat().filter(v => v === 1).length, 0);
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

  // ── Revenue ────────────────────────────────────────────────────────────────
  calcRevenue(weeklyAttendance) {
    const tiles = this.calcMerchandiseTiles();
    if (tiles === 0) return 0;
    const { staffRatio } = this.calcStaffingState();
    return Math.round(weeklyAttendance * Population.BUYER_RATE * (this.BASE_SPEND + this.merchandiseUpcharge) * Math.sqrt(tiles) * staffRatio);
  },

  // ── Theft ──────────────────────────────────────────────────────────────────
  // Called by Security.calcIncidents() to get the raw shoplifter count.
  calcTheftIncidents(weeklyAttendance) {
    const tiles = this.calcMerchandiseTiles();
    if (tiles === 0) return 0;
    const { theftMultiplier } = this.calcStaffingState();
    return Math.floor(weeklyAttendance * (1 - Population.BUYER_RATE) * Population.THEFT_RATE * Math.sqrt(tiles) * theftMultiplier);
  },

  // Called by Security.calcIncidents() after determining how many went unhandled.
  calcTheftLoss(unhandledShop) {
    return unhandledShop * this.THEFT_LOSS_PER;
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
