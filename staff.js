// staff.js — Staff definitions, state, and panel rendering.
//
// Adding a new job type: append an entry to JOB_TYPES. Everything else
// (panel grouping, salary totals, hiring/firing when added) picks it up.

// ── Name pool ──────────────────────────────────────────────────────────────
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie',
  'Avery', 'Quinn', 'Peyton', 'Drew', 'Blake', 'Cameron', 'Hayden',
  'Dakota', 'Reese', 'Skyler', 'Finley', 'Logan', 'Parker', 'Sidney',
  'Kendall', 'Emerson', 'Rowan', 'Charlie', 'Sage', 'Harley', 'River',
];

// ── Job type registry ──────────────────────────────────────────────────────
const JOB_TYPES = [
  { id: JOB.RIDE_OPERATOR,    label: 'Ride Operator',    plural: 'Ride Operators',    weeklySalary: 520  },
  { id: JOB.SECURITY,         label: 'Security',         plural: 'Security',          weeklySalary: 640  },
  { id: JOB.JANITOR,          label: 'Janitor',          plural: 'Janitors',          weeklySalary: 480  },
  { id: JOB.ENGINEER,         label: 'Engineer',         plural: 'Engineers',         weeklySalary: 1200 },
  { id: JOB.BOOTH_ATTENDANT,  label: 'Booth Attendant',  plural: 'Booth Attendants',  weeklySalary: 480  },
  { id: JOB.BUSINESS_ANALYST, label: 'Business Analyst', plural: 'Business Analysts', weeklySalary: 1400 },
];

// staff entries: { instanceId, name, jobId, salary, skillModifier, salaryModifier, mood (0–100), weeksEmployed }
let staff = [];
let _staffIdSeq = 0;

// quality 0–100: controls the ceiling of skillModifier and yearsExperience.
// quality 0  → skillModifier always 0.75, yearsExp always 0.
// quality 100 → skillModifier up to 1.25, yearsExp up to 5.
function generateEmployee(quality) {
  const q            = Math.max(0, Math.min(100, quality)) / 100;
  const firstName    = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName     = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const job          = JOB_TYPES[Math.floor(Math.random() * JOB_TYPES.length)];
  const skillModifier  = 0.75 + Math.random() * 0.5 * q;
  const salaryModifier = 0.90 + Math.random() * 0.20;
  const maxYears       = Math.round(5 * q);
  const yearsExp       = maxYears > 0 ? Math.floor(Math.random() * (maxYears + 1)) : 0;
  return {
    instanceId:    `staff_${++_staffIdSeq}`,
    name:          `${firstName} ${lastName}.`,
    jobId:         job.id,
    salary:        Math.round(job.weeklySalary * salaryModifier),
    skillModifier,
    salaryModifier,
    mood:          80,
    weeksEmployed: yearsExp * 52,
  };
}

function hireStaff(jobId, salaryOverride) {
  const emp = generateEmployee(0);
  emp.jobId  = jobId;
  emp.salary = salaryOverride
    ?? Math.round(JOB_TYPES.find(j => j.id === jobId).weeklySalary * emp.salaryModifier);
  staff.push(emp);
}

function initStaff() {
  [
    JOB.RIDE_OPERATOR, JOB.RIDE_OPERATOR,
    JOB.SECURITY, JOB.JANITOR, JOB.ENGINEER,
    JOB.BOOTH_ATTENDANT, JOB.BOOTH_ATTENDANT,
  ].forEach(jobId => {
    const emp  = generateEmployee(0);
    emp.jobId  = jobId;
    emp.salary = Math.round(JOB_TYPES.find(j => j.id === jobId).weeklySalary * emp.salaryModifier);
    staff.push(emp);
  });
}

function totalWeeklySalary() {
  return staff.reduce((sum, s) => sum + s.salary, 0);
}

// ── Experience ─────────────────────────────────────────────────────────────
// < 52 weeks  → Junior  (0.75×)
// 52–156 weeks → Normal  (1.0×)
// > 156 weeks → Senior  (1.25×)
function getExperienceTier(weeksEmployed) {
  if (weeksEmployed < 52)  return { label: 'Junior', multiplier: 0.75 };
  if (weeksEmployed > 156) return { label: 'Senior', multiplier: 1.25 };
  return                          { label: null,      multiplier: 1.0  };
}

