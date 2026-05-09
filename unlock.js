// unlock.js — Progressive feature unlock system.
// Features are revealed gradually so new players learn one system at a time.
// Read feature state directly: Unlock.SECURITY (boolean).
// Set afterWeek to null to permanently disable a feature — useful for teachers
// who want to focus on a single concept without other systems appearing.
//
// Teacher modes: pass ?mode=<name> in the URL to lock all out-of-scope features.
//   banking   — only Banking active
//   staffing  — locks Banking and Marketing
//   shop      — locks Messes, Wear, Banking, and Marketing
//   marketing — only Marketing active

// Private config: afterWeek (rounds of play until auto-unlock), name (for notifications).
const _DEFS = {
  STAFFING:    { afterWeek: 0, name: 'Staffing' },
  MESSES:      { afterWeek: 0, name: 'Messes' },
  MERCHANDISE: { afterWeek: 0, name: 'Merchandise' },
  SECURITY:    { afterWeek: 0, name: 'Security' },
  FOOD:        { afterWeek: 0, name: 'Food & Dining' },
  BANKING:     { afterWeek: 0, name: 'Banking' },
  WEAR:        { afterWeek: 0, name: 'Wear & Maintenance' },
  MARKETING:   { afterWeek: 0, name: 'Marketing' },
};

// Features permanently locked by each teacher mode.
const _MODES = {
  banking:   ['STAFFING', 'MESSES', 'MERCHANDISE', 'SECURITY', 'FOOD', 'WEAR', 'MARKETING'],
  staffing:  ['BANKING', 'MARKETING'],
  shop:      ['MESSES', 'WEAR', 'BANKING', 'MARKETING'],
  marketing: ['STAFFING', 'MESSES', 'MERCHANDISE', 'SECURITY', 'FOOD', 'BANKING', 'WEAR'],
};

// Features locked by the active mode (empty set = no mode / full game).
const _modeParam   = new URLSearchParams(window.location.search).get('mode') ?? '';
const _modeLocked  = new Set(_MODES[_modeParam] ?? []);

// Rounds remaining until each feature unlocks. null = permanently locked.
const UnlockWeeks = {};

// Boolean unlock flags — read directly: Unlock.SECURITY, Unlock.STAFFING, etc.
const Unlock = {
  // Call once per round. Decrements countdowns and fires a notification on unlock.
  tick() {
    for (const [key, def] of Object.entries(_DEFS)) {
      if (Unlock[key] || UnlockWeeks[key] === null) continue;
      UnlockWeeks[key]--;
      if (UnlockWeeks[key] === 0) {
        Unlock[key] = true;
        Notifications.push({
          label:   'Unlocked',
          message: `${def.name} is now available!`,
        });
      }
    }
  },
};

// Initialise boolean flags and week countdowns. Mode-locked features are treated
// as afterWeek: null — permanently off for this session.
for (const [key, def] of Object.entries(_DEFS)) {
  const afterWeek  = _modeLocked.has(key) ? null : def.afterWeek;
  Unlock[key]      = afterWeek === 0;
  UnlockWeeks[key] = afterWeek != null ? Math.max(0, afterWeek - 1) : null;
}
