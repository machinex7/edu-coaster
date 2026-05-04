const Marketing = {
  // Default impressions for a new campaign draft.
  draftImpressions: 50_000,
  draftMedium:      'tv',
  draftHook:        'jingle',
  draftMessageType: 'informational',
  // ID of the award attached to this campaign draft, or null for none.
  draftAward: null,
  // instanceId of the ride featured in the current draft campaign, or null for none.
  draftRide: null,
  // Keys of the Population bracket arrays mapped to each chart axis.
  draftXAxis:  'age',
  draftYAxis:  'income',
  // Selected range on each axis; initialized to full selection (all brackets).
  // Age and Income each have 5 brackets → indices 0–4.
  draftXRange: { min: 0, max: 4 },
  draftYRange: { min: 0, max: 4 },
  // Whether the current draft is a trial run (no favor changes, fixed 3-week duration).
  draftTrialMode: false,

  // One-time fee added when the hook is a celebrity cameo.
  CELEBRITY_COST: 10_000,

  // Additive interest bonus per marketing use of an award (0-indexed by prior use count).
  // Each use is one tier less effective; clamps at the last entry.
  AWARD_BOOST_TIERS: [0.20, 0.15, 0.10, 0.05, 0.01],

  // Tracks how many campaigns each award has been used in (awardId → count).
  // Persists for the full game session; incremented at campaign launch.
  marketingUses: {},

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

  // Base confidence points added to each targeted bracket when a campaign completes.
  // Multiplied by focusMultiplier so tighter targeting yields more demographic insight.
  CAMPAIGN_CONFIDENCE_BASE: 2,

  // Fixed run time (weeks) for a trial campaign — shorter than any full campaign.
  TRIAL_WEEKS: 3,

  // How many weeks to project when showing the full interest curve after a trial.
  TRIAL_PROJECTION_WEEKS: 10,

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

  // Returns installed rides eligible to be featured in a marketing campaign:
  // rides currently under construction (any construction status) or rides that
  // became active within the last 4 rounds.
  _getEligibleRides() {
    return installedRides.filter(r => {
      if (r.status === STATUS.UNDER_CONSTRUCTION || r.status === STATUS.PAUSED_CONSTRUCTION) return true;
      return r.status === STATUS.ACTIVE && round - r.installedRound <= 4;
    });
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

  // Returns the upfront cost for a trial run: TRIAL_WEEKS × one-step impressions × medium rate.
  // Celebrity surcharge still applies since the hook choice affects curve shape.
  calcTrialCost() {
    const mediaCost     = this.TRIAL_WEEKS * this.IMPRESSIONS_STEP * this.COST_PER_IMPRESSION[this.draftMedium];
    const celebrityCost = this.draftHook === 'celebrity' ? this.CELEBRITY_COST : 0;
    return Math.round((mediaCost + celebrityCost) * Population.cumulativeInflation);
  },

  // Updates the estimated-duration, cost displays, and launch button state without rebuilding the panel.
  _refreshEstimate() {
    const cost    = this.draftTrialMode ? this.calcTrialCost() : this.calcCost();
    const costEl   = document.getElementById('mkt-est-cost');
    const launchEl = document.querySelector('.mkt-launch-btn');
    if (costEl)   costEl.textContent = `$${cost.toLocaleString()}`;
    if (launchEl) launchEl.disabled  = money < cost;
    if (launchEl) launchEl.title     = money < cost ? 'Insufficient funds' : '';
    if (!this.draftTrialMode) {
      const weeks   = this.estimatedWeeks();
      const weeksEl = document.getElementById('mkt-est-weeks');
      if (weeksEl) weeksEl.textContent = `~${weeks} week${weeks !== 1 ? 's' : ''}`;
    }
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

  // Returns the additive interest bonus for the next use of the given award.
  // Looks up the current use count in marketingUses, maps to AWARD_BOOST_TIERS.
  calcAwardBoost(awardId) {
    const uses = this.marketingUses[awardId] ?? 0;
    const idx  = Math.min(uses, this.AWARD_BOOST_TIERS.length - 1);
    return this.AWARD_BOOST_TIERS[idx];
  },

  // Advances every active campaign by one round: decrements weeksRemaining,
  // recomputes interest (curve × hook ceiling), adds interest × focusMultiplier
  // to each selected bracket's favor (skipped for trial runs), then removes
  // finished campaigns. Trial runs compute a projected full curve on completion.
  tickCampaigns() {
    for (let i = activeCampaigns.length - 1; i >= 0; i--) {
      const c = activeCampaigns[i];
      c.weeksRemaining--;
      const t = c.weeksTotal - c.weeksRemaining;
      c.interest = this.calcInterest(c.messageType, t, c.weeksTotal)
                 * this.calcHookMax(c.hook, t, c.weeksTotal)
                 + c.awardBoost;

      const delta = c.interest * c.focusMultiplier;
      const xCat  = this.DEMO_CATS.find(d => d.key === c.xAxis);
      const yCat  = this.DEMO_CATS.find(d => d.key === c.yAxis);

      // Trial runs observe without influencing — no favor changes.
      if (!c.trialMode) {
        if (c.xRange.min !== null) {
          for (let xi = c.xRange.min; xi <= c.xRange.max; xi++)
            xCat.brackets[xi].favor += delta;
        }
        if (c.yRange.min !== null) {
          for (let yi = c.yRange.min; yi <= c.yRange.max; yi++)
            yCat.brackets[yi].favor += delta;
        }
      }

      // Sum the estimated attendance delta across all targeted brackets for this week.
      // Formula: parkExcitement × chance × favorDelta × count / baselineFavorablePopulation.
      const weekDelta = c.trackedBrackets.reduce((sum, tb) => {
        const b = this.DEMO_CATS.find(d => d.key === tb.key).brackets[tb.idx];
        return sum + b.chance * b.count;
      }, 0);
      c.weeklyDeltas.push(Math.round(
        Finance.parkExcitement * weekDelta * delta / Population.baselineFavorablePopulation
      ));

      if (c.weeksRemaining <= 0) {
        // Award a small confidence gain to each selected bracket on completion.
        // Narrower targeting (higher focusMultiplier) earns more insight.
        const gain = this.CAMPAIGN_CONFIDENCE_BASE * c.focusMultiplier;
        const xKey = c.xAxis.toUpperCase();
        const yKey = c.yAxis.toUpperCase();
        if (c.xRange.min !== null && Population.confidence[xKey]) {
          for (let xi = c.xRange.min; xi <= c.xRange.max; xi++)
            Population.confidence[xKey][xi] = Math.min(100, Population.confidence[xKey][xi] + gain);
        }
        if (c.yRange.min !== null && Population.confidence[yKey]) {
          for (let yi = c.yRange.min; yi <= c.yRange.max; yi++)
            Population.confidence[yKey][yi] = Math.min(100, Population.confidence[yKey][yi] + gain);
        }

        if (c.trialMode) {
          // Simulate what a full-length campaign would have looked like — same settings,
          // same bracket state (untouched by the trial), over TRIAL_PROJECTION_WEEKS.
          const projWeeks = this.TRIAL_PROJECTION_WEEKS;
          const projPop   = c.trackedBrackets.reduce((sum, tb) => {
            const b = this.DEMO_CATS.find(d => d.key === tb.key).brackets[tb.idx];
            return sum + b.chance * b.count;
          }, 0);
          c.projectedDeltas = [];
          for (let pt = 1; pt <= projWeeks; pt++) {
            const projInt   = this.calcInterest(c.messageType, pt, projWeeks)
                            * this.calcHookMax(c.hook, pt, projWeeks)
                            + c.awardBoost;
            const projDelta = projInt * c.focusMultiplier;
            c.projectedDeltas.push(Math.round(
              Finance.parkExcitement * projPop * projDelta / Population.baselineFavorablePopulation
            ));
          }
        }

        completedCampaigns.push(activeCampaigns.splice(i, 1)[0]);
      }
    }
  },

  // Builds the list of bracket descriptors for all selected brackets in both axes.
  // Stored on the campaign at launch so tickCampaigns can record deltas without
  // re-deriving the selection each round.
  _buildTrackedBrackets(xAxis, yAxis, xRange, yRange) {
    const xCat = this.DEMO_CATS.find(c => c.key === xAxis);
    const yCat = this.DEMO_CATS.find(c => c.key === yAxis);
    const result = [];
    if (xRange.min !== null)
      for (let xi = xRange.min; xi <= xRange.max; xi++)
        result.push({ key: xAxis, idx: xi, name: xCat.brackets[xi].name });
    if (yRange.min !== null)
      for (let yi = yRange.min; yi <= yRange.max; yi++)
        result.push({ key: yAxis, idx: yi, name: yCat.brackets[yi].name });
    return result;
  },

  // Deducts the campaign cost, snapshots draft settings into activeCampaigns, and notifies the player.
  // In trial mode, uses TRIAL_WEEKS for duration and calcTrialCost() for the fee.
  launchCampaign() {
    const cost = this.draftTrialMode ? this.calcTrialCost() : this.calcCost();
    if (money < cost) return;
    const weeks      = this.draftTrialMode ? this.TRIAL_WEEKS : this.estimatedWeeks();
    const awardBoost = this.draftAward ? this.calcAwardBoost(this.draftAward) : 0;
    money -= cost;
    const featuredRideId   = this.draftRide;
    const featuredRideName = featuredRideId
      ? (installedRides.find(r => r.instanceId === featuredRideId)?.name ?? null)
      : null;
    activeCampaigns.push({
      impressions:      this.draftTrialMode
                          ? this.IMPRESSIONS_STEP * this.TRIAL_WEEKS
                          : this.draftImpressions,
      medium:           this.draftMedium,
      hook:             this.draftHook,
      messageType:      this.draftMessageType,
      award:            this.draftAward,        // award id used, or null
      awardBoost,                               // additive interest bonus, frozen at launch
      featuredRide:     featuredRideId,         // instanceId of featured ride, or null
      featuredRideName,                         // display name frozen at launch, or null
      xAxis:            this.draftXAxis,
      yAxis:            this.draftYAxis,
      xRange:           { ...this.draftXRange },
      yRange:           { ...this.draftYRange },
      weeksTotal:       weeks,
      weeksRemaining:   weeks,
      interest:         0,
      focusMultiplier:  this.calcFocusMultiplier(
                          this.draftXAxis, this.draftYAxis,
                          this.draftXRange, this.draftYRange),
      trackedBrackets:  this._buildTrackedBrackets(
                          this.draftXAxis, this.draftYAxis,
                          this.draftXRange, this.draftYRange),
      weeklyDeltas:     [],  // per-week estimated attendance delta (integer visitors)
      cost,
      roundLaunched:    round,
      trialMode:        this.draftTrialMode,
      projectedDeltas:  null,  // set by tickCampaigns on trial completion
    });
    // Increment use count after computing awardBoost so the snapshot reflects this tier.
    if (this.draftAward) {
      this.marketingUses[this.draftAward] = (this.marketingUses[this.draftAward] ?? 0) + 1;
    }
    this.draftAward = null;
    this.draftRide  = null;
    updateHUD();
    this.buildPanel();
  },

  // Tracks which top-level view is shown: 'design' or 'campaigns'.
  _activeView: 'design',
  // Campaign object currently selected in the campaigns list, or null.
  _selectedCampaign: null,
  // Which chart mode is shown in the campaign detail: 'absolute', 'relative', or 'cumulative'.
  _chartMode: 'absolute',

  // Switches top-level view and rebuilds the panel.
  setView(v) {
    this._activeView = v;
    if (v !== 'campaigns') this._selectedCampaign = null;
    this.buildPanel();
  },

  // Sets the selected campaign by roundLaunched key and rebuilds only the campaigns view.
  _selectCampaign(roundLaunched) {
    const all = [...activeCampaigns, ...completedCampaigns];
    this._selectedCampaign = all.find(c => c.roundLaunched === roundLaunched) ?? null;
    this._chartMode = 'absolute';
    this._buildCampaignsView();
  },

  // Renders the tab bar + the active view into marketing-panel-body.
  buildPanel() {
    document.getElementById('marketing-panel-body').innerHTML = `
      <div class="mkt-tab-bar">
        <button class="mkt-tab-btn${this._activeView === 'design'    ? ' active' : ''}" data-mkt-view="design">Design</button>
        <button class="mkt-tab-btn${this._activeView === 'campaigns' ? ' active' : ''}" data-mkt-view="campaigns">Campaigns</button>
      </div>
      <div id="mkt-design-view"    class="${this._activeView === 'design'    ? '' : 'hidden'}"></div>
      <div id="mkt-campaigns-view" class="${this._activeView === 'campaigns' ? '' : 'hidden'}"></div>`;
    document.querySelectorAll('.mkt-tab-btn').forEach(btn =>
      btn.addEventListener('click', () => this.setView(btn.dataset.mktView))
    );
    if (this._activeView === 'design')    this._buildDesignView();
    if (this._activeView === 'campaigns') this._buildCampaignsView();
  },

  // Renders the campaign designer into #mkt-design-view and wires its event listeners.
  _buildDesignView() {
    const eligibleRides = this._getEligibleRides();
    // Clear selected ride if it is no longer eligible (e.g. construction finished long ago).
    if (this.draftRide && !eligibleRides.some(r => r.instanceId === this.draftRide)) {
      this.draftRide = null;
    }

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

    document.getElementById('mkt-design-view').innerHTML = `
      <div class="panel-section-header">Campaign Designer</div>
      <div class="mkt-mode-toggle">
        <button class="mkt-mode-btn${!this.draftTrialMode ? ' active' : ''}" data-mkt-trial="false">Full Campaign</button>
        <button class="mkt-mode-btn${this.draftTrialMode ? ' active' : ''}" data-mkt-trial="true">Trial Run</button>
      </div>
      ${this.draftTrialMode ? `<p class="mkt-trial-desc">${this.TRIAL_WEEKS} weeks · no favor changes · reveals projected interest curve</p>` : ''}
      <div class="mkt-layout">

        <div class="mkt-settings-col">
          ${!this.draftTrialMode ? `
          <div class="form-field">
            <label for="mkt-impressions">Target Impressions</label>
            <input id="mkt-impressions" type="number" min="${this.IMPRESSIONS_STEP}" step="${this.IMPRESSIONS_STEP}" value="${this.draftImpressions}">
            <div class="mkt-estimate">Est. <span id="mkt-est-weeks"></span></div>
          </div>` : ''}
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

      ${Awards.list.length > 0 ? `
      <div class="form-field mkt-award-row">
        <label>Feature an Award <span class="mkt-award-hint">(boosts campaign interest)</span></label>
        <div class="mkt-option-group mkt-award-group">
          <button class="mkt-option-btn${this.draftAward === null ? ' active' : ''}" data-mkt-award="">None</button>
          ${Awards.list.map(a => {
            const boost = this.calcAwardBoost(a.id);
            const uses  = this.marketingUses[a.id] ?? 0;
            const tip   = uses > 0 ? `Used ${uses}× — +${boost.toFixed(2)} interest/wk` : `+${boost.toFixed(2)} interest/wk`;
            return `<button class="mkt-option-btn mkt-option-btn--award${this.draftAward === a.id ? ' active' : ''}"
              data-mkt-award="${a.id}" title="${tip}">${a.name}</button>`;
          }).join('')}
        </div>
      </div>` : ''}

      ${eligibleRides.length > 0 ? `
      <div class="form-field mkt-ride-row">
        <label>Feature a Ride <span class="mkt-award-hint">(highlight a new or upcoming attraction)</span></label>
        <div class="mkt-option-group mkt-award-group">
          <button class="mkt-option-btn${this.draftRide === null ? ' active' : ''}" data-mkt-ride="">None</button>
          ${eligibleRides.map(r => {
            const underConstruction = r.status === STATUS.UNDER_CONSTRUCTION || r.status === STATUS.PAUSED_CONSTRUCTION;
            const tip = underConstruction ? 'Under construction' : `Opened ${round - r.installedRound} week(s) ago`;
            return `<button class="mkt-option-btn mkt-option-btn--award${this.draftRide === r.instanceId ? ' active' : ''}"
              data-mkt-ride="${r.instanceId}" title="${tip}">${r.name}${underConstruction ? ' <em>(coming soon)</em>' : ''}</button>`;
          }).join('')}
        </div>
      </div>` : ''}

      <div class="mkt-launch-row">
        <div class="mkt-cost-line">Cost: <span id="mkt-est-cost"></span></div>
        <button class="mkt-launch-btn"${money < (this.draftTrialMode ? this.calcTrialCost() : this.calcCost()) ? ' disabled title="Insufficient funds"' : ''}>${this.draftTrialMode ? 'Launch Trial Run' : 'Launch Campaign'}</button>
      </div>`;

    this._refreshEstimate();

    document.querySelectorAll('[data-mkt-trial]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftTrialMode = btn.dataset.mktTrial === 'true';
        this._buildDesignView();
      });
    });

    if (!this.draftTrialMode) document.getElementById('mkt-impressions').addEventListener('change', e => {
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

    document.querySelectorAll('[data-mkt-award]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftAward = btn.dataset.mktAward || null;
        document.querySelectorAll('[data-mkt-award]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    document.querySelectorAll('[data-mkt-ride]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftRide = btn.dataset.mktRide || null;
        document.querySelectorAll('[data-mkt-ride]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    document.getElementById('mkt-x-axis').addEventListener('change', e => {
      this.draftXAxis  = e.target.value;
      this.draftXRange = this._fullRange(e.target.value);
      this._buildDesignView();
    });

    document.getElementById('mkt-y-axis').addEventListener('change', e => {
      this.draftYAxis  = e.target.value;
      this.draftYRange = this._fullRange(e.target.value);
      this._buildDesignView();
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

  // Renders the campaigns list + detail pane into #mkt-campaigns-view.
  _buildCampaignsView() {
    const active    = activeCampaigns.map(c    => ({ c, status: 'active'    }));
    const completed = [...completedCampaigns].reverse().map(c => ({ c, status: 'completed' }));
    const all = [...active, ...completed];

    const listItems = all.map(({ c, status }) => {
      const medLabel  = this.MEDIUMS.find(m => m.value === c.medium)?.label ?? c.medium;
      const msgLabel  = this.MESSAGE_TYPES.find(m => m.value === c.messageType)?.label ?? c.messageType;
      const statusStr = status === 'active' ? `${c.weeksRemaining} wk remaining` : 'Completed';
      const trialBadge = c.trialMode ? '<span class="mkt-trial-badge">Trial</span>' : '';
      const sel = this._selectedCampaign?.roundLaunched === c.roundLaunched;
      return `<div class="mkt-clist-item${sel ? ' selected' : ''}" data-round="${c.roundLaunched}">
        <div class="mkt-clist-dot ${status}"></div>
        <div>
          <div class="mkt-clist-label">${medLabel} · ${msgLabel}${trialBadge}</div>
          <div class="mkt-clist-status">${statusStr}</div>
        </div>
      </div>`;
    }).join('') || '<div class="mkt-clist-empty">No campaigns yet.</div>';

    const detail = this._selectedCampaign
      ? this._buildCampaignSummary(this._selectedCampaign)
      : '<div class="mkt-cdetail-empty">Select a campaign to view its summary.</div>';

    document.getElementById('mkt-campaigns-view').innerHTML = `
      <div class="mkt-clist">${listItems}</div>
      <div class="mkt-cdetail">${detail}</div>`;

    document.querySelectorAll('.mkt-clist-item[data-round]').forEach(item =>
      item.addEventListener('click', () => this._selectCampaign(parseInt(item.dataset.round)))
    );
    document.querySelectorAll('.mkt-chart-mode-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        this._chartMode = btn.dataset.chartMode;
        this._buildCampaignsView();
      })
    );
  },

  // Returns the HTML for the detail pane of a single campaign.
  _buildCampaignSummary(c) {
    const medLabel  = this.MEDIUMS.find(m => m.value === c.medium)?.label            ?? c.medium;
    const hookLabel = this.HOOKS.find(h => h.value === c.hook)?.label                ?? c.hook;
    const msgLabel  = this.MESSAGE_TYPES.find(m => m.value === c.messageType)?.label ?? c.messageType;
    const brackets  = c.trackedBrackets.map(b => b.name).join(', ');
    const isActive  = activeCampaigns.includes(c);

    const field = (label, value) =>
      `<div class="mkt-summary-field"><span>${label}</span><span>${value}</span></div>`;

    // For a completed trial, show the projected full curve; otherwise show actual weeklyDeltas.
    const useProjected = c.trialMode && c.projectedDeltas && c.projectedDeltas.length > 0;
    const chartSource  = useProjected ? c.projectedDeltas : c.weeklyDeltas;

    let chartSection = '<div class="mkt-cdetail-empty">No data yet.</div>';
    if (chartSource.length > 0) {
      // Build the data series for the active chart mode.
      // Relative mode is disabled for projected data since history won't match trial weeks.
      let values, chartLabel;
      if (!useProjected && this._chartMode === 'relative') {
        // Delta as a percentage of that week's recorded attendance from history.
        const attByRound = new Map(History.rounds.map(r => [r.round, r.attendance]));
        values = c.weeklyDeltas.map((d, i) =>
          (d / (attByRound.get(c.roundLaunched + i) || 1)) * 100
        );
        chartLabel = 'Est. attendance boost (% of weekly visitors)';
      } else if (this._chartMode === 'cumulative') {
        // Running sum of absolute deltas week over week.
        values = chartSource.reduce((acc, d) => {
          acc.push((acc[acc.length - 1] ?? 0) + d);
          return acc;
        }, []);
        chartLabel = useProjected
          ? 'Projected cumulative attendance boost (full campaign)'
          : 'Est. cumulative attendance boost';
      } else {
        values = chartSource;
        chartLabel = useProjected
          ? 'Projected weekly attendance boost (full campaign)'
          : 'Est. weekly attendance boost';
      }

      const maxVal = Math.max(...values, 1);
      const bars = values.map((v, wi) => {
        const pct     = Math.round(v / maxVal * 100);
        const tipVal  = (!useProjected && this._chartMode === 'relative')
          ? v.toFixed(2) + '%'
          : Math.round(v).toLocaleString() + ' visitors';
        return `<div class="mkt-chart-col">
          <div class="mkt-chart-bar${useProjected ? ' mkt-chart-bar--projected' : ''}" style="height:${pct}%" title="W${wi + 1}: ${tipVal}"></div>
          <div class="mkt-chart-wlabel">W${wi + 1}</div>
        </div>`;
      }).join('');

      // Suppress the relative mode button for projected data (no matching history).
      const modeBtns = ['absolute', 'relative', 'cumulative']
        .filter(mode => !(useProjected && mode === 'relative'))
        .map(mode => {
          const label = mode === 'absolute' ? 'Weekly' : mode === 'relative' ? '% Share' : 'Cumulative';
          const activeMode = (useProjected && this._chartMode === 'relative') ? 'absolute' : this._chartMode;
          return `<button class="mkt-chart-mode-btn${activeMode === mode ? ' active' : ''}"
            data-chart-mode="${mode}">${label}</button>`;
        }).join('');

      chartSection = `
        <div class="mkt-summary-chart-label">${chartLabel}</div>
        <div class="mkt-chart">${bars}</div>
        <div class="mkt-chart-mode-bar">${modeBtns}</div>`;
    }

    const awardLabel = c.award
      ? `${Awards.list.find(a => a.id === c.award)?.name ?? c.award} (+${c.awardBoost.toFixed(2)})`
      : 'None';

    return `
      ${c.trialMode ? field('Type', '<span class="mkt-trial-badge">Trial Run</span>') : ''}
      ${field('Medium',     medLabel)}
      ${field('Hook',       hookLabel)}
      ${field('Message',    msgLabel)}
      ${field('Award',      awardLabel)}
      ${c.featuredRide ? field('Featured Ride', c.featuredRideName) : ''}
      ${!c.trialMode ? field('Impressions', c.impressions.toLocaleString()) : ''}
      ${field('Cost',       '$' + c.cost.toLocaleString())}
      ${field('Targeting',  brackets)}
      ${isActive ? field('Weeks remaining', c.weeksRemaining) : ''}
      ${chartSection}`;
  },
};
