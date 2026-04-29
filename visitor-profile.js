// visitor-profile.js — Visitor Profile panel.
// Shows each demographic category as a row of person icons per bracket.
// Icon colour (green/amber/red) reflects chance; grey icons are still unknown.
// The coloured-to-grey ratio tracks Population.confidence for that bracket.

const VisitorProfile = {

  // Category definitions in display order.
  CATEGORIES: [
    { label: 'Age',            brackets: Population.AGE_BRACKETS,      key: 'AGE'        },
    { label: 'Household Size', brackets: Population.HOUSEHOLD_SIZES,   key: 'HOUSEHOLD'  },
    { label: 'Income',         brackets: Population.INCOME_BRACKETS,   key: 'INCOME'     },
    { label: 'Distance',       brackets: Population.DISTANCE_BRACKETS, key: 'DISTANCE'   },
    { label: 'Area Type',      brackets: Population.AREA_TYPES,        key: 'AREA'       },
    { label: 'Employment',     brackets: Population.EMPLOYMENT_STATUS, key: 'EMPLOYMENT' },
    { label: 'Visitor Status', brackets: Population.VISITOR_STATUS,    key: 'STATUS'     },
  ],

  // Maximum icons shown for the largest bracket in a category.
  // All others scale proportionally so relative sizes are visible.
  MAX_DOTS: 50,

  // Build or rebuild the full panel contents.
  buildPanel() {
    const el = document.getElementById('visitor-profile-body');
    if (!el) return;
    el.innerHTML = this.CATEGORIES.map((cat, ci) =>
      this._buildCategory(cat, ci)
    ).join('');
  },

  // Render one demographic category section with a sticky header and bracket rows.
  _buildCategory(cat, catIndex) {
    const maxCount = Math.max(...cat.brackets.map(b => b.count));
    const rows = cat.brackets.map((b, bi) =>
      this._buildBracketRow(b, bi, Population.confidence[cat.key][bi], maxCount, catIndex * 10 + bi)
    ).join('');
    return `<div class="vp-category">
      <div class="vp-category-header">${cat.label}</div>
      ${rows}
    </div>`;
  },

  // Render one bracket row: label + population count + confidence % + dot field.
  _buildBracketRow(bracket, bracketIndex, confidence, maxCount, seed) {
    const dotCount     = Math.max(1, Math.round((bracket.count / maxCount) * this.MAX_DOTS));
    const coloredCount = Math.round(dotCount * (confidence / 100));

    // Green fraction = chance / 2: chance 1.0 → 50/50, chance 2.0 → all green, 0 → all red.
    const greenCount = Math.round(coloredCount * (bracket.chance / 2));
    const redCount   = coloredCount - greenCount;

    // Build shuffled array of dot colours so the reveal order is stable across redraws.
    const states = [
      ...Array(greenCount).fill('green'),
      ...Array(redCount).fill('red'),
      ...Array(dotCount - coloredCount).fill('gray'),
    ];
    const dots = this._seededShuffle(states, seed).map(c => this._personSvg(c)).join('');

    return `<div class="vp-bracket-row">
      <div class="vp-bracket-meta">
        <span class="vp-bracket-name">${bracket.name}</span>
        <span class="vp-bracket-pop">${bracket.count.toLocaleString()} people</span>
        <span class="vp-bracket-conf">${Math.round(confidence)}% observed</span>
      </div>
      <div class="vp-dot-field">${dots}</div>
    </div>`;
  },

  // Tiny SVG person silhouette. fill="currentColor" makes the shapes inherit
  // the CSS color property set by the vp-person--* class.
  _personSvg(color) {
    return `<svg class="vp-person vp-person--${color}" viewBox="0 0 10 16" width="11" height="17" fill="currentColor" aria-hidden="true"><circle cx="5" cy="3.5" r="2.8"/><path d="M0.5 16 Q0.5 9.5 5 9.5 Q9.5 9.5 9.5 16 Z"/></svg>`;
  },

  // Deterministic Fisher-Yates shuffle using a seed so layout is stable across redraws.
  _seededShuffle(arr, seed) {
    const a = [...arr];
    let s = (seed + 1) >>> 0;
    for (let i = a.length - 1; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

};
