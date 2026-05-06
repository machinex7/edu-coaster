// concessions.js — Concessions panel: menu management and standing delivery orders.

const Concessions = {

  // Flat fee charged on every non-empty standing delivery.
  DELIVERY_FEE: 75,

  // Meals a visitor wants to eat per day (demand multiplier).
  EXPECTED_MEALS_PER_DAY: 2,

  // Base meals a concessions worker can serve per day (boosted by experience tier).
  MEALS_PER_WORKER_PER_DAY: 250,

  // Base sale price per meal in dollars.
  MEAL_BASE_PRICE: 10,

  // Menu item definitions loaded from concessions.json at game start.
  menuItems: [],

  // Player-set sale prices, one entry per menuItem (parallel array).
  prices: [],

  // Units currently in the freezer, one entry per menuItem (parallel array).
  stock: [],

  // Quantities for the next standing delivery, one entry per menuItem (parallel array).
  standingOrder: [],

  // Round on which the current order locks and the player is charged.
  lockRound: 3,

  // Round on which the ordered items arrive in the freezer.
  nextDeliveryRound: 4,

  // When true the standing order persists after each delivery; false clears it.
  repeatOrder: true,

  // Player-created combo meals: [{ name, itemIds: string[], price }].
  meals: [],

  // Set up initial state; called once from initHUD().
  init() {
    this.prices        = this.menuItems.map(item => Math.max(item.cost * 2, item.cost + 2));
    this.stock         = this.menuItems.map(() => 0);
    this.standingOrder = this.menuItems.map(() => 0);
    this.meals         = [];
  },

  // Total active tiles across all placed food shops.
  // Used to cap worker throughput: workers beyond the tile count add no capacity.
  calcFoodTiles() {
    const foodIds = new Set(Shopping.catalog.filter(s => s.shopType === 'food').map(s => s.id));
    return Shopping.installed
      .filter(s => s.status === STATUS.ACTIVE && foodIds.has(s.shopId))
      .reduce((sum, s) => sum + s.footprint.flat().filter(v => v === 1).length, 0);
  },

  // Returns mealsWanted (demand) and mealsServed (capacity).
  // Effective workers = min(active concessions workers, food tiles), picking the
  // most experienced workers first. Each worker contributes MEALS_PER_WORKER_PER_DAY
  // boosted by 20% per experience tier (tier 1–4 → 1.2×–1.8×).
  calcFood(weeklyAttendance) {
    const mealsWanted = weeklyAttendance * this.EXPECTED_MEALS_PER_DAY;
    if (!Unlock.STAFFING) return { mealsWanted, mealsServed: mealsWanted, mealsSold: mealsWanted };

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

  // Returns true when the order inputs should be disabled (week 3 through delivery).
  get isLocked() {
    return stage === STAGE.PLAY && round >= this.lockRound;
  },

  // Called each round from advanceRound() in hud.js.
  onRoundAdvance() {
    if (round === this.lockRound) {
      // Charge the player for the upcoming delivery, but only if something was ordered.
      const subtotal = this.menuItems.reduce((sum, item, i) => sum + this.standingOrder[i] * item.cost, 0);
      if (subtotal > 0) {
        money -= subtotal + this.DELIVERY_FEE;
      }
    }

    if (round === this.nextDeliveryRound) {
      // Add ordered quantities to freezer stock.
      this.menuItems.forEach((item, i) => { this.stock[i] += this.standingOrder[i]; });
      // Advance cycle.
      this.lockRound         += 4;
      this.nextDeliveryRound += 4;
      // Clear or repeat the standing order based on player preference.
      if (!this.repeatOrder) {
        this.standingOrder = this.menuItems.map(() => 0);
      }
    }
  },

  // Build or rebuild the concessions panel content.
  buildPanel() {
    const body = document.getElementById('concessions-panel-body');
    body.innerHTML = '';

    // Tab bar
    const tabs = document.createElement('div');
    tabs.className = 'con-sub-tabs';
    tabs.innerHTML = `
      <button class="con-tab-btn active" data-con-tab="menu">Menu</button>
      <button class="con-tab-btn" data-con-tab="orders">Orders</button>
    `;
    body.appendChild(tabs);

    // Menu view
    const menuView = document.createElement('div');
    menuView.id = 'con-menu-view';
    menuView.className = 'con-view';
    this._buildMenuView(menuView);
    body.appendChild(menuView);

    // Orders view
    const ordersView = document.createElement('div');
    ordersView.id = 'con-orders-view';
    ordersView.className = 'con-view hidden';
    this._buildOrdersView(ordersView);
    body.appendChild(ordersView);

    // Wire tab switching.
    tabs.querySelectorAll('.con-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.querySelectorAll('.con-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.conTab;
        menuView.classList.toggle('hidden', tab !== 'menu');
        ordersView.classList.toggle('hidden', tab !== 'orders');
      });
    });
  },

  // Render the delivery cycle tracker into the given container.
  _buildDeliveryTracker(container) {
    const weekInCycle   = 4 - (this.nextDeliveryRound - round);
    const weeksToLock   = this.lockRound - round;
    const weeksToDel    = this.nextDeliveryRound - round;

    let statusText;
    if (weekInCycle >= 4) {
      statusText = 'Delivering this week';
    } else if (weekInCycle >= 3) {
      statusText = 'Order locked — delivery next week';
    } else {
      const n = weeksToLock;
      statusText = `Order open — locks in ${n} week${n === 1 ? '' : 's'}`;
    }

    const tracker = document.createElement('div');
    tracker.className = 'con-tracker';

    const title = document.createElement('div');
    title.className = 'con-tracker-title';
    title.textContent = `Delivery Cycle — Week ${weekInCycle} of 4`;
    tracker.appendChild(title);

    // Four-step progress indicator.
    const steps = document.createElement('div');
    steps.className = 'con-tracker-steps';
    for (let w = 1; w <= 4; w++) {
      const step = document.createElement('div');
      step.className = 'con-tracker-step';

      const dot = document.createElement('div');
      dot.className = 'con-tracker-dot' + (w <= weekInCycle ? ' con-tracker-dot--done' : '');
      if (w === weekInCycle) dot.classList.add('con-tracker-dot--current');

      const label = document.createElement('div');
      label.className = 'con-tracker-label';
      label.textContent = w === 3 ? 'Lock' : w === 4 ? 'Delivery' : `Wk ${w}`;

      step.appendChild(dot);
      step.appendChild(label);
      steps.appendChild(step);

      if (w < 4) {
        const line = document.createElement('div');
        line.className = 'con-tracker-line' + (w < weekInCycle ? ' con-tracker-line--done' : '');
        steps.appendChild(line);
      }
    }
    tracker.appendChild(steps);

    const status = document.createElement('div');
    status.className = 'con-tracker-status' + (this.isLocked ? ' con-tracker-status--locked' : '');
    status.textContent = statusText;
    tracker.appendChild(status);

    container.appendChild(tracker);
  },

  // Render the orders tab: delivery tracker, item rows, summary, and order mode toggle.
  _buildOrdersView(container) {
    this._buildDeliveryTracker(container);

    // Scrollable list section.
    const list = document.createElement('div');
    list.className = 'con-order-list';

    const header = document.createElement('div');
    header.className = 'con-order-header';
    header.innerHTML = `
      <span>Item</span>
      <span>Cost/Unit</span>
      <span>In Freezer</span>
      <span>Order Qty</span>
      <span class="con-col-right">Line Cost</span>
    `;
    list.appendChild(header);

    // Summary elements defined up front so the refresh helper can close over them.
    const subtotalEl  = document.createElement('div');
    subtotalEl.className = 'con-summary-row';
    const deliveryEl  = document.createElement('div');
    deliveryEl.className = 'con-summary-row';
    const totalEl     = document.createElement('div');
    totalEl.className = 'con-summary-row con-summary-total';

    // Track each item's line-cost display element for refresh.
    const lineCostEls = [];

    this.menuItems.forEach((item, i) => {
      if (item.id === MENU_ITEM.WATER_CUP) return;

      const row = document.createElement('div');
      row.className = 'con-order-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'con-order-name';
      nameEl.textContent = item.name;

      const costEl = document.createElement('span');
      costEl.className = 'con-order-cost';
      costEl.textContent = `$${item.cost.toFixed(2)}`;

      const stockEl = document.createElement('span');
      stockEl.className = 'con-order-stock';
      stockEl.textContent = this.stock[i].toLocaleString();

      const qtyInput = document.createElement('input');
      qtyInput.type      = 'number';
      qtyInput.className = 'con-order-input';
      qtyInput.min       = '0';
      qtyInput.step      = '1';
      qtyInput.value     = this.standingOrder[i];
      qtyInput.disabled  = this.isLocked;

      const lineEl = document.createElement('span');
      lineEl.className = 'con-order-line';
      lineCostEls.push({ el: lineEl, index: i });

      qtyInput.addEventListener('input', () => {
        this.standingOrder[i] = Math.max(0, parseInt(qtyInput.value) || 0);
        this._refreshOrderSummary(lineCostEls, subtotalEl, deliveryEl, totalEl);
      });

      row.appendChild(nameEl);
      row.appendChild(costEl);
      row.appendChild(stockEl);
      row.appendChild(qtyInput);
      row.appendChild(lineEl);
      list.appendChild(row);
    });

    container.appendChild(list);

    // Summary section pinned below the scrollable list.
    const summary = document.createElement('div');
    summary.className = 'con-order-summary';
    summary.appendChild(subtotalEl);
    summary.appendChild(deliveryEl);
    summary.appendChild(totalEl);
    container.appendChild(summary);

    this._refreshOrderSummary(lineCostEls, subtotalEl, deliveryEl, totalEl);

    // Order mode radio buttons.
    const modeWrap = document.createElement('div');
    modeWrap.className = 'con-order-mode';

    const repeatLabel = document.createElement('label');
    repeatLabel.className = 'con-mode-label';
    const repeatRadio = document.createElement('input');
    repeatRadio.type    = 'radio';
    repeatRadio.name    = 'con-order-mode';
    repeatRadio.value   = 'repeat';
    repeatRadio.checked = this.repeatOrder;
    repeatLabel.appendChild(repeatRadio);
    repeatLabel.append(' Repeat Order');

    const clearLabel = document.createElement('label');
    clearLabel.className = 'con-mode-label';
    const clearRadio = document.createElement('input');
    clearRadio.type    = 'radio';
    clearRadio.name    = 'con-order-mode';
    clearRadio.value   = 'clear';
    clearRadio.checked = !this.repeatOrder;
    clearLabel.appendChild(clearRadio);
    clearLabel.append(' Clear Order');

    repeatRadio.addEventListener('change', () => { if (repeatRadio.checked) this.repeatOrder = true; });
    clearRadio.addEventListener('change',  () => { if (clearRadio.checked)  this.repeatOrder = false; });

    modeWrap.appendChild(repeatLabel);
    modeWrap.appendChild(clearLabel);
    container.appendChild(modeWrap);
  },

  // Recompute every line cost and the subtotal / delivery fee / total display.
  _refreshOrderSummary(lineCostEls, subtotalEl, deliveryEl, totalEl) {
    let subtotal = 0;
    lineCostEls.forEach(({ el, index }) => {
      const line = this.standingOrder[index] * this.menuItems[index].cost;
      subtotal += line;
      el.textContent = `$${line.toFixed(2)}`;
    });
    // No delivery fee if the entire order is empty.
    const deliveryFee = subtotal > 0 ? this.DELIVERY_FEE : 0;
    const total       = subtotal + deliveryFee;
    subtotalEl.innerHTML = `<span>Subtotal</span><span>$${subtotal.toFixed(2)}</span>`;
    deliveryEl.innerHTML = `<span>Delivery Fee</span><span>$${deliveryFee.toFixed(2)}</span>`;
    totalEl.innerHTML    = `<span>Total</span><span>$${total.toFixed(2)}</span>`;
  },

  // Render the menu item rows into the given container element.
  _buildMenuView(container) {
    // Column header row
    const header = document.createElement('div');
    header.className = 'con-menu-header';
    header.innerHTML = `
      <span>Item</span>
      <span>Price</span>
      <span>Prep</span>
    `;
    container.appendChild(header);

    this.menuItems.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'con-menu-row';

      // Item name
      const nameEl = document.createElement('span');
      nameEl.className = 'con-item-name';
      nameEl.textContent = item.name;

      // Editable price field with a $ prefix
      const priceWrap = document.createElement('span');
      priceWrap.className = 'con-price-wrap';
      priceWrap.innerHTML = '<span class="con-price-dollar">$</span>';
      const priceInput = document.createElement('input');
      priceInput.type  = 'number';
      priceInput.className = 'con-price-input';
      priceInput.min   = '0';
      priceInput.step  = '0.25';
      priceInput.value = this.prices[i].toFixed(2);
      priceInput.addEventListener('change', () => {
        const val = parseFloat(priceInput.value);
        if (!isNaN(val) && val >= 0) {
          this.prices[i] = val;
        } else {
          priceInput.value = this.prices[i].toFixed(2);
        }
      });
      priceWrap.appendChild(priceInput);

      // Prep time (read-only)
      const prepEl = document.createElement('span');
      prepEl.className = 'con-item-prep';
      prepEl.textContent = `${item.prepTime} min`;

      // Freezer stock count (read-only)
      const stockEl = document.createElement('span');
      stockEl.className = 'con-item-stock';
      stockEl.textContent = this.stock[i].toLocaleString();

      row.appendChild(nameEl);
      row.appendChild(priceWrap);
      row.appendChild(prepEl);
      container.appendChild(row);
    });

    // Meals section lives below the solo item rows.
    const mealsSection = document.createElement('div');
    mealsSection.className = 'con-meals-section';
    this._buildMealsSection(mealsSection);
    container.appendChild(mealsSection);
  },

  // Render (or re-render) the saved meals list and the Add Meal button into section.
  _buildMealsSection(section) {
    section.innerHTML = '';

    const divider = document.createElement('div');
    divider.className = 'con-section-divider';
    divider.textContent = 'Combo Meals';
    section.appendChild(divider);

    this.meals.forEach((meal, mi) => {
      section.appendChild(this._makeMealCard(meal, mi, section));
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'con-add-meal-btn';
    addBtn.textContent = '+ Add Meal';
    addBtn.addEventListener('click', () => {
      section.innerHTML = '';
      this._buildMealBuilder(section);
    });
    section.appendChild(addBtn);
  },

  // Build a single saved-meal card that shows chips, an editable price, and a delete button.
  _makeMealCard(meal, mealIndex, section) {
    const card = document.createElement('div');
    card.className = 'con-meal-card';

    // Top row: name, price input, delete button.
    const top = document.createElement('div');
    top.className = 'con-meal-top';

    const nameEl = document.createElement('span');
    nameEl.className = 'con-meal-name';
    nameEl.textContent = meal.name;

    const priceWrap = document.createElement('span');
    priceWrap.className = 'con-price-wrap';
    priceWrap.innerHTML = '<span class="con-price-dollar">$</span>';
    const priceInput = document.createElement('input');
    priceInput.type      = 'number';
    priceInput.className = 'con-price-input';
    priceInput.min       = '0';
    priceInput.step      = '0.25';
    priceInput.value     = meal.price.toFixed(2);
    priceInput.addEventListener('change', () => {
      const val = parseFloat(priceInput.value);
      if (!isNaN(val) && val >= 0) meal.price = val;
      else priceInput.value = meal.price.toFixed(2);
    });
    priceWrap.appendChild(priceInput);

    const deleteBtn = document.createElement('button');
    deleteBtn.className   = 'con-meal-delete';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => {
      this.meals.splice(mealIndex, 1);
      this._buildMealsSection(section);
    });

    top.appendChild(nameEl);
    top.appendChild(priceWrap);
    top.appendChild(deleteBtn);
    card.appendChild(top);

    // Item chips: show "Name ×N" when count > 1, just "Name" when count is 1.
    const chips = document.createElement('div');
    chips.className = 'con-meal-chips';
    meal.items.forEach(({ id, count }) => {
      const item = this.menuItems.find(m => m.id === id);
      if (!item) return;
      const chip = document.createElement('span');
      chip.className   = 'con-meal-chip';
      chip.textContent = count > 1 ? `${item.name} ×${count}` : item.name;
      chips.appendChild(chip);
    });
    card.appendChild(chips);

    return card;
  },

  // Render the inline meal builder form into section.
  _buildMealBuilder(section) {
    const builder = document.createElement('div');
    builder.className = 'con-builder';

    // Meal name input.
    const nameInput = document.createElement('input');
    nameInput.type        = 'text';
    nameInput.className   = 'con-builder-name';
    nameInput.placeholder = 'Meal name (optional)';
    nameInput.maxLength   = 40;
    builder.appendChild(nameInput);

    // Per-item count rows. counts maps item id → quantity (0 = not included).
    const counts = {};
    this.menuItems.forEach(item => { counts[item.id] = 0; });

    // Price input defined before the item rows so count handlers can reference it.
    const priceInput = document.createElement('input');
    priceInput.type      = 'number';
    priceInput.className = 'con-price-input';
    priceInput.min       = '0';
    priceInput.step      = '0.25';
    priceInput.value     = '0.00';
    priceInput.addEventListener('input', () => { priceInput.dataset.edited = '1'; });

    // Recalculate the suggested price from current counts.
    const updateSuggestedPrice = () => {
      if (priceInput.dataset.edited) return;
      const sum = this.menuItems.reduce((s, item, i) => s + counts[item.id] * this.prices[i], 0);
      priceInput.value = sum.toFixed(2);
    };

    const countsGrid = document.createElement('div');
    countsGrid.className = 'con-builder-counts';

    this.menuItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'con-builder-count-row';

      const label = document.createElement('span');
      label.className   = 'con-builder-count-label';
      label.textContent = item.name;

      const decBtn = document.createElement('button');
      decBtn.type      = 'button';
      decBtn.className = 'con-builder-count-btn';
      decBtn.textContent = '−';

      const countEl = document.createElement('span');
      countEl.className   = 'con-builder-count-val';
      countEl.textContent = '0';

      const incBtn = document.createElement('button');
      incBtn.type      = 'button';
      incBtn.className = 'con-builder-count-btn';
      incBtn.textContent = '+';

      const update = () => {
        countEl.textContent = counts[item.id];
        row.classList.toggle('con-builder-count-row--active', counts[item.id] > 0);
        updateSuggestedPrice();
      };

      decBtn.addEventListener('click', () => {
        if (counts[item.id] > 0) { counts[item.id]--; update(); }
      });
      incBtn.addEventListener('click', () => {
        counts[item.id]++;
        update();
      });

      row.appendChild(label);
      row.appendChild(decBtn);
      row.appendChild(countEl);
      row.appendChild(incBtn);
      countsGrid.appendChild(row);
    });
    builder.appendChild(countsGrid);

    // Footer: price, Save, Cancel.
    const footer = document.createElement('div');
    footer.className = 'con-builder-footer';

    const priceWrap = document.createElement('span');
    priceWrap.className = 'con-price-wrap';
    priceWrap.innerHTML = '<span class="con-price-dollar">$</span>';
    priceWrap.appendChild(priceInput);

    const saveBtn = document.createElement('button');
    saveBtn.type        = 'button';
    saveBtn.className   = 'con-builder-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      const price = parseFloat(priceInput.value);
      const items = this.menuItems
        .filter(item => counts[item.id] > 0)
        .map(item => ({ id: item.id, count: counts[item.id] }));
      if (items.length === 0 || isNaN(price) || price < 0) return;
      const name = nameInput.value.trim() ||
        items.map(({ id, count }) => {
          const item = this.menuItems.find(m => m.id === id);
          return count > 1 ? `${count}× ${item.name}` : item.name;
        }).join(' + ');
      this.meals.push({ name, items, price });
      this._buildMealsSection(section);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type        = 'button';
    cancelBtn.className   = 'con-builder-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this._buildMealsSection(section));

    footer.appendChild(priceWrap);
    footer.appendChild(saveBtn);
    footer.appendChild(cancelBtn);
    builder.appendChild(footer);

    section.appendChild(builder);
  },
};
