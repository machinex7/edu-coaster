const Marketing = {
  // Default impressions for a new campaign draft.
  draftImpressions: 50_000,
  draftMedium:      'tv',
  draftHook:        'jingle',
  draftMessageType: 'informational',
  // Keys of the Population bracket arrays mapped to each chart axis.
  draftXAxis:  'age',
  draftYAxis:  'income',
  // Selected range on each axis; initialized to full selection (all brackets).
  // Age and Income each have 5 brackets → indices 0–4.
  draftXRange: { min: 0, max: 4 },
  draftYRange: { min: 0, max: 4 },

  // Flat weekly cost before medium and inflation adjustments.
  BASE_MARKETING_COST: 100,
  // One-time fee added when the hook is a celebrity cameo.
  CELEBRITY_COST: 10_000,

  // Dollar cost per impression for each medium — TV is most expensive,
  // online cheapest, matching real-world CPM relative rates.
  COST_PER_IMPRESSION: {
    tv:     0.04,
    print:  0.02,
    radio:  0.01,
    online: 0.003,
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

  // Maximum number of crowd dots in the most-populated cloud cell.
  MAX_CROWD_DOTS: 40,

  MEDIUMS: [
    { value: 'tv',     label: 'TV'     },
    { value: 'radio',  label: 'Radio'  },
    { value: 'online', label: 'Online' },
    { value: 'print',  label: 'Print'  },
  ],

  HOOKS: [
    { value: 'jingle',    label: 'Catchy Jingle'   },
    { value: 'tagline',   label: 'Tagline'         },
    // Celebrity Cameo requires the mkt_celebrity_hook research node.
    { value: 'celebrity', label: 'Celebrity Cameo', unlock: 'mkt_celebrity_hook' },
  ],

  MESSAGE_TYPES: [
    { value: 'informational', label: 'Informational',  sub: 'biggest rides in the state'     },
    // Emotional and Urgency-Driven each require a research node before use.
    { value: 'emotional',     label: 'Emotional',      sub: 'make memories with your family', unlock: 'mkt_emotional_messaging' },
    { value: 'urgency',       label: 'Urgency-Driven', sub: 'this weekend only',              unlock: 'mkt_urgency_messaging'   },
  ],

  // Demographic categories available as point cloud axes.
  // Age and Income are always available; the rest require research unlocks.
  DEMO_CATS: [
    { key: 'age',       label: 'Age',       brackets: Population.AGE_BRACKETS      },
    { key: 'income',    label: 'Income',    brackets: Population.INCOME_BRACKETS   },
    { key: 'household', label: 'Household', brackets: Population.HOUSEHOLD_SIZES,   unlock: 'mkt_household_targeting' },
    { key: 'distance',  label: 'Distance',  brackets: Population.DISTANCE_BRACKETS, unlock: 'mkt_distance_targeting'  },
    { key: 'area',      label: 'Area',      brackets: Population.AREA_TYPES,        unlock: 'mkt_area_targeting'      },
  ],

  // Reach multipliers per medium for age and distance brackets.
  // Values > 1 mean the medium over-indexes on that bracket; < 1 means under-indexes.
  // Indices parallel AGE_BRACKETS [Child, Teen, Young Adult, Adult, Senior]
  // and DISTANCE_BRACKETS [Local, Nearby, Regional, Destination].
  MEDIUM_AFFINITY: {
    age: {
      tv:     [1.0, 0.7, 0.8, 1.2, 1.5],
      radio:  [0.5, 0.7, 1.1, 1.3, 1.0],
      online: [0.9, 1.6, 1.5, 1.0, 0.4],
      print:  [0.5, 0.5, 0.7, 1.2, 1.6],
    },
    distance: {
      tv:     [0.8, 1.0, 1.4, 1.0],
      radio:  [1.5, 1.3, 0.8, 0.4],
      online: [0.8, 1.0, 1.2, 1.5],
      print:  [1.6, 1.3, 0.7, 0.3],
    },
  },

  // Returns true if the entry's research unlock has been completed (or has none).
  _isUnlocked(entry) {
    return !entry.unlock || Research.completed.has(entry.unlock);
  },

  // Returns a range covering all brackets for the given category key.
  _fullRange(catKey) {
    const cat = this.DEMO_CATS.find(c => c.key === catKey);
    return { min: 0, max: cat.brackets.length - 1 };
  },

  // Generates deterministic pseudo-random dot positions for a cloud cell,
  // seeded by (xi, yi) so positions stay stable across selection re-renders.
  _seededPositions(xi, yi, count) {
    let s = xi * 31337 + yi * 6271 + 1;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const positions = [];
    for (let i = 0; i < count; i++) {
      positions.push({ x: Math.round(rand() * 96), y: Math.round(rand() * 91) });
    }
    return positions;
  },

  // Returns weeks needed to deliver draftImpressions via the selected medium.
  estimatedWeeks() {
    return Math.ceil(this.draftImpressions / this.IMPRESSIONS_PER_WEEK[this.draftMedium]);
  },

  // Returns the total upfront cost to launch the current draft campaign.
  // Media cost is impression-based (impressions × rate), so switching medium
  // changes cost directly rather than via estimated run time.
  calcCost() {
    const mediaCost     = this.draftImpressions * this.COST_PER_IMPRESSION[this.draftMedium];
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

  // Redraws selected/unselected state on all crowd dots without rebuilding the panel.
  _refreshCloudSelection() {
    document.querySelectorAll('.mkt-cloud-cell[data-xi]').forEach(cell => {
      const sel = this._isCellSelected(parseInt(cell.dataset.xi), parseInt(cell.dataset.yi));
      cell.querySelectorAll('.mkt-crowd-dot').forEach(dot => dot.classList.toggle('selected', sel));
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

  // Returns the 0–1 interest value for a given message type at week t (1-indexed) of weeksTotal.
  // Urgency: ramps to 1.0 at week 2 then decays as 1/(t−1).
  // Informational: holds a mid-level (0.4) and rises slowly toward 0.7 by campaign end.
  // Emotional: grows linearly from near-zero to 1.0 over the full campaign duration.
  calcInterest(messageType, t, weeksTotal) {
    switch (messageType) {
      case 'urgency':
        return t <= 2 ? t / 2 : 1 / (t - 1);
      case 'informational':
        return 0.4 + 0.3 * (t - 1) / Math.max(1, weeksTotal - 1);
      case 'emotional':
        return t / weeksTotal;
      default:
        return 0;
    }
  },

  // Returns a focus multiplier (≥ 1) based on what fraction of the total joint population
  // falls within the selected demographic ranges. Computed from bracket.count products so
  // a bracket covering 80% of the population still reads as "broad" even if it's one index.
  // Uses 1/sqrt(fraction) so halving the selected population gives a 1.41× boost, not 2×.
  calcFocusMultiplier(xAxis, yAxis, xRange, yRange) {
    const xCat = this.DEMO_CATS.find(c => c.key === xAxis);
    const yCat = this.DEMO_CATS.find(c => c.key === yAxis);
    const xSet = xRange.min !== null, ySet = yRange.min !== null;
    let totalPop = 0, selectedPop = 0;
    for (let yi = 0; yi < yCat.brackets.length; yi++) {
      for (let xi = 0; xi < xCat.brackets.length; xi++) {
        const pop = xCat.brackets[xi].count * yCat.brackets[yi].count;
        totalPop += pop;
        const inX = xSet && xi >= xRange.min && xi <= xRange.max;
        const inY = ySet && yi >= yRange.min && yi <= yRange.max;
        const sel = (!xSet && !ySet) ? false
                  : (xSet && ySet)   ? (inX && inY)
                  : xSet ? inX : inY;
        if (sel) selectedPop += pop;
      }
    }
    if (selectedPop === 0 || totalPop === 0) return 1;
    return 1 / Math.sqrt(selectedPop / totalPop);
  },

  // Returns the maximum interest ceiling for the given hook at week t of weeksTotal.
  // Celebrity: flat 1.5 — high-impact from day one.
  // Jingle: scales from 0.5 to 1.5 as the tune lodges in people's heads.
  // Tagline: neutral 1.0.
  calcHookMax(hook, t, weeksTotal) {
    switch (hook) {
      case 'celebrity': return 1.5;
      case 'jingle':    return 0.5 + t / weeksTotal;
      default:          return 1.0;
    }
  },

  // Advances every active campaign by one round: decrements weeksRemaining,
  // recomputes interest (curve × hook ceiling), adds interest × focusMultiplier
  // to each selected bracket's favor, then removes finished campaigns.
  tickCampaigns() {
    for (let i = activeCampaigns.length - 1; i >= 0; i--) {
      const c = activeCampaigns[i];
      c.weeksRemaining--;
      const t = c.weeksTotal - c.weeksRemaining;
      c.interest = this.calcInterest(c.messageType, t, c.weeksTotal)
                 * this.calcHookMax(c.hook, t, c.weeksTotal);

      const delta = c.interest * c.focusMultiplier;
      const xCat  = this.DEMO_CATS.find(d => d.key === c.xAxis);
      const yCat  = this.DEMO_CATS.find(d => d.key === c.yAxis);
      if (c.xRange.min !== null) {
        for (let xi = c.xRange.min; xi <= c.xRange.max; xi++)
          xCat.brackets[xi].favor += delta;
      }
      if (c.yRange.min !== null) {
        for (let yi = c.yRange.min; yi <= c.yRange.max; yi++)
          yCat.brackets[yi].favor += delta;
      }

      if (c.weeksRemaining <= 0) activeCampaigns.splice(i, 1);
    }
  },

  // Deducts the campaign cost, snapshots draft settings into activeCampaigns, and notifies the player.
  launchCampaign() {
    const cost = this.calcCost();
    if (money < cost) return;
    const weeks = this.estimatedWeeks();
    money -= cost;
    activeCampaigns.push({
      impressions:    this.draftImpressions,
      medium:         this.draftMedium,
      hook:           this.draftHook,
      messageType:    this.draftMessageType,
      xAxis:          this.draftXAxis,
      yAxis:          this.draftYAxis,
      xRange:         { ...this.draftXRange },
      yRange:         { ...this.draftYRange },
      weeksTotal:       weeks,
      weeksRemaining:   weeks,
      interest:         0,
      focusMultiplier:  this.calcFocusMultiplier(
                          this.draftXAxis, this.draftYAxis,
                          this.draftXRange, this.draftYRange),
      cost,
      roundLaunched:    round,
    });
    updateHUD();
    this.buildPanel();
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

    const hookBtns = this.HOOKS.map(h => {
      const locked = !this._isUnlocked(h);
      return `<button class="mkt-option-btn${this.draftHook === h.value ? ' active' : ''}"
        data-mkt-hook="${h.value}"${locked ? ' disabled title="Research required"' : ''}>${h.label}${locked ? ' 🔒' : ''}</button>`;
    }).join('');

    const messageTypeBtns = this.MESSAGE_TYPES.map(m => {
      const locked = !this._isUnlocked(m);
      return `<button class="mkt-option-btn mkt-option-btn--wide${this.draftMessageType === m.value ? ' active' : ''}"
        data-mkt-message="${m.value}"${locked ? ' disabled title="Research required"' : ''}>
        <span class="mkt-option-label">${m.label}${locked ? ' 🔒' : ''}</span>
        <span class="mkt-option-sub">${locked ? 'Research required' : m.sub}</span>
      </button>`;
    }).join('');

    // Dropdown options for axis pickers — each axis excludes the other's current selection
    // and hides any category not yet unlocked via research.
    const axisOptions = (selectedKey, otherKey) => this.DEMO_CATS.map(c => {
      const locked   = !this._isUnlocked(c);
      const disabled = c.key === otherKey || locked;
      return `<option value="${c.key}"${c.key === selectedKey ? ' selected' : ''}${disabled ? ' disabled' : ''}>${locked ? '🔒 ' : ''}${c.label}</option>`;
    }).join('');

    // Point cloud grid: two corners + x-labels header, then one row per y-bracket.
    // The first grid column is a narrow Y-range selector strip.
    const xLabels   = xCat.brackets.map(b =>
      `<div class="mkt-cloud-xlabel">${b.short}</div>`
    ).join('');
    const cloudRows = yCat.brackets.map((yb, yi) => {
      const yRangeSel = this.draftYRange.min !== null && yi >= this.draftYRange.min && yi <= this.draftYRange.max;
      const cells = xCat.brackets.map((xb, xi) => {
        const count = Math.max(2, Math.round((weights[yi][xi] / maxWeight) * this.MAX_CROWD_DOTS));
        const sel   = this._isCellSelected(xi, yi);
        const dots  = this._seededPositions(xi, yi, count).map(p =>
          `<div class="mkt-crowd-dot${sel ? ' selected' : ''}" style="left:${p.x}%;top:${p.y}%"></div>`
        ).join('');
        return `<div class="mkt-cloud-cell" data-xi="${xi}" data-yi="${yi}">${dots}</div>`;
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
          <div class="mkt-cloud-grid" style="grid-template-columns:18px auto repeat(${xCat.brackets.length},1fr)">
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
        <button class="mkt-launch-btn"${money < this.calcCost() ? ' disabled title="Insufficient funds"' : ''}>Launch Campaign</button>
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
      this.draftXRange = this._fullRange(e.target.value);
      this.buildPanel();
    });

    document.getElementById('mkt-y-axis').addEventListener('change', e => {
      this.draftYAxis  = e.target.value;
      this.draftYRange = this._fullRange(e.target.value);
      this.buildPanel();
    });

    document.querySelectorAll('[data-range-axis]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._handleRangeClick(btn.dataset.rangeAxis, parseInt(btn.dataset.idx));
      });
    });

    document.querySelector('.mkt-launch-btn').addEventListener('click', () => {
      this.launchCampaign();
    });
  },
};
