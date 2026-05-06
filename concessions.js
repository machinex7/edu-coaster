// concessions.js — Concessions panel: menu management and standing delivery orders.

const Concessions = {

  // Flat fee charged on every standing delivery regardless of order size.
  DELIVERY_FEE: 75,

  // Menu item definitions loaded from concessions.json at game start.
  menuItems: [],

  // Player-set sale prices, one entry per menuItem (parallel array).
  prices: [],

  // Units currently in the freezer, one entry per menuItem (parallel array).
  stock: [],

  // Quantities for the next standing delivery, one entry per menuItem (parallel array).
  standingOrder: [],

  // Set up initial state; called once from initHUD().
  init() {
    this.prices       = this.menuItems.map(item => Math.max(item.cost * 2, item.cost + 2));
    this.stock        = this.menuItems.map(() => 0);
    this.standingOrder = this.menuItems.map(() => 0);
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

  // Render the orders tab: one row per orderable item plus a running subtotal/total.
  _buildOrdersView(container) {
    // Scrollable list section
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

    // Create summary elements up front so the refresh helper can close over them.
    const subtotalEl = document.createElement('div');
    subtotalEl.className = 'con-summary-row';
    const totalEl = document.createElement('div');
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

      const lineEl = document.createElement('span');
      lineEl.className = 'con-order-line';
      lineCostEls.push({ el: lineEl, index: i });

      qtyInput.addEventListener('input', () => {
        this.standingOrder[i] = Math.max(0, parseInt(qtyInput.value) || 0);
        this._refreshOrderSummary(lineCostEls, subtotalEl, totalEl);
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

    const deliveryRow = document.createElement('div');
    deliveryRow.className = 'con-summary-row';
    deliveryRow.innerHTML = `<span>Delivery Fee</span><span>$${this.DELIVERY_FEE.toFixed(2)}</span>`;

    summary.appendChild(subtotalEl);
    summary.appendChild(deliveryRow);
    summary.appendChild(totalEl);
    container.appendChild(summary);

    this._refreshOrderSummary(lineCostEls, subtotalEl, totalEl);
  },

  // Recompute every line cost and the subtotal/total display.
  _refreshOrderSummary(lineCostEls, subtotalEl, totalEl) {
    let subtotal = 0;
    lineCostEls.forEach(({ el, index }) => {
      const line = this.standingOrder[index] * this.menuItems[index].cost;
      subtotal += line;
      el.textContent = `$${line.toFixed(2)}`;
    });
    const total = subtotal + this.DELIVERY_FEE;
    subtotalEl.innerHTML = `<span>Subtotal</span><span>$${subtotal.toFixed(2)}</span>`;
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
      <span class="con-col-right">In Freezer</span>
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
      row.appendChild(stockEl);
      container.appendChild(row);
    });
  },
};
