// visitor-profile.js — Visitor Profile panel.
// Each bracket shows two dot rows: person icons (chance = propensity to visit any park)
// and small circles (favor = appeal of this park specifically, unlocked at 25% confidence).
// Green/red ratio encodes the metric; colored-to-gray ratio encodes confidence.

const VisitorProfile = {

  // Category definitions in display order.
  // Defined as a getter so it reads the live Population arrays at render time rather than
  // capturing the empty placeholder arrays that exist when this script first loads.
  // (game.js replaces Population.AGE_BRACKETS etc. via Object.assign after all scripts load.)
  get CATEGORIES() {
    return [
      { label: 'Age',            brackets: Population.AGE_BRACKETS,      key: 'AGE'        },
      { label: 'Household Size', brackets: Population.HOUSEHOLD_SIZES,   key: 'HOUSEHOLD'  },
      { label: 'Income',         brackets: Population.INCOME_BRACKETS,   key: 'INCOME'     },
      { label: 'Distance',       brackets: Population.DISTANCE_BRACKETS, key: 'DISTANCE'   },
      { label: 'Area Type',      brackets: Population.AREA_TYPES,        key: 'AREA'       },
      { label: 'Employment',     brackets: Population.EMPLOYMENT_STATUS, key: 'EMPLOYMENT' },
      { label: 'Visitor Status', brackets: Population.VISITOR_STATUS,    key: 'STATUS'     },
    ];
  },

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
    const hasPopulation = Research.completed.has(RESEARCH_ID.DEMOGRAPHIC_POPULATION);
    // Without population research all brackets use the same dot count so
    // relative sizes stay hidden while the green/red ratios remain accurate.
    const maxCount = hasPopulation ? Math.max(...cat.brackets.map(b => b.count)) : 1;
    const rows = cat.brackets.map((b, bi) =>
      this._buildBracketRow(b, bi, Population.confidence[cat.key][bi], maxCount, hasPopulation, catIndex * 10 + bi)
    ).join('');
    return `<div class="vp-category">
      <div class="vp-category-header">${cat.label}</div>
      ${rows}
    </div>`;
  },

  // Render one bracket row: label + population count + confidence % + dot field.
  // The dot field has two rows: person icons (chance) and circles (favor, unlocked at 25% confidence).
  _buildBracketRow(bracket, bracketIndex, confidence, maxCount, showPopulation, seed) {
    // When population research is unlocked, scale dots to bracket size.
    // Otherwise every bracket gets MAX_DOTS so relative sizes are not revealed.
    const dotCount = showPopulation
      ? Math.max(1, Math.round((bracket.count / maxCount) * this.MAX_DOTS))
      : this.MAX_DOTS;
    // Colored (non-gray) icons scale with confidence so unknown brackets stay mostly gray.
    const coloredCount = Math.round(dotCount * (confidence / 100));

    // When segmentation display research is unlocked, icons are grouped by colour
    // (red → gray → green) instead of shuffled, so the breakdown is scannable at a glance.
    const ordered = Research.completed.has(RESEARCH_ID.DEMOGRAPHIC_SEGMENTATION_DISPLAY);

    // Chance row: green fraction = chance / 2 (chance 1.0 → 50/50, 2.0 → all green, 0 → all red).
    const chanceGreen = Math.round(coloredCount * (bracket.chance / 2));
    const chanceRed   = coloredCount - chanceGreen;
    const chanceStates = ordered
      ? [...Array(chanceRed).fill('red'), ...Array(dotCount - coloredCount).fill('gray'), ...Array(chanceGreen).fill('green')]
      : this._seededShuffle([...Array(chanceGreen).fill('green'), ...Array(chanceRed).fill('red'), ...Array(dotCount - coloredCount).fill('gray')], seed);
    const chanceDots = chanceStates.map(c => this._personSvg(c)).join('');

    // Favor row: visible once confidence reaches 25%.
    // Three-tier encoding across two linear ranges:
    //   favor 0–2: red → green (favor/2 green fraction, same scale as chance)
    //   favor 2–4: green → gold (gold replaces from the top; red goes to 0 at favor=2)
    //   favor 4+:  all gold (saturated exceptional)
    let favorRow = '';
    if (confidence >= 25) {
      const fav = bracket.favor;
      let favorGreen, favorRed, favorGold;
      if (fav <= 2) {
        favorGreen = Math.round(coloredCount * (fav / 2));
        favorRed   = coloredCount - favorGreen;
        favorGold  = 0;
      } else {
        favorGold  = Math.round(coloredCount * Math.min(1, (fav - 2) / 2));
        favorGreen = coloredCount - favorGold;
        favorRed   = 0;
      }
      const favorStates = ordered
        ? [...Array(favorRed).fill('red'), ...Array(dotCount - coloredCount).fill('gray'), ...Array(favorGreen).fill('green'), ...Array(favorGold).fill('gold')]
        : this._seededShuffle([...Array(favorGold).fill('gold'), ...Array(favorGreen).fill('green'), ...Array(favorRed).fill('red'), ...Array(dotCount - coloredCount).fill('gray')], seed + 1000);
      const favorDots = favorStates.map(c => this._circleSvg(c)).join('');
      favorRow = `<div class="vp-dot-row vp-dot-row--favor">${favorDots}</div>`;
    }

    const popLabel = showPopulation
      ? `<span class="vp-bracket-pop">${bracket.count.toLocaleString()} people</span>`
      : '';

    return `<div class="vp-bracket-row">
      <div class="vp-bracket-meta">
        <span class="vp-bracket-name">${bracket.name}</span>
        ${popLabel}
        <span class="vp-bracket-conf">${Math.round(confidence)}% observed</span>
      </div>
      <div class="vp-dot-field">
        <div class="vp-dot-row">${chanceDots}</div>
        ${favorRow}
      </div>
    </div>`;
  },

  // Tiny SVG person silhouette. fill="currentColor" inherits the vp-person--* color class.
  _personSvg(color) {
    return `<svg class="vp-person vp-person--${color}" viewBox="0 0 10 16" width="11" height="17" fill="currentColor" aria-hidden="true"><circle cx="5" cy="3.5" r="2.8"/><path d="M0.5 16 Q0.5 9.5 5 9.5 Q9.5 9.5 9.5 16 Z"/></svg>`;
  },

  // Small filled circle for the favor row. fill="currentColor" inherits the vp-circle--* color class.
  _circleSvg(color) {
    return `<svg class="vp-circle vp-circle--${color}" viewBox="0 0 8 8" width="8" height="8" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="4"/></svg>`;
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
