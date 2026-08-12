export const CATEGORIES = {
  STUDY: 'Study',
  DSA: 'DSA',
  DEVELOPMENT: 'Development',
  PRODUCTIVITY: 'Productivity',
  ENTERTAINMENT: 'Entertainment',
  SOCIAL: 'Social',
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
  [CATEGORIES.SOCIAL]: '#fb923c',
  [CATEGORIES.SHORT_VIDEO]: '#e879f9',
  [CATEGORIES.UTILITIES]: '#94a3b8',
  [CATEGORIES.OTHER]: '#64748b',
};

export const CATEGORY_WEIGHTS = {
  [CATEGORIES.STUDY]: 1.0,
  [CATEGORIES.DSA]: 1.0,
  [CATEGORIES.DEVELOPMENT]: 1.0,
  [CATEGORIES.PRODUCTIVITY]: 0.8,
  [CATEGORIES.UTILITIES]: 0.3,
  [CATEGORIES.OTHER]: 0.2,
  [CATEGORIES.SOCIAL]: 0.1,
  [CATEGORIES.ENTERTAINMENT]: 0.05,
  [CATEGORIES.SHORT_VIDEO]: 0,
};

export const SHORT_URL_RE = /\/shorts\/|\/reel\/|\/reels\//i;

const RULES = [
  [CATEGORIES.STUDY, ['moodle.org', 'coursera.org', 'udemy.com', 'edx.org', 'nptel.ac.in', 'khanacademy.org', 'classcentral.com', 'futurelearn.com', 'swayam.gov.in', 'byjus.com', 'unacademy.com', 'studocu.com', 'w3schools.com', 'javatpoint.com', 'tutorialspoint.com', 'mitocw', 'ted.com']],
  [CATEGORIES.DSA, ['leetcode.com', 'codeforces.com', 'hackerrank.com', 'codechef.com', 'atcoder.jp', 'topcoder.com', 'geeksforgeeks.org', 'interviewbit.com', 'codingninjas.com', 'cses.fi', 'algoexpert.io', 'hackerearth.com']],
  [CATEGORIES.DEVELOPMENT, ['github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'mdn', 'developer.mozilla.org', 'chat.openai.com', 'openai.com', 'claude.ai', 'gemini.google.com', 'colab.research.google.com', 'kaggle.com', 'huggingface.co', 'replit.com', 'stackblitz.com', 'codesandbox.io', 'vercel.com', 'netlify.com', 'render.com', 'heroku.com', 'docker.com', 'postman.com', 'swagger.io', 'python.org', 'nodejs.org', 'react.dev', 'vitejs.dev', 'npmjs.com', 'caniuse.com', 'w3schools.com', 'freecodecamp.org', 'codewars.com', 'exercism.org']],
  [CATEGORIES.PRODUCTIVITY, ['docs.google.com', 'sheets.google.com', 'slides.google.com', 'forms.google.com', 'calendar.google.com', 'keep.google.com', 'drive.google.com', 'gmail.com', 'mail.google.com', 'outlook.com', 'outlook.live.com', 'office.com', 'notion.so', 'todoist.com', 'trello.com', 'asana.com', 'clickup.com', 'evernote.com', 'medium.com', 'dev.to', 'hashnode.com', 'overleaf.com', 'grammarly.com', 'canva.com', 'figma.com', 'lucidchart.com', 'miro.com', 'zotero.org', 'meet.google.com', 'teams.microsoft.com', 'zoom.us']],
  [CATEGORIES.ENTERTAINMENT, ['youtube.com', 'netflix.com', 'primevideo.com', 'hotstar.com', 'jiocinema.com', 'sonyliv.com', 'spotify.com', 'gaana.com', 'wynk.in', 'twitch.tv', 'disneyplus.com', 'mxplayer.in', 'zee5.com', 'music.youtube.com']],
  [CATEGORIES.SOCIAL, ['instagram.com', 'facebook.com', 'web.whatsapp.com', 'whatsapp.com', 'x.com', 'twitter.com', 'linkedin.com', 'telegram.org', 'web.telegram.org', 'discord.com', 'snapchat.com', 'reddit.com', 'pinterest.com', 'quora.com', 'threads.net', 't.me']],
  [CATEGORIES.UTILITIES, ['google.com', 'bing.com', 'duckduckgo.com', 'wikipedia.org', 'translate.google.com', 'maps.google.com', 'paytm.com', 'phonepe.com', 'upi', 'github.io']],
];

export function classify(domain, path, overrides = {}) {
  if (!domain) return CATEGORIES.OTHER;
  if (path && SHORT_URL_RE.test(path)) return CATEGORIES.SHORT_VIDEO;
  if (overrides[domain]) return overrides[domain];
  const keys = Object.keys(overrides).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (overrides[key] && (domain === key || domain.endsWith('.' + key))) return overrides[key];
  }
  for (const [category, domains] of RULES) {
    for (const d of domains) {
      if (domain === d || domain.endsWith('.' + d)) return category;
    }
  }
  return CATEGORIES.OTHER;
}

export function categoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS[CATEGORIES.OTHER];
}
