// constants.js — Shared enums for the whole app.
// All objects are frozen so accidental assignment fails loudly.

const STAGE = Object.freeze({
  SETUP: 'setup',
  PLAY:  'play',
});

const STATUS = Object.freeze({
  ACTIVE:               'active',
  UNDER_CONSTRUCTION:   'under_construction',
  PAUSED_CONSTRUCTION:  'paused_construction',
  CLOSED:               'closed',
  BROKEN_DOWN:          'broken_down',
  DEMOLISHING:          'demolishing',
});

const CATEGORY = Object.freeze({
  RIDE:     'ride',
  FACILITY: 'facility',
  SHOP:     'shop',
});

const JOB = Object.freeze({
  RIDE_OPERATOR:         'ride_operator',
  SECURITY:              'security',
  JANITOR:               'janitor',
  ENGINEER:              'engineer',
  BOOTH_ATTENDANT:       'booth_attendant',
  MERCHANDISE_ATTENDANT: 'merchandise_attendant',
  CONCESSIONS_WORKER:    'concessions_worker',
  BUSINESS_ANALYST:      'business_analyst',
  HR:                    'hr',
});

// IDs that match the "id" field in facilities.json.
const FACILITY_ID = Object.freeze({
  PARK_ENTRANCE: 'park_entrance',
  PATH:          'path',
  BATHROOM:      'bathroom',
  STATUE:        'statue',
  GARDEN:        'garden',
  FOUNTAIN:      'fountain',
  STAFF_LOUNGE:  'staff_lounge',
});

const SECURITY_FOCUS = Object.freeze({
  PATROL:      'patrol',
  GATE:        'gate',
  SHOP:        'shop',
  PARKING_OBS: 'parking_obs',
});

const ENGINEER_FOCUS = Object.freeze({
  MAINTENANCE:  'maintenance',
  CONSTRUCTION: 'construction',
});

const SURVEY_INCENTIVE = Object.freeze({
  NONE:     'none',
  DISCOUNT: 'discount',
  PRIZE:    'prize',
});

const RESEARCH_ID = Object.freeze({
  SURVEYS:                  'surveys',
  LICENSE_PLATE_MONITORING: 'license_plate_monitoring',
  QUARTERLY_SURVEY_RESULTS: 'quarterly_survey_results',
  SURVEY_COUPON_INCENTIVE:  'survey_coupon_incentive',
  SURVEY_PRIZE_INCENTIVE:   'survey_prize_incentive',
  WEATHER_SENSOR:           'weather_sensor',
  WEATHER_STATION:          'weather_station',
  EMPLOYEE_BENEFITS:        'employee_benefits',
  PARENTAL_LEAVE:           'parental_leave',
  FOUR_OH_ONE_K:            '401k',
  MEDICAL_COVERAGE:         'medical_coverage',
});

// Breakdown probability reaches 100% at this cumulative wear value.
const MAX_EFFECTIVE_WEAR = 1000;

const WEEKS_PER_YEAR = 52;

const LOAN_STATUS = Object.freeze({
  APPROACHING: 'approaching',
  OPEN:        'open',
  APPLYING:    'applying',
  OFFERED:     'offered',
  REVIEW:      'review',
});

// Interest rate reduction per covenant on the loan agreement.
const COVENANT_RATE_DISCOUNT = 0.4;
// Per missed payment: interest rate premium added to future proposals.
const MISSED_PAYMENT_RATE_PENALTY = 0.15;
// Per missed payment: fraction subtracted from each purpose's LTV cap.
const MISSED_PAYMENT_LTV_PENALTY  = 0.05;
