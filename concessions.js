// concessions.js — Concessions panel: menu management and standing delivery orders.

const Concessions = {

  // Menu item definitions loaded from concessions.json at game start.
  menuItems: [],

  // Player-set sale prices, one entry per menuItem (parallel array).
  prices: [],

  // Units currently in the freezer, one entry per menuItem (parallel array).
  stock: [],

  // Set up initial state; called once from initHUD().
  init() {
    this.prices = this.menuItems.map(item => Math.max(item.cost * 2, item.cost + 2));
    this.stock  = this.menuItems.map(() => 0);
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

    // Orders view — placeholder until the ordering system is built.
    const ordersView = document.createElement('div');
    ordersView.id = 'con-orders-view';
    ordersView.className = 'con-view hidden';
    ordersView.innerHTML = '<p class="empty-note">Standing orders coming soon.</p>';
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
