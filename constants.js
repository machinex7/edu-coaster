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
  STAFF_LOUNGE:       'staff_lounge',
  GUARD_STATION:      'guard_station',
  STORAGE_WAREHOUSE:  'storage_warehouse',
  TREE:               'tree',
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
  BULK_ORDERING:            'bulk_ordering',
  DEMOGRAPHIC_POPULATION:             'demographic_population',
  DEMOGRAPHIC_SEGMENTATION_DISPLAY:   'demographic_segmentation_display',
  PARKING_FEES:             'parking_fees',
  PARKING_LOT_AMENITIES:    'parking_lot_amenities',
  BUS_SERVICE:              'bus_service',
  WASH_HANDS_POLICY:        'wash_hands_policy',
  WORKPLACE_SAFETY_PROTOCOLS: 'workplace_safety_protocols',
});

// IDs that match the concessions menu items in Concessions.menuItems.
const MENU_ITEM = Object.freeze({
  WATER_CUP:       'water_cup',
  SODA:            'soda',
  HOT_DOG:         'hot_dog',
  FRIES:           'fries',
  TATER_TOTS:      'tater_tots',
  BURGER:          'burger',
  CHICKEN_TENDERS: 'chicken_tenders',
});

// Breakdown probability reaches 100% at this cumulative wear value.
const MAX_EFFECTIVE_WEAR = 10000;

// Wear accumulated per rider per round. Calibrated so a heavily-ridden ride (~15 000 riders/wk)
// accumulates ~105 wear/round and reaches MAX_EFFECTIVE_WEAR in roughly 1.8 years.
const WEAR_PER_RIDER = 0.007;

const WEEKS_PER_YEAR = 52;

// Hours the park is open each day — used to convert ride cycles/hr to weekly rider capacity.
const PARK_HOURS_PER_DAY = 10;

const LOAN_STATUS = Object.freeze({
  APPROACHING: 'approaching',
  OPEN:        'open',
  APPLYING:    'applying',
  OFFERED:     'offered',
  REVIEW:      'review',
});

const AWARD_ID = Object.freeze({
  HIGHEST_RIDE: 'highest_ride',
  LONGEST_RIDE: 'longest_ride',
  FASTEST_RIDE: 'fastest_ride',
  MOST_LOOPS:   'most_loops',
  LONGEST_DROP: 'longest_drop',
  MOST_RIDES:    'most_rides',
  CLEANEST_PARK: 'cleanest_park',
  SAFEST_PARK:   'safest_park',
  MOST_GUESTS:    'most_guests',
  MOST_BATHROOMS: 'most_bathrooms',
});

// Per-charity sponsorship tiers based on cumulative all-time donations.
// Ordered highest to lowest so Array.find() returns the best qualifying tier.
// boost: percentage points added to rawExcitement per charity at this tier.
const SPONSORSHIP_TIERS = Object.freeze([
  { id: 'diamond',  label: 'Diamond Sponsor',  emoji: '💎', threshold: 10_000_000, boost: 5 },
  { id: 'platinum', label: 'Platinum Sponsor',  emoji: '🌟', threshold: 1_000_000,  boost: 4 },
  { id: 'gold',     label: 'Gold Sponsor',      emoji: '🥇', threshold: 100_000,   boost: 3 },
  { id: 'silver',   label: 'Silver Sponsor',    emoji: '🥈', threshold: 10_000,    boost: 2 },
  { id: 'bronze',   label: 'Bronze Sponsor',    emoji: '🥉', threshold: 1000,      boost: 1 },
]);

// Annual interest rate for the savings account, compounded weekly.
const SAVINGS_ANNUAL_RATE = 0.004;

// Money market account parameters.
const MM_ANNUAL_RATE         = 0.04;  // 4% annual, compounded weekly
const MM_MIN_BALANCE         = 3000;  // minimum balance; falling below closes the account
const MM_WITHDRAWAL_COOLDOWN = 4;     // rounds to wait between withdrawals

// Interest rate reduction per covenant on the loan agreement.
const COVENANT_RATE_DISCOUNT = 0.4;
// Per missed payment: interest rate premium added to future proposals.
const MISSED_PAYMENT_RATE_PENALTY = 0.15;
// Per missed payment: fraction subtracted from each purpose's LTV cap.
const MISSED_PAYMENT_LTV_PENALTY  = 0.05;
