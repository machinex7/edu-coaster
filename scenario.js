// scenario.js — Scenario system: long-term narrative arc with milestone steps.
// Loads scenario.json, tracks the active scenario, and drives the calendar bar
// shown at the top of the screen.

const Scenario = {

  // The currently active scenario object, or null if no scenario is loaded.
  activeScenario: null,

  // Last step's round number, used as the fixed denominator for bar scaling.
  _lastStepRound: 0,

  // Indices of steps that have already fired and been dismissed from the bar.
  _firedSteps: new Set(),

  // Load scenario.json and apply the first scenario.
  async init() {
    const data = await fetch('scenario.json').then(r => r.json());
    if (!data.length) return;
    this.activeScenario = data[0];
    this._lastStepRound = Math.max(...this.activeScenario.steps.map(s => s.round));
    this._buildBar();
    this._refreshBar(0);
  },

  // Called each round from advanceRound() after the round counter increments.
  tick(currentRound) {
    if (!this.activeScenario) return;
    this._checkSteps(currentRound);
    this._refreshBar(currentRound);
  },

  // Create one circle element per step inside #scenario-bar-track.
  // Re-measures --header-h after revealing the bar so panels remain correctly offset.
  _buildBar() {
    const bar = document.getElementById('scenario-bar');
    bar.classList.remove('hidden');
    const headerEl = document.querySelector('header');
    document.documentElement.style.setProperty('--header-h', headerEl.offsetHeight + 'px');
    const track = document.getElementById('scenario-bar-track');
    track.innerHTML = '';
    this.activeScenario.steps.forEach((step, i) => {
      const dot = document.createElement('div');
      dot.className = 'scenario-dot';
      dot.dataset.stepIndex = i;
      // Abbreviate the title to initials for the circle label.
      const words = step.title.trim().split(/\s+/);
      const label = words.length >= 2
        ? words.map(w => w[0].toUpperCase()).join('')
        : step.title.slice(0, 3).toUpperCase();
      dot.textContent = label;
      dot.title = `${step.title} — Week ${step.round}`;
      track.appendChild(dot);
    });
  },

  // Reposition all dot circles based on rounds remaining until each step.
  _refreshBar(currentRound) {
    const track = document.getElementById('scenario-bar-track');
    if (!track) return;
    this.activeScenario.steps.forEach((step, i) => {
      const dot = track.querySelector(`[data-step-index="${i}"]`);
      if (!dot) return;
      if (this._firedSteps.has(i)) {
        dot.classList.add('hidden');
        return;
      }
      // Map (rounds remaining / total scenario length) to the 2–94% range so
      // dots drift smoothly leftward each round and never clip the now-marker.
      const pct = ((step.round - currentRound) / this._lastStepRound) * 92 + 2;
      dot.style.left = `${Math.max(2, pct)}%`;
      dot.classList.toggle('scenario-dot-approaching', step.round - currentRound <= 13);
    });
  },

  // Evaluate and fire any step whose round matches the current round.
  _checkSteps(currentRound) {
    this.activeScenario.steps.forEach((step, i) => {
      if (this._firedSteps.has(i)) return;
      if (step.round !== currentRound) return;
      this._firedSteps.add(i);

      const conditionMet = step.condition
        ? this._evalCondition(step.condition)
        : true;

      // Show the appropriate flavor text as a notification.
      const message = step.condition
        ? (conditionMet ? step.condition.successFlavor : step.condition.failFlavor)
        : step.flavor;
      Notifications.push({ label: step.title, message });

      // Apply the matching effect (success path, fail path, or unconditional).
      const effect = step.condition
        ? (conditionMet ? step.effect : step.failEffect)
        : step.effect;
      if (effect) this._applyEffect(effect);
    });
  },

  // Return true if the condition is satisfied by the current game state.
  _evalCondition(condition) {
    switch (condition.type) {
      case 'cash_gte':
        return money >= condition.value;
      case 'park_value_gte':
        return Finance.parkValue() >= condition.value;
      case 'weekly_attendance_gte': {
        const last = History.rounds[History.rounds.length - 1];
        return last ? last.attendance >= condition.value : false;
      }
      case 'quarterly_revenue_gte': {
        const recent = History.rounds.slice(-13);
        const total = recent.reduce((s, r) =>
          s + (r.gateIncome    ?? 0) + (r.parkingIncome  ?? 0) +
              (r.shopIncome    ?? 0) + (r.foodIncome     ?? 0) +
              (r.membershipIncome ?? 0), 0);
        return total >= condition.value;
      }
      default:
        return true;
    }
  },

  // Permanently mutate game state according to an effect descriptor.
  _applyEffect(effect) {
    switch (effect.type) {
      case 'cash_delta':
        money += effect.value;
        updateHUD();
        break;
      case 'inflation_rate_set':
        Population.inflationRate = effect.value;
        break;
      case 'utility_multiplier_set':
        Population.utilityMultiplier = effect.value;
        break;
      case 'demand_multiplier_set':
        Population.scenarioDemandMultiplier = effect.value;
        break;
    }
  },

};
