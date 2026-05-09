// ── Business Research ──────────────────────────────────────────────────────
const Research = {
  items: [],
  completed: new Set(),
  activeId: null,
  progress: {},  // { [id]: pointsSpent }

  load() {
    return fetch('research.json')
      .then(r => r.json())
      .then(data => { this.items = data; });
  },

  // Points contributed per week. Passive base is 0.5 pts/wk regardless of BA count.
  // Each active BA contributes an additional 2 + 0.4 × their tier (1–4).
  _researchRate() {
    const PASSIVE = 0.5;
    if (!Unlock.STAFFING) return PASSIVE;
    return Staff.roster
      .filter(s => s.jobId === JOB.BUSINESS_ANALYST && s.weeksOut === 0)
      .reduce((sum, ba) => {
        const { tier } = Staff.getExperienceTier(ba.weeksEmployed);
        return sum + 2 + 0.4 * tier;
      }, PASSIVE);
  },

  // Weeks to finish item from its current progress state, minimum 1.
  _weeksRemaining(item) {
    const rate = this._researchRate();
    if (rate === 0) return Infinity;
    const spent = this.progress[item.id] || 0;
    const remaining = Math.max(0, item.cost - spent);
    if (remaining === 0) return 0;
    return Math.max(1, Math.ceil(remaining / rate));
  },

  // Called once per round. Advances progress on the active item.
  tickResearch() {
    if (!this.activeId) return;
    const item = this.items.find(i => i.id === this.activeId);
    if (!item || this.completed.has(this.activeId) || this._isFeatureLocked(item)) {
      this.activeId = null;
      return;
    }

    const rate = this._researchRate();
    if (rate === 0) return;

    this.progress[this.activeId] = (this.progress[this.activeId] || 0) + rate;

    if (this.progress[this.activeId] >= item.cost) {
      this.completed.add(this.activeId);
      delete this.progress[this.activeId];
      const name = item.name;
      this.activeId = null;
      Notifications.push({
        label: 'Research',
        message: `Research complete: ${name}`,
        action: () => openPanel('research'),
      });
    }
  },

  // Called after each round if panel is open.
  refreshPanel() {
    if (document.getElementById('research-cols')) this._updatePanel();
  },

  // Returns true if the item belongs to a feature that isn't unlocked yet.
  _isFeatureLocked(item) {
    return item.feature && !Unlock[item.feature];
  },

  _getDepth(id) {
    const item = this.items.find(i => i.id === id);
    if (!item || !item.requires.length) return 0;
    return Math.max(...item.requires.map(r => this._getDepth(r))) + 1;
  },

  // Ordered group definitions matching unlock categories; null feature = always-visible General group.
  _GROUP_ORDER: [
    { feature: null,          label: 'General' },
    { feature: 'STAFFING',    label: 'Staffing' },
    { feature: 'MESSES',      label: 'Messes' },
    { feature: 'MERCHANDISE', label: 'Merchandise' },
    { feature: 'SECURITY',    label: 'Security' },
    { feature: 'FOOD',        label: 'Food & Dining' },
    { feature: 'BANKING',     label: 'Banking' },
    { feature: 'WEAR',        label: 'Wear & Maintenance' },
    { feature: 'MARKETING',   label: 'Marketing' },
  ],

  // Partitions visible items into per-feature groups, each with depth-based columns.
  _buildGroups() {
    const visible = this.items.filter(item => !this._isFeatureLocked(item));
    return this._GROUP_ORDER.map(({ feature, label }) => {
      const items = visible.filter(i => (i.feature ?? null) === feature);
      if (items.length === 0) return null;
      const columns = [];
      items.forEach(item => {
        const depth = this._getDepth(item.id);
        if (!columns[depth]) columns[depth] = [];
        columns[depth].push(item);
      });
      return { label, columns: columns.filter(Boolean) };
    }).filter(Boolean);
  },

  _getStatus(item) {
    if (this.completed.has(item.id)) return 'completed';
    if (item.requires.every(r => this.completed.has(r))) return 'available';
    return 'locked';
  },

  buildPanel() {
    const body = document.getElementById('research-panel-body');
    if (this.items.length === 0) {
      body.innerHTML = '<p class="empty-note">Loading…</p>';
      this.load().then(() => this.buildPanel());
      return;
    }
    this._renderPanel();
  },

  _nodeHtml(item) {
    const status = this._getStatus(item);
    const isActive = this.activeId === item.id;

    // Show details only if the node itself is visible (no prereqs, or at least
    // one prereq is available/completed — i.e. the player can see what's coming).
    const prereqsVisible = item.requires.length === 0 || item.requires.some(r => {
      const s = this._getStatus(this.items.find(i => i.id === r));
      return s === 'available' || s === 'completed';
    });

    if (!prereqsVisible) {
      return `<div class="research-node locked mystery" data-id="${item.id}">
        <div class="rn-name">???</div>
        <span class="rn-badge locked">Locked</span>
      </div>`;
    }

    const STATUS_LABEL = { locked: 'Locked', available: 'Available', completed: 'Researched' };
    const badgeLabel = isActive ? 'In Progress' : STATUS_LABEL[status];
    const badgeCls   = isActive ? 'in-progress' : status;

    let timeHtml = '';
    if (status !== 'completed') {
      const wks = this._weeksRemaining(item);
      const wksLabel = wks === Infinity ? '∞ wks'
                     : `${wks} wk${wks !== 1 ? 's' : ''}`;
      timeHtml = `<div class="rn-cost">${wksLabel}</div>`;
    }

    const spent = this.progress[item.id] || 0;
    const pct   = item.cost > 0 ? Math.min(100, Math.round(spent / item.cost * 100)) : 0;
    const progressHtml = isActive
      ? `<div class="rn-progress-wrap"><div class="rn-progress-bar" style="width:${pct}%"></div></div>`
      : '';

    const activeClass = isActive ? ' active' : '';

    return `<div class="research-node ${status}${activeClass}" data-id="${item.id}">
      <div class="rn-name">${item.name}</div>
      ${timeHtml}
      <div class="rn-desc">${item.description}</div>
      ${progressHtml}
      <span class="rn-badge ${badgeCls}">${badgeLabel}</span>
    </div>`;
  },

  _renderPanel() {
    const body   = document.getElementById('research-panel-body');
    const groups = this._buildGroups();
    const rate   = this._researchRate();
    const rateLabel = `${rate % 1 === 0 ? rate : rate.toFixed(1)} pts/wk`;
    const activeLabel = this.activeId
      ? `Researching: ${this.items.find(i => i.id === this.activeId)?.name ?? ''}`
      : 'No active research';

    const groupsHtml = groups.map(g => {
      const colsHtml = g.columns.map(col =>
        `<div class="research-col">${col.map(i => this._nodeHtml(i)).join('')}</div>`
      ).join('');
      return `<div class="research-group">
        <div class="research-group-header">${g.label}</div>
        <div class="research-columns">${colsHtml}</div>
      </div>`;
    }).join('');

    body.innerHTML = `
      <div class="research-info-bar">
        <span class="research-rate" id="research-rate-val">${rateLabel}</span>
        <span class="research-active-label" id="research-active-label">${activeLabel}</span>
      </div>
      <div class="research-tree-scroll">
        <div class="research-tree-content">
          <svg class="research-connectors" id="research-svg"></svg>
          <div id="research-cols">${groupsHtml}</div>
        </div>
      </div>`;

    this._bindNodeClicks();
    requestAnimationFrame(() => this._drawConnections());
  },

  _updatePanel() {
    const cols = document.getElementById('research-cols');
    if (!cols) return;

    // Update info bar
    const rate = this._researchRate();
    const rateLabel = `${rate % 1 === 0 ? rate : rate.toFixed(1)} pts/wk`;
    const rateEl = document.getElementById('research-rate-val');
    if (rateEl) rateEl.textContent = rateLabel;
    const activeEl = document.getElementById('research-active-label');
    if (activeEl) {
      activeEl.textContent = this.activeId
        ? `Researching: ${this.items.find(i => i.id === this.activeId)?.name ?? ''}`
        : 'No active research';
    }

    // Swap each node card
    this.items.forEach(item => {
      const old = cols.querySelector(`.research-node[data-id="${item.id}"]`);
      if (!old) return;
      const tmp = document.createElement('div');
      tmp.innerHTML = this._nodeHtml(item);
      old.replaceWith(tmp.firstElementChild);
    });

    this._bindNodeClicks();
    requestAnimationFrame(() => this._drawConnections());
  },

  _bindNodeClicks() {
    const cols = document.getElementById('research-cols');
    if (!cols) return;
    cols.querySelectorAll('.research-node.available').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        this.activeId = this.activeId === id ? null : id;
        this._updatePanel();
        updateAchievementIndicators();
      });
    });
  },

  _drawConnections() {
    const svg     = document.getElementById('research-svg');
    const content = document.querySelector('.research-tree-content');
    if (!svg || !content) return;

    const w = content.scrollWidth;
    const h = content.scrollHeight;
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.style.width  = `${w}px`;
    svg.style.height = `${h}px`;

    const cr = content.getBoundingClientRect();
    const paths = [];

    this.items.forEach(item => {
      if (!item.requires.length) return;
      const toEl = content.querySelector(`.research-node[data-id="${item.id}"]`);
      if (!toEl) return;
      const toRect   = toEl.getBoundingClientRect();
      const toStatus = this._getStatus(item);
      const isActive = this.activeId === item.id;

      item.requires.forEach(reqId => {
        const fromEl = content.querySelector(`.research-node[data-id="${reqId}"]`);
        if (!fromEl) return;
        const fromRect = fromEl.getBoundingClientRect();

        const x1 = fromRect.right - cr.left;
        const y1 = (fromRect.top + fromRect.height / 2) - cr.top;
        const x2 = toRect.left  - cr.left;
        const y2 = (toRect.top  + toRect.height / 2) - cr.top;
        const cx = (x1 + x2) / 2;

        const color = this.completed.has(reqId) && toStatus !== 'locked' ? '#4ade80'
                    : isActive                                            ? '#3b82f6'
                    : toStatus === 'available'                            ? '#b45309'
                    : '#374151';

        paths.push(
          `<path d="M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}"` +
          ` stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/>`
        );
      });
    });

    svg.innerHTML = paths.join('\n');
  },
};
