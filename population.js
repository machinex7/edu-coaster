// population.js — Constants representing visitor behavior and external
// economic conditions. Update these to tune how the outside world affects
// the park simulation.

const Population = {

  // ── Visitor behavior ───────────────────────────────────────────────────────
  BUYER_RATE:             0.15,   // fraction of visitors who purchase merchandise
  THEFT_RATE:             0.008,  // fraction of non-buyers who attempt to shoplift

  // Incident rates: how often frustrated or bored visitors cause trouble.
  OVERFLOW_INCIDENT_RATE: 0.05,   // fraction of turned-away visitors who cause incidents
  UNRIDDEN_INCIDENT_RATE: 0.20,   // fraction of visitors who rode nothing who cause incidents
  RANDOM_INCIDENT_RATE:   0.001,  // baseline incident chance per visitor per week

  // ── External economic conditions ───────────────────────────────────────────
  utilityMultiplier: 1,     // applied to all ride utility costs each round
  inflationRate:     1.02,  // annual rate; will adjust cost-of-living and merchandise

};
