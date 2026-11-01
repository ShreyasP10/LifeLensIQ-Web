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
  matchOverride,
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
    expect(isDistractingCategory('Timepass')).toBe(true);
    expect(isDistractingCategory('Study')).toBe(false);
  });
});

describe('extension classify (shared rules)', () => {
  it('detects short-form URLs by path', () => {
    expect(SHORT_URL_RE.test('/shorts/abc')).toBe(true);
    expect(SHORT_URL_RE.test('/reels/xyz')).toBe(true);
    expect(SHORT_URL_RE.test('/watch?v=1')).toBe(false);
  });

  it('AI assistants are Productivity', () => {
    expect(classify('chatgpt.com', '/')).toBe('Productivity');
    expect(classify('chat.openai.com', '/')).toBe('Productivity');
    expect(classify('chat.deepseek.com', '/chat')).toBe('Productivity');
    expect(classify('deepseek.com', '/')).toBe('Productivity');
    expect(classify('claude.ai', '/')).toBe('Productivity');
    expect(classify('perplexity.ai', '/')).toBe('Productivity');
    expect(classify('gemini.google.com', '/')).toBe('Productivity');
  });

  it('college / education sites are Study', () => {
    expect(classify('elearn.apsit.edu.in', '/moodle/')).toBe('Study');
    expect(classify('apsit.edu.in', '/')).toBe('Study');
    expect(classify('moodle.org', '/course/view.php')).toBe('Study');
    expect(classify('nptel.ac.in', '/course')).toBe('Study');
    expect(classify('credly.com', '/')).toBe('Study');
  });

  it('coding practice sites are DSA', () => {
    expect(classify('leetcode.com', '/problems')).toBe('DSA');
    expect(classify('codeforces.com', '/')).toBe('DSA');
    expect(classify('geeksforgeeks.org', '/graph')).toBe('DSA');
  });

  it('dev platforms are Development', () => {
    expect(classify('stackoverflow.com', '/questions')).toBe('Development');
    expect(classify('w3schools.com', '/js')).toBe('Development');
    expect(classify('kaggle.com', '/')).toBe('Development');
  });

  it('GitHub and LinkedIn are Productivity', () => {
    expect(classify('github.com', '/')).toBe('Productivity');
    expect(classify('linkedin.com', '/feed')).toBe('Productivity');
    expect(classify('mail.google.com', '/')).toBe('Productivity');
    expect(classify('notion.so', '/')).toBe('Productivity');
  });

  it('timepass sites are Timepass (was Social)', () => {
    for (const d of ['instagram.com', 'x.com', 'twitter.com', 'facebook.com', 'web.whatsapp.com', 'reddit.com', 'discord.com', 'snapchat.com']) {
      expect(classify(d, '/')).toBe('Timepass');
    }
    expect(CATEGORIES.TIMEPASS).toBe('Timepass');
  });

  it('exact shorts path wins over domain rules', () => {
    expect(classify('youtube.com', '/shorts/x')).toBe(CATEGORIES.SHORT_VIDEO);
  });

  it('supports subdomain suffix matching', () => {
    expect(classify('mail.google.com', '/')).toBe('Productivity');
    expect(classify('chat.deepseek.com', '/')).toBe('Productivity');
    expect(classify('anything.stackoverflow.com', '/')).toBe('Development');
  });

  it('deploys on vercel.app count as Productivity', () => {
    expect(classify('shreyaspawardev.vercel.app', '/')).toBe('Productivity');
    expect(classify('life-lens-iq-web.vercel.app', '/')).toBe('Productivity');
    expect(classify('any-app.vercel.app', '/report')).toBe('Productivity');
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

  it('classifies localhost and private IPs as Development', () => {
    expect(classify('localhost', '/')).toBe('Development');
    expect(classify('localhost:5173', '/')).toBe('Development');
    expect(classify('myapp.localhost', '/')).toBe('Development');
    expect(classify('127.0.0.1', '/')).toBe('Development');
    expect(classify('0.0.0.0', '/')).toBe('Development');
    expect(classify('::1', '/')).toBe('Development');
    expect(classify('192.168.1.5', '/')).toBe('Development');
    expect(classify('10.0.14.22', '/')).toBe('Development');
    expect(classify('172.16.5.1', '/')).toBe('Development');
    expect(classify('172.31.255.1', '/')).toBe('Development');
  });

  it('still respects overrides over the local dev rule', () => {
    expect(classify('localhost', '/', { 'localhost': 'Study' })).toBe('Study');
  });

  it('does not misclassify public IPs or lookalikes', () => {
    expect(classify('8.8.8.8', '/')).toBe(CATEGORIES.OTHER);
    expect(classify('172.32.1.1', '/')).toBe(CATEGORIES.OTHER);
    expect(classify('172.15.0.9', '/')).toBe(CATEGORIES.OTHER);
    expect(classify('191.168.1.5', '/')).toBe(CATEGORIES.OTHER);
    expect(classify('test.com', '/')).toBe(CATEGORIES.OTHER);
    expect(classify('notion.so', '/', { })).toBe('Productivity');
  });
});

describe('path-level override rules', () => {
  it('domain rules still work without a path key', () => {
    expect(matchOverride('youtube.com', '/watch?v=1', { 'youtube.com': 'Study' })).toBe('Study');
  });

  it('a domain + path key matches only matching path prefixes', () => {
    const ov = { 'youtube.com/playlist': 'Study' };
    expect(matchOverride('youtube.com', '/playlist?list=abc', ov)).toBe('Study');
    expect(matchOverride('youtube.com', '/watch?v=1', ov)).toBe(null);
  });

  it('longest match wins regardless of exact/suffix', () => {
    const ov = { 'github.com': 'Timepass', 'github.com/feature': 'Development' };
    expect(matchOverride('github.com', '/feature/x', ov)).toBe('Development');
    expect(matchOverride('github.com', '/home', ov)).toBe('Timepass');
    expect(matchOverride('gist.github.com', '/x', ov)).toBe('Timepass');
  });

  it('classify applies path overrides before built-in rules', () => {
    expect(classify('github.com', '/feature/x', { 'github.com': 'Timepass', 'github.com/feature': 'Development' })).toBe('Development');
  });

  it('exact-deeper-path override beats shorter domain override', () => {
    const ov = { 'youtube.com': 'Timepass', 'youtube.com/watch': 'Study' };
    expect(classify('youtube.com', '/watch?v=1', ov)).toBe('Study');
    expect(classify('youtube.com', '/feed', ov)).toBe('Timepass');
  });
});