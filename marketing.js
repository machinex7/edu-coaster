const Marketing = {
  // Default impressions for a new campaign draft.
  draftImpressions: 50_000,
  draftMedium:      'tv',
  draftHook:        'jingle',
  draftMessageType: 'informational',
  // Keys of the Population bracket arrays mapped to each chart axis.
  draftXAxis:  'age',
  draftYAxis:  'income',
  // Selected range on each axis; null means no selection.
  draftXRange: { min: null, max: null },
  draftYRange: { min: null, max: null },

  // Flat weekly cost before medium and inflation adjustments.
  BASE_MARKETING_COST: 100,
  // One-time fee added when the hook is a celebrity cameo.
  CELEBRITY_COST: 10_000,

  // Cost multiplier per medium — reflects real-world relative ad rates.
  MEDIUM_MULTIPLIERS: {
    tv:     6,
    print:  3,
    radio:  2,
    online: 1,
  },

  // Impressions delivered per week at the base spend level for each medium.
  IMPRESSIONS_PER_WEEK: {
    tv:     50_000,
    radio:  30_000,
    print:  15_000,
    online: 100_000,
  },

  // Step size for the impressions input.
  IMPRESSIONS_STEP: 10_000,

  MEDIUMS: [
    { value: 'tv',     label: 'TV'     },
    { value: 'radio',  label: 'Radio'  },
    { value: 'online', label: 'Online' },
    { value: 'print',  label: 'Print'  },
  ],

  HOOKS: [
    { value: 'jingle',    label: 'Catchy Jingle'   },
    { value: 'tagline',   label: 'Tagline'         },
    { value: 'celebrity', label: 'Celebrity Cameo' },
  ],

  MESSAGE_TYPES: [
    { value: 'informational', label: 'Informational',  sub: 'biggest rides in the state'     },
    { value: 'emotional',     label: 'Emotional',      sub: 'make memories with your family' },
    { value: 'urgency',       label: 'Urgency-Driven', sub: 'this weekend only'              },
  ],

  // Demographic categories available as point cloud axes.
  DEMO_CATS: [
    { key: 'age',       label: 'Age',       brackets: Population.AGE_BRACKETS      },
    { key: 'income',    label: 'Income',    brackets: Population.INCOME_BRACKETS   },
    { key: 'household', label: 'Household', brackets: Population.HOUSEHOLD_SIZES   },
    { key: 'distance',  label: 'Distance',  brackets: Population.DISTANCE_BRACKETS },
    { key: 'area',      label: 'Area',      brackets: Population.AREA_TYPES        },
  ],

  // Returns weeks needed to deliver draftImpressions via the selected medium.
  estimatedWeeks() {
    return Math.ceil(this.draftImpressions / this.IMPRESSIONS_PER_WEEK[this.draftMedium]);
  },

  // Returns the total upfront cost to launch the current draft campaign.
  calcCost() {
    const mediaCost     = this.estimatedWeeks() * this.BASE_MARKETING_COST * this.MEDIUM_MULTIPLIERS[this.draftMedium];
    const celebrityCost = this.draftHook === 'celebrity' ? this.CELEBRITY_COST : 0;
    return Math.round((mediaCost + celebrityCost) * Population.cumulativeInflation);
  },

  // Updates the estimated-duration and cost displays without rebuilding the panel.
  _refreshEstimate() {
    const weeks = this.estimatedWeeks();
    const weeksEl = document.getElementById('mkt-est-weeks');
    const costEl  = document.getElementById('mkt-est-cost');
    if (weeksEl) weeksEl.textContent = `~${weeks} week${weeks !== 1 ? 's' : ''}`;
    if (costEl)  costEl.textContent  = `$${this.calcCost().toLocaleString()}`;
  },

  // Returns true if the chart cell at (xi, yi) should be highlighted.
  // One axis set: highlights all cells on that axis. Both set: intersection only.
  _isCellSelected(xi, yi) {
    const xr = this.draftXRange, yr = this.draftYRange;
    const xSet = xr.min !== null, ySet = yr.min !== null;
    const inX  = xSet && xi >= xr.min && xi <= xr.max;
    const inY  = ySet && yi >= yr.min && yi <= yr.max;
    if (!xSet && !ySet) return false;
    if (xSet && ySet)   return inX && inY;
    return xSet ? inX : inY;
  },

  // Redraws selected/unselected state on all cloud dots without rebuilding the panel.
  _refreshCloudSelection() {
    document.querySelectorAll('.mkt-cloud-dot').forEach(dot => {
      dot.classList.toggle('selected', this._isCellSelected(
        parseInt(dot.dataset.xi), parseInt(dot.dataset.yi)
      ));
    });
  },

  // Applies the range-selection click rules for a chart axis and redraws affected UI.
  _handleRangeClick(axis, idx) {
    const t = axis === 'x' ? this.draftXRange : this.draftYRange;
    if (t.min === null) {
      t.min = idx; t.max = idx;
    } else if (idx > t.max) {
      t.max = idx;
    } else if (idx < t.min) {
      t.min = idx;
    } else if (t.min === t.max) {
      t.min = null; t.max = null;
    } else if (idx === t.min) {
      t.min = idx + 1;
    } else if (idx === t.max) {
      t.max = idx - 1;
    }
    this._refreshRangeBar(axis);
    this._refreshCloudSelection();
  },

  // Syncs the selected class on all cells of a range bar to match the stored range.
  _refreshRangeBar(axis) {
    const t = axis === 'x' ? this.draftXRange : this.draftYRange;
    document.querySelectorAll(`[data-range-axis="${axis}"]`).forEach(btn => {
      const i = parseInt(btn.dataset.idx);
      btn.classList.toggle('selected', t.min !== null && i >= t.min && i <= t.max);
    });
  },

  // Renders the full panel from current draft state and wires up all event listeners.
  buildPanel() {
    const xCat = this.DEMO_CATS.find(c => c.key === this.draftXAxis);
    const yCat = this.DEMO_CATS.find(c => c.key === this.draftYAxis);

    // Compute joint probability weights for dot sizing (independent-axis approximation).
    const xTotal  = xCat.brackets.reduce((s, b) => s + b.count, 0);
    const yTotal  = yCat.brackets.reduce((s, b) => s + b.count, 0);
    const weights = yCat.brackets.map(yb =>
      xCat.brackets.map(xb => (xb.count / xTotal) * (yb.count / yTotal))
    );
    const maxWeight = Math.max(...weights.flat());

    const mediumBtns = this.MEDIUMS.map(m =>
      `<button class="mkt-option-btn${this.draftMedium === m.value ? ' active' : ''}" data-mkt-medium="${m.value}">${m.label}</button>`
    ).join('');

    const hookBtns = this.HOOKS.map(h =>
      `<button class="mkt-option-btn${this.draftHook === h.value ? ' active' : ''}" data-mkt-hook="${h.value}">${h.label}</button>`
    ).join('');

    const messageTypeBtns = this.MESSAGE_TYPES.map(m =>
      `<button class="mkt-option-btn mkt-option-btn--wide${this.draftMessageType === m.value ? ' active' : ''}" data-mkt-message="${m.value}">
        <span class="mkt-option-label">${m.label}</span>
        <span class="mkt-option-sub">${m.sub}</span>
      </button>`
    ).join('');

    // Dropdown options for axis pickers — each axis excludes the other's current selection.
    const axisOptions = (selectedKey, otherKey) => this.DEMO_CATS.map(c =>
      `<option value="${c.key}"${c.key === selectedKey ? ' selected' : ''}${c.key === otherKey ? ' disabled' : ''}>${c.label}</option>`
    ).join('');

    // Point cloud grid: two corners + x-labels header, then one row per y-bracket.
    // The first grid column is a narrow Y-range selector strip.
    const xLabels   = xCat.brackets.map(b =>
      `<div class="mkt-cloud-xlabel">${b.short}</div>`
    ).join('');
    const cloudRows = yCat.brackets.map((yb, yi) => {
      const yRangeSel = this.draftYRange.min !== null && yi >= this.draftYRange.min && yi <= this.draftYRange.max;
      const cells = xCat.brackets.map((xb, xi) => {
        const pct = Math.round(25 + 55 * (weights[yi][xi] / maxWeight));
        const sel = this._isCellSelected(xi, yi) ? ' selected' : '';
        return `<div class="mkt-cloud-cell"><div class="mkt-cloud-dot${sel}"
          data-xi="${xi}" data-yi="${yi}" style="width:${pct}%;aspect-ratio:1"></div></div>`;
      }).join('');
      return `
        <button class="mkt-cell-vert${yRangeSel ? ' selected' : ''}"
          data-range-axis="y" data-idx="${yi}" title="${yb.name}"></button>
        <div class="mkt-cloud-ylabel">${yb.short}</div>
        ${cells}`;
    }).join('');

    // Only the X range bar sits below the chart; Y range is the grid's first column.
    const xRangeBar = xCat.brackets.map((b, i) => {
      const sel = this.draftXRange.min !== null && i >= this.draftXRange.min && i <= this.draftXRange.max;
      return `<button class="mkt-cell${sel ? ' selected' : ''}" data-range-axis="x" data-idx="${i}" title="${b.name}">${b.short}</button>`;
    }).join('');

    document.getElementById('marketing-panel-body').innerHTML = `
      <div class="panel-section-header">Campaign Designer</div>
      <div class="mkt-layout">

        <div class="mkt-settings-col">
          <div class="form-field">
            <label for="mkt-impressions">Target Impressions</label>
            <input id="mkt-impressions" type="number" min="${this.IMPRESSIONS_STEP}" step="${this.IMPRESSIONS_STEP}" value="${this.draftImpressions}">
            <div class="mkt-estimate">Est. <span id="mkt-est-weeks"></span></div>
          </div>
          <div class="form-field">
            <label>Medium</label>
            <div class="mkt-option-group">${mediumBtns}</div>
          </div>
          <div class="form-field">
            <label>Hook</label>
            <div class="mkt-option-group">${hookBtns}</div>
          </div>
          <div class="form-field">
            <label>Message Type</label>
            <div class="mkt-option-group mkt-option-group--col">${messageTypeBtns}</div>
          </div>
        </div>

        <div class="mkt-cloud-col">
          <div class="mkt-axis-pickers">
            <div class="form-field">
              <label for="mkt-x-axis">Horizontal</label>
              <select id="mkt-x-axis">${axisOptions(this.draftXAxis, this.draftYAxis)}</select>
            </div>
            <div class="form-field">
              <label for="mkt-y-axis">Vertical</label>
              <select id="mkt-y-axis">${axisOptions(this.draftYAxis, this.draftXAxis)}</select>
            </div>
          </div>
          <div class="mkt-cloud-grid" style="grid-template-columns:12px auto repeat(${xCat.brackets.length},1fr)">
            <div class="mkt-cloud-corner"></div>
            <div class="mkt-cloud-corner"></div>
            ${xLabels}${cloudRows}
          </div>
          <div class="mkt-range-bars">
            <div class="mkt-demo-row">
              <div class="mkt-demo-cat">${xCat.label}</div>
              <div class="mkt-demo-cells">${xRangeBar}</div>
            </div>
          </div>
        </div>

      </div>
      <div class="mkt-launch-row">
        <div class="mkt-cost-line">Cost: <span id="mkt-est-cost"></span></div>
        <button class="mkt-launch-btn" disabled>Launch Campaign</button>
      </div>`;

    this._refreshEstimate();

    document.getElementById('mkt-impressions').addEventListener('change', e => {
      this.draftImpressions = Math.max(this.IMPRESSIONS_STEP, Math.round((parseInt(e.target.value) || this.IMPRESSIONS_STEP) / this.IMPRESSIONS_STEP) * this.IMPRESSIONS_STEP);
      e.target.value = this.draftImpressions;
      this._refreshEstimate();
    });

    document.querySelectorAll('[data-mkt-medium]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftMedium = btn.dataset.mktMedium;
        document.querySelectorAll('[data-mkt-medium]').forEach(b => b.classList.toggle('active', b === btn));
        this._refreshEstimate();
      });
    });

    document.querySelectorAll('[data-mkt-hook]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftHook = btn.dataset.mktHook;
        document.querySelectorAll('[data-mkt-hook]').forEach(b => b.classList.toggle('active', b === btn));
        this._refreshEstimate();
      });
    });

    document.querySelectorAll('[data-mkt-message]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftMessageType = btn.dataset.mktMessage;
        document.querySelectorAll('[data-mkt-message]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    document.getElementById('mkt-x-axis').addEventListener('change', e => {
      this.draftXAxis  = e.target.value;
      this.draftXRange = { min: null, max: null };
      this.buildPanel();
    });

    document.getElementById('mkt-y-axis').addEventListener('change', e => {
      this.draftYAxis  = e.target.value;
      this.draftYRange = { min: null, max: null };
      this.buildPanel();
    });

    document.querySelectorAll('[data-range-axis]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._handleRangeClick(btn.dataset.rangeAxis, parseInt(btn.dataset.idx));
      });
    });
  },
};