function advanceExperience() {
  staff.forEach(s => s.weeksEmployed++);
}

// ── Staffing requirements ──────────────────────────────────────────────────

function operatorsNeededForRide(record) {
  const tiles = record.footprint.flat().filter(v => v === 1).length;
  return tiles >= 10 ? 4 : tiles >= 5 ? 3 : 2;
}

// Total ride operators needed to fully staff every Running ride.
function rideOperatorsNeeded() {
  return installedRides
    .filter(r => r.status === STATUS.ACTIVE && isRideConnected(r))
    .reduce((total, r) => total + operatorsNeededForRide(r), 0);
}

// ── Postings ───────────────────────────────────────────────────────────────
// posting entries: { instanceId, jobId, minYearsExperience, salary, weeksActive }

const POSTING_WEEKLY_COST = 75;

let postings = [];
let _postingIdSeq = 0;

function createPosting(jobId, minYearsExperience, salary) {
  postings.push({
    instanceId: `posting_${jobId}_${++_postingIdSeq}`,
    jobId,
    minYearsExperience,
    salary,
    weeksActive: 0,
  });
}

function cancelPosting(instanceId) {
  postings = postings.filter(p => p.instanceId !== instanceId);
}

function totalPostingCosts() {
  return postings.length * POSTING_WEEKLY_COST;
}

function advancePostings() {
  postings.forEach(p => p.weeksActive++);
}

// ── Candidates ─────────────────────────────────────────────────────────────
// candidate entries: same shape as a staff record, plus weeksAsCandidate.

let candidates = [];

// Generate 4 new candidates each round a posting exists.
function generateCandidates() {
  if (postings.length === 0) return;
  for (let i = 0; i < 4; i++) {
    const emp = generateEmployee(0);
    candidates.push({ ...emp, weeksAsCandidate: 0 });
  }
}

// Returns the first open posting this candidate qualifies for, or null.
function findMatchingPosting(candidate) {
  const years = Math.floor(candidate.weeksEmployed / 52);
  return postings.find(p =>
    p.jobId === candidate.jobId &&
    years >= p.minYearsExperience &&
    candidate.salary <= p.salary
  ) ?? null;
}

// Player-initiated hire: move candidate to staff and fill the matched posting.
function hireCandidate(instanceId) {
  const candidate = candidates.find(c => c.instanceId === instanceId);
  if (!candidate) return;
  const posting = findMatchingPosting(candidate);
  if (!posting) return;

  staff.push({ ...candidate });
  postings   = postings.filter(p => p.instanceId !== posting.instanceId);
  candidates = candidates.filter(c => c.instanceId !== instanceId);
  buildCandidatesView();
}

// Player-initiated decline: remove candidate, posting stays open.
function declineCandidate(instanceId) {
  candidates = candidates.filter(c => c.instanceId !== instanceId);
  buildCandidatesView();
}

// Check withdrawals then increment weeksAsCandidate.
// Withdrawal chance: 20% at week 4, +20% for each additional week.
function advanceCandidates() {
  candidates = candidates.filter(c => {
    if (c.weeksAsCandidate < 4) return true;
    const withdrawChance = 0.20 + (c.weeksAsCandidate - 4) * 0.20;
    return Math.random() >= withdrawChance;
  });
  candidates.forEach(c => c.weeksAsCandidate++);
}

// ── Staff panel sub-view switching ─────────────────────────────────────────
let _activeStaffView = 'roster';

function initStaffPanel() {
  document.querySelectorAll('.staff-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setStaffView(_activeStaffView === btn.dataset.view ? 'roster' : btn.dataset.view);
    });
  });
}

function setStaffView(viewName) {
  _activeStaffView = viewName;
  document.querySelectorAll('.staff-action-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.view === viewName)
  );
  document.getElementById('staff-roster-view').classList.toggle('hidden',    viewName !== 'roster');
  document.getElementById('staff-postings-view').classList.toggle('hidden',  viewName !== 'postings');
  document.getElementById('staff-candidates-view').classList.toggle('hidden', viewName !== 'candidates');
  if (viewName === 'postings')    buildPostingsView();
  if (viewName === 'roster')     buildStaffPanel();
  if (viewName === 'candidates') buildCandidatesView();
}

