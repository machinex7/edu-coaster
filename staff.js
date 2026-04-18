// staff.js — Staff definitions, state, and panel rendering.
//
// Adding a new job type: append an entry to JOB_TYPES. Everything else
// (panel grouping, salary totals, hiring/firing when added) picks it up.

// ── Job type registry ──────────────────────────────────────────────────────
const JOB_TYPES = [
  { id: 'ride_operator',    label: 'Ride Operator',    plural: 'Ride Operators',    weeklySalary: 520  },
  { id: 'security',         label: 'Security',         plural: 'Security',          weeklySalary: 640  },
  { id: 'janitor',          label: 'Janitor',          plural: 'Janitors',          weeklySalary: 480  },
  { id: 'engineer',         label: 'Engineer',         plural: 'Engineers',         weeklySalary: 1200 },
  { id: 'booth_attendant',  label: 'Booth Attendant',  plural: 'Booth Attendants',  weeklySalary: 480  },
  { id: 'business_analyst', label: 'Business Analyst', plural: 'Business Analysts', weeklySalary: 1400 },
];

// staff entries: { instanceId, jobId, salary, mood (0–100) }
let staff = [];
let _staffIdSeq = 0;

function hireStaff(jobId, salaryOverride) {
  const job = JOB_TYPES.find(j => j.id === jobId);
  staff.push({
    instanceId: `staff_${jobId}_${++_staffIdSeq}`,
    jobId,
    salary: salaryOverride ?? job.weeklySalary,
    mood: 80,
  });
}

function initStaff() {
  hireStaff('ride_operator');
  hireStaff('ride_operator');
  hireStaff('security');
  hireStaff('janitor');
  hireStaff('engineer');
}

function totalWeeklySalary() {
  return staff.reduce((sum, s) => sum + s.salary, 0);
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
      const { label, cls } = getMoodInfo(s.mood);
      return `<tr>
        <td>${job.label} ${i + 1}</td>
        <td>$${s.salary.toLocaleString()}/wk</td>
        <td><span class="mood-badge ${cls}">${label}</span></td>
      </tr>`;
    })];
  });

  container.innerHTML = `
    <table class="staff-table">
      <thead><tr><th>Employee</th><th>Salary</th><th>Mood</th></tr></thead>
      <tbody>${bodyRows.join('')}</tbody>
    </table>`;
}

function refreshStaffPanel() {
  if (activePanel === 'staffing') buildStaffPanel();
}
