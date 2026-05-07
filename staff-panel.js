// staff-panel.js — Panel UI for the Staff object defined in staff.js.
//
// All methods here extend Staff via Object.assign. They may freely call
// Staff simulation methods since both files are loaded before any execution.

Object.assign(Staff, {

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

  refreshPanel() {
    if (activePanel !== 'staffing') return;
    if (this._activeView === 'roster')     this.buildRosterView();
    if (this._activeView === 'postings')   this.buildPostingsView();
    if (this._activeView === 'candidates') this.buildCandidatesView();
    if (this._activeView === 'benefits')   this.buildBenefitsView();
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

    const bodyRows = this.JOB_TYPES.filter(job =>
      (Unlock.FOOD        || job.id !== JOB.CONCESSIONS_WORKER) &&
      (Unlock.MERCHANDISE || job.id !== JOB.MERCHANDISE_ATTENDANT) &&
      (Unlock.MESSES      || job.id !== JOB.JANITOR) &&
      (Unlock.WEAR        || job.id !== JOB.ENGINEER)
    ).flatMap(job => {
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
          <label class="staff-detail-label">Give Raise</label>
          <div class="staff-raise-options">
            ${[
              { label: `Inflation (+${Math.round(Population.inflationRate * 100)}%)`, newSalary: s.salary + Math.round(s.salary * Population.inflationRate), pct: Population.inflationRate },
              { label: '+10%', newSalary: s.salary + Math.round(s.salary * 0.10), pct: 0.10 },
              { label: '+20%', newSalary: s.salary + Math.round(s.salary * 0.20), pct: 0.20 },
            ].map(opt => `<button class="ride-action-btn sdx-raise-btn" data-salary="${opt.newSalary}" data-pct="${opt.pct}">
                ${opt.label}<br><span class="sdx-raise-sub">$${opt.newSalary.toLocaleString()}/wk</span>
              </button>`).join('')}
          </div>
        </div>
        <div class="staff-propose-salary">
          <label class="staff-detail-label">One-Time Bonus <span class="staff-hint">+10 mood per $500</span></label>
          <div class="staff-raise-options">
            ${[500, 1000, 1500].map(amt =>
              `<button class="ride-action-btn sdx-bonus-btn" data-amount="${amt}">$${amt.toLocaleString()}</button>`
            ).join('')}
          </div>
        </div>
        <div class="ride-detail-actions">
          <button class="ride-action-btn ride-action-danger" id="sdx-fire">Fire</button>
        </div>
      </div>`;

    document.getElementById('sdx-back').addEventListener('click', () => {
      this._selectedStaffId = null;
      this.buildRosterView();
    });
    document.querySelectorAll('.sdx-raise-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newSalary = parseInt(btn.dataset.salary);
        const modifier  = Math.round((newSalary - s.salary) / s.salary * 100);
        s.events.push({ moodModifier: modifier, comment: 'Happy about a raise.' });
        s.salary = newSalary;
        document.querySelectorAll('.sdx-raise-btn').forEach(b => { b.disabled = true; });
        btn.innerHTML = `Applied ✓<br><span class="sdx-raise-sub">$${newSalary.toLocaleString()}/wk</span>`;
      });
    });
    document.querySelectorAll('.sdx-bonus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const amt      = parseInt(btn.dataset.amount);
        const modifier = (amt / 500) * 10;
        s.events.push({ moodModifier: modifier, comment: `Happy about a $${amt.toLocaleString()} bonus.` });
        document.querySelectorAll('.sdx-bonus-btn').forEach(b => { b.disabled = true; });
        btn.textContent = btn.textContent + ' ✓';
      });
    });
    document.getElementById('sdx-fire').addEventListener('click', () => {
      const actionsEl = document.querySelector('.ride-detail-actions');
      actionsEl.innerHTML = `
        <span class="fire-confirm-label">Fire this employee?</span>
        <button class="ride-action-btn ride-action-danger" id="sdx-fire-confirm">Yes, Fire</button>
        <button class="ride-action-btn" id="sdx-fire-cancel">Cancel</button>`;
      document.getElementById('sdx-fire-confirm').addEventListener('click', () => {
        this.roster = this.roster.filter(e => e.instanceId !== instanceId);
        this._selectedStaffId = null;
        this.buildRosterView();
        refreshSecurityOverlay();
      });
      document.getElementById('sdx-fire-cancel').addEventListener('click', () => {
        this.buildStaffDetail(instanceId);
      });
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

    const jobOptions = this.JOB_TYPES
      .filter(j => (Unlock.FOOD        || j.id !== JOB.CONCESSIONS_WORKER) &&
                   (Unlock.MERCHANDISE || j.id !== JOB.MERCHANDISE_ATTENDANT) &&
                   (Unlock.MESSES      || j.id !== JOB.JANITOR) &&
                   (Unlock.WEAR        || j.id !== JOB.ENGINEER))
      .map(j => `<option value="${j.id}" data-salary="${j.weeklySalary}">${j.label}</option>`)
      .join('');

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

  // ── Candidates view ────────────────────────────────────────────────────────
  buildCandidatesView() {
    const container = document.getElementById('staff-candidates-view');
    if (this.candidates.length === 0) {
      const msg = gameStage === STAGE.SETUP
        ? 'No candidates available.'
        : 'No candidates yet. Post a job to attract applicants.';
      container.innerHTML = `<p class="empty-note">${msg}</p>`;
      return;
    }

    const cards = this.candidates.map(c => {
      const job      = this.JOB_TYPES.find(j => j.id === c.jobId);
      const years    = Math.floor(c.weeksEmployed / 52);
      const expStr   = years === 0 ? 'No exp.' : `${years} yr exp`;
      const weeksStr = c.weeksAsCandidate === 0 ? 'Just applied' : `${c.weeksAsCandidate} wk ago`;
      const canHire  = c.isSetupCandidate || this.findMatchingPosting(c) !== null;
      return `<div class="candidate-card">
        <div class="candidate-name">${c.name}</div>
        <div class="candidate-details">
          <span>${job?.label ?? c.jobId}</span>
          <span>$${c.salary.toLocaleString()}/wk</span>
          <span>${expStr}</span>
          <span class="posting-meta">Applied ${weeksStr}</span>
        </div>
        <div class="candidate-actions">
          <button class="hire-btn" data-id="${c.instanceId}" ${canHire ? '' : 'disabled'}>Hire</button>
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

  // Renders all four benefit sections (vacation, parental leave, 401k, medical)
  // and wires their event listeners. Rebuilds innerHTML completely on each call;
  // this is intentional — it keeps state display accurate after any change and
  // avoids stale listener buildup since the container is always fully replaced.
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
      ${Research.completed.has(RESEARCH_ID.PARENTAL_LEAVE) ? `
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
      </div>` : ''}
      ${Research.completed.has(RESEARCH_ID.FOUR_OH_ONE_K) ? `
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
      </div>` : ''}
      ${Research.completed.has(RESEARCH_ID.MEDICAL_COVERAGE) ? `
      <div class="benefits-section">
        <div class="benefits-section-title">Medical Insurance</div>
        ${this._buildMedicalInsuranceHTML()}
      </div>` : ''}`;

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

    document.getElementById('ben-parental-apply')?.addEventListener('click', () => {
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

    document.getElementById('ben-retirement-apply')?.addEventListener('click', () => {
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

    const shopBtn = document.getElementById('ben-medical-shop');
    if (shopBtn) {
      shopBtn.addEventListener('click', () => {
        this.medicalQuoteCooldown = 4;
        this.buildBenefitsView();
      });
    }
    const acceptBtn = document.getElementById('ben-medical-accept');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        this.medicalPolicy = { ...this.medicalQuote, weeksRemaining: this.medicalQuote.durationWeeks };
        this.medicalQuote  = null;
        this.buildBenefitsView();
      });
    }
    const dismissBtn = document.getElementById('ben-medical-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        this.medicalQuote = null;
        this.buildBenefitsView();
      });
    }
    const cancelRenewBtn = document.getElementById('ben-medical-cancel-renew');
    if (cancelRenewBtn) {
      cancelRenewBtn.addEventListener('click', () => {
        this.medicalPolicy.autoRenew = false;
        this.buildBenefitsView();
      });
    }
  },

  // Returns the inner HTML for the medical insurance section. Renders one of
  // four states depending on current insurance state:
  //   Quote pending  — accept/dismiss buttons with full quote details
  //   Shopping       — countdown message (+ current policy summary if active)
  //   Policy active  — policy details, shop button, and a cancel-auto-renew
  //                    button during the final 4 weeks of an auto-renew policy
  //   Idle           — shop-for-coverage button only
  _buildMedicalInsuranceHTML() {
    const autoRenewTag = p => p.autoRenew ? ` — Auto-renews (+$${p.renewalBump})` : '';
    const policyLine   = p => `${p.tier} — $${p.pricePerEmployee}/employee/week — ${p.weeksRemaining} wks remaining${autoRenewTag(p)}`;
    if (this.medicalQuote) {
      const q = this.medicalQuote;
      return `
        <p class="staff-detail-label">${q.tier} — $${q.pricePerEmployee}/employee/week — ${q.durationWeeks} weeks${autoRenewTag(q)}</p>
        <div class="staff-propose-row">
          <button class="ride-action-btn" id="ben-medical-accept">Accept</button>
          <button class="ride-action-btn" id="ben-medical-dismiss">Dismiss</button>
        </div>
        ${this.medicalPolicy ? `<p class="staff-detail-label" style="margin-top:8px">Current: ${policyLine(this.medicalPolicy)}</p>` : ''}`;
    }
    if (this.medicalQuoteCooldown > 0) {
      return `<p class="staff-detail-label">Quote arriving in ${this.medicalQuoteCooldown} week${this.medicalQuoteCooldown !== 1 ? 's' : ''}...</p>
        ${this.medicalPolicy ? `<p class="staff-detail-label" style="margin-top:8px">Current: ${policyLine(this.medicalPolicy)}</p>` : ''}`;
    }
    if (this.medicalPolicy) {
      const p = this.medicalPolicy;
      const cancelBtn = p.autoRenew && p.weeksRemaining <= 4
        ? `<button class="ride-action-btn" id="ben-medical-cancel-renew" style="margin-top:8px">Cancel Auto-Renew</button>`
        : '';
      return `
        <p class="staff-detail-label">${policyLine(p)}</p>
        <button class="ride-action-btn" id="ben-medical-shop" style="margin-top:8px">Shop for New Coverage</button>
        ${cancelBtn}`;
    }
    return `<button class="ride-action-btn" id="ben-medical-shop">Shop for Coverage</button>`;
  },

});
