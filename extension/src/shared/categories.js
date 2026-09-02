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

export const SHORT_URL_RE = /\/shorts\/|\/reel\/|\/reels\//i;

const STUDY_KEYWORDS = [
  'tutorial', 'lecture', 'course', 'learn', 'lesson', 'education',
  'explained', 'guide', 'how to', 'crash course', 'full course',
  'beginner', 'advanced', 'introduction', 'basics', 'fundamentals',
  'masterclass', 'study', 'academy'
];

const DEV_KEYWORDS = [
  'programming', 'code', 'coding', 'developer', 'software',
  'javascript', 'python', 'java', 'c++', 'c#', 'html', 'css',
  'react', 'angular', 'vue', 'node', 'sql', 'database',
  'data structure', 'algorithm', 'dsa', 'leetcode', 'machine learning',
  'ai', 'artificial intelligence', 'deep learning', 'development',
  'web dev', 'app dev', 'frontend', 'backend', 'fullstack', 'system design'
];

const DSA_KEYWORDS = [
  'data structure', 'algorithm', 'leetcode', 'dsa',
  'binary tree', 'linked list', 'dynamic programming',
  'graph', 'sorting', 'searching', 'recursion', 'stack', 'queue',
  'competitive programming', 'neetcode', 'striver'
];

const PRODUCTIVITY_KEYWORDS = [
  'productivity', 'study with me', 'focus', 'time management',
  'notion', 'obsidian', 'note taking', 'exam prep',
  'upsc', 'gate', 'neet', 'jee', 'cat', 'gre', 'toefl',
  'pomodoro', 'workflow', 'planning', 'habits'
];

export function classifyYouTubeTitle(title) {
  const t = title.toLowerCase();
  
  // Shorts are already handled via URL pattern, but skip if title contains '#shorts'
  if (t.includes('#shorts')) return null; // let URL rule handle it

  // DSA specific (highest priority)
  if (DSA_KEYWORDS.some(k => t.includes(k))) return CATEGORIES.DSA;
  
  // Study (generic educational) - check before Development
  if (STUDY_KEYWORDS.some(k => t.includes(k))) return CATEGORIES.STUDY;
  
  // Productivity
  if (PRODUCTIVITY_KEYWORDS.some(k => t.includes(k))) return CATEGORIES.PRODUCTIVITY;
  
  // Development (programming but not explicitly tutorial/lecture)
  if (DEV_KEYWORDS.some(k => t.includes(k))) return CATEGORIES.DEVELOPMENT;
  
  // Default: entertainment
  return CATEGORIES.ENTERTAINMENT;
}

const RULES = [
  // Education + college resources
  [CATEGORIES.STUDY, ['moodle.org', 'elearn.apsit.edu.in', 'apsit.edu.in', 'coursera.org', 'udemy.com', 'edx.org', 'nptel.ac.in', 'khanacademy.org', 'classcentral.com', 'futurelearn.com', 'swayam.gov.in', 'byjus.com', 'unacademy.com', 'studocu.com', 'javatpoint.com', 'tutorialspoint.com', 'mitocw', 'ted.com']],
  // Coding practice / interview prep
  [CATEGORIES.DSA, ['leetcode.com', 'codeforces.com', 'hackerrank.com', 'codechef.com', 'atcoder.jp', 'topcoder.com', 'geeksforgeeks.org', 'interviewbit.com', 'codingninjas.com', 'cses.fi', 'algoexpert.io', 'hackerearth.com']],
  // Code, docs, AI-assisted development
  [CATEGORIES.DEVELOPMENT, ['stackoverflow.com', 'mdn', 'developer.mozilla.org', 'stackblitz.com', 'codesandbox.io', 'codepen.io', 'jsfiddle.net', 'vercel.com', 'netlify.com', 'render.com', 'heroku.com', 'docker.com', 'postman.com', 'swagger.io', 'python.org', 'nodejs.org', 'react.dev', 'vitejs.dev', 'npmjs.com', 'caniuse.com', 'w3schools.com', 'freecodecamp.org', 'codewars.com', 'exercism.org', 'kaggle.com', 'huggingface.co', 'colab.research.google.com', 'replit.com', 'bolt.new', 'v0.dev', 'lovable.dev']],
  // Productivity: docs, mail, notes, calendars, AI chat assistants, career, code hosting
  [CATEGORIES.PRODUCTIVITY, ['docs.google.com', 'sheets.google.com', 'slides.google.com', 'forms.google.com', 'calendar.google.com', 'keep.google.com', 'drive.google.com', 'gmail.com', 'mail.google.com', 'meet.google.com', 'chat.google.com', 'classroom.google.com', 'contacts.google.com', 'tasks.google.com', 'sites.google.com', 'script.google.com', 'admin.google.com', 'groups.google.com', 'voice.google.com', 'analytics.google.com', 'ads.google.com', 'tagmanager.google.com', 'datastudio.google.com', 'outlook.com', 'outlook.live.com', 'office.com', 'notion.so', 'todoist.com', 'trello.com', 'asana.com', 'clickup.com', 'evernote.com', 'medium.com', 'dev.to', 'hashnode.com', 'overleaf.com', 'grammarly.com', 'canva.com', 'figma.com', 'lucidchart.com', 'miro.com', 'zotero.org', 'meet.google.com', 'teams.microsoft.com', 'zoom.us', 'linkedin.com', 'github.com', 'gitlab.com', 'bitbucket.org', 'chatgpt.com', 'chat.openai.com', 'openai.com', 'claude.ai', 'gemini.google.com', 'bard.google.com', 'chat.deepseek.com', 'deepseek.com', 'perplexity.ai', 'copilot.microsoft.com', 'poe.com', 'grok.com', 'you.com']],
  [CATEGORIES.ENTERTAINMENT, ['youtube.com', 'netflix.com', 'primevideo.com', 'hotstar.com', 'jiocinema.com', 'sonyliv.com', 'spotify.com', 'gaana.com', 'wynk.in', 'twitch.tv', 'disneyplus.com', 'mxplayer.in', 'zee5.com', 'music.youtube.com', 'primevideo']],
  // Timepass / distraction: social feeds, chats, forums
  [CATEGORIES.TIMEPASS, ['instagram.com', 'facebook.com', 'web.whatsapp.com', 'whatsapp.com', 'x.com', 'twitter.com', 'telegram.org', 'web.telegram.org', 'discord.com', 'snapchat.com', 'reddit.com', 'pinterest.com', 'quora.com', 'threads.net', 't.me']],
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