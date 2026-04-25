// survey.js — Guest satisfaction survey system.
//
// Players pay to send surveys to guests. Only a fraction respond.
// Results are noisy: accuracy improves with more responses following 1/√n.
// Completed results accumulate in pendingResults until History.record() drains them.

const Survey = {

  // Noise scale: reported score = true score ± (NOISE_K / sqrt(completed)).
  // At 10 responses noise is ~±11 pts; at 100 responses ~±3.5 pts.
  NOISE_K: 35,

  INCENTIVES: Object.freeze([
    { id: SURVEY_INCENTIVE.NONE,     label: 'No Incentive',   completionRate: 0.10, costPerSurvey: 1 },
    { id: SURVEY_INCENTIVE.DISCOUNT, label: 'Discount Coupon', completionRate: 0.25, costPerSurvey: 2 },
    { id: SURVEY_INCENTIVE.PRIZE,    label: 'Prize Entry',     completionRate: 0.35, costPerSurvey: 3 },
  ]),

  // Surveys run this round, not yet recorded in History.
  pendingResults: [],

  // True satisfaction per category derived from current game state, 0–100.
  // Each formula mirrors how that category already affects demand/excitement.
  trueSatisfaction() {
    return {
      rides:       Finance.rideOpinion * 100,
      security:    Math.max(0, 1 - Math.sqrt(Security.opinion) / 100) * 100,
      food:        (Finance.mealSatisfaction - 0.5) * 200,
      cleanliness: Math.max(0, (2 - Finance.calcMessFactor()) * 100),
      shopping:    Shopping.calcStaffingState().staffRatio * 100,
    };
  },

  // Deducts cost, computes noisy reported scores, pushes result to pendingResults.
  // Returns null if not in play stage or insufficient funds.
  run(batchSize, incentiveId) {
    if (gameStage !== STAGE.PLAY) return null;
    const incentive = this.INCENTIVES.find(i => i.id === incentiveId) ?? this.INCENTIVES[0];
    const cost      = Math.round(batchSize * incentive.costPerSurvey);
    if (money < cost) return null;

    money -= cost;
    updateHUD();

    const completed  = Math.round(batchSize * incentive.completionRate);
    const noiseRange = completed > 0 ? this.NOISE_K / Math.sqrt(completed) : 50;
    const trueScores = this.trueSatisfaction();

    const reportedScores = {};
    for (const [cat, trueVal] of Object.entries(trueScores)) {
      const jitter = (Math.random() - 0.5) * 2 * noiseRange;
      reportedScores[cat] = Math.max(0, Math.min(100, trueVal + jitter));
    }

    const result = { round, batchSize, completed, incentiveId, cost, noiseRange, reportedScores };
    this.pendingResults.push(result);

    const el = document.getElementById('survey-panel-body');
    if (el) Survey.buildPanel();
    return result;
  },

  // Called by History.record() — returns pending results and clears the queue.
  drainPending() {
    const results = [...this.pendingResults];
    this.pendingResults = [];
    return results;
  },

  buildPanel() {
    const el = document.getElementById('survey-panel-body');
    if (!el) return;

    if (gameStage !== STAGE.PLAY) {
      el.innerHTML = '<p class="empty-note">Surveys are available once the park is open.</p>';
      return;
    }

    const incentive = this.INCENTIVES.find(i => i.id === _surveyIncentive) ?? this.INCENTIVES[0];
    const cost      = Math.round(_surveyBatchSize * incentive.costPerSurvey);
    const expected  = Math.round(_surveyBatchSize * incentive.completionRate);
    const canAfford = money >= cost;

    const incentiveRows = this.INCENTIVES.map(inc => `
      <label class="survey-incentive-row">
        <input type="radio" name="survey-incentive" value="${inc.id}"
               ${inc.id === _surveyIncentive ? 'checked' : ''}>
        <div class="survey-incentive-info">
          <span class="survey-incentive-label">${inc.label}</span>
          <span class="survey-incentive-meta">$${inc.costPerSurvey}/survey &middot; ${inc.completionRate * 100}% respond</span>
        </div>
      </label>`).join('');

    const sentSection = this.pendingResults.length > 0
      ? `<div class="panel-section-header">Sent This Round</div>
         <div class="survey-sent-list">${this.pendingResults.map(r =>
           `<div class="survey-sent-row">${r.batchSize.toLocaleString()} surveys &middot; ${r.completed} responses &middot; $${r.cost.toLocaleString()}</div>`
         ).join('')}</div>`
      : '';

    el.innerHTML = `
      <div class="panel-section-header">Incentive</div>
      <div class="survey-incentive-group">${incentiveRows}</div>
      <div class="panel-section-header">Batch Size</div>
      <div class="survey-batch-row">
        <input class="survey-batch-input" type="number" id="survey-batch-input"
               min="10" step="10" value="${_surveyBatchSize}">
        <span class="survey-batch-meta" id="survey-batch-meta">~${expected} responses</span>
      </div>
      <div class="survey-send-wrap">
        <button class="ride-action-btn${canAfford ? '' : ' ride-action-danger'}"
                id="survey-send-btn"${canAfford ? '' : ' disabled'}>
          Send ($${cost.toLocaleString()})
        </button>
      </div>
      ${sentSection}`;

    // Incentive radio — full rebuild since layout may change
    el.querySelectorAll('input[name="survey-incentive"]').forEach(radio => {
      radio.addEventListener('change', () => {
        _surveyIncentive = radio.value;
        Survey.buildPanel();
      });
    });

    // Batch size — partial update only to avoid losing input focus
    el.querySelector('#survey-batch-input').addEventListener('input', e => {
      const val = Math.max(10, parseInt(e.target.value) || 10);
      _surveyBatchSize = val;
      const inc  = Survey.INCENTIVES.find(i => i.id === _surveyIncentive) ?? Survey.INCENTIVES[0];
      const c    = Math.round(val * inc.costPerSurvey);
      const exp  = Math.round(val * inc.completionRate);
      const afford = money >= c;
      document.getElementById('survey-batch-meta').textContent = `~${exp} responses`;
      const btn = document.getElementById('survey-send-btn');
      btn.textContent = `Send ($${c.toLocaleString()})`;
      btn.classList.toggle('ride-action-danger', !afford);
      btn.disabled = !afford;
    });

    el.querySelector('#survey-send-btn').addEventListener('click', () => {
      Survey.run(_surveyBatchSize, _surveyIncentive);
    });
  },

};

let _surveyBatchSize = 100;
let _surveyIncentive  = SURVEY_INCENTIVE.NONE;
