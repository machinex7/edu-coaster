// unlock.js — Progressive feature unlock system.
// Features are revealed gradually so new players learn one system at a time.
// Read feature state directly: Unlock.SECURITY (boolean).
// Set afterWeek to null to permanently disable a feature — useful for teachers
// who want to focus on a single concept without other systems appearing.

// Private config: afterWeek (rounds of play until auto-unlock), name (for notifications).
const _DEFS = {
  STAFFING:    { afterWeek: 0, name: 'Staffing' },
  MESSES:      { afterWeek: 0, name: 'Messes' },
  MERCHANDISE: { afterWeek: 0, name: 'Merchandise' },
  SECURITY:    { afterWeek: 0, name: 'Security' },
  FOOD:        { afterWeek: 0, name: 'Food & Dining' },
  BANKING:     { afterWeek: 0, name: 'Banking' },
  WEAR:        { afterWeek: 0, name: 'Wear & Maintenance' },
};

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

// Initialise boolean flags and week countdowns from _DEFS.
for (const [key, def] of Object.entries(_DEFS)) {
  Unlock[key]      = def.afterWeek === 0;
  UnlockWeeks[key] = def.afterWeek != null ? Math.max(0, def.afterWeek - 1) : null;
}
