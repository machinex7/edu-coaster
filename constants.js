// constants.js — Shared enums for the whole app.
// All objects are frozen so accidental assignment fails loudly.

const STAGE = Object.freeze({
  SETUP: 'setup',
  PLAY:  'play',
});

const STATUS = Object.freeze({
  ACTIVE:             'active',
  UNDER_CONSTRUCTION: 'under_construction',
});

const CATEGORY = Object.freeze({
  RIDE:     'ride',
  FACILITY: 'facility',
});

const JOB = Object.freeze({
  RIDE_OPERATOR:    'ride_operator',
  SECURITY:         'security',
  JANITOR:          'janitor',
  ENGINEER:         'engineer',
  BOOTH_ATTENDANT:  'booth_attendant',
  BUSINESS_ANALYST: 'business_analyst',
  HR:               'hr',
});

// IDs that match the "id" field in facilities.json.
const FACILITY_ID = Object.freeze({
  PARK_ENTRANCE: 'park_entrance',
  PATH:          'path',
  BATHROOM:      'bathroom',
  STATUE:        'statue',
  GARDEN:        'garden',
  FOUNTAIN:      'fountain',
});
