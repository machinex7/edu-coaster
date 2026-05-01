// staff.js — Staff state, simulation logic, and round processing.
//
// Adding a new job type: append an entry to JOB_TYPES. Everything else
// (panel grouping, salary totals, hiring) picks it up automatically.
// Panel rendering lives in staff-panel.js.

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
    { id: JOB.CONCESSIONS_WORKER,    label: 'Concessions Worker',    plural: 'Concessions Workers',    weeklySalary: Population.MINIMUM_WAGE_WEEKLY },
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

  medicalQuoteCooldown: 0,     // weeks until quote is ready; 0 = not shopping
  medicalQuote:         null,  // { tier, pricePerEmployee, durationWeeks } pending offer
  medicalPolicy:        null,  // { tier, pricePerEmployee, durationWeeks, weeksRemaining } active policy

  // ── Employee generation ────────────────────────────────────────────────────
  // quality 0–100: controls the ceiling of skillModifier and yearsExperience.
  // jobId optionally pins the candidate to a specific job type; random otherwise.
  generateEmployee(quality, jobId = null) {
    const q            = Math.max(0, Math.min(100, quality)) / 100;
    const firstName    = this.FIRST_NAMES[Math.floor(Math.random() * this.FIRST_NAMES.length)];
    const lastName     = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const job          = jobId
      ? this.JOB_TYPES.find(j => j.id === jobId)
      : this.JOB_TYPES[Math.floor(Math.random() * this.JOB_TYPES.length)];
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
      JOB.RIDE_OPERATOR, JOB.RIDE_OPERATOR, JOB.RIDE_OPERATOR, JOB.RIDE_OPERATOR,
      JOB.SECURITY, JOB.JANITOR, JOB.ENGINEER,
      JOB.BOOTH_ATTENDANT, JOB.BOOTH_ATTENDANT,
      JOB.MERCHANDISE_ATTENDANT,
    ].forEach(jobId => {
      const emp    = this.generateEmployee(0);
      const jobDef = this.JOB_TYPES.find(j => j.id === jobId);
      emp.jobId        = jobId;
      emp.focus        = jobId === JOB.ENGINEER ? ENGINEER_FOCUS.MAINTENANCE : SECURITY_FOCUS.PATROL;
      emp.costOfLiving = Math.round(jobDef.weeklySalary * (0.80 + Math.random() * 0.40));
      emp.salary       = emp.costOfLiving;
      emp.mood         = 70;
      emp.events.push({ moodModifier: 20, comment: 'Excited to start a new job.' });
      this.roster.push(emp);
    });
    this.generateSetupCandidates();
  },

  // Populates the candidate pool before the park opens so the player can hire
  // freely during setup without posting a job. Generates 3 candidates per job
  // type at low-to-medium quality. All are flagged isSetupCandidate so they
  // bypass the posting requirement and are cleared when play begins.
  generateSetupCandidates() {
    this.JOB_TYPES.forEach(jobDef => {
      for (let i = 0; i < 3; i++) {
        const emp = this.generateEmployee(0);
        emp.jobId           = jobDef.id;
        emp.focus           = jobDef.id === JOB.ENGINEER ? ENGINEER_FOCUS.MAINTENANCE : SECURITY_FOCUS.PATROL;
        emp.costOfLiving    = Math.round(jobDef.weeklySalary * (0.80 + Math.random() * 0.40));
        emp.salary          = emp.costOfLiving;
        emp.weeksAsCandidate = 0;
        emp.isSetupCandidate = true;
        this.candidates.push(emp);
      }
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

  // Grows each employee's cost of living by one week of their personal annual
  // inflation rate. Base rate is global inflation; each child adds 1 percentage
  // point on top (3 kids + 2% global = 5% annual for that employee).
  applyInflation() {
    this.roster.forEach(s => {
      const annualRate = Population.inflationRate + s.kids / 100;
      s.costOfLiving = Math.round(s.costOfLiving * (1 + annualRate / 52));
    });
  },

  // Fires a notification if the employee's job type now has no working members.
  // Call this any time a staff member becomes unavailable (absence, fire, quit).
  // Skipped for HR since gaps there are less operationally critical.
  _notifyIfLastWorker(s) {
    if (s.jobId === JOB.HR) return;
    const stillWorking = this.roster.filter(r => r.jobId === s.jobId && r.weeksOut === 0).length;
    if (stillWorking === 0) {
      const jobDef = this.JOB_TYPES.find(j => j.id === s.jobId);
      Notifications.push({
        label:   'Staff',
        message: `Your last ${jobDef.label} is out — no ${jobDef.plural} available this week!`,
        action:  () => openPanel('staffing'),
      });
    }
  },

  // Returns the mood penalty for an absence of the given duration based on the
  // active medical policy tier. Premium = no penalty; Standard = 5 × weeks;
  // no coverage = 10 × weeks. Applied to sick, injury, and parental leave events.
  _insuranceMoodReduction(weeks) {
    const tier = this.medicalPolicy?.tier;
    if (tier === 'Premium')  return 0;
    if (tier === 'Standard') return 5 * weeks;
    return 10 * weeks;
  },

  // Each round: decrement remaining absence time, then roll for new absences on
  // healthy staff. Injury and sickness are checked first; vacation last.
  // Effective vacation chance = VACATION_RATE × VACATION_WEEKS.
  processSickness() {
    this.roster.forEach(s => {
      if (s.weeksOut > 0) {
        s.weeksOut--;
      } else {
        const roll              = Math.random();
        const moodPenalty       = (100 - s.mood) / 2000; // low mood raises injury/sickness chance
        const injuryRate        = this.INJURY_RATE   + moodPenalty;
        const sicknessRate      = this.SICKNESS_RATE + moodPenalty;
        const vacationChance    = this.VACATION_RATE * this.VACATION_WEEKS;
        const parentalThreshold = injuryRate + sicknessRate + vacationChance + this.PARENTAL_LEAVE_RATE;
        if (roll < injuryRate) {
          s.weeksOut = 4;
          s.events.push({ moodModifier: -20 - this._insuranceMoodReduction(4), comment: 'I got seriously injured...' });
        } else if (roll < injuryRate + sicknessRate) {
          s.weeksOut = 1;
          s.events.push({ moodModifier: -10 - this._insuranceMoodReduction(1), comment: 'I feel sick...' });
        } else if (roll < this.INJURY_RATE + this.SICKNESS_RATE + vacationChance) {
          s.weeksOut = this.VACATION_WEEKS;
          s.events.push({ moodModifier: 10, comment: 'Taking a vacation!' });
        } else if (roll < parentalThreshold) {
          s.weeksOut = this.PARENTAL_LEAVE_WEEKS;
          s.kids++;
          const parentalBase = 5 * (this.PARENTAL_LEAVE_WEEKS + 2);
          const reduction    = this._insuranceMoodReduction(this.PARENTAL_LEAVE_WEEKS);
          if (Math.random() < 0.03) {
            s.kids++;
            s.events.push({ moodModifier: parentalBase + 15 - reduction, comment: 'Twins? Twins! ... twins...' });
          } else {
            s.events.push({ moodModifier: parentalBase - reduction, comment: 'Having a baby!' });
          }
        }
        if (s.weeksOut > 0) this._notifyIfLastWorker(s);
      }
    });
  },

  // Recalculates mood for every employee from salary vs cost-of-living ratio,
  // plus flat passive bonuses from active benefits (vacation weeks × 5, 401k
  // match %, kids × 2), plus any pending mood events. Events decay by 2 points
  // per round and are pruned once they fall below ±2.
  updateMoods() {
    const loungeCount  = installedFacilities.filter(f => f.facilityId === FACILITY_ID.STAFF_LOUNGE && f.status === STATUS.ACTIVE).length;
    const loungeBonus  = Math.floor(Math.sqrt(loungeCount));
    this.roster.forEach(s => {
      const ratio      = s.salary / s.costOfLiving;
      const base       = ratio / 2 * 100;
      const eventBonus = s.events.reduce((sum, e) => sum + e.moodModifier, 0);
      s.mood = Math.round(Math.max(0, Math.min(100, base + eventBonus + 5 * this.VACATION_WEEKS + this.RETIREMENT_MATCH_PCT + 2 * s.kids + loungeBonus)));

      s.events.forEach(e => { e.moodModifier -= Math.sign(e.moodModifier) * 2; });
      s.events = s.events.filter(e => Math.abs(e.moodModifier) >= 2);
    });
    const jobLabel = id => this.JOB_TYPES.find(j => j.id === id)?.label ?? id;
    console.log('[mood] ' + this.roster
      .map(s => `${s.name} (${jobLabel(s.jobId)}): ${s.mood} [events: ${s.events.map(e => e.moodModifier).join(', ') || 'none'}]`)
      .join(' | '));
  },

  processQuits() {
    // Employees on any leave (weeksOut > 0) cannot quit mid-absence.
    const quitting = this.roster.filter(s => s.mood === 0 && s.weeksOut === 0);
    if (quitting.length === 0) return;
    this.roster = this.roster.filter(s => s.mood !== 0);
    for (const s of quitting) {
      Notifications.push({
        label:   'Staff',
        message: `${s.name} quit — their mood reached 0.`,
        action:  () => openPanel('staffing'),
      });
      this._notifyIfLastWorker(s);
    }
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
  // Generates one candidate per posted job type each round.
  // Candidates whose salary or experience don't match the posting are discarded.
  // Quality scales with active HR staff tier and benefits.
  // Fires a single notification if any new matching candidates arrived this round.
  generateCandidates() {
    if (this.postings.length === 0) return;

    let quality = 0;
    this.roster.filter(s => s.jobId === JOB.HR && s.weeksOut === 0).forEach(s => {
      const { tier } = this.getExperienceTier(s.weeksEmployed);
      quality += tier * 5;
    });

    // Benefits attract better candidates.
    if (this.RETIREMENT_MATCH_PCT > 0) quality += 10;
    quality += this.VACATION_WEEKS * 5;
    quality += this.PARENTAL_LEAVE_WEEKS * 5;

    // One candidate per unique posted job type; skip types with no open posting.
    const postedJobIds = [...new Set(this.postings.map(p => p.jobId))];
    const before = this.candidates.length;
    for (const jobId of postedJobIds) {
      const emp       = this.generateEmployee(quality, jobId);
      const candidate = { ...emp, weeksAsCandidate: 0 };
      if (this.findMatchingPosting(candidate)) this.candidates.push(candidate);
    }
    if (this.candidates.length > before) {
      Notifications.push({
        label:   'Hire',
        message: 'New candidates are available for your open postings.',
        action:  () => { openPanel('staffing'); Staff.setView('candidates'); },
      });
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

    // Setup candidates don't require a posting — hire directly.
    if (!candidate.isSetupCandidate) {
      const posting = this.findMatchingPosting(candidate);
      if (!posting) return;
      this.postings = this.postings.filter(p => p.instanceId !== posting.instanceId);
    }

    const emp = { ...candidate, events: [...(candidate.events ?? [])] };
    emp.events.push({ moodModifier: 20, comment: 'Excited to start a new job.' });
    this.roster.push(emp);
    this.candidates = this.candidates.filter(c => c.instanceId !== instanceId);
    this.buildCandidatesView();
    refreshSecurityOverlay();
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

  // ── Medical insurance ──────────────────────────────────────────────────────

  // Generates a randomized insurance quote and stores it in medicalQuote.
  // Tier (Standard/Premium) sets the base price range (100–150 or 150–200 ×
  // inflationRate). Longer contracts (2–6 × 4-week increments) get $10/employee
  // off per increment. 50% chance of auto-renew; if so, a fixed renewalBump is
  // rolled once here and reused at every subsequent renewal.
  generateMedicalQuote() {
    const tier       = Math.random() < 0.5 ? 'Standard' : 'Premium';
    const [lo, hi]   = tier === 'Standard' ? [100, 150] : [150, 200];
    const basePrice  = Math.round((lo + Math.random() * (hi - lo)) * Population.inflationRate);
    const increments = 2 + Math.floor(Math.random() * 5);  // 2–6
    const autoRenew = Math.random() < 0.5;
    this.medicalQuote = {
      tier,
      pricePerEmployee:  Math.max(0, basePrice - increments * 10),
      durationWeeks:     increments * 4,
      weeksRemaining:    4,
      autoRenew,
      renewalBump:       autoRenew ? 10 * (1 + Math.floor(Math.random() * 5)) : 0,
    };
  },

  // Called each round. Ticks the quote-shopping countdown and generates a quote
  // when it hits zero. Ticks an unaccepted quote's 4-round expiry window and
  // silently discards it on timeout. Ticks the active policy; on expiry either
  // auto-renews (adding the fixed renewalBump to pricePerEmployee) or nulls the
  // policy, firing an appropriate notification in both cases. A 4-week warning
  // notification is also pushed when the policy enters its final month.
  advanceMedicalInsurance() {
    if (this.medicalQuoteCooldown > 0) {
      this.medicalQuoteCooldown--;
      if (this.medicalQuoteCooldown === 0) {
        this.generateMedicalQuote();
        Notifications.push({
          label: 'Med.',
          message: 'A new medical insurance quote is ready for review.',
          action: () => { openPanel('staffing'); Staff.setView('benefits'); },
        });
      }
    }
    if (this.medicalQuote) {
      this.medicalQuote.weeksRemaining--;
      if (this.medicalQuote.weeksRemaining <= 0) this.medicalQuote = null;
    }
    if (this.medicalPolicy) {
      this.medicalPolicy.weeksRemaining--;
      const openBenefits = () => { openPanel('staffing'); Staff.setView('benefits'); };
      if (this.medicalPolicy.weeksRemaining === 4) {
        const msg = this.medicalPolicy.autoRenew
          ? 'Medical insurance auto-renews in 4 weeks. Price will increase.'
          : 'Medical insurance expires in 4 weeks. Shop for new coverage.';
        Notifications.push({ label: 'Med.', message: msg, action: openBenefits });
      } else if (this.medicalPolicy.weeksRemaining <= 0) {
        if (this.medicalPolicy.autoRenew) {
          this.medicalPolicy = {
            ...this.medicalPolicy,
            pricePerEmployee: this.medicalPolicy.pricePerEmployee + this.medicalPolicy.renewalBump,
            weeksRemaining:   this.medicalPolicy.durationWeeks,
          };
          Notifications.push({
            label: 'Med.',
            message: `Medical insurance auto-renewed at $${this.medicalPolicy.pricePerEmployee}/employee/week.`,
            action: openBenefits,
          });
        } else {
          Notifications.push({
            label: 'Med.',
            message: 'Medical insurance policy has expired.',
            action: openBenefits,
          });
          this.medicalPolicy = null;
        }
      }
    }
  },

  // Returns the total weekly medical insurance premium (pricePerEmployee ×
  // roster size). Returns 0 when no policy is active.
  calcMedicalCosts() {
    if (!this.medicalPolicy) return 0;
    return this.medicalPolicy.pricePerEmployee * this.roster.length;
  },

};
