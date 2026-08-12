export const CATEGORIES = {
  STUDY: 'Study',
  DSA: 'DSA',
  DEVELOPMENT: 'Development',
  PRODUCTIVITY: 'Productivity',
  ENTERTAINMENT: 'Entertainment',
  TIMEPASS: 'Timepass',
  SHORT_VIDEO: 'Short-form Video',
  UTILITIES: 'Utilities',
  OTHER: 'Other',
};

export const CATEGORY_KEYS = Object.values(CATEGORIES);

export const CATEGORY_COLORS = {
  [CATEGORIES.STUDY]: '#4ade80',
  [CATEGORIES.DSA]: '#38bdf8',
  [CATEGORIES.DEVELOPMENT]: '#818cf8',
  [CATEGORIES.PRODUCTIVITY]: '#fbbf24',
  [CATEGORIES.ENTERTAINMENT]: '#f87171',
  [CATEGORIES.TIMEPASS]: '#fb923c',
  [CATEGORIES.SHORT_VIDEO]: '#e879f9',
  [CATEGORIES.UTILITIES]: '#94a3b8',
  [CATEGORIES.OTHER]: '#64748b',
};

export const CATEGORY_WEIGHTS = {
  [CATEGORIES.STUDY]: 1.0,
  [CATEGORIES.DSA]: 1.0,
  [CATEGORIES.DEVELOPMENT]: 1.0,
  [CATEGORIES.PRODUCTIVITY]: 0.9,
  [CATEGORIES.UTILITIES]: 0.3,
  [CATEGORIES.OTHER]: 0.2,
  [CATEGORIES.ENTERTAINMENT]: 0.05,
  [CATEGORIES.TIMEPASS]: 0.05,
  [CATEGORIES.SHORT_VIDEO]: 0,
};

export function categoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS[CATEGORIES.OTHER];
}

export function isProductiveCategory(category) {
  return (CATEGORY_WEIGHTS[category] ?? 0) >= 0.8;
}

export function isDistractingCategory(category) {
  return (
    category === CATEGORIES.ENTERTAINMENT ||
    category === CATEGORIES.TIMEPASS ||
    category === CATEGORIES.SHORT_VIDEO
  );
}