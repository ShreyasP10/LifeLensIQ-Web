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

export const SHORT_URL_RE = /\/shorts\/|\/reel\/|\/reels\/|\/spotlight\//i;

const STUDY_KEYWORDS = [
  'tutorial', 'lecture', 'course', 'learn', 'lesson', 'education', 'educational',
  'explained', 'guide', 'how to', 'crash course', 'full course', 'bootcamp', 'workshop',
  'seminar', 'training', 'coaching', 'masterclass', 'study', 'academy', 'school', 'college', 'university',
  'beginner', 'advanced', 'introduction', 'basics', 'fundamentals', 'complete guide', 'step by step',
  'for beginners', 'for advanced', 'deep dive', 'hands on', 'practical', 'example', 'demo',
  'syllabus', 'curriculum', 'certification', 'degree', 'diploma', 'exam', 'preparation', 'prep'
];

const DEV_KEYWORDS = [
  'programming', 'coding', 'code', 'developer', 'software', 'software engineering',
  'web development', 'app development', 'web dev', 'app dev', 'frontend', 'backend', 'fullstack', 'full stack',
  'system design', 'architecture', 'api', 'framework', 'library', 'open source', 'github', 'git',
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'html', 'css', 'react', 'angular', 'vue', 'svelte',
  'node', 'nodejs', 'express', 'nextjs', 'nestjs', 'django', 'flask', 'spring', 'laravel', 'php', 'ruby', 'golang', 'go lang',
  'rust', 'kotlin', 'swift', 'flutter', 'dart', 'sql', 'database', 'mongodb', 'mysql', 'postgresql', 'firebase',
  'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'cloud', 'devops', 'ci/cd', 'machine learning', 'ml',
  'ai', 'artificial intelligence', 'deep learning', 'data science', 'computer science', 'cs', 'tech'
];

const DSA_KEYWORDS = [
  'data structure', 'dsa', 'algorithm', 'algorithms', 'leetcode', 'codeforces', 'geeksforgeeks',
  'binary tree', 'binary search', 'linked list', 'array', 'hashmap', 'hash table', 'heap', 'trie', 'bst',
  'graph', 'sorting', 'searching', 'recursion', 'stack', 'queue', 'dynamic programming', 'dp', 'backtracking',
  'greedy', 'two pointer', 'sliding window', 'bit manipulation', 'competitive programming', 'cp', 'neetcode', 'striver',
  'takeuforward', 'aditya verma', 'love babbar', 'kunal kushwaha'
];

const PRODUCTIVITY_KEYWORDS = [
  'productivity', 'study with me', 'focus', 'time management', 'pomodoro', 'workflow', 'planning', 'habits', 'routine',
  'notion', 'obsidian', 'note taking', 'second brain', 'exam prep', 'upsc', 'gate', 'neet', 'jee', 'cat', 'gre', 'toefl', 'ielts',
  'motivation', 'self improvement', 'personal development', 'life hack', 'organization'
];

export function classifyYouTubeTitle(title) {
  const t = title.toLowerCase();
  
  // Shorts are already handled via URL pattern, but skip if title contains '#shorts'
  if (t.includes('#shorts')) return null; // let URL rule handle it

  // DSA specific (highest priority)
  if (DSA_KEYWORDS.some(k => t.includes(k))) return CATEGORIES.DSA;
  
  // Development (programming) - check before generic Study
  if (DEV_KEYWORDS.some(k => t.includes(k))) return CATEGORIES.DEVELOPMENT;
  
  // Study (generic educational)
  if (STUDY_KEYWORDS.some(k => t.includes(k))) return CATEGORIES.STUDY;
  
  // Productivity
  if (PRODUCTIVITY_KEYWORDS.some(k => t.includes(k))) return CATEGORIES.PRODUCTIVITY;
  
  // Default: entertainment
  return CATEGORIES.ENTERTAINMENT;
}

const PRIVATE_IPV4_RE = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

function stripPort(host) {
  if (host.startsWith('[') && host.includes(']')) return host.slice(1, host.indexOf(']'));
  if ((host.match(/:/g) || []).length > 1) return host; // IPv6 literal like ::1
  return host.replace(/:\d+$/, '');
}

export function isLocalDevHost(rawDomain) {
  const host = stripPort(String(rawDomain).toLowerCase());
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    PRIVATE_IPV4_RE.test(host) ||
    /\.(local|test|internal)$/.test(host)
  );
}

