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
  WEATHER:     'weather',
  MERCHANDISE: 'merchandise',
  FOOD:        'food',
});

// Each entry: afterWeek (week number when the feature auto-unlocks) and an
// optional researchId (completing that research node also unlocks it early).
const UNLOCK_DEFS = Object.freeze({
  [FEATURE_ID.STAFFING]:    { afterWeek: 4 },
  [FEATURE_ID.MESSES]:      { afterWeek: 6 },
  [FEATURE_ID.MERCHANDISE]: { afterWeek: 6 },
  [FEATURE_ID.SECURITY]:    { afterWeek: 8 },
  [FEATURE_ID.FOOD]:        { afterWeek: 8 },
  [FEATURE_ID.LOANS]:       { afterWeek: 10 },
  [FEATURE_ID.WEATHER]:     { afterWeek: 12, researchId: RESEARCH_ID.WEATHER_SENSOR },
});

// Unlock — query whether a feature is available.
const Unlock = {
  // Returns true if featureId is available this round, or if the player
  // has completed the feature's associated research node.
  isUnlocked(featureId, completedResearch = []) {
    const def = UNLOCK_DEFS[featureId];
    if (!def) return true;
    if (def.researchId && completedResearch.includes(def.researchId)) return true;
    return round >= def.afterWeek;
  },
};
