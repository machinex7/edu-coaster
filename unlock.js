// unlock.js — Progressive feature unlock system.
// Features are revealed gradually so new players learn one system at a time.
// Nothing in this file locks the UI yet — wire up isUnlocked() calls in each
// feature's panel/module when ready.

// Identifiers for every lockable feature.
const FEATURE_ID = Object.freeze({
  SECURITY:    'security',
  MESSES:      'messes',
  LOANS:       'loans',
  STAFFING:    'staffing',
  MERCHANDISE: 'merchandise',
  FOOD:        'food',
});

// Each entry: afterWeek (week number when the feature auto-unlocks).
const UNLOCK_DEFS = Object.freeze({
  [FEATURE_ID.STAFFING]:    { afterWeek: 4 },
  [FEATURE_ID.MESSES]:      { afterWeek: 6 },
  [FEATURE_ID.MERCHANDISE]: { afterWeek: 6 },
  [FEATURE_ID.SECURITY]:    { afterWeek: 8 },
  [FEATURE_ID.FOOD]:        { afterWeek: 8 },
  [FEATURE_ID.LOANS]:       { afterWeek: 10 },
});

// Unlock — query whether a feature is available.
const Unlock = {
  // Returns true if featureId is available this round.
  isUnlocked(featureId) {
    const def = UNLOCK_DEFS[featureId];
    if (!def) return true;
    return round >= def.afterWeek;
  },
};
