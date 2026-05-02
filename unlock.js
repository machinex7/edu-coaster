// unlock.js — Progressive feature unlock system.
// Features are revealed gradually so new players learn one system at a time.
// Wire up Unlock.isUnlocked() calls in each feature's panel/module when ready.

// Identifiers for every lockable feature.
const FEATURE_ID = Object.freeze({
  SECURITY:    'security',
  MESSES:      'messes',
  LOANS:       'loans',
  STAFFING:    'staffing',
  MERCHANDISE: 'merchandise',
  FOOD:        'food',
});

// Each entry: afterWeek (rounds of play until auto-unlock), name (display label).
// Set afterWeek to null to permanently disable a feature — useful for teachers
// who want to focus on a single concept without other systems appearing.
const UNLOCK_DEFS = Object.freeze({
  [FEATURE_ID.STAFFING]:    { afterWeek: 4,  name: 'Staffing' },
  [FEATURE_ID.MESSES]:      { afterWeek: 6,  name: 'Messes' },
  [FEATURE_ID.MERCHANDISE]: { afterWeek: 6,  name: 'Merchandise' },
  [FEATURE_ID.SECURITY]:    { afterWeek: 8,  name: 'Security' },
  [FEATURE_ID.FOOD]:        { afterWeek: 8,  name: 'Food & Dining' },
  [FEATURE_ID.LOANS]:       { afterWeek: 10, name: 'Business Loans' },
});

// Mutable per-feature state: unlocked boolean and weeksLeft countdown.
// Initialised assuming round 1 is the first week of play.
const _unlockState = {};
for (const [id, def] of Object.entries(UNLOCK_DEFS)) {
  _unlockState[id] = { unlocked: false, weeksLeft: def.afterWeek != null ? def.afterWeek - 1 : null };
}

// Unlock — query and advance feature availability.
const Unlock = {
  // Returns true if the feature is currently available.
  isUnlocked(featureId) {
    return _unlockState[featureId]?.unlocked ?? true;
  },

  // Returns rounds remaining until the feature unlocks, or 0 if already unlocked.
  weeksLeft(featureId) {
    return _unlockState[featureId]?.weeksLeft ?? 0;
  },

  // Call once per round after incrementing round. Decrements each locked
  // feature's countdown and fires a notification on unlock.
  tick() {
    for (const [id, def] of Object.entries(UNLOCK_DEFS)) {
      const s = _unlockState[id];
      if (s.unlocked || s.weeksLeft === null) continue;
      s.weeksLeft = Math.max(0, s.weeksLeft - 1);
      if (s.weeksLeft === 0) {
        s.unlocked = true;
        Notifications.push({
          label:   'Unlocked',
          message: `${def.name} is now available!`,
        });
      }
    }
  },
};
