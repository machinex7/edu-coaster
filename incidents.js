// incidents.js — Random incident system. One incident active at a time, each
// incident defined in incidents.json as a sequence of phases. Phases advance
// automatically when their duration expires; some phases branch on a challenge
// condition (security record, research completion, etc.).

const Incidents = {

  // ── Spawn tuning ───────────────────────────────────────────────────────────
  // Per-round probability that an eligible incident is drawn from the pool.
  SPAWN_CHANCE: 0.05,

  // Minimum rounds between any two incidents (applied after each incident ends).
  GLOBAL_COOLDOWN_ROUNDS: 4,

  // ── Definitions loaded from incidents.json ─────────────────────────────────
  _defs: [],

  // ── Active incident state ──────────────────────────────────────────────────
  // null when no incident is running; otherwise:
  //   { def, phaseIndex, phaseWeeksRemaining, startRound }
  active: null,

  // ── History log ───────────────────────────────────────────────────────────
  // Each resolved incident: { name, emoji, startRound, endRound, phaseName }
  _log: [],

  // ── Permanent modifications summary (display only) ────────────────────────
  // Permanent one-shot effects (competing park, etc.) mutate Population directly.
  // Each entry: { label: string } — shown in the history panel for context.
  _permanentMods: [],

  // ── Cooldown tracking ──────────────────────────────────────────────────────
  _globalCooldown: 0,         // rounds before next spawn attempt
  _lastRoundById:  {},        // incidentId → round on which it last ended
  _startRounds:    [],        // round number recorded each time any incident begins

  // ── Security challenge tracking ────────────────────────────────────────────
  // Set by Finance.processRound() each round so the challenge condition can
  // read the previous round's unhandled incident count.
  lastRoundUnhandled: 0,

  // ── Computed properties ────────────────────────────────────────────────────
  // Reset each tick and recomputed from the current phase's effects.
  // Other systems read these — no scattered conditionals in those files needed.
  demandMultiplier:         1,     // multiplied into calcDailyDemand()
  rideExcitementMultiplier: 1,     // multiplied into calcExcitement()
  bathroomsDisabled:        false, // stops bathrooms contributing to mess cleaning
  staffSickMultiplier:      1,     // multiplied into Staff sick-out rate
  ingredientCostMultipliers: {},   // { itemId: multiplier } on concessions orders
  rideBuildCostMultiplier:  1,     // multiplied into ride/facility build cost in placeItem()
  utilityCostMultiplier:    1,     // multiplied into per-ride utility cost in processRound()

  // ── Init ───────────────────────────────────────────────────────────────────
  // Loads incident definitions from incidents.json. Called from initHUD().
  async init() {
    this._defs = await fetch('incidents.json').then(r => r.json());
  },

  // ── Main tick ──────────────────────────────────────────────────────────────
  // Called once per round from advanceRound(), BEFORE Finance.processRound(),
  // so that computed properties are fresh when the round's revenue is calculated.
  tick() {
    if (this.active) {
      this._tickActive();
    } else {
      if (this._globalCooldown > 0) {
        this._globalCooldown--;
      } else {
        this._trySpawn();
      }
    }
    this._recomputeProperties();
  },

  // ── Spawn ──────────────────────────────────────────────────────────────────
  // Builds the eligible pool, rolls SPAWN_CHANCE, then does a weighted draw.
  _trySpawn() {
    const eligible = this._defs.filter(def => {
      if (round < (def.minRound ?? 0)) return false;
      const last = this._lastRoundById[def.id] ?? -Infinity;
      if (round - last < (def.cooldown ?? 0)) return false;
      if (def.triggerCondition && !this._evalTrigger(def.triggerCondition)) return false;
      return true;
    });
    if (eligible.length === 0) return;
    // Hard cap: no more than 2 incidents may begin within any 52-round window.
    const recentStarts = this._startRounds.filter(r => r > round - WEEKS_PER_YEAR).length;
    if (recentStarts >= 2) return;
    if (Math.random() > this.SPAWN_CHANCE) return;

    const totalWeight = eligible.reduce((s, d) => s + (d.weight ?? 1), 0);
    let roll = Math.random() * totalWeight;
    for (const def of eligible) {
      roll -= (def.weight ?? 1);
      if (roll <= 0) { this._startIncident(def); return; }
    }
    this._startIncident(eligible[eligible.length - 1]);
  },

  // Checks whether an incident's trigger condition is currently met.
  _evalTrigger(cond) {
    if (cond.type === 'has_employee') {
      return Staff.roster.some(s => s.jobId === cond.jobId);
    }
    return true;
  },

  // ── Start an incident ──────────────────────────────────────────────────────
  // Initialises active state, applies phase-0 on_start effects, pushes a
  // notification, and injects the first flavor string into populationEvents.
  _startIncident(def) {
    this._startRounds.push(round);
    this.active = {
      def,
      phaseIndex:         0,
      phaseWeeksRemaining: def.phases[0].durationWeeks,
      startRound:         round,
    };
    this._applyPhaseStart(def.phases[0]);
    Notifications.push({
      label:  def.emoji + ' Incident',
      message: `${def.name}: ${def.phases[0].name} — tap for details.`,
      action: () => openPanel('incidents'),
    });
    console.log(`[Incidents] Started: ${def.name} (phase 0: ${def.phases[0].name})`);
  },

  // ── Tick the active incident ───────────────────────────────────────────────
  _tickActive() {
    const { def, phaseIndex } = this.active;
    const phase = def.phases[phaseIndex];

    // failImmediately challenge: any failing round jumps straight to onFail.
    if (phase.challenge?.failImmediately) {
      if (!this._evalChallenge(phase.challenge)) {
        console.log(`[Incidents] Challenge failed immediately — jumping to phase ${phase.challenge.onFail}`);
        this._advancePhase(phase.challenge.onFail);
        return;
      }
    }

    this.active.phaseWeeksRemaining--;

    if (this.active.phaseWeeksRemaining <= 0) {
      if (phase.challenge) {
        // Non-failImmediately challenge: evaluate at phase end.
        const success = phase.challenge.failImmediately
          ? true   // reached here means all rounds passed
          : this._evalChallenge(phase.challenge);
        console.log(`[Incidents] Phase ${phaseIndex} ended — challenge ${success ? 'SUCCESS' : 'FAIL'}`);
        this._advancePhase(success ? phase.challenge.onSuccess : phase.challenge.onFail);
      } else {
        this._advancePhase(phaseIndex + 1);
      }
    }
  },

  // ── Advance to a phase by index ────────────────────────────────────────────
  // If nextIndex is out of range the incident ends.
  _advancePhase(nextIndex) {
    const { def } = this.active;
    if (nextIndex == null || nextIndex >= def.phases.length) {
      this._endIncident();
      return;
    }
    this.active.phaseIndex          = nextIndex;
    this.active.phaseWeeksRemaining = def.phases[nextIndex].durationWeeks;
    this._applyPhaseStart(def.phases[nextIndex]);
    const phase = def.phases[nextIndex];
    Notifications.push({
      label:  def.emoji,
      message: `${def.name} — ${phase.name}`,
      action: () => openPanel('incidents'),
    });
    console.log(`[Incidents] Advanced to phase ${nextIndex}: ${phase.name}`);
  },

  // ── Apply on_start effects for a phase ────────────────────────────────────
  // Iterates the phase's effects array; fires one-shot effects immediately.
  // Recurring effects are handled in _recomputeProperties().
  _applyPhaseStart(phase) {
    for (const effect of (phase.effects ?? [])) {
      if (effect.timing === 'on_start') this._applyOneShotEffect(effect);
    }
  },

  // ── End the incident ───────────────────────────────────────────────────────
  _endIncident() {
    const { def, phaseIndex, startRound } = this.active;
    this._log.unshift({
      name:      def.name,
      emoji:     def.emoji,
      startRound,
      endRound:  round,
      phaseName: def.phases[phaseIndex].name,
    });
    this._lastRoundById[def.id] = round;
    this._globalCooldown        = this.GLOBAL_COOLDOWN_ROUNDS;
    this.active                 = null;
    Notifications.push({
      label:   '✅',
      message: `${def.name} has ended.`,
    });
    console.log(`[Incidents] Ended: ${def.name}`);
  },

  // ── Evaluate a challenge condition ─────────────────────────────────────────
  // Returns true when the current state satisfies the challenge.
  _evalChallenge(challenge) {
    switch (challenge.conditionType) {
      case 'security_clean':
        // Reads the count set by Finance.processRound() the previous round.
        return this.lastRoundUnhandled === 0;
      case 'benefits_unlocked':
        return Research.completed.has(RESEARCH_ID.EMPLOYEE_BENEFITS);
      default:
        return false;
    }
  },

  // ── One-shot effect handler ────────────────────────────────────────────────
  // Effects with timing:"on_start" fire exactly once when their phase begins.
  // Permanent mutations (competing park, embezzlement) happen here directly.
  _applyOneShotEffect(effect) {
    switch (effect.type) {

      case 'spoil_all_food': {
        // Zero all non-alwaysAvailable concessions stock.
        Concessions.menuItems.forEach((item, i) => {
          if (!item.alwaysAvailable) Concessions.stock[i] = 0;
        });
        Notifications.push({ label: '🌡️', message: 'All freezer stock has spoiled from the heat!' });
        break;
      }

      case 'wear_all_rides': {
        installedRides.forEach(r => { r.wear = (r.wear ?? 0) + effect.amount; });
        Notifications.push({
          label:   '⚠️',
          message: `All rides gained ${effect.amount} wear points from the disaster.`,
          action:  () => openPanel('rides'),
        });
        break;
      }

      case 'demolish_paths_fraction': {
        // Randomly demolish a fraction of placed path tiles immediately.
        const paths    = installedFacilities.filter(f => f.facilityId === FACILITY_ID.PATH);
        const count    = Math.floor(paths.length * effect.fraction);
        const shuffled = paths.slice().sort(() => Math.random() - 0.5);
        shuffled.slice(0, count).forEach(p => completeDemolition(p));
        // Clear animation path cache so it rebuilds without the removed tiles.
        Animations.paths = [];
        Notifications.push({
          label:   '🌊',
          message: `${count} path tiles were destroyed.`,
        });
        break;
      }

      case 'halve_cash': {
        money = Math.floor(money / 2);
        updateHUD();
        break;
      }

      case 'cash_grant': {
        // Award a lump-sum cash payment directly to the park balance.
        money += effect.amount;
        updateHUD();
        Notifications.push({
          label:   '💰',
          message: `Cash grant received: +$${effect.amount.toLocaleString()}.`,
        });
        break;
      }

      case 'fire_employee': {
        // Remove the first matching employee from the roster.
        const idx = Staff.roster.findIndex(s => s.jobId === effect.jobId);
        if (idx !== -1) {
          const emp = Staff.roster[idx];
          Staff.roster.splice(idx, 1);
          Staff.refreshPanel();
          Notifications.push({
            label:   '💸',
            message: `${emp.name} has been terminated for embezzlement.`,
            action:  () => openPanel('staffing'),
          });
        }
        break;
      }

      case 'staff_mood_bonus': {
        // Add a mood bonus to every current employee, capped at 100.
        Staff.roster.forEach(s => { s.mood = Math.min(100, s.mood + effect.value); });
        Staff.refreshPanel();
        break;
      }

      case 'staff_strike_fraction': {
        // Force a fraction of currently working staff onto a multi-week absence.
        const working     = Staff.roster.filter(s => s.weeksOut === 0);
        const strikeCount = Math.floor(working.length * effect.value);
        working.slice(0, strikeCount).forEach(s => { s.weeksOut = 3; });
        Staff.refreshPanel();
        Notifications.push({
          label:   '✊',
          message: `${strikeCount} staff member${strikeCount !== 1 ? 's have' : ' has'} walked off the job.`,
          action:  () => openPanel('staffing'),
        });
        break;
      }

      case 'demographic_chance_multiplier': {
        // Permanently mutate the targeted demographic brackets' chance values.
        // Do NOT reset baselineFavorablePopulation — the reduced chance must
        // create a lasting multiplier < 1 to reflect permanent loss of market share.
        const brackets = Population[effect.bracketKey];
        if (!brackets) break;
        (effect.bracketIndices ?? []).forEach(i => {
          if (brackets[i] != null) {
            brackets[i].chance = +(brackets[i].chance * effect.value).toFixed(4);
          }
        });
        this._permanentMods.push({
          label: `${this.active?.def.name ?? 'Incident'}: local/nearby visitor interest permanently reduced.`,
        });
        break;
      }

      case 'desired_rides_addend': {
        // Permanently increase the rides-per-visit expectation.
        Population.DESIRED_RIDES += effect.value;
        this._permanentMods.push({
          label: `${this.active?.def.name ?? 'Incident'}: guests now expect ${Population.DESIRED_RIDES} rides per visit.`,
        });
        break;
      }

      case 'staff_parental_rate_multiplier': {
        // Permanently multiply the per-round chance that a healthy employee
        // has a child. Staff.processAbsences() reads PARENTAL_LEAVE_RATE directly.
        Staff.PARENTAL_LEAVE_RATE = +(Staff.PARENTAL_LEAVE_RATE * effect.value).toFixed(6);
        this._permanentMods.push({
          label: `${this.active?.def.name ?? 'Incident'}: staff parental leave rate permanently ×${effect.value} (${(Staff.PARENTAL_LEAVE_RATE * 100).toFixed(2)}%/wk).`,
        });
        break;
      }

      case 'demographic_count_multiplier': {
        // Permanently multiply the population count for targeted demographic
        // brackets. Does NOT reset baselineFavorablePopulation so the larger
        // market produces a sustained multiplier > 1 in calcDemandMultiplier().
        const brackets = Population[effect.bracketKey];
        if (!brackets) break;
        (effect.bracketIndices ?? []).forEach(i => {
          if (brackets[i] != null) {
            brackets[i].count = Math.round(brackets[i].count * effect.value);
          }
        });
        this._permanentMods.push({
          label: `${this.active?.def.name ?? 'Incident'}: ${effect.bracketKey} bracket counts permanently ×${effect.value}.`,
        });
        break;
      }

      case 'inflation_addend': {
        // Permanently shifts the annual inflation rate by effect.value percentage points.
        // Positive values raise the baseline (economic crisis); negative values lower it
        // (partial recovery). Clamped at 0 so inflation can never go negative.
        const before = Population.inflationRate;
        Population.inflationRate = Math.max(0, +(Population.inflationRate + effect.value).toFixed(4));
        const pct = pctStr => `${(pctStr * 100).toFixed(1)}%`;
        this._permanentMods.push({
          label: `${this.active?.def.name ?? 'Incident'}: inflation permanently ${effect.value >= 0 ? '+' : ''}${pct(effect.value)} (${pct(before)} → ${pct(Population.inflationRate)} annually).`,
        });
        break;
      }
    }
  },

  // ── Recompute tick-by-tick properties from the active phase ───────────────
  // Called every tick (after spawning/advancing). Resets all properties to
  // their defaults then applies whichever recurring effects the current phase
  // declares. One-shot (on_start) effects are skipped — they already fired.
  _recomputeProperties() {
    this.demandMultiplier         = 1;
    this.rideExcitementMultiplier = 1;
    this.bathroomsDisabled        = false;
    this.staffSickMultiplier      = 1;
    this.ingredientCostMultipliers = {};
    this.rideBuildCostMultiplier  = 1;
    this.utilityCostMultiplier    = 1;
    // Percentage points subtracted from loan interest rates while active.
    this.loanRateDiscount         = 0;
    // Temporary per-bracket favor boosts keyed by bracketKey → bracketIndex → amount.
    // Read by Incidents.getFavorBoost() inside Population.calcDemandMultiplier().
    this.tempFavorBoosts          = {};

    if (!this.active) return;

    const phase   = this.active.def.phases[this.active.phaseIndex];
    const elapsed = phase.durationWeeks - this.active.phaseWeeksRemaining;

    for (const effect of (phase.effects ?? [])) {
      if (effect.timing === 'on_start') continue;
      this._applyRecurringEffect(effect, elapsed);
    }
  },

  // Applies a single recurring effect to the computed properties.
  _applyRecurringEffect(effect, phaseWeeksElapsed) {
    switch (effect.type) {

      case 'demand_multiplier':
        this.demandMultiplier *= effect.value;
        break;

      case 'ride_demand_multiplier': {
        // Optional rampPerRound worsens the multiplier each round of the phase.
        const ramp      = effect.rampPerRound ?? 0;
        const effective = Math.max(0, effect.value + ramp * phaseWeeksElapsed);
        this.rideExcitementMultiplier *= effective;
        break;
      }

      case 'bathroom_disabled':
        this.bathroomsDisabled = true;
        break;

      case 'staff_sick_multiplier':
        this.staffSickMultiplier *= effect.value;
        break;

      case 'ingredient_cost_multiplier':
        (effect.itemIds ?? []).forEach(id => {
          this.ingredientCostMultipliers[id] =
            (this.ingredientCostMultipliers[id] ?? 1) * effect.value;
        });
        break;

      case 'ride_build_cost_multiplier': {
        // Supports rampPerRound so costs climb week-over-week during a shortage
        // and fall back during recovery. Clamped at 1.0 — costs never go below normal.
        const ramp      = effect.rampPerRound ?? 0;
        const effective = Math.max(1, effect.value + ramp * phaseWeeksElapsed);
        this.rideBuildCostMultiplier *= effective;
        break;
      }

      case 'utility_cost_multiplier': {
        // Supports rampPerRound for escalating/recovering energy price shocks.
        // Clamped at 1.0 so utility costs cannot drop below their baseline.
        const ramp      = effect.rampPerRound ?? 0;
        const effective = Math.max(1, effect.value + ramp * phaseWeeksElapsed);
        this.utilityCostMultiplier *= effective;
        break;
      }

      case 'loan_rate_discount':
        // Reduces the interest rate offered on new loans by this many percentage points.
        // Read by Banking.calcLoanRate() to lower offers during stimulus windows.
        this.loanRateDiscount += effect.value;
        break;

      case 'demographic_favor_addend': {
        // Temporarily boosts favor for specific demographic brackets (by index).
        // Stored in tempFavorBoosts and read each round by Population.calcDemandMultiplier()
        // via Incidents.getFavorBoost() — stored favor values are never mutated.
        const bk = effect.bracketKey;
        if (!this.tempFavorBoosts[bk]) this.tempFavorBoosts[bk] = {};
        (effect.bracketIndices ?? []).forEach(i => {
          this.tempFavorBoosts[bk][i] = (this.tempFavorBoosts[bk][i] ?? 0) + effect.value;
        });
        break;
      }
    }
  },

  // Returns the temporary favor boost for a bracket, keyed by bracketKey and index.
  // Called by Population.calcDemandMultiplier() alongside Discounts.getFavorBoost().
  getFavorBoost(bracketKey, bracketIndex) {
    return (this.tempFavorBoosts[bracketKey] ?? {})[bracketIndex] ?? 0;
  },

  // ── Flavor text ────────────────────────────────────────────────────────────
  // Returns the flavor string for the current active phase and week, or null.
  // Called from showRoundSummary() to inject incident narrative into the modal.
  currentFlavor() {
    if (!this.active) return null;
    const phase   = this.active.def.phases[this.active.phaseIndex];
    const flavor  = phase.flavor ?? [];
    if (flavor.length === 0) return null;
    // elapsed = how many weeks into this phase we are (0 on the spawn round).
    const elapsed = phase.durationWeeks - this.active.phaseWeeksRemaining;
    const idx     = Math.min(elapsed, flavor.length - 1);
    return flavor[idx] ?? null;
  },

  // ── HUD pill ───────────────────────────────────────────────────────────────
  // Returns a pill descriptor for updateAchievementIndicators(), or null.
  hudPill() {
    if (!this.active) return null;
    const { def, phaseIndex, phaseWeeksRemaining } = this.active;
    const phase = def.phases[phaseIndex];
    const label = phase.challenge
      ? `${def.emoji} ${def.name}: ${phaseWeeksRemaining} wk${phaseWeeksRemaining !== 1 ? 's' : ''}`
      : `${def.emoji} ${def.name}: ${phase.name}`;
    return { icon: def.emoji, text: label, panel: 'incidents' };
  },

  // ── Panel ──────────────────────────────────────────────────────────────────
  // Rebuilds the incidents panel content. Called from openPanel() and each
  // round when the panel is open.
  buildPanel() {
    const inner = document.querySelector('#panel-incidents .side-panel-inner');
    if (!inner) return;
    inner.innerHTML = '<div class="panel-header">Incidents</div>';

    // ── Active incident section ──
    const activeSection = document.createElement('div');
    activeSection.className = 'incidents-section';

    if (this.active) {
      const { def, phaseIndex, phaseWeeksRemaining } = this.active;
      const phase = def.phases[phaseIndex];

      // Header with emoji, name, phase name.
      const hdr = document.createElement('div');
      hdr.className = 'incident-active-header';
      hdr.innerHTML = `
        <span class="incident-emoji">${def.emoji}</span>
        <div>
          <div class="incident-name">${def.name}</div>
          <div class="incident-phase">${phase.name}</div>
        </div>
        <span class="incident-weeks">${phaseWeeksRemaining} wk${phaseWeeksRemaining !== 1 ? 's' : ''} left</span>
      `;
      activeSection.appendChild(hdr);

      // Current flavor text — rendered as a newspaper article clipping.
      const flavor = this.currentFlavor();
      if (flavor) {
        const article = document.createElement('div');
        article.className = 'incident-newspaper';

        const masthead = document.createElement('div');
        masthead.className = 'incident-newspaper-masthead';
        masthead.textContent = '★ The Daily Coaster ★';

        const rule = document.createElement('div');
        rule.className = 'incident-newspaper-rule';

        const headline = document.createElement('div');
        headline.className = 'incident-newspaper-headline';
        // Phase name as headline; incident name as kicker above it.
        headline.innerHTML = `<span class="incident-newspaper-kicker">${def.name}</span>${phase.name}`;

        const dateline = document.createElement('div');
        dateline.className = 'incident-newspaper-dateline';
        dateline.textContent = `${getDateLabel()} — SPECIAL REPORT`;

        const body = document.createElement('p');
        body.className = 'incident-newspaper-body';
        // Strip leading emoji cluster for cleaner body copy.
        body.textContent = flavor.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '').trim();

        article.appendChild(masthead);
        article.appendChild(rule);
        article.appendChild(headline);
        article.appendChild(dateline);
        article.appendChild(body);
        activeSection.appendChild(article);
      }

      // Effects summary.
      const recurring = (phase.effects ?? []).filter(e => e.timing !== 'on_start');
      if (recurring.length > 0) {
        const effectsHdr = document.createElement('div');
        effectsHdr.className = 'incident-effects-label';
        effectsHdr.textContent = 'Active effects:';
        activeSection.appendChild(effectsHdr);
        const ul = document.createElement('ul');
        ul.className = 'incident-effects-list';
        recurring.forEach(e => {
          const li = document.createElement('li');
          li.textContent = this._describeEffect(e);
          ul.appendChild(li);
        });
        activeSection.appendChild(ul);
      }

      // Challenge box.
      if (phase.challenge) {
        const box = document.createElement('div');
        box.className = 'incident-challenge-box';
        box.innerHTML = `
          <div class="incident-challenge-label">⚡ Challenge</div>
          <div class="incident-challenge-desc">${this._describeChallenge(phase.challenge)}</div>
          <div class="incident-challenge-meta">
            ${phase.challenge.failImmediately ? 'Any failure ends the challenge immediately.' : 'Evaluated at end of phase.'}
          </div>
        `;
        activeSection.appendChild(box);
      }

      inner.appendChild(activeSection);
    } else {
      activeSection.innerHTML = '<p class="empty-note">No active incident this week.</p>';
      inner.appendChild(activeSection);
    }

    // ── Permanent modifications ──
    if (this._permanentMods.length > 0) {
      const permSection = document.createElement('div');
      permSection.className = 'incidents-section';
      const permHdr = document.createElement('div');
      permHdr.className = 'incidents-section-header';
      permHdr.textContent = 'Permanent changes';
      permSection.appendChild(permHdr);
      this._permanentMods.forEach(mod => {
        const p = document.createElement('p');
        p.className = 'incident-perm-mod';
        p.textContent = mod.label;
        permSection.appendChild(p);
      });
      inner.appendChild(permSection);
    }

    // ── History log ──
    if (this._log.length > 0) {
      const histSection = document.createElement('div');
      histSection.className = 'incidents-section';
      const histHdr = document.createElement('div');
      histHdr.className = 'incidents-section-header';
      histHdr.textContent = 'Recent incidents';
      histSection.appendChild(histHdr);
      this._log.slice(0, 8).forEach(entry => {
        const row = document.createElement('div');
        row.className = 'incident-log-row';
        row.innerHTML = `
          <span class="incident-log-emoji">${entry.emoji}</span>
          <span class="incident-log-name">${entry.name}</span>
          <span class="incident-log-phase">${entry.phaseName}</span>
          <span class="incident-log-rounds">Rnd ${entry.startRound}–${entry.endRound}</span>
        `;
        histSection.appendChild(row);
      });
      inner.appendChild(histSection);
    }
  },

  // Rebuilds the panel if it is currently open.
  refreshPanel() {
    if (activePanel === 'incidents') this.buildPanel();
  },

  // ── Effect description helpers ─────────────────────────────────────────────
  // Returns a plain-English summary of a recurring effect for the panel.
  _describeEffect(effect) {
    const pct = v => `${Math.round((v - 1) * 100)}%`;
    switch (effect.type) {
      case 'demand_multiplier':
        return effect.value >= 1
          ? `Visitor demand +${pct(effect.value)}`
          : `Visitor demand ${pct(effect.value)}`;
      case 'ride_demand_multiplier': {
        const ramp = effect.rampPerRound ? ` (worsens ${Math.abs(Math.round(effect.rampPerRound * 100))}%/wk)` : '';
        return `Ride interest reduced to ${Math.round(effect.value * 100)}%${ramp}`;
      }
      case 'bathroom_disabled':
        return 'Bathrooms not reducing mess this week';
      case 'staff_sick_multiplier':
        return `Staff sick-out rate ×${effect.value}`;
      case 'ingredient_cost_multiplier':
        return `${(effect.itemIds ?? []).join(', ')} cost ×${effect.value}`;
      case 'staff_parental_rate_multiplier':
        return `Staff parental leave rate ×${effect.value} (permanent, applied on phase start)`;
      case 'demographic_count_multiplier':
        return `${effect.bracketKey} bracket populations ×${effect.value} (permanent, applied on phase start)`;
      case 'ride_build_cost_multiplier': {
        const ramp = effect.rampPerRound
          ? ` (${effect.rampPerRound > 0 ? '+' : ''}${Math.round(effect.rampPerRound * 100)}%/wk)`
          : '';
        return `Ride & facility build costs ×${effect.value}${ramp}`;
      }
      case 'utility_cost_multiplier': {
        const ramp = effect.rampPerRound
          ? ` (${effect.rampPerRound > 0 ? '+' : ''}${Math.round(effect.rampPerRound * 100)}%/wk)`
          : '';
        return `Ride utility costs ×${effect.value}${ramp}`;
      }
      case 'loan_rate_discount':
        return `Loan interest rates −${effect.value}%`;
      case 'cash_grant':
        return `One-time cash payment +$${(effect.amount ?? 0).toLocaleString()} (applied on phase start)`;
      case 'demographic_favor_addend':
        return `${effect.bracketKey} brackets [${(effect.bracketIndices ?? []).join(', ')}] favor +${effect.value}`;
      default:
        return effect.type;
    }
  },

  // Returns a plain-English description of a challenge condition.
  _describeChallenge(challenge) {
    switch (challenge.conditionType) {
      case 'security_clean':
        return 'Maintain zero unhandled security incidents each week.';
      case 'benefits_unlocked':
        return 'Unlock Employee Benefits through Business Research before time runs out.';
      default:
        return challenge.conditionType;
    }
  },
};
