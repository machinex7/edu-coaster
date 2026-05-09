// banking.js — Loan applications, covenants, repayments, and negotiation.
// Extracted from finance.js so the loan subsystem lives in its own module.
// Finance.parkValue() is called for LTV calculations since park valuation
// belongs to the broader financial system.

// Each entry: { id, applicable: purpose[], generate(app) → covenant }
// covenant shape: { id, description, weeks, value }
//   weeks — duration or deadline in game-weeks
//   value — contextual threshold/target (amount, count, etc.)
const LOAN_COVENANT_TEMPLATES = [
  {
    id: 'MIN_CASH',
    applicable: ['new_rides', 'staffing', 'emergency', 'refinance'],
    generate(app) {
      const value = Math.max(1000, Math.round(app.amount * 0.15 / 1000) * 1000);
      return {
        id: 'MIN_CASH',
        description: `Maintain at least $${value.toLocaleString()} cash on hand`,
        weeks: app.term * WEEKS_PER_YEAR,
        value,
      };
    },
  },
  {
    id: 'NO_NEW_LOANS',
    applicable: ['new_rides', 'staffing', 'emergency', 'refinance'],
    generate(app) {
      return {
        id: 'NO_NEW_LOANS',
        description: 'Do not take on additional loans during the term',
        weeks: app.term * WEEKS_PER_YEAR,
        value: 1,
      };
    },
  },
  {
    id: 'COMPLETE_RIDE',
    applicable: ['new_rides'],
    generate(app) {
      const weeks = Math.max(8, Math.ceil(app.term * WEEKS_PER_YEAR * 0.25));
      return {
        id: 'COMPLETE_RIDE',
        description: `Complete construction of at least 1 new ride within ${weeks} weeks`,
        weeks,
        value: 1,
      };
    },
  },
  {
    id: 'NO_DEMOLISH',
    applicable: ['new_rides'],
    generate(app) {
      return {
        id: 'NO_DEMOLISH',
        description: 'Do not demolish any rides for the duration of the loan',
        weeks: app.term * WEEKS_PER_YEAR,
        value: 0,
      };
    },
  },
  {
    id: 'HIRE_STAFF',
    applicable: ['staffing'],
    generate(app) {
      const value = Math.max(2, Math.round(app.amount / 75000));
      const weeks = Math.max(8, Math.ceil(app.term * WEEKS_PER_YEAR * 0.25));
      return {
        id: 'HIRE_STAFF',
        description: `Hire at least ${value} new employee${value !== 1 ? 's' : ''} within ${weeks} weeks`,
        weeks,
        value,
      };
    },
  },
  {
    id: 'RIDERSHIP_FLOOR',
    applicable: ['new_rides', 'staffing'],
    generate(app) {
      const recent = History.rounds.slice(-4);
      const avg    = recent.length > 0
        ? recent.reduce((s, r) => s + r.attendance, 0) / recent.length
        : 500;
      const value = Math.max(100, Math.round(avg * 0.8 / 100) * 100);
      return {
        id: 'RIDERSHIP_FLOOR',
        description: `Maintain weekly attendance of at least ${value.toLocaleString()} visitors`,
        weeks: app.term * WEEKS_PER_YEAR,
        value,
      };
    },
  },
  {
    id: 'SECURITY_THRESHOLD',
    applicable: ['emergency'],
    generate(app) {
      const value = 10;
      return {
        id: 'SECURITY_THRESHOLD',
        description: `Keep security opinion below ${value} for the duration`,
        weeks: app.term * WEEKS_PER_YEAR,
        value,
      };
    },
  },
  // Refinance: must pay down a target amount of combined principal within a deadline.
  {
    id: 'DEBT_PAYDOWN',
    applicable: ['refinance'],
    generate(app) {
      const value = Math.max(1000, Math.round(app.amount * 0.20 / 1000) * 1000);
      const weeks = Math.max(8, Math.ceil(app.term * WEEKS_PER_YEAR * 0.25));
      return {
        id: 'DEBT_PAYDOWN',
        description: `Pay down at least $${value.toLocaleString()} in combined loan principal within ${weeks} weeks`,
        weeks,
        value,
      };
    },
  },
  // Refinance: average weekly revenue must not fall below a floor for the loan's duration.
  {
    id: 'INCOME_FLOOR',
    applicable: ['refinance'],
    generate(app) {
      const recent = History.rounds.slice(-4);
      const avgIncome = recent.length > 0
        ? recent.reduce((s, r) => s + r.gateIncome + r.parkingIncome + r.shopIncome + r.foodIncome + r.membershipIncome, 0) / recent.length
        : 1000;
      const value = Math.max(500, Math.round(avgIncome * 0.70 / 100) * 100);
      return {
        id: 'INCOME_FLOOR',
        description: `Maintain average weekly revenue above $${value.toLocaleString()} for the duration`,
        weeks: app.term * WEEKS_PER_YEAR,
        value,
      };
    },
  },
];

