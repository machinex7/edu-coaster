// ── Business Research ──────────────────────────────────────────────────────
const Research = {
  items: [],
  completed: new Set(),

  load() {
    return fetch('research.json')
      .then(r => r.json())
      .then(data => { this.items = data; });
  },

  _getDepth(id) {
    const item = this.items.find(i => i.id === id);
    if (!item || !item.requires.length) return 0;
    return Math.max(...item.requires.map(r => this._getDepth(r))) + 1;
  },

  _buildColumns() {
    const columns = [];
    this.items.forEach(item => {
      const depth = this._getDepth(item.id);
      if (!columns[depth]) columns[depth] = [];
      columns[depth].push(item);
    });
    return columns;
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

  _renderPanel() {
    const body = document.getElementById('research-panel-body');
    const columns = this._buildColumns();

    const STATUS_LABEL = { locked: 'Locked', available: 'Available', completed: 'Researched' };

    const columnsHtml = columns.map(col => {
      const nodes = col.map(item => {
        const status = this._getStatus(item);
        const costLabel = item.cost === 1 ? '1 pt' : `${item.cost} pts`;
        return `<div class="research-node ${status}" data-id="${item.id}">
          <div class="rn-name">${item.name}</div>
          <div class="rn-cost">${costLabel}</div>
          <div class="rn-desc">${item.description}</div>
          <span class="rn-badge ${status}">${STATUS_LABEL[status]}</span>
        </div>`;
      }).join('');
      return `<div class="research-col">${nodes}</div>`;
    }).join('');

    body.innerHTML = `
      <div class="research-info-bar">
        <span class="research-info-label">Business Research</span>
        <span class="research-pts"><span class="research-pts-val" id="research-pts-val">—</span> pts available</span>
      </div>
      <div class="research-tree-scroll">
        <div class="research-tree-content">
          <svg class="research-connectors" id="research-svg"></svg>
          <div class="research-columns" id="research-cols">${columnsHtml}</div>
        </div>
      </div>`;

    requestAnimationFrame(() => this._drawConnections());
  },

  _drawConnections() {
    const svg = document.getElementById('research-svg');
    const content = document.querySelector('.research-tree-content');
    if (!svg || !content) return;

    const w = content.scrollWidth;
    const h = content.scrollHeight;
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;

    const contentRect = content.getBoundingClientRect();
    const paths = [];

    this.items.forEach(item => {
      if (!item.requires.length) return;
      const toEl = content.querySelector(`.research-node[data-id="${item.id}"]`);
      if (!toEl) return;
      const toRect = toEl.getBoundingClientRect();
      const toStatus = this._getStatus(item);

      item.requires.forEach(reqId => {
        const fromEl = content.querySelector(`.research-node[data-id="${reqId}"]`);
        if (!fromEl) return;
        const fromRect = fromEl.getBoundingClientRect();

        const x1 = fromRect.right - contentRect.left;
        const y1 = (fromRect.top + fromRect.height / 2) - contentRect.top;
        const x2 = toRect.left - contentRect.left;
        const y2 = (toRect.top + toRect.height / 2) - contentRect.top;
        const cx = (x1 + x2) / 2;

        const color = this.completed.has(reqId) && toStatus !== 'locked' ? '#4ade80'
                    : toStatus === 'available' ? '#fbbf24'
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
