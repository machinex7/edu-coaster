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
  BASE_SPEND:     30,  // $ base spend per buyer
  THEFT_LOSS_PER: 50,  // $ lost per unhandled shoplifter

  // Total active tiles across all placed Merchandise stores.
  // Used to scale revenue and theft: more floor space = more shoppers and more risk.
  calcMerchandiseTiles() {
    return this.installed
      .filter(s => s.shopId === SHOP_ID.MERCHANDISE && s.status === STATUS.ACTIVE)
      .reduce((sum, s) => sum + s.footprint.flat().filter(v => v === 1).length, 0);
  },

  // ── Revenue ────────────────────────────────────────────────────────────────
  // Scales with sqrt(tiles): no store = no revenue; each additional store adds
  // diminishing returns.
  calcRevenue(weeklyAttendance) {
    const tiles = this.calcMerchandiseTiles();
    if (tiles === 0) return 0;
    return Math.round(weeklyAttendance * Population.BUYER_RATE * (this.BASE_SPEND + this.merchandiseUpcharge) * Math.sqrt(tiles));
  },

  // ── Theft ──────────────────────────────────────────────────────────────────
  // Called by Security.calcIncidents() to get the raw shoplifter count.
  // Also scales with sqrt(tiles): no store = nothing to steal.
  calcTheftIncidents(weeklyAttendance) {
    const tiles = this.calcMerchandiseTiles();
    if (tiles === 0) return 0;
    return Math.floor(weeklyAttendance * (1 - Population.BUYER_RATE) * Population.THEFT_RATE * Math.sqrt(tiles));
  },

  // Called by Security.calcIncidents() after determining how many went unhandled.
  calcTheftLoss(unhandledShop) {
    return unhandledShop * this.THEFT_LOSS_PER;
  },

  // ── Construction panel ─────────────────────────────────────────────────────
  buildCatalog() {
    const list = document.getElementById('shop-list');
    this.catalog.forEach(shop => list.appendChild(createItemCard(shop, CATEGORY.SHOP)));
  },

};
