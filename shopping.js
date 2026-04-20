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
  BUYER_RATE:     0.20,  // fraction of weekly visitors who purchase
  BASE_SPEND:     30,    // $ base spend per buyer
  THEFT_RATE:     0.01,  // fraction of non-buyers who attempt to shoplift
  THEFT_LOSS_PER: 50,    // $ lost per unhandled shoplifter

  // ── Revenue ────────────────────────────────────────────────────────────────
  calcRevenue(weeklyAttendance) {
    return Math.round(weeklyAttendance * this.BUYER_RATE * (this.BASE_SPEND + this.merchandiseUpcharge));
  },

  // ── Theft ──────────────────────────────────────────────────────────────────
  // Called by Security.calcIncidents() to get the raw shoplifter count.
  calcTheftIncidents(weeklyAttendance) {
    return Math.floor(weeklyAttendance * (1 - this.BUYER_RATE) * this.THEFT_RATE);
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