function openStaffPanel() {
  setStaffView(_activeStaffView);
}

// ── Staff panel ────────────────────────────────────────────────────────────
function getMoodInfo(mood) {
  if (mood >= 70) return { label: 'Happy',   cls: 'mood-happy'   };
  if (mood >= 40) return { label: 'Neutral', cls: 'mood-neutral' };
  return                  { label: 'Unhappy', cls: 'mood-unhappy' };
}

function buildStaffPanel() {
  const container = document.getElementById('staff-overview');

  const bodyRows = JOB_TYPES.flatMap(job => {
    const members = staff.filter(s => s.jobId === job.id);
    const header  = `<tr class="job-group-header">
      <td colspan="3">${job.plural} <span class="group-count">(${members.length})</span></td>
    </tr>`;
    if (members.length === 0) {
      return [header, `<tr class="job-empty-row"><td colspan="3">None hired</td></tr>`];
    }
    return [header, ...members.map((s, i) => {
      const { label: moodLabel, cls: moodCls } = getMoodInfo(s.mood);
      const { label: expLabel }                = getExperienceTier(s.weeksEmployed);
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
}

// ── Postings view ──────────────────────────────────────────────────────────
function buildPostingsView() {
  const container = document.getElementById('staff-postings-view');

  const jobOptions = JOB_TYPES.map(j =>
    `<option value="${j.id}" data-salary="${j.weeklySalary}">${j.label}</option>`
  ).join('');

  const defaultJob = JOB_TYPES[0];

  const postingCards = postings.length === 0
    ? '<p class="empty-note">No active postings.</p>'
    : postings.map(p => {
        const job    = JOB_TYPES.find(j => j.id === p.jobId);
        const expStr = p.minYearsExperience === 0 ? 'Any experience' : `${p.minYearsExperience}+ yr exp`;
        return `<div class="posting-card">
          <div class="posting-job">${job.label}</div>
          <div class="posting-details">
            <span>${expStr}</span>
            <span>$${p.salary.toLocaleString()}/wk</span>
            <span class="posting-meta">${p.weeksActive} wk active &middot; $${POSTING_WEEKLY_COST}/wk cost</span>
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

  // Toggle form
  document.getElementById('new-posting-btn').addEventListener('click', () =>
    document.getElementById('posting-form').classList.toggle('hidden')
  );

  // Update salary default when job type changes
  document.getElementById('pf-job').addEventListener('change', e => {
    const job = JOB_TYPES.find(j => j.id === e.target.value);
    document.getElementById('pf-salary').value = job.weeklySalary;
  });

  // Submit
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
    createPosting(jobId, minExp, salary);
    buildPostingsView();
  });

  // Discard form
  document.getElementById('pf-discard-btn').addEventListener('click', () =>
    document.getElementById('posting-form').classList.add('hidden')
  );

  // Cancel individual postings
  container.querySelectorAll('.cancel-posting-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      cancelPosting(btn.dataset.id);
      buildPostingsView();
    })
  );
}

function refreshStaffPanel() {
  if (activePanel !== 'staffing') return;
  if (_activeStaffView === 'roster')     buildStaffPanel();
  if (_activeStaffView === 'postings')   buildPostingsView();
  if (_activeStaffView === 'candidates') buildCandidatesView();
}

// ── Candidates view ────────────────────────────────────────────────────────
function buildCandidatesView() {
  const container = document.getElementById('staff-candidates-view');
  if (candidates.length === 0) {
    container.innerHTML = '<p class="empty-note">No candidates yet. Post a job to attract applicants.</p>';
    return;
  }

  const cards = candidates.map(c => {
    const job      = JOB_TYPES.find(j => j.id === c.jobId);
    const years    = Math.floor(c.weeksEmployed / 52);
    const expStr   = years === 0 ? 'No exp.' : `${years} yr exp`;
    const weeksStr = c.weeksAsCandidate === 0 ? 'Just applied' : `${c.weeksAsCandidate} wk ago`;
    const matched  = findMatchingPosting(c) !== null;
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
    btn.addEventListener('click', () => hireCandidate(btn.dataset.id))
  );
  container.querySelectorAll('.decline-btn').forEach(btn =>
    btn.addEventListener('click', () => declineCandidate(btn.dataset.id))
  );
}