const RULES = [
  // Education + college resources
  [CATEGORIES.STUDY, ['moodle.org', 'elearn.apsit.edu.in', 'apsit.edu.in', 'coursera.org', 'udemy.com', 'edx.org', 'nptel.ac.in', 'khanacademy.org', 'classcentral.com', 'futurelearn.com', 'swayam.gov.in', 'byjus.com', 'unacademy.com', 'studocu.com', 'javatpoint.com', 'tutorialspoint.com', 'mitocw', 'ted.com', 'vedantu.com', 'pw.live', 'allen.in', 'testbook.com', 'pluralsight.com', 'datacamp.com', 'brilliant.org', 'credly.com']],
  // Coding practice / interview prep
  [CATEGORIES.DSA, ['leetcode.com', 'codeforces.com', 'hackerrank.com', 'codechef.com', 'atcoder.jp', 'topcoder.com', 'geeksforgeeks.org', 'interviewbit.com', 'codingninjas.com', 'cses.fi', 'algoexpert.io', 'hackerearth.com']],
  // Code, docs, AI-assisted development
  [CATEGORIES.DEVELOPMENT, ['stackoverflow.com', 'mdn', 'developer.mozilla.org', 'stackblitz.com', 'codesandbox.io', 'codepen.io', 'jsfiddle.net', 'vercel.com', 'netlify.com', 'render.com', 'heroku.com', 'docker.com', 'postman.com', 'swagger.io', 'python.org', 'nodejs.org', 'react.dev', 'vitejs.dev', 'npmjs.com', 'caniuse.com', 'w3schools.com', 'freecodecamp.org', 'codewars.com', 'exercism.org', 'kaggle.com', 'huggingface.co', 'colab.research.google.com', 'replit.com', 'bolt.new', 'v0.dev', 'lovable.dev', 'codecademy.com', 'javascript.info', 'roadmap.sh', 'developer.chrome.com', 'developer.android.com', 'firebase.google.com', 'supabase.com', 'code.visualstudio.com', 'vscode.dev', 'github.dev', 'raw.githubusercontent.com', 'jetbrains.com', 'golang.org', 'go.dev', 'rust-lang.org', 'flutter.dev', 'dart.dev', 'angular.dev', 'jupyter.org', 'git-scm.com', 'skills.google', 'cloudskillsboost.google']],
  // Productivity: docs, mail, notes, calendars, AI chat assistants, career, code hosting
  [CATEGORIES.PRODUCTIVITY, ['docs.google.com', 'sheets.google.com', 'slides.google.com', 'forms.google.com', 'calendar.google.com', 'keep.google.com', 'drive.google.com', 'gmail.com', 'mail.google.com', 'meet.google.com', 'chat.google.com', 'classroom.google.com', 'contacts.google.com', 'tasks.google.com', 'sites.google.com', 'script.google.com', 'admin.google.com', 'groups.google.com', 'voice.google.com', 'analytics.google.com', 'ads.google.com', 'tagmanager.google.com', 'datastudio.google.com', 'outlook.com', 'outlook.live.com', 'office.com', 'notion.so', 'todoist.com', 'trello.com', 'asana.com', 'clickup.com', 'evernote.com', 'medium.com', 'dev.to', 'hashnode.com', 'overleaf.com', 'grammarly.com', 'canva.com', 'figma.com', 'lucidchart.com', 'miro.com', 'zotero.org', 'meet.google.com', 'teams.microsoft.com', 'zoom.us', 'linkedin.com', 'github.com', 'gitlab.com', 'bitbucket.org', 'chatgpt.com', 'chat.openai.com', 'openai.com', 'claude.ai', 'gemini.google.com', 'bard.google.com', 'chat.deepseek.com', 'deepseek.com', 'perplexity.ai', 'copilot.microsoft.com', 'poe.com', 'grok.com', 'you.com', 'notebooklm.google.com', 'chat.mistral.ai', 'mistral.ai', 'meta.ai', 'slack.com', 'atlassian.com', 'dropbox.com', 'onedrive.live.com', 'linear.app', 'monday.com', 'zoho.com', 'basecamp.com', 'vercel.app']],
  [CATEGORIES.ENTERTAINMENT, ['youtube.com', 'netflix.com', 'primevideo.com', 'hotstar.com', 'jiocinema.com', 'sonyliv.com', 'spotify.com', 'gaana.com', 'wynk.in', 'twitch.tv', 'disneyplus.com', 'mxplayer.in', 'zee5.com', 'music.youtube.com', 'primevideo', 'jiohotstar.com', 'voot.com', 'soundcloud.com']],
  // Timepass / distraction: social feeds, chats, forums
  [CATEGORIES.TIMEPASS, ['instagram.com', 'facebook.com', 'web.whatsapp.com', 'whatsapp.com', 'x.com', 'twitter.com', 'telegram.org', 'web.telegram.org', 'discord.com', 'snapchat.com', 'reddit.com', 'pinterest.com', 'quora.com', 'threads.net', 't.me', 'threads.com', 'messenger.com', 'fb.watch', '9gag.com', 'tumblr.com', 'buzzfeed.com', 'sportskeeda.com', 'cricbuzz.com']],
  [CATEGORIES.UTILITIES, ['google.com', 'bing.com', 'duckduckgo.com', 'wikipedia.org', 'translate.google.com', 'maps.google.com', 'paytm.com', 'phonepe.com', 'upi', 'github.io', 'speedtest.net', 'fast.com', 'wetransfer.com']],
];

export function rulesByCategory() {
  const map = {};
  for (const [category, domains] of RULES) {
    map[category] = [...(map[category] || []), ...domains];
  }
  return map;
}

export function classify(domain, path, overrides = {}) {
  if (!domain) return CATEGORIES.OTHER;
  if (path && SHORT_URL_RE.test(path)) return CATEGORIES.SHORT_VIDEO;
  if (overrides[domain]) return overrides[domain];
  const keys = Object.keys(overrides).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (overrides[key] && (domain === key || domain.endsWith('.' + key))) return overrides[key];
  }
  // Local dev servers (localhost, LAN/private IPs, .local/.test) are coding work
  if (isLocalDevHost(domain)) return CATEGORIES.DEVELOPMENT;
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