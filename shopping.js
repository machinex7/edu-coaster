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

  // ── Revenue ────────────────────────────────────────────────────────────────
  calcRevenue(weeklyAttendance) {
    return Math.round(weeklyAttendance * Population.BUYER_RATE * (this.BASE_SPEND + this.merchandiseUpcharge));
  },

  // ── Theft ──────────────────────────────────────────────────────────────────
  // Called by Security.calcIncidents() to get the raw shoplifter count.
  calcTheftIncidents(weeklyAttendance) {
    return Math.floor(weeklyAttendance * (1 - Population.BUYER_RATE) * Population.THEFT_RATE);
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
