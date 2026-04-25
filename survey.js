// survey.js — Guest satisfaction survey system and gate analytics.
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

  CATEGORY_LABELS: Object.freeze({
    rides:       'Rides',
    security:    'Security',
    food:        'Food',
    cleanliness: 'Cleanliness',
    shopping:    'Shopping',
  }),

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

    const rateJitter = (Math.random() - 0.5) * 2 * (incentive.costPerSurvey / 100);
    const completed  = Math.round(batchSize * Math.max(0, incentive.completionRate + rateJitter));
    const noiseRange = completed > 0 ? this.NOISE_K / Math.sqrt(completed) : 50;
    const trueScores = this.trueSatisfaction();

    const reportedScores = {};
    for (const [cat, trueVal] of Object.entries(trueScores)) {
      const jitter = (Math.random() - 0.5) * 2 * noiseRange;
      reportedScores[cat] = Math.max(0, Math.min(100, trueVal + jitter));
    }

    const result = { round, batchSize, completed, incentiveId, cost, noiseRange, reportedScores };
    this.pendingResults.push(result);

    if (document.getElementById('survey-panel-body')) Survey.buildPanel();
    return result;
  },

  // Returns the most recent survey result from this round or past history, or null.
  _lastSurveyResult() {
    if (this.pendingResults.length > 0)
      return this.pendingResults[this.pendingResults.length - 1];
    for (let i = History.rounds.length - 1; i >= 0; i--) {
      const surveys = History.rounds[i].surveys;
      if (surveys && surveys.length > 0) return surveys[surveys.length - 1];
    }
    return null;
  },

  // "Q3 2024" label for the quarter that ends at round completedQ * 13.
  _quarterLabel(completedQ) {
    const weekOfYear   = STARTING_WEEK_OF_YEAR + completedQ * 13 - 1;
    const yearsElapsed = Math.floor((weekOfYear - 1) / 52);
    const weekInYear   = ((weekOfYear - 1) % 52) + 1;
    return `Q${Math.ceil(weekInYear / 13)} ${STARTING_YEAR + yearsElapsed}`;
  },

  // Normalised fractions for a bracket array, weighted by chance × count.
  _demographicFractions(brackets) {
    const weights     = brackets.map(b => b.chance * b.count);
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    return weights.map(w => w / totalWeight);
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

    const available = this.INCENTIVES.filter(inc => {
      if (inc.id === SURVEY_INCENTIVE.DISCOUNT) return Research.completed.has(RESEARCH_ID.SURVEY_COUPON_INCENTIVE);
      if (inc.id === SURVEY_INCENTIVE.PRIZE)    return Research.completed.has(RESEARCH_ID.SURVEY_PRIZE_INCENTIVE);
      return true;
    });
    const incentive = available.find(i => i.id === _surveyIncentive) ?? available[0];
    const cost      = Math.round(_surveyBatchSize * incentive.costPerSurvey);
    const canAfford = money >= cost;

    const incentiveRows = available.map(inc => `
      <label class="survey-incentive-row">
        <input type="radio" name="survey-incentive" value="${inc.id}"
               ${inc.id === _surveyIncentive ? 'checked' : ''}>
        <div class="survey-incentive-info">
          <span class="survey-incentive-label">${inc.label}</span>
          <span class="survey-incentive-meta">$${inc.costPerSurvey}/survey &middot; ${inc.completionRate * 100}% respond</span>
        </div>
      </label>`).join('');

    const last = this.pendingResults[this.pendingResults.length - 1];
    const sentSection = this.pendingResults.length > 0
      ? `<div class="panel-section-header">Sent This Round</div>
         ${last ? `<div class="survey-last-response">${last.completed} people responded to your last survey.</div>` : ''}
         <div class="survey-sent-list">${this.pendingResults.map(r =>
           `<div class="survey-sent-row">${r.batchSize.toLocaleString()} surveys &middot; ${r.completed} responses &middot; $${r.cost.toLocaleString()}</div>`
         ).join('')}</div>`
      : '';

    const lastResult        = this._lastSurveyResult();
    const completedQuarters = Math.floor(History.rounds.length / 13);
    const resultsSection = lastResult
      ? `<div class="survey-results-wrap">
           <button class="ride-action-btn" id="survey-results-btn">Show Survey Results</button>
           <button class="ride-action-btn" id="survey-quarterly-btn"
                   ${completedQuarters < 1 ? 'disabled title="Available after your first full quarter"' : ''}>
             Quarterly Survey Results
           </button>
         </div>`
      : '';

    const totalAttendance = History.rounds.reduce((s, r) => s + r.attendance, 0);
    const gateSection = History.rounds.length > 0
      ? `<div class="panel-section-header">Gate Analytics</div>
         <div class="gate-analytics-body">
           <div class="gate-analytics-stat">${totalAttendance.toLocaleString()} total visitors</div>
           <button class="ride-action-btn" id="gate-demographics-btn">View Group Size Demographics</button>
           <button class="ride-action-btn" id="gate-quarterly-btn"
                   ${completedQuarters < 1 ? 'disabled title="Available after your first full quarter"' : ''}>
             View Quarterly Demographics
           </button>
         </div>`
      : '';

    const totalCars  = History.rounds.reduce((s, r) => s + Math.round(r.parkingIncome / Finance.parkingPrice), 0);
    const hasParking = Staff.roster.some(s => s.jobId === JOB.SECURITY && s.focus === SECURITY_FOCUS.PARKING_OBS && s.weeksOut === 0);
    const parkingSection = History.rounds.length > 0
      ? `<div class="panel-section-header">Parking</div>
         <div class="gate-analytics-body">
           <div class="gate-analytics-stat">${totalCars.toLocaleString()} total cars parked</div>
           ${hasParking
             ? '<button class="ride-action-btn" id="parking-location-btn">View Location Demographics</button>'
             : '<p class="empty-note">Assign a guard to Parking to unlock location data.</p>'}
         </div>`
      : '';

    el.innerHTML = `
      <div class="panel-section-header">Incentive</div>
      <div class="survey-incentive-group">${incentiveRows}</div>
      <div class="panel-section-header">Batch Size</div>
      <div class="survey-batch-row">
        <input class="survey-batch-input" type="number" id="survey-batch-input"
               min="10" step="10" value="${_surveyBatchSize}">
      </div>
      <div class="survey-send-wrap">
        <button class="ride-action-btn${canAfford ? '' : ' ride-action-danger'}"
                id="survey-send-btn"${canAfford ? '' : ' disabled'}>
          Send ($${cost.toLocaleString()})
        </button>
      </div>
      ${sentSection}
      ${resultsSection}
      ${gateSection}
      ${parkingSection}`;

    el.querySelectorAll('input[name="survey-incentive"]').forEach(radio => {
      radio.addEventListener('change', () => {
        _surveyIncentive = radio.value;
        Survey.buildPanel();
      });
    });

    el.querySelector('#survey-batch-input').addEventListener('input', e => {
      const val    = Math.max(10, parseInt(e.target.value) || 10);
      _surveyBatchSize = val;
      const inc    = Survey.INCENTIVES.find(i => i.id === _surveyIncentive) ?? Survey.INCENTIVES[0];
      const c      = Math.round(val * inc.costPerSurvey);
      const afford = money >= c;
      const btn    = document.getElementById('survey-send-btn');
      btn.textContent = `Send ($${c.toLocaleString()})`;
      btn.classList.toggle('ride-action-danger', !afford);
      btn.disabled = !afford;
    });

    el.querySelector('#survey-send-btn').addEventListener('click', () => {
      Survey.run(_surveyBatchSize, _surveyIncentive);
    });

    el.querySelector('#survey-results-btn')?.addEventListener('click', () => {
      const result = Survey._lastSurveyResult();
      if (!result) return;
      Charts.showModal({
        title:       'Survey Results',
        subtitle:    `${result.completed} of ${result.batchSize.toLocaleString()} responded · Round ${result.round}`,
        items:       Object.entries(result.reportedScores).map(([cat, score]) => ({
          label: Survey.CATEGORY_LABELS[cat] ?? cat,
          value: Math.round(score),
        })),
        formatValue: v => `${v}%`,
      });
    });

    el.querySelector('#survey-quarterly-btn')?.addEventListener('click', () => {
      const completedQ = Math.floor(History.rounds.length / 13);
      const qRounds    = History.rounds.slice((completedQ - 1) * 13, completedQ * 13);
      const allSurveys = qRounds.flatMap(r => r.surveys ?? []);
      const categories = Object.keys(Survey.CATEGORY_LABELS);
      Charts.showModal({
        title:        `Quarterly Survey Results — ${Survey._quarterLabel(completedQ)}`,
        subtitle:     allSurveys.length > 0
          ? `${allSurveys.reduce((s, r) => s + r.completed, 0).toLocaleString()} total responses from ${allSurveys.length} survey${allSurveys.length !== 1 ? 's' : ''}`
          : null,
        items:        allSurveys.length > 0
          ? categories.map(cat => ({
              label: Survey.CATEGORY_LABELS[cat],
              value: Math.round(allSurveys.reduce((s, r) => s + r.reportedScores[cat], 0) / allSurveys.length),
            }))
          : [],
        formatValue:  v => `${v}%`,
        emptyMessage: 'No surveys were sent during this quarter.',
      });
    });

    el.querySelector('#gate-demographics-btn')?.addEventListener('click', () => {
      const fractions = Survey._demographicFractions(Population.HOUSEHOLD_SIZES);
      Charts.showModal({
        title:       'Group Size Demographics',
        items:       Population.HOUSEHOLD_SIZES.map((b, i) => ({
          label: b.name,
          value: Math.round(fractions[i] * 100),
        })),
        formatValue: v => `${v}%`,
      });
    });

    el.querySelector('#gate-quarterly-btn')?.addEventListener('click', () => {
      const completedQ    = Math.floor(History.rounds.length / 13);
      const qRounds       = History.rounds.slice((completedQ - 1) * 13, completedQ * 13);
      const avgAttendance = qRounds.reduce((s, r) => s + r.attendance, 0) / qRounds.length;
      const fractions     = Survey._demographicFractions(Population.HOUSEHOLD_SIZES);
      Charts.showModal({
        title:       `Quarterly Demographics — ${Survey._quarterLabel(completedQ)}`,
        subtitle:    `Avg. ${Math.round(avgAttendance).toLocaleString()} visitors/week`,
        items:       Population.HOUSEHOLD_SIZES.map((b, i) => ({
          label: b.name,
          value: Math.round(fractions[i] * avgAttendance),
        })),
        formatValue: v => v.toLocaleString(),
      });
    });

    el.querySelector('#parking-location-btn')?.addEventListener('click', () => {
      const fractions = Survey._demographicFractions(Population.DISTANCE_BRACKETS);
      Charts.showModal({
        title:       'Location Demographics',
        items:       Population.DISTANCE_BRACKETS.map((b, i) => ({
          label: b.name,
          value: Math.round(fractions[i] * 100),
        })),
        formatValue: v => `${v}%`,
      });
    });
  },

};

let _surveyBatchSize = 100;
let _surveyIncentive = SURVEY_INCENTIVE.NONE;
