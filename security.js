// security.js — Security panel UI and focus management.

const FOCUS_META = [
  { focus: SECURITY_FOCUS.PATROL, label: 'Patrol', desc: 'Handles unridden visitor incidents' },
  { focus: SECURITY_FOCUS.GATE,   label: 'Gate',   desc: 'Handles gate overflow incidents'    },
  { focus: SECURITY_FOCUS.SHOP,   label: 'Shop',   desc: 'Handles shop theft (coming soon)'   },
];

function buildSecurityPanel() {
  const container = document.getElementById('security-overview');
  const guards    = staff.filter(s => s.jobId === JOB.SECURITY);

  if (guards.length === 0) {
    container.innerHTML = '<p class="empty-note">No security guards hired. Visit Staffing to hire some.</p>';
    return;
  }

  const guardRows = guards.map(s => {
    const { label: expLabel, tier } = getExperienceTier(s.weeksEmployed);
    const weeklyCapacity = (3 + tier) * 7;
    const expBadge = expLabel
      ? `<span class="exp-badge exp-${expLabel.toLowerCase()}">${expLabel}</span>`
      : '';
    const focusBtns = FOCUS_META.map(m =>
      `<button class="sec-focus-btn${s.focus === m.focus ? ' active' : ''}"
               data-id="${s.instanceId}" data-focus="${m.focus}">${m.label}</button>`
    ).join('');
    return `<div class="security-guard-row">
      <div class="sec-guard-info">
        <span class="sec-guard-name">${s.name} ${expBadge}</span>
        <span class="sec-guard-cap">${weeklyCapacity}/wk</span>
      </div>
      <div class="sec-focus-btns">${focusBtns}</div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="sec-focus-legend">
      ${FOCUS_META.map(m => `<div class="sec-legend-row">
        <strong>${m.label}</strong> — ${m.desc}</div>`).join('')}
    </div>
    <div class="security-guard-list">${guardRows}</div>`;

  container.querySelectorAll('.sec-focus-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const guard = staff.find(s => s.instanceId === btn.dataset.id);
      if (!guard) return;
      guard.focus = btn.dataset.focus;
      buildSecurityPanel();
    });
  });
}

function refreshSecurityPanel() {
  if (activePanel === 'security') buildSecurityPanel();
}