const Banking = {

  // ── State ────────────────────────────────────────────────────────────────────

  // status lifecycle:
  //   null          → no application
  //   'approaching' → initial check pending (1 round)
  //   'open'        → bank accepted; player can click Apply For Loan
  //   'applying'    → rate calculation pending (1 round)
  //   'offered'     → bank has posted a rate offer
  loanApplication: null,

  // Disbursed loans currently being repaid.
  activeLoans: [],

  // Cumulative across all loans; drives future rate and LTV penalties.
  totalMissedPayments: 0,

  // Loan amount disbursed this round; reset by History.record() after each round.
  roundDisbursement: 0,

  // ── Savings account ──────────────────────────────────────────────────────────

  // Current balance held in the savings account (separate from cash).
  savingsBalance: 0,

  // All interest credited to the savings account across the entire game.
  totalInterestEarned: 0,

  // Move money from cash into the savings account in $1,000 increments.
  // Returns false if funds are insufficient or amount is not a positive multiple of 1000.
  deposit(amount) {
    if (amount <= 0 || amount % 1000 !== 0) return false;
    if (money < amount) return false;
    money -= amount;
    this.savingsBalance += amount;
    return true;
  },

  // Move money from the savings account back to cash in $1,000 increments.
  // Returns false if the savings balance is insufficient or amount is invalid.
  withdraw(amount) {
    if (amount <= 0 || amount % 1000 !== 0) return false;
    if (this.savingsBalance < amount) return false;
    this.savingsBalance -= amount;
    money += amount;
    return true;
  },

  // Credit weekly compounded interest to the savings balance.
  // Weekly rate = (1 + SAVINGS_ANNUAL_RATE)^(1/52) − 1.
  // Returns the whole-dollar interest earned this round for P&L reporting.
  processSavingsInterest() {
    if (this.savingsBalance <= 0) return 0;
    const weeklyRate = Math.pow(1 + SAVINGS_ANNUAL_RATE, 1 / WEEKS_PER_YEAR) - 1;
    const interest   = Math.round(this.savingsBalance * weeklyRate);
    this.savingsBalance      += interest;
    this.totalInterestEarned += interest;
    return interest;
  },

  // ── Money market account ─────────────────────────────────────────────────────

  // Balance held in the money market account (separate from cash and savings).
  mmBalance: 0,

  // Rounds remaining before a withdrawal is permitted. Starts at MM_WITHDRAWAL_COOLDOWN
  // after any withdrawal and decrements once per round.
  mmWithdrawalCooldown: 0,

  // All interest ever credited to the money market account.
  mmTotalInterestEarned: 0,

  // True when the player has requested a withdrawal that would drop the balance below
  // MM_MIN_BALANCE and is waiting to confirm the close-out.
  mmCloseConfirmPending: false,

  // Deposit into the money market account. Initial deposit must be >= MM_MIN_BALANCE.
  // Returns false if funds are insufficient or amount is not a positive multiple of 1000.
  mmDeposit(amount) {
    if (amount <= 0 || amount % 1000 !== 0) return false;
    if (this.mmBalance === 0 && amount < MM_MIN_BALANCE) return false;
    if (money < amount) return false;
    money -= amount;
    this.mmBalance += amount;
    return true;
  },

  // Attempt a withdrawal. If the amount would drop the balance below MM_MIN_BALANCE,
  // sets mmCloseConfirmPending = true and returns 'confirm' so the caller can show
  // the close-out confirmation UI. During cooldown, returns false.
  mmWithdraw(amount) {
    if (amount <= 0 || amount % 1000 !== 0) return false;
    if (this.mmWithdrawalCooldown > 0) return false;
    if (amount > this.mmBalance) return false;
    if (this.mmBalance - amount < MM_MIN_BALANCE) {
      this.mmCloseConfirmPending = true;
      return 'confirm';
    }
    money += amount;
    this.mmBalance -= amount;
    this.mmWithdrawalCooldown = MM_WITHDRAWAL_COOLDOWN;
    return true;
  },

  // Execute a confirmed close-out: return the full balance to cash, reset the
  // account, and start the withdrawal cooldown.
  mmConfirmClose() {
    money += this.mmBalance;
    this.mmBalance = 0;
    this.mmWithdrawalCooldown = MM_WITHDRAWAL_COOLDOWN;
    this.mmCloseConfirmPending = false;
  },

  // Cancel a pending close-out confirmation without making any changes.
  mmCancelClose() {
    this.mmCloseConfirmPending = false;
  },

  // Tick the withdrawal cooldown and credit weekly compounded interest to the MM balance.
  // Called once per round. Returns the whole-dollar interest earned this round.
  processMmInterest() {
    if (this.mmCloseConfirmPending) this.mmCloseConfirmPending = false; // clear stale confirmation
    if (this.mmWithdrawalCooldown > 0) this.mmWithdrawalCooldown--;
    if (this.mmBalance <= 0) return 0;
    const weeklyRate = Math.pow(1 + MM_ANNUAL_RATE, 1 / WEEKS_PER_YEAR) - 1;
    const interest   = Math.round(this.mmBalance * weeklyRate);
    this.mmBalance            += interest;
    this.mmTotalInterestEarned += interest;
    return interest;
  },

  // ── LTV and covenant helpers ─────────────────────────────────────────────────

  // ── Line of credit ───────────────────────────────────────────────────────────

  // Pending or offered application: null | { status: 'pending' | 'offered', limit, rate }
  locApplication: null,

  // True once the player has accepted an offer. Reset when the account is closed.
  locActive: false,

  // Approved revolving limit in dollars.
  locLimit: 0,

  // Annual interest rate on the outstanding balance (%).
  locRate: 0,

  // Currently drawn balance. Increases on draw, decreases on repay.
  locBalance: 0,

  // All interest ever paid on the line of credit.
  locTotalInterestPaid: 0,

  // Compute the credit limit for a new application.
  // 25% of park value, rounded to the nearest $1,000, capped at $100,000.
  // Returns 0 if the park is not yet valuable enough to offer any credit.
  calcLocLimit() {
    const raw = Math.floor(Finance.parkValue() * 0.25 / 1000) * 1000;
    return Math.max(0, Math.min(100000, raw));
  },

  // Annual interest rate for the line of credit.
  // inflation % + 4, floored at 5%.
  calcLocRate() {
    return Math.round(Math.max(5, Population.inflationRate * 100 + 4) * 100) / 100;
  },

  // Submit a line of credit application. No-ops if one is already pending or active.
  submitLocApplication() {
    if (this.locApplication || this.locActive) return;
    this.locApplication = { status: 'pending' };
  },

  // Accept the offered terms and activate the line of credit.
  acceptLocOffer() {
    if (this.locApplication?.status !== 'offered') return;
    this.locActive  = true;
    this.locLimit   = this.locApplication.limit;
    this.locRate    = this.locApplication.rate;
    this.locApplication = null;
  },

  // Decline the offer and clear the application.
  rejectLocOffer() {
    if (this.locApplication?.status !== 'offered') return;
    this.locApplication = null;
  },

  // Draw funds from the line of credit into cash.
  // Returns false if the amount exceeds available credit, is not a positive
  // multiple of 1000, or the account is not active.
  locDraw(amount) {
    if (!this.locActive) return false;
    if (amount <= 0 || amount % 1000 !== 0) return false;
    if (this.locBalance + amount > this.locLimit) return false;
    money += amount;
    this.locBalance += amount;
    return true;
  },

  // Repay funds from cash back to the line of credit.
  // Returns false if cash is insufficient or balance would go negative.
  locRepay(amount) {
    if (!this.locActive) return false;
    if (amount <= 0 || amount % 1000 !== 0) return false;
    if (amount > this.locBalance) return false;
    if (money < amount) return false;
    money -= amount;
    this.locBalance -= amount;
    return true;
  },

  // Close the line of credit. Requires the balance to be fully repaid first.
  // Returns false if balance > 0.
  closeLocAccount() {
    if (this.locBalance > 0) return false;
    this.locActive           = false;
    this.locLimit            = 0;
    this.locRate             = 0;
    this.locTotalInterestPaid = 0;
    return true;
  },

  // Deduct weekly compounded interest on the outstanding balance from cash.
  // Called once per round from Finance.processRound(). Returns the dollar amount charged.
  processLocInterest() {
    if (!this.locActive || this.locBalance <= 0) return 0;
    const weeklyRate = Math.pow(1 + this.locRate / 100, 1 / WEEKS_PER_YEAR) - 1;
    const interest   = Math.round(this.locBalance * weeklyRate);
    money                    -= interest;
    this.locTotalInterestPaid += interest;
    return interest;
  },

  // Advance a pending LOC application one step each round.
  // Returns 'offered', 'rejected', or null.
  processPendingLoc() {
    if (!this.locApplication || this.locApplication.status !== 'pending') return null;
    const limit = this.calcLocLimit();
    if (limit < 5000) {
      this.locApplication = null;
      Notifications.push({
        label:   'Credit',
        message: 'Line of credit application declined — park value too low.',
        action:  () => openPanel('banking'),
      });
      return 'rejected';
    }
    const rate = this.calcLocRate();
    this.locApplication = { status: 'offered', limit, rate };
    Notifications.push({
      label:   'Credit',
      message: `Line of credit offer: $${limit.toLocaleString()} at ${rate}%.`,
      action:  () => openPanel('banking'),
    });
    return 'offered';
  },

  // ── LTV and covenant helpers ─────────────────────────────────────────────────

  // Maximum loan-to-park-value ratio the bank will approve for each purpose.
  // Missed payments erode the cap by MISSED_PAYMENT_LTV_PENALTY per miss.
  effectiveLtvCap(purpose) {
    const reduction = this.totalMissedPayments * MISSED_PAYMENT_LTV_PENALTY;
    if (purpose === 'emergency')  return Math.max(0.05, 0.25 - reduction);
    if (purpose === 'staffing')   return Math.max(0.10, 0.50 - reduction);
    if (purpose === 'refinance')  return Math.max(0.10, 0.75 - reduction);
    return Math.max(0.10, 1.00 - reduction);
  },

  // Returns true if any active loan carries an unsatisfied, unbreached covenant
  // with the given id.
  hasActiveCovenant(id) {
    return this.activeLoans.some(loan =>
      loan.covenants?.some(c => c.id === id && !c.breached && !c.satisfied)
    );
  },

  // ── Application flow ─────────────────────────────────────────────────────────

  // Starts the application state machine at 'approaching'.
  // Favor 1–3; upper limit shrinks by 1 per active loan (floored at 1).
  submitLoanApplication(amount, purpose, term) {
    const maxFavor  = Math.max(1, 3 - this.activeLoans.length);
    const bankFavor = Math.floor(Math.random() * maxFavor) + 1;
    this.loanApplication = { amount, purpose, term, status: LOAN_STATUS.APPROACHING, bankFavor };
  },

  // Advances an open application to 'applying' so the next round computes the offer.
  applyForLoan() {
    if (this.loanApplication?.status === LOAN_STATUS.OPEN)
      this.loanApplication.status = LOAN_STATUS.APPLYING;
  },

  // ── Covenants ────────────────────────────────────────────────────────────────

  // Mark a covenant as breached and warn the player. The fee is not taken
  // until the following round so the player sees it coming. Once the fee
  // is collected the covenant is retired and cannot fire again.
  breachCovenant(loan, covenant) {
    if (covenant.breachPending || covenant.breached || covenant.satisfied) return;
    covenant.breachPending = true;
    const penaltyAmt = Math.round(loan.amount * loan.covenantPenaltyPct / 100);
    Notifications.push({
      label:   'Covenant',
      message: `In breach: "${covenant.description}". A $${penaltyAmt.toLocaleString()} fee will be assessed next round.`,
      action:  () => openPanel('banking'),
    });
  },

  // Called each round. Collects any pending breach fees and retires those
  // covenants so they cannot be triggered again.
  processCovenantBreaches() {
    for (const loan of this.activeLoans) {
      for (const covenant of loan.covenants ?? []) {
        if (!covenant.breachPending) continue;
        const penaltyAmt = Math.round(loan.amount * loan.covenantPenaltyPct / 100);
        money -= penaltyAmt;
        covenant.breachPending = false;
        covenant.breached      = true;
        Notifications.push({
          label:   'Covenant',
          message: `Breach fee of $${penaltyAmt.toLocaleString()} assessed for: "${covenant.description}".`,
          action:  () => openPanel('banking'),
        });
      }
    }
  },

  // Check all active covenant conditions each round.
  // Achievement covenants (COMPLETE_RIDE, HIRE_STAFF) track a deadline and
  // can be satisfied. Ongoing covenants (RIDERSHIP_FLOOR, SECURITY_THRESHOLD)
  // breach the first time their condition is violated and are then retired.
  // All covenants in all active loans are evaluated independently each round.
  processActiveCovenants(weeklyAttendance) {
    for (const loan of this.activeLoans) {
      for (const covenant of loan.covenants ?? []) {
        if (covenant.breached || covenant.satisfied) continue;

        switch (covenant.id) {

          case 'COMPLETE_RIDE': {
            if (covenant.initialActiveRides === undefined) {
              covenant.initialActiveRides = installedRides.filter(r => r.status === STATUS.ACTIVE).length;
              covenant.weeksRemaining     = covenant.weeks;
            }
            const activeNow = installedRides.filter(r => r.status === STATUS.ACTIVE).length;
            if (activeNow >= covenant.initialActiveRides + covenant.value) {
              covenant.satisfied = true;
            } else {
              covenant.weeksRemaining--;
              if (covenant.weeksRemaining <= 0) this.breachCovenant(loan, covenant);
            }
            break;
          }

          case 'HIRE_STAFF': {
            if (covenant.initialRosterSize === undefined) {
              covenant.initialRosterSize = Staff.roster.length;
              covenant.weeksRemaining    = covenant.weeks;
            }
            if (Staff.roster.length >= covenant.initialRosterSize + covenant.value) {
              covenant.satisfied = true;
            } else {
              covenant.weeksRemaining--;
              if (covenant.weeksRemaining <= 0) this.breachCovenant(loan, covenant);
            }
            break;
          }

          case 'MIN_CASH':
            if (money < covenant.value)
              this.breachCovenant(loan, covenant);
            break;

          case 'RIDERSHIP_FLOOR':
            if (weeklyAttendance < covenant.value)
              this.breachCovenant(loan, covenant);
            break;

          case 'SECURITY_THRESHOLD':
            if (Security.opinion > covenant.value)
              this.breachCovenant(loan, covenant);
            break;

          case 'DEBT_PAYDOWN': {
            // Snapshot total principal paid across all loans at first evaluation.
            if (covenant.initialPrincipalPaid === undefined) {
              covenant.initialPrincipalPaid = this.activeLoans.reduce((s, l) => s + l.totalPrincipalPaid, 0);
              covenant.weeksRemaining       = covenant.weeks;
            }
            const totalPaid = this.activeLoans.reduce((s, l) => s + l.totalPrincipalPaid, 0);
            if (totalPaid - covenant.initialPrincipalPaid >= covenant.value) {
              covenant.satisfied = true;
            } else {
              covenant.weeksRemaining--;
              if (covenant.weeksRemaining <= 0) this.breachCovenant(loan, covenant);
            }
            break;
          }

          case 'INCOME_FLOOR': {
            // Breach if the trailing 4-round average total revenue falls below the floor.
            const recent = History.rounds.slice(-4);
            if (recent.length > 0) {
              const avgIncome = recent.reduce((s, r) => s + r.gateIncome + r.parkingIncome + r.shopIncome + r.foodIncome + r.membershipIncome, 0) / recent.length;
              if (avgIncome < covenant.value) this.breachCovenant(loan, covenant);
            }
            break;
          }
        }
      }
    }
  },

  // Picks a random covenant template applicable to the current loan purpose,
  // excluding any ids already on the offer.
  pickCovenant(excludeIds = []) {
    const { purpose } = this.loanApplication;
    const pool = LOAN_COVENANT_TEMPLATES.filter(t =>
      t.applicable.includes(purpose) && !excludeIds.includes(t.id)
    );
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)].generate(this.loanApplication);
  },

  // ── Negotiation ──────────────────────────────────────────────────────────────
  // Each action costs 1 bank favor. Guards are no-ops if favor is exhausted.

  // Removes a covenant at the given index in exchange for a 0.3% rate increase.
  negotiateCovenant(index) {
    if (this.loanApplication.bankFavor <= 0) return;
    this.loanApplication.covenants.splice(index, 1);
    this.loanApplication.rate = Math.round((this.loanApplication.rate + 0.3) * 100) / 100;
    this.loanApplication.bankFavor--;
  },

  // Lowers the rate by 0.5% in exchange for an extra covenant (or 0.2% if no new
  // covenant is available because the pool is exhausted).
  negotiateRate() {
    if (this.loanApplication.bankFavor <= 0) return;
    const { covenants } = this.loanApplication;
    if (covenants.length < 2) {
      const newCovenant = this.pickCovenant(covenants.map(c => c.id));
      if (newCovenant) {
        covenants.push(newCovenant);
        this.loanApplication.rate = Math.round((this.loanApplication.rate - 0.5) * 100) / 100;
      } else {
        this.loanApplication.rate = Math.round((this.loanApplication.rate - 0.2) * 100) / 100;
      }
    } else {
      this.loanApplication.rate = Math.round((this.loanApplication.rate - 0.2) * 100) / 100;
    }
    this.loanApplication.bankFavor--;
  },

  // Reduces the breach-penalty percentage by 5 points (floored at 5%).
  negotiateFee() {
    if (this.loanApplication.bankFavor <= 0) return;
    if (this.loanApplication.covenantPenaltyPct <= 5) return;
    this.loanApplication.covenantPenaltyPct -= 5;
    this.loanApplication.bankFavor--;
  },

  // ── Payment math ─────────────────────────────────────────────────────────────

  // Fixed weekly payment for an amortizing loan.
  // Uses the standard annuity formula: P × r(1+r)^n / ((1+r)^n − 1)
  // where r = annualRatePct / 100 / 52 and n = weeksRemaining.
  // Returns { total, principal } where total is the full payment (rounded up)
  // and principal is the portion reducing the balance (total minus interest this period).
  calcLoanPayment(principal, annualRatePct, weeksRemaining) {
    if (weeksRemaining <= 0) return { total: 0, principal: 0 };
    const r = annualRatePct / 100 / 52;
    if (r === 0) {
      const total = Math.ceil(principal / weeksRemaining);
      return { total, principal: total };
    }
    const factor   = Math.pow(1 + r, weeksRemaining);
    const total    = Math.ceil(principal * r * factor / (factor - 1));
    const interest = principal * r;
    return { total, principal: total - interest };
  },

  // ── Accept / reject ──────────────────────────────────────────────────────────

  // Cancels an offered loan — resets loanApplication to null.
  rejectOffer() {
    if (this.loanApplication?.status !== LOAN_STATUS.OFFERED) return;
    this.loanApplication = null;
  },

  // Moves an accepted offer into 'review' status (2-week disbursement delay).
  acceptOffer() {
    if (this.loanApplication?.status !== LOAN_STATUS.OFFERED) return;
    this.loanApplication.status = LOAN_STATUS.REVIEW;
    this.loanApplication.reviewWeeksRemaining = 2;
  },

  // ── Rate calculation ─────────────────────────────────────────────────────────

  // Annual interest rate for the pending loan.
  // Base = inflation % + 1. Then premiums and adjustments:
  //   LTV             — loan amount as share of park value (collateral risk)
  //   Coverage        — recent operating income vs expenses (repayment risk)
  //   Term            — longer terms carry more uncertainty
  //   Favor           — bank's industry sentiment (-0.5 favorable → +0.5 unfavorable)
  //   Covenants       — COVENANT_RATE_DISCOUNT per covenant on the agreement
  //   Missed payments — MISSED_PAYMENT_RATE_PENALTY per historical missed payment
  calcLoanRate(covenants = []) {
    const { amount, term } = this.loanApplication;
    const baseRate = Population.inflationRate * 100 + 1;

    // LTV premium — Finance owns parkValue() since it encompasses all assets
    const netWorth = Finance.parkValue();
    const ltv      = netWorth > 0 ? amount / netWorth : 1;
    const ltvPremium = ltv < 0.25 ? 0
                     : ltv < 0.50 ? 0.75
                     : ltv < 0.75 ? 1.75
                     :              3.5;

    // Coverage premium — avg operating income vs avg operating expenses (last 4 rounds)
    const recent = History.rounds.slice(-4);
    let coveragePremium;
    if (recent.length === 0) {
      coveragePremium = 0.5;
    } else {
      const avgIncome = recent.reduce((s, r) => s + r.gateIncome + r.parkingIncome + r.shopIncome + r.foodIncome + r.membershipIncome, 0) / recent.length;
      const avgOpEx   = recent.reduce((s, r) => s + r.staffExpense + r.utilityExpense, 0) / recent.length;
      const ratio     = avgOpEx > 0 ? avgIncome / avgOpEx : (avgIncome > 0 ? 2 : 0);
      coveragePremium = ratio >= 2.0 ? -0.5
                      : ratio >= 1.5 ?  0
                      : ratio >= 1.0 ?  0.5
                      : ratio >= 0.5 ?  1.5
                      :                 3.0;
    }

    // Term premium
    const termPremium = term <= 2 ? 0 : term <= 5 ? 0.25 : 0.75;

    // Favor premium (1 unfavorable, 2 neutral, 3 favorable)
    const { bankFavor } = this.loanApplication;
    const favorPremium = bankFavor >= 3 ? -0.5 : bankFavor === 2 ? 0 : 0.5;

    // Covenant discount — each covenant the player accepts shaves off a fixed amount
    const covenantDiscount = covenants.length * COVENANT_RATE_DISCOUNT;

    // Missed payment penalty — compounds across all historical missed payments
    const missedPenalty = this.totalMissedPayments * MISSED_PAYMENT_RATE_PENALTY;

    // Refinance discount — restructuring existing debt is lower-risk for the bank
    const refinanceDiscount = this.loanApplication.purpose === 'refinance' ? 0.75 : 0;

    return Math.round((baseRate + ltvPremium + coveragePremium + termPremium + favorPremium - covenantDiscount - refinanceDiscount + missedPenalty) * 100) / 100;
  },

  // ── Round processing ─────────────────────────────────────────────────────────

  // Called once per round by Finance.processRound(). Drives the loan application
  // state machine one step forward.
  // Returns the transition that fired, or null if nothing was pending.
  processPendingLoan() {
    if (!this.loanApplication) return null;
    const { amount, purpose, status } = this.loanApplication;

    if (status === LOAN_STATUS.APPROACHING) {
      const netWorth = Finance.parkValue();
      const cap      = this.effectiveLtvCap(purpose);
      const ok       = amount > 0 && amount < netWorth * cap;

      if (ok) {
        this.loanApplication.status = LOAN_STATUS.OPEN;
        Notifications.push({
          label:   'Loan',
          message: 'A bank is open for applications on your requested loan.',
          action:  () => openPanel('banking'),
        });
        return 'approved';
      } else {
        this.loanApplication = null;
        Notifications.push({
          label:   'Loan',
          message: 'No banks wanted to pursue your offer at this time.',
          action:  () => openPanel('banking'),
        });
        return 'rejected';
      }
    }

    if (status === LOAN_STATUS.APPLYING) {
      // Refinance loans carry two covenants; all other purposes carry one.
      const first    = this.pickCovenant();
      const second   = purpose === 'refinance' ? this.pickCovenant(first ? [first.id] : []) : null;
      const covenants = [first, second].filter(Boolean);
      const rate               = this.calcLoanRate(covenants);
      // Penalty for breaching any covenant: 5–20% of loan amount in 5% steps
      const covenantPenaltyPct = covenants.length > 0 ? (Math.floor(Math.random() * 4) + 1) * 5 : 0;
      this.loanApplication.status             = LOAN_STATUS.OFFERED;
      this.loanApplication.rate               = rate;
      this.loanApplication.covenants          = covenants;
      this.loanApplication.covenantPenaltyPct = covenantPenaltyPct;
      Notifications.push({
        label:   'Loan',
        message: `Bank offer: ${rate}% over ${this.loanApplication.term} yr — ${covenants.length} covenant${covenants.length !== 1 ? 's' : ''}.`,
        action:  () => openPanel('banking'),
      });
      return 'offered';
    }

    if (status === LOAN_STATUS.REVIEW) {
      this.loanApplication.reviewWeeksRemaining--;
      if (this.loanApplication.reviewWeeksRemaining > 0) return 'reviewing';

      // Disburse — credit cash, move to active loans, clear application
      const { amount: amt, purpose: pur, term, rate, covenants, covenantPenaltyPct } = this.loanApplication;
      money += amt;
      this.roundDisbursement += amt;
      this.activeLoans.push({
        id: Date.now(),
        amount: amt, purpose: pur, term, rate, covenants, covenantPenaltyPct,
        balance:            amt,
        weeksRemaining:     term * WEEKS_PER_YEAR,
        totalInterestPaid:  0,
        totalPrincipalPaid: 0,
        missedPayments:     0,
      });
      this.loanApplication = null;
      Notifications.push({
        label:   'Loan',
        message: `$${amt.toLocaleString()} loan disbursed and now active.`,
        action:  () => openPanel('banking'),
      });
      return 'disbursed';
    }

    return null;
  },

  // Applies an extra principal payment to the given active loan, reducing its balance
  // and recalculating weeksRemaining so the regular payment stays the same (term shortens).
  // Returns true on success, false if the amount is invalid or cash is insufficient.
  makeExtraPayment(loanIndex, amount) {
    const loan = this.activeLoans[loanIndex];
    if (!loan || amount <= 0 || amount > money) return false;

    // Capture the current scheduled payment before altering the balance.
    const { total: scheduledPayment } = this.calcLoanPayment(loan.balance, loan.rate, loan.weeksRemaining);

    money        -= amount;
    loan.balance  = Math.max(0, loan.balance - amount);
    loan.totalPrincipalPaid += amount;

    if (loan.balance <= 0) {
      this.activeLoans.splice(loanIndex, 1);
      Notifications.push({
        label:   'Loan',
        message: 'Loan fully repaid via extra payment.',
        action:  () => openPanel('banking'),
      });
      return true;
    }

    // Recalculate weeks needed to pay off new balance at the same scheduled payment.
    const r = loan.rate / 100 / 52;
    let newWeeks;
    if (r === 0) {
      newWeeks = Math.ceil(loan.balance / scheduledPayment);
    } else {
      const ratio = r * loan.balance / scheduledPayment;
      // If ratio >= 1 the payment no longer covers interest; clamp to current weeksRemaining.
      newWeeks = ratio >= 1
        ? loan.weeksRemaining
        : Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r));
    }
    loan.weeksRemaining = Math.max(1, Math.min(newWeeks, loan.weeksRemaining));
    return true;
  },

  // Deducts the weekly payment from cash, splits it into interest and principal,
  // and removes loans that have been fully repaid.
  // Returns total cash deducted this round across all loans.
  processLoanRepayments() {
    let paid = 0;
    for (let i = this.activeLoans.length - 1; i >= 0; i--) {
      const loan = this.activeLoans[i];
      const { total, principal } = this.calcLoanPayment(loan.balance, loan.rate, loan.weeksRemaining);
      if (money >= total) {
        money -= total;
        paid  += total;
        loan.balance           = Math.max(0, loan.balance - principal);
        loan.weeksRemaining--;
        loan.totalInterestPaid  += total - principal;
        loan.totalPrincipalPaid += principal;
        if (loan.weeksRemaining <= 0 || loan.balance <= 0) {
          this.activeLoans.splice(i, 1);
          Notifications.push({
            label:   'Loan',
            message: 'Loan fully repaid.',
            action:  () => openPanel('banking'),
          });
        }
      } else {
        loan.missedPayments++;
        this.totalMissedPayments++;
        Notifications.push({
          label:   'Loan',
          message: `Missed loan payment of $${total.toLocaleString()} — insufficient funds.`,
          action:  () => openPanel('banking'),
        });
      }
    }
    return paid;
  },

};
