const TERMS_VERSION = "2026-09-06";

const MUSIC_TYPES = ["single", "ep", "album", "mixtape", "dj_mix", "beat"];
const BUNDLE_TYPES = ["ep", "album", "mixtape"];

const COMMISSION_RULES = {
  music: {
    fixed: {
      "5.00": 1.5,
      "9.00": 2.5
    },
    default: null
  },
  beat: {
    fixed: {
      "300.00": 25
    },
    default: null
  }
};

function normalizePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) ? Math.round(price * 100) / 100 : NaN;
}

function validateMusicPrice(type, value) {
  const price = normalizePrice(value);
  if (!Number.isFinite(price) || price < 0) return "A valid non-negative price is required.";
  if (BUNDLE_TYPES.includes(type) && (price < 50 || price > 70)) {
    return `${type.toUpperCase()} prices must be between R50 and R70.`;
  }
  return null;
}

function commissionFor(kind, value) {
  const price = normalizePrice(value);
  if (!Number.isFinite(price)) return null;
  const rules = COMMISSION_RULES[kind];
  if (!rules) return null;
  return rules.fixed[price.toFixed(2)] ?? rules.default;
}

function creatorPayout(kind, value) {
  const price = normalizePrice(value);
  const commission = commissionFor(kind, price);
  return commission === null ? null : Math.round((price - commission) * 100) / 100;
}

module.exports = {
  TERMS_VERSION,
  MUSIC_TYPES,
  BUNDLE_TYPES,
  COMMISSION_RULES,
  normalizePrice,
  validateMusicPrice,
  commissionFor,
  creatorPayout
};
