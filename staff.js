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
    { id: JOB.BOOTH_ATTENDANT,  label: 'Booth Attendant',  plural: 'Booth Attendants',  weeklySalary: 480  },
    { id: JOB.BUSINESS_ANALYST, label: 'Business Analyst', plural: 'Business Analysts', weeklySalary: 1400 },
    { id: JOB.HR,               label: 'HR',               plural: 'HR',                weeklySalary: 1600 },
  ],

  POSTING_WEEKLY_COST: 75,

  // ── State ──────────────────────────────────────────────────────────────────
  // staff entries: { instanceId, name, jobId, salary, skillModifier, salaryModifier, mood (0–100), weeksEmployed }
  roster:          [],
  _idSeq:          0,
  postings:        [],
  _postingIdSeq:   0,
  candidates:      [],
  _activeView:     'roster',

  // ── Employee generation ────────────────────────────────────────────────────
  // quality 0–100: controls the ceiling of skillModifier and yearsExperience.
  generateEmployee(quality) {
    const q            = Math.max(0, Math.min(100, quality)) / 100;
    const firstName    = this.FIRST_NAMES[Math.floor(Math.random() * this.FIRST_NAMES.length)];
    const lastName     = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const job          = this.JOB_TYPES[Math.floor(Math.random() * this.JOB_TYPES.length)];
    const skillModifier  = 0.75 + Math.random() * 0.5 * q;
    const salaryModifier = 0.80 + Math.random() * 0.40;
    const maxYears       = Math.round(5 * q);
    const yearsExp       = maxYears > 0 ? Math.floor(Math.random() * (maxYears + 1)) : 0;
    return {
      instanceId:    `staff_${++this._idSeq}`,
      name:          `${firstName} ${lastName}.`,
      jobId:         job.id,
      salary:        Math.round(job.weeklySalary * salaryModifier),
      skillModifier,
      salaryModifier,
      mood:          80,
      weeksEmployed: yearsExp * 52,
      focus:         SECURITY_FOCUS.PATROL,
    };
  },

  hireStaff(jobId, salaryOverride) {
    const emp = this.generateEmployee(0);
    emp.jobId  = jobId;
    emp.salary = salaryOverride
      ?? Math.round(this.JOB_TYPES.find(j => j.id === jobId).weeklySalary * emp.salaryModifier);
    this.roster.push(emp);
  },

  init() {
    [
      JOB.RIDE_OPERATOR, JOB.RIDE_OPERATOR,
      JOB.SECURITY, JOB.JANITOR, JOB.ENGINEER,
      JOB.BOOTH_ATTENDANT, JOB.BOOTH_ATTENDANT,
    ].forEach(jobId => {
      const emp  = this.generateEmployee(0);
      emp.jobId  = jobId;
      emp.salary = Math.round(this.JOB_TYPES.find(j => j.id === jobId).weeklySalary * emp.salaryModifier);
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
    this.roster.forEach(s => s.weeksEmployed++);
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
    this.roster.filter(s => s.jobId === JOB.HR).forEach(s => {
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

    this.roster.push({ ...candidate });
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
    if (viewName === 'postings')    this.buildPostingsView();
    if (viewName === 'roster')      this.buildRosterView();
    if (viewName === 'candidates')  this.buildCandidatesView();
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
        return `<tr>
          <td>${s.name} ${expBadge}</td>
          <td>$${s.salary.toLocaleString()}/wk</td>
          <td><span class="mood-badge ${moodCls}">${moodLabel}</span></td>
        </tr>`;
      })];
    });

    container.innerHTML = `
      <table class="staff-table">
        <thead><tr><th>Employee</th><th>Salary</th><th>Mood</th></tr></thead>
        <tbody>${bodyRows.join('')}</tbody>
      </table>`;
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

};
