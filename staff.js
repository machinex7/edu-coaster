// staff.js — Staff definitions, state, and panel rendering.
//
// Adding a new job type: append an entry to JOB_TYPES. Everything else
// (panel grouping, salary totals, hiring/firing when added) picks it up.

const Staff = {

  // ── Constants ──────────────────────────────────────────────────────────────
  FIRST_NAMES: [
    'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie',
    'Avery', 'Quinn', 'Peyton', 'Drew', 'Blake', 'Cameron', 'Hayden',
    'Dakota', 'Reese', 'Skyler', 'Finley', 'Logan', 'Parker', 'Sidney',
    'Kendall', 'Emerson', 'Rowan', 'Charlie', 'Sage', 'Harley', 'River',
  ],

  JOB_TYPES: [
    { id: JOB.RIDE_OPERATOR,    label: 'Ride Operator',    plural: 'Ride Operators',    weeklySalary: 520  },
    { id: JOB.SECURITY,         label: 'Security',         plural: 'Security',          weeklySalary: 640  },
    { id: JOB.JANITOR,          label: 'Janitor',          plural: 'Janitors',          weeklySalary: 480  },
    { id: JOB.ENGINEER,         label: 'Engineer',         plural: 'Engineers',         weeklySalary: 1200 },
    { id: JOB.BOOTH_ATTENDANT,       label: 'Booth Attendant',       plural: 'Booth Attendants',       weeklySalary: 480                           },
    { id: JOB.MERCHANDISE_ATTENDANT, label: 'Merchandise Attendant', plural: 'Merchandise Attendants', weeklySalary: Population.MINIMUM_WAGE_WEEKLY },
    { id: JOB.BUSINESS_ANALYST,      label: 'Business Analyst',      plural: 'Business Analysts',      weeklySalary: 1400                          },
    { id: JOB.HR,               label: 'HR',               plural: 'HR',                weeklySalary: 1600 },
  ],

  POSTING_WEEKLY_COST: 75,
  SICKNESS_RATE:       0.02,   // per-round chance of 1-week illness
  INJURY_RATE:         0.005,  // per-round chance of 4-week critical injury
  VACATION_RATE:        0.04,  // per-round base chance of taking a vacation
  VACATION_WEEKS:       1,     // vacation duration in weeks; effective chance = VACATION_RATE × VACATION_WEEKS
  PARENTAL_LEAVE_RATE:  0.003, // per-round chance a healthy employee goes on parental leave
  PARENTAL_LEAVE_WEEKS: 0,     // weeks of paid parental leave per child
  RETIREMENT_MATCH_PCT: 0,     // employer 401(k) match percentage (1–10, 0 = disabled)

  // ── State ──────────────────────────────────────────────────────────────────
  // staff entries: { instanceId, name, jobId, salary, skillModifier, costOfLiving, mood (0–100), weeksEmployed }
  roster:           [],
  _idSeq:           0,
  postings:         [],
  _postingIdSeq:    0,
  candidates:       [],
  _activeView:      'roster',
  _selectedStaffId: null,

  // ── Employee generation ────────────────────────────────────────────────────
  // quality 0–100: controls the ceiling of skillModifier and yearsExperience.
  generateEmployee(quality) {
    const q            = Math.max(0, Math.min(100, quality)) / 100;
    const firstName    = this.FIRST_NAMES[Math.floor(Math.random() * this.FIRST_NAMES.length)];
    const lastName     = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const job          = this.JOB_TYPES[Math.floor(Math.random() * this.JOB_TYPES.length)];
    const skillModifier = 0.75 + Math.random() * 0.5 * q;
    const costOfLiving  = Math.round(job.weeklySalary * (0.80 + Math.random() * 0.40));
    const maxYears      = Math.round(5 * q);
    const yearsExp      = maxYears > 0 ? Math.floor(Math.random() * (maxYears + 1)) : 0;
    return {
      instanceId:              `staff_${++this._idSeq}`,
      name:                    `${firstName} ${lastName}.`,
      jobId:                   job.id,
      salary:                  costOfLiving,
      skillModifier,
      costOfLiving,
      mood:                    80,
      weeksEmployed:           yearsExp * 52,
      focus:                   job.id === JOB.ENGINEER ? ENGINEER_FOCUS.MAINTENANCE : SECURITY_FOCUS.PATROL,
      events:      [],
      weeksOut:    0,
      kids:        0,
    };
  },

  hireStaff(jobId, salaryOverride) {
    const emp    = this.generateEmployee(0);
    const jobDef = this.JOB_TYPES.find(j => j.id === jobId);
    emp.jobId        = jobId;
    emp.focus        = jobId === JOB.ENGINEER ? ENGINEER_FOCUS.MAINTENANCE : SECURITY_FOCUS.PATROL;
    emp.costOfLiving = Math.round(jobDef.weeklySalary * (0.80 + Math.random() * 0.40));
    emp.salary       = salaryOverride ?? emp.costOfLiving;
    emp.events.push({ moodModifier: 20, comment: 'Excited to start a new job.' });
    this.roster.push(emp);
  },

  init() {
    [
      JOB.RIDE_OPERATOR, JOB.RIDE_OPERATOR,
      JOB.SECURITY, JOB.JANITOR, JOB.ENGINEER,
      JOB.BOOTH_ATTENDANT, JOB.BOOTH_ATTENDANT,
    ].forEach(jobId => {
      const emp    = this.generateEmployee(0);
      const jobDef = this.JOB_TYPES.find(j => j.id === jobId);
      emp.jobId        = jobId;
      emp.focus        = jobId === JOB.ENGINEER ? ENGINEER_FOCUS.MAINTENANCE : SECURITY_FOCUS.PATROL;
      emp.costOfLiving = Math.round(jobDef.weeklySalary * (0.80 + Math.random() * 0.40));
      emp.salary       = emp.costOfLiving;
      emp.mood         = 50;
      this.roster.push(emp);
    });
  },

  totalWeeklySalary() {
    return this.roster.reduce((sum, s) => sum + s.salary, 0);
  },

  // ── Experience ─────────────────────────────────────────────────────────────
  getExperienceTier(weeksEmployed) {
    if (weeksEmployed < 52)  return { label: 'Junior', multiplier: 0.75, tier: 1 };
    if (weeksEmployed > 260) return { label: 'Lead',   multiplier: 1.5,  tier: 4 };
    if (weeksEmployed > 156) return { label: 'Senior', multiplier: 1.25, tier: 3 };
    return                          { label: null,      multiplier: 1.0,  tier: 2 };
  },

  advanceExperience() {
    this.roster.forEach(s => {
      const tierBefore = this.getExperienceTier(s.weeksEmployed).tier;
      s.weeksEmployed++;
      if (this.getExperienceTier(s.weeksEmployed).tier > tierBefore) {
        s.events.push({ moodModifier: 20, comment: 'Excited for my new title.' });
      }
    });
  },

  applyInflation() {
    const weeklyRate = Population.inflationRate / 52;
    this.roster.forEach(s => {
      s.costOfLiving = Math.round(s.costOfLiving * (1 + weeklyRate));
    });
  },

  // Each round: decrement remaining absence time, then roll for new absences on
  // healthy staff. Injury and sickness are checked first; vacation last.
  // Effective vacation chance = VACATION_RATE × VACATION_WEEKS.
  processSickness() {
    this.roster.forEach(s => {
      if (s.weeksOut > 0) {
        s.weeksOut--;
      } else {
        const roll             = Math.random();
        const vacationChance   = this.VACATION_RATE * this.VACATION_WEEKS;
        const parentalThreshold = this.INJURY_RATE + this.SICKNESS_RATE + vacationChance + this.PARENTAL_LEAVE_RATE;
        if (roll < this.INJURY_RATE) {
          s.weeksOut = 4;
          s.events.push({ moodModifier: -20, comment: 'I got seriously injured...' });
        } else if (roll < this.INJURY_RATE + this.SICKNESS_RATE) {
          s.weeksOut = 1;
          s.events.push({ moodModifier: -10, comment: 'I feel sick...' });
        } else if (roll < this.INJURY_RATE + this.SICKNESS_RATE + vacationChance) {
          s.weeksOut = this.VACATION_WEEKS;
          s.events.push({ moodModifier: 10, comment: 'Taking a vacation!' });
        } else if (roll < parentalThreshold) {
          s.weeksOut = 5 * (this.PARENTAL_LEAVE_WEEKS + 2);
          s.kids++;
          s.events.push({ moodModifier: 30, comment: 'Having a baby!' });
        }
      }
    });
  },

  updateMoods() {
    this.roster.forEach(s => {
      const ratio      = s.salary / s.costOfLiving;
      const base       = ratio / 2 * 100;
      const eventBonus = s.events.reduce((sum, e) => sum + e.moodModifier, 0);
      s.mood = Math.round(Math.max(0, Math.min(100, base + eventBonus + 5 * this.VACATION_WEEKS)));

      s.events.forEach(e => { e.moodModifier -= Math.sign(e.moodModifier) * 2; });
      s.events = s.events.filter(e => Math.abs(e.moodModifier) >= 2);
    });
  },

  // ── Staffing requirements ──────────────────────────────────────────────────
  operatorsNeededForRide(record) {
    const tiles = record.footprint.flat().filter(v => v === 1).length;
    return tiles >= 10 ? 4 : tiles >= 5 ? 3 : 2;
  },

  rideOperatorsNeeded() {
    return installedRides
      .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
      .reduce((total, r) => total + this.operatorsNeededForRide(r), 0);
  },

  // Total mess units janitors can clear per week.
  // Each janitor clears (40 + 5 × tier) messes/day × 7 days.
  calcJanitorCapacity() {
    return this.roster
      .filter(s => s.jobId === JOB.JANITOR && s.weeksOut === 0)
      .reduce((sum, s) => {
        const { tier } = this.getExperienceTier(s.weeksEmployed);
        return sum + (40 + 5 * tier) * 7;
      }, 0);
  },

  // ── Postings ───────────────────────────────────────────────────────────────
  createPosting(jobId, minYearsExperience, salary) {
    this.postings.push({
      instanceId: `posting_${jobId}_${++this._postingIdSeq}`,
      jobId,
      minYearsExperience,
      salary,
      weeksActive: 0,
    });
  },

  cancelPosting(instanceId) {
    this.postings = this.postings.filter(p => p.instanceId !== instanceId);
  },

  totalPostingCosts() {
    return this.postings.length * this.POSTING_WEEKLY_COST;
  },

  advancePostings() {
    this.postings.forEach(p => p.weeksActive++);
  },

  // ── Candidates ─────────────────────────────────────────────────────────────
  generateCandidates() {
    if (this.postings.length === 0) return;

    let count   = 4;
    let quality = 0;
    this.roster.filter(s => s.jobId === JOB.HR && s.weeksOut === 0).forEach(s => {
      const { tier } = this.getExperienceTier(s.weeksEmployed);
      count   += tier;
      quality += tier * 5;
    });

    for (let i = 0; i < count; i++) {
      const emp       = this.generateEmployee(quality);
      const candidate = { ...emp, weeksAsCandidate: 0 };
      if (this.findMatchingPosting(candidate)) this.candidates.push(candidate);
    }
  },

  findMatchingPosting(candidate) {
    const years = Math.floor(candidate.weeksEmployed / 52);
    return this.postings.find(p =>
      p.jobId === candidate.jobId &&
      years >= p.minYearsExperience &&
      candidate.salary <= p.salary
    ) ?? null;
  },

  hireCandidate(instanceId) {
    const candidate = this.candidates.find(c => c.instanceId === instanceId);
    if (!candidate) return;
    const posting = this.findMatchingPosting(candidate);
    if (!posting) return;

    const emp = { ...candidate, events: [...(candidate.events ?? [])] };
    emp.events.push({ moodModifier: 20, comment: 'Excited to start a new job.' });
    this.roster.push(emp);
    this.postings   = this.postings.filter(p => p.instanceId !== posting.instanceId);
    this.candidates = this.candidates.filter(c => c.instanceId !== instanceId);
    this.buildCandidatesView();
  },

  declineCandidate(instanceId) {
    this.candidates = this.candidates.filter(c => c.instanceId !== instanceId);
    this.buildCandidatesView();
  },

  advanceCandidates() {
    this.candidates = this.candidates.filter(c => {
      if (c.weeksAsCandidate < 4) return true;
      const withdrawChance = 0.20 + (c.weeksAsCandidate - 4) * 0.20;
      return Math.random() >= withdrawChance;
    });
    this.candidates.forEach(c => c.weeksAsCandidate++);
  },

  // ── Panel sub-view switching ───────────────────────────────────────────────
  initPanel() {
    document.querySelectorAll('.staff-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setView(this._activeView === btn.dataset.view ? 'roster' : btn.dataset.view);
      });
    });
  },

  setView(viewName) {
    this._activeView = viewName;
    document.querySelectorAll('.staff-action-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.view === viewName)
    );
    document.getElementById('staff-roster-view').classList.toggle('hidden',     viewName !== 'roster');
    document.getElementById('staff-postings-view').classList.toggle('hidden',   viewName !== 'postings');
    document.getElementById('staff-candidates-view').classList.toggle('hidden', viewName !== 'candidates');
    document.getElementById('staff-benefits-view').classList.toggle('hidden',   viewName !== 'benefits');
    if (viewName === 'postings')   this.buildPostingsView();
    if (viewName === 'roster')     this.buildRosterView();
    if (viewName === 'candidates') this.buildCandidatesView();
    if (viewName === 'benefits')   this.buildBenefitsView();
  },

  openPanel() {
    this.setView(this._activeView);
  },

  // ── Roster view ────────────────────────────────────────────────────────────
  getMoodInfo(mood) {
    if (mood >= 70) return { label: 'Happy',   cls: 'mood-happy'   };
    if (mood >= 40) return { label: 'Neutral', cls: 'mood-neutral' };
    return                  { label: 'Unhappy', cls: 'mood-unhappy' };
  },

  buildRosterView() {
    if (this._selectedStaffId) { this.buildStaffDetail(this._selectedStaffId); return; }

    const container = document.getElementById('staff-overview');

    const bodyRows = this.JOB_TYPES.flatMap(job => {
      const members = this.roster.filter(s => s.jobId === job.id);
      const header  = `<tr class="job-group-header">
        <td colspan="3">${job.plural} <span class="group-count">(${members.length})</span></td>
      </tr>`;
      if (members.length === 0) {
        return [header, `<tr class="job-empty-row"><td colspan="3">None hired</td></tr>`];
      }
      return [header, ...members.map(s => {
        const { label: moodLabel, cls: moodCls } = this.getMoodInfo(s.mood);
        const { label: expLabel }                = this.getExperienceTier(s.weeksEmployed);
        const expBadge = expLabel
          ? `<span class="exp-badge exp-${expLabel.toLowerCase()}">${expLabel}</span>`
          : '';
        const outBadge = s.weeksOut > 0
          ? `<span class="out-badge">Out (${s.weeksOut}wk)</span>`
          : '';
        const statusCell = s.weeksOut > 0
          ? `<span class="out-badge">Out</span>`
          : `<span class="mood-badge ${moodCls}">${moodLabel}</span>`;
        return `<tr class="staff-row-clickable" data-id="${s.instanceId}">
          <td>${s.name} ${expBadge} ${outBadge}</td>
          <td>$${s.salary.toLocaleString()}/wk</td>
          <td>${statusCell}</td>
        </tr>`;
      })];
    });

    container.innerHTML = `
      <table class="staff-table">
        <thead><tr><th>Employee</th><th>Salary</th><th>Mood</th></tr></thead>
        <tbody>${bodyRows.join('')}</tbody>
      </table>`;

    container.querySelectorAll('.staff-row-clickable').forEach(row =>
      row.addEventListener('click', () => this.buildStaffDetail(row.dataset.id))
    );
  },

  buildStaffDetail(instanceId) {
    const s = this.roster.find(e => e.instanceId === instanceId);
    if (!s) { this._selectedStaffId = null; this.buildRosterView(); return; }
    this._selectedStaffId = instanceId;

    const container = document.getElementById('staff-overview');
    const job       = this.JOB_TYPES.find(j => j.id === s.jobId);
    const { label: moodLabel, cls: moodCls } = this.getMoodInfo(s.mood);
    const { label: expLabel } = this.getExperienceTier(s.weeksEmployed);
    const expBadge = expLabel
      ? `<span class="exp-badge exp-${expLabel.toLowerCase()}">${expLabel}</span>`
      : '';

    const years = Math.floor(s.weeksEmployed / 52);
    const weeks = s.weeksEmployed % 52;
    const empStr = years > 0 && weeks > 0 ? `${years} yr, ${weeks} wk`
                 : years > 0              ? `${years} yr`
                 :                          `${weeks} wk`;

    let taskHtml = '';
    if (s.weeksOut > 0) {
      const wks = s.weeksOut;
      taskHtml = `<div class="staff-detail-out">Out — ${wks} week${wks !== 1 ? 's' : ''} remaining</div>`;
    } else if (s.jobId === JOB.ENGINEER) {
      const broken    = installedRides
        .filter(r => r.status === STATUS.BROKEN_DOWN)
        .sort((a, b) => b.wear - a.wear);
      const engineers = this.roster.filter(e => e.jobId === JOB.ENGINEER && e.weeksOut === 0);
      const idx       = engineers.findIndex(e => e.instanceId === s.instanceId);

      let taskLabel;
      if (s.focus === ENGINEER_FOCUS.CONSTRUCTION) {
        const underConstruction = [...installedRides, ...installedFacilities, ...Shopping.installed]
          .filter(r => r.status === STATUS.UNDER_CONSTRUCTION)
          .sort((a, b) => b.weeksCompleted - a.weeksCompleted);
        taskLabel = underConstruction.length > 0
          ? `Expediting ${underConstruction[0].name}`
          : (broken[idx] ? `Repairing ${broken[idx].name}` : 'Maintenance');
      } else {
        taskLabel = broken[idx] ? `Repairing ${broken[idx].name}` : 'Maintenance';
      }

      const focusBtns = [
        { focus: ENGINEER_FOCUS.MAINTENANCE,  label: 'Maintenance'  },
        { focus: ENGINEER_FOCUS.CONSTRUCTION, label: 'Construction' },
      ].map(m =>
        `<button class="sec-focus-btn${s.focus === m.focus ? ' active' : ''}"
                 data-engid="${s.instanceId}" data-focus="${m.focus}">${m.label}</button>`
      ).join('');

      taskHtml = `
        <div class="staff-detail-task">${taskLabel}</div>
        <div class="sec-focus-btns" id="eng-focus-btns">${focusBtns}</div>`;
    } else if (s.jobId === JOB.RIDE_OPERATOR) {
      const running   = installedRides.filter(r => r.status === STATUS.ACTIVE && isRideConnected(r));
      const operators = this.roster.filter(o => o.jobId === JOB.RIDE_OPERATOR && o.weeksOut === 0);
      let taskLabel;
      if (running.length === 0) {
        taskLabel = 'No rides running';
      } else if (operators.length < running.length) {
        taskLabel = 'Working multiple rides';
      } else {
        const idx = operators.findIndex(o => o.instanceId === s.instanceId);
        taskLabel = `Operating ${running[idx % running.length].name}`;
      }
      taskHtml = `<div class="staff-detail-task">${taskLabel}</div>`;
    }

    const bubblesHtml = s.events.length === 0 ? '' : `
      <div class="staff-events">
        ${s.events.map(e => `<div class="staff-event-bubble">${e.comment}</div>`).join('')}
      </div>`;

    container.innerHTML = `
      <div class="staff-detail">
        <button class="ride-back-btn" id="sdx-back">← Roster</button>
        <div class="ride-detail-name">${s.name} ${expBadge}</div>
        <div class="staff-detail-job">${job.label}</div>
        ${taskHtml}
        <div class="staff-detail-stats">
          <div class="staff-detail-row">
            <span class="staff-detail-label">Employed</span>
            <span>${empStr}</span>
          </div>
          <div class="staff-detail-row">
            <span class="staff-detail-label">Salary</span>
            <span>$${s.salary.toLocaleString()}/wk</span>
          </div>
          <div class="staff-detail-row">
            <span class="staff-detail-label">Mood</span>
            <span><span class="mood-badge ${moodCls}">${moodLabel}</span></span>
          </div>
        </div>
        ${bubblesHtml}
        <div class="staff-propose-salary">
          <label class="staff-detail-label">Propose New Salary</label>
          <div class="staff-propose-row">
            <input type="number" id="sdx-salary-input" min="0" value="${s.salary}">
            <button class="ride-action-btn" id="sdx-propose">Propose</button>
          </div>
          <p id="sdx-propose-error" class="form-error hidden"></p>
        </div>
        <div class="staff-propose-salary">
          <label class="staff-detail-label">Give Bonus</label>
          <div class="staff-propose-row">
            <input type="number" id="sdx-bonus-input" min="500" step="500" value="500">
            <button class="ride-action-btn" id="sdx-bonus">Give</button>
          </div>
          <p id="sdx-bonus-error" class="form-error hidden"></p>
        </div>
        <div class="ride-detail-actions">
          <button class="ride-action-btn ride-action-danger" id="sdx-fire">Fire</button>
        </div>
      </div>`;

    document.getElementById('sdx-back').addEventListener('click', () => {
      this._selectedStaffId = null;
      this.buildRosterView();
    });
    document.getElementById('sdx-propose').addEventListener('click', () => {
      const val   = parseInt(document.getElementById('sdx-salary-input').value) || 0;
      const errEl = document.getElementById('sdx-propose-error');
      if (val <= 0) {
        errEl.textContent = 'Enter a valid salary.';
        errEl.classList.remove('hidden');
        return;
      }
      if (val !== s.salary) {
        const modifier = Math.round((val - s.salary) / s.salary * 100);
        const comment  = modifier > 0 ? 'Happy about a raise.' : 'Unhappy about a pay cut.';
        s.events.push({ moodModifier: modifier, comment });
      }
      s.salary = val;
      errEl.classList.add('hidden');
      document.getElementById('sdx-propose').textContent = 'Proposed ✓';
      document.getElementById('sdx-propose').disabled = true;
    });
    document.getElementById('sdx-bonus').addEventListener('click', () => {
      const val   = parseInt(document.getElementById('sdx-bonus-input').value) || 0;
      const errEl = document.getElementById('sdx-bonus-error');
      if (val <= 0 || val % 500 !== 0) {
        errEl.textContent = 'Bonus must be a multiple of $500.';
        errEl.classList.remove('hidden');
        return;
      }
      const modifier = (val / 500) * 10;
      s.events.push({ moodModifier: modifier, comment: `Happy about a $${val.toLocaleString()} bonus.` });
      errEl.classList.add('hidden');
      document.getElementById('sdx-bonus').textContent = 'Given ✓';
      document.getElementById('sdx-bonus').disabled = true;
    });
    document.getElementById('sdx-fire').addEventListener('click', () => {
      this.roster = this.roster.filter(e => e.instanceId !== instanceId);
      this._selectedStaffId = null;
      this.buildRosterView();
    });
    document.getElementById('eng-focus-btns')?.querySelectorAll('.sec-focus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const eng = Staff.roster.find(e => e.instanceId === btn.dataset.engid);
        if (eng) eng.focus = btn.dataset.focus;
        this.buildStaffDetail(instanceId);
      });
    });
  },

  // ── Postings view ──────────────────────────────────────────────────────────
  buildPostingsView() {
    const container = document.getElementById('staff-postings-view');

    const jobOptions = this.JOB_TYPES.map(j =>
      `<option value="${j.id}" data-salary="${j.weeklySalary}">${j.label}</option>`
    ).join('');

    const defaultJob = this.JOB_TYPES[0];

    const postingCards = this.postings.length === 0
      ? '<p class="empty-note">No active postings.</p>'
      : this.postings.map(p => {
          const job    = this.JOB_TYPES.find(j => j.id === p.jobId);
          const expStr = p.minYearsExperience === 0 ? 'Any experience' : `${p.minYearsExperience}+ yr exp`;
          return `<div class="posting-card">
            <div class="posting-job">${job.label}</div>
            <div class="posting-details">
              <span>${expStr}</span>
              <span>$${p.salary.toLocaleString()}/wk</span>
              <span class="posting-meta">${p.weeksActive} wk active &middot; $${this.POSTING_WEEKLY_COST}/wk cost</span>
            </div>
            <button class="cancel-posting-btn" data-id="${p.instanceId}">Cancel Posting</button>
          </div>`;
        }).join('');

    container.innerHTML = `
      <div class="postings-toolbar">
        <button id="new-posting-btn">+ New Posting</button>
      </div>
      <div id="posting-form" class="posting-form hidden">
        <div class="form-field">
          <label>Job Type</label>
          <select id="pf-job">${jobOptions}</select>
        </div>
        <div class="form-field">
          <label>Min. Experience (years)</label>
          <input type="number" id="pf-exp" min="0" max="30" value="0">
        </div>
        <div class="form-field">
          <label>Weekly Salary</label>
          <input type="number" id="pf-salary" min="0" value="${defaultJob.weeklySalary}">
        </div>
        <p id="pf-error" class="form-error hidden"></p>
        <div class="form-actions">
          <button id="pf-post-btn">Post Job</button>
          <button id="pf-discard-btn">Discard</button>
        </div>
      </div>
      <div class="postings-list">${postingCards}</div>`;

    document.getElementById('new-posting-btn').addEventListener('click', () =>
      document.getElementById('posting-form').classList.toggle('hidden')
    );

    document.getElementById('pf-job').addEventListener('change', e => {
      const job = this.JOB_TYPES.find(j => j.id === e.target.value);
      document.getElementById('pf-salary').value = job.weeklySalary;
    });

    document.getElementById('pf-post-btn').addEventListener('click', () => {
      const jobId  = document.getElementById('pf-job').value;
      const minExp = parseInt(document.getElementById('pf-exp').value)    || 0;
      const salary = parseInt(document.getElementById('pf-salary').value) || 0;
      const errEl  = document.getElementById('pf-error');

      if (salary <= 0) {
        errEl.textContent = 'Enter a salary.';
        errEl.classList.remove('hidden');
        return;
      }
      this.createPosting(jobId, minExp, salary);
      this.buildPostingsView();
    });

    document.getElementById('pf-discard-btn').addEventListener('click', () =>
      document.getElementById('posting-form').classList.add('hidden')
    );

    container.querySelectorAll('.cancel-posting-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        this.cancelPosting(btn.dataset.id);
        this.buildPostingsView();
      })
    );
  },

  refreshPanel() {
    if (activePanel !== 'staffing') return;
    if (this._activeView === 'roster')     this.buildRosterView();
    if (this._activeView === 'postings')   this.buildPostingsView();
    if (this._activeView === 'candidates') this.buildCandidatesView();
    if (this._activeView === 'benefits')   this.buildBenefitsView();
  },

  // ── Candidates view ────────────────────────────────────────────────────────
  buildCandidatesView() {
    const container = document.getElementById('staff-candidates-view');
    if (this.candidates.length === 0) {
      container.innerHTML = '<p class="empty-note">No candidates yet. Post a job to attract applicants.</p>';
      return;
    }

    const cards = this.candidates.map(c => {
      const job      = this.JOB_TYPES.find(j => j.id === c.jobId);
      const years    = Math.floor(c.weeksEmployed / 52);
      const expStr   = years === 0 ? 'No exp.' : `${years} yr exp`;
      const weeksStr = c.weeksAsCandidate === 0 ? 'Just applied' : `${c.weeksAsCandidate} wk ago`;
      const matched  = this.findMatchingPosting(c) !== null;
      return `<div class="candidate-card">
        <div class="candidate-name">${c.name}</div>
        <div class="candidate-details">
          <span>${job?.label ?? c.jobId}</span>
          <span>$${c.salary.toLocaleString()}/wk</span>
          <span>${expStr}</span>
          <span class="posting-meta">Applied ${weeksStr}</span>
        </div>
        <div class="candidate-actions">
          <button class="hire-btn" data-id="${c.instanceId}" ${matched ? '' : 'disabled'}>Hire</button>
          <button class="decline-btn" data-id="${c.instanceId}">Decline</button>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = cards;

    container.querySelectorAll('.hire-btn').forEach(btn =>
      btn.addEventListener('click', () => this.hireCandidate(btn.dataset.id))
    );
    container.querySelectorAll('.decline-btn').forEach(btn =>
      btn.addEventListener('click', () => this.declineCandidate(btn.dataset.id))
    );
  },

  // ── Benefits view ──────────────────────────────────────────────────────────
  buildBenefitsView() {
    const container = document.getElementById('staff-benefits-view');

    container.innerHTML = `
      <div class="benefits-section">
        <div class="benefits-section-title">Vacation</div>
        <div class="form-field">
          <label class="staff-detail-label">Weeks per year</label>
          <div class="staff-propose-row">
            <input type="number" id="ben-vacation-weeks" min="0" max="52" value="${this.VACATION_WEEKS}">
            <button class="ride-action-btn" id="ben-vacation-apply">Apply</button>
          </div>
          <p id="ben-vacation-error" class="form-error hidden"></p>
        </div>
      </div>
      <div class="benefits-section">
        <div class="benefits-section-title">Parental Leave</div>
        <div class="form-field">
          <label class="staff-detail-label">Weeks per child</label>
          <div class="staff-propose-row">
            <input type="number" id="ben-parental-weeks" min="0" max="52" value="${this.PARENTAL_LEAVE_WEEKS}">
            <button class="ride-action-btn" id="ben-parental-apply">Apply</button>
          </div>
          <p id="ben-parental-error" class="form-error hidden"></p>
        </div>
      </div>
      <div class="benefits-section">
        <div class="benefits-section-title">401(k) Match</div>
        <div class="form-field">
          <label class="staff-detail-label">Employer match % (0 = disabled, 1–10)</label>
          <div class="staff-propose-row">
            <input type="number" id="ben-retirement-pct" min="0" max="10" value="${this.RETIREMENT_MATCH_PCT}">
            <button class="ride-action-btn" id="ben-retirement-apply">Apply</button>
          </div>
          <p id="ben-retirement-error" class="form-error hidden"></p>
        </div>
      </div>`;

    document.getElementById('ben-vacation-apply').addEventListener('click', () => {
      const val   = parseInt(document.getElementById('ben-vacation-weeks').value);
      const errEl = document.getElementById('ben-vacation-error');
      if (isNaN(val) || val < 0 || val > 52) {
        errEl.textContent = 'Enter a value between 0 and 52.';
        errEl.classList.remove('hidden');
        return;
      }
      this.VACATION_WEEKS = val;
      errEl.classList.add('hidden');
      this.buildBenefitsView();
    });

    document.getElementById('ben-parental-apply').addEventListener('click', () => {
      const val   = parseInt(document.getElementById('ben-parental-weeks').value);
      const errEl = document.getElementById('ben-parental-error');
      if (isNaN(val) || val < 0 || val > 52) {
        errEl.textContent = 'Enter a value between 0 and 52.';
        errEl.classList.remove('hidden');
        return;
      }
      this.PARENTAL_LEAVE_WEEKS = val;
      errEl.classList.add('hidden');
      this.buildBenefitsView();
    });

    document.getElementById('ben-retirement-apply').addEventListener('click', () => {
      const val   = parseInt(document.getElementById('ben-retirement-pct').value);
      const errEl = document.getElementById('ben-retirement-error');
      if (isNaN(val) || val < 0 || val > 10) {
        errEl.textContent = 'Enter a value between 0 and 10.';
        errEl.classList.remove('hidden');
        return;
      }
      this.RETIREMENT_MATCH_PCT = val;
      errEl.classList.add('hidden');
      this.buildBenefitsView();
    });
  },

};
