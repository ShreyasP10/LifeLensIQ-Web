import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_KEYS,
  CATEGORY_COLORS,
  CATEGORY_WEIGHTS,
  categoryColor,
  isProductiveCategory,
  isDistractingCategory,
} from '../categories.js';
import {
  classify,
  SHORT_URL_RE,
} from '../../../../extension/src/shared/categories.js';

describe('dashboard categories', () => {
  it('exposes unique category keys with colors for every key', () => {
    expect(new Set(CATEGORY_KEYS).size).toBe(CATEGORY_KEYS.length);
    for (const c of CATEGORY_KEYS) {
      expect(CATEGORY_COLORS[c]).toBeTruthy();
    }
  });

  it('weights are within [0, 1] and shorts weigh nothing', () => {
    for (const [c, w] of Object.entries(CATEGORY_WEIGHTS)) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
    expect(CATEGORY_WEIGHTS[CATEGORIES.SHORT_VIDEO]).toBe(0);
    expect(CATEGORY_WEIGHTS[CATEGORIES.STUDY]).toBe(1);
  });

  it('categoryColor falls back for unknown categories', () => {
    expect(categoryColor(CATEGORIES.STUDY)).toBe('#4ade80');
    expect(categoryColor('Nope')).toBe(CATEGORY_COLORS[CATEGORIES.OTHER]);
  });

  it('classifies productive vs distracting', () => {
    expect(isProductiveCategory('Study')).toBe(true);
    expect(isProductiveCategory('Development')).toBe(true);
    expect(isProductiveCategory('Entertainment')).toBe(false);
    expect(isDistractingCategory('Short-form Video')).toBe(true);
    expect(isDistractingCategory('Social')).toBe(true);
    expect(isDistractingCategory('Study')).toBe(false);
  });
});

describe('extension classify (shared rules)', () => {
  it('detects short-form URLs by path', () => {
    expect(SHORT_URL_RE.test('/shorts/abc')).toBe(true);
    expect(SHORT_URL_RE.test('/reels/xyz')).toBe(true);
    expect(SHORT_URL_RE.test('/watch?v=1')).toBe(false);
  });

  it('classifies known domains', () => {
    expect(classify('youtube.com', '/watch?v=1')).toBe(CATEGORIES.ENTERTAINMENT);
    expect(classify('leetcode.com', '/problems')).toBe('DSA');
    expect(classify('github.com', '/')).toBe('Development');
  });

  it('exact shorts path wins over domain rules', () => {
    expect(classify('youtube.com', '/shorts/x')).toBe(CATEGORIES.SHORT_VIDEO);
  });

  it('supports subdomain suffix matching', () => {
    expect(classify('mail.google.com', '/')).toBe('Productivity');
    expect(classify('anything.stackoverflow.com', '/')).toBe('Development');
  });

  it('applies user overrides before built-in rules', () => {
    expect(classify('youtube.com', '/watch?v=1', { 'youtube.com': 'Study' })).toBe('Study');
    expect(classify('youtube.com', '/shorts/x', { 'youtube.com': 'Study' })).toBe(
      CATEGORIES.SHORT_VIDEO
    );
  });

  it('falls back to Other', () => {
    expect(classify('somerandom.example', '/')).toBe(CATEGORIES.OTHER);
    expect(classify('', '/')).toBe(CATEGORIES.OTHER);
  });
});