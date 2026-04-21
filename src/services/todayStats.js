/**
 * todayStats.js
 *
 * Computes daily activity stats (active/productive/afk seconds + focusScore)
 * from today's sample buffer. Output feeds the Firestore upload at
 *   users/{email}/Integrations/MacUsage/DailyStats/{YYYY-MM-DD}
 *
 * Ported from Swift (TodayUsageService.swift + AppCategoryService.swift).
 *
 * Parity notes (from Swift):
 *   - activeSeconds = productive + neutral + unproductive (all non-AFK)
 *   - AFK is detected by appName.lowercased() == "no activity"
 *   - focusScore = Int((productive / active) * 100) when active > 0, else 0
 *     (TodayUsageService.swift line 596-601)
 *   - Classification order (AppCategoryService.swift classifyUncached):
 *       1. Browser -> classify by URL then window title (neutral is neutral)
 *       2. App DB exact match (with communication-app downgrade for meme/funny/lol)
 *       3. App name partial patterns
 *       4. Window title patterns
 *       5. User-defined lists (wordListService)
 *       6. Default = unproductive
 */

// NOTE: wordListService is imported lazily inside getDailyStats() to keep
// this module testable from plain Node without extension-less ESM resolution
// (Vite handles './wordListService' automatically at build time).

// ---------------------------------------------------------------------------
// Constants ported verbatim from AppCategoryService.swift
// ---------------------------------------------------------------------------

const BROWSERS = new Set([
  'safari', 'chrome', 'firefox', 'edge', 'brave', 'arc', 'opera',
  'vivaldi', 'tor browser', 'duckduckgo', 'chromium', 'waterfox',
  'pale moon', 'seamonkey', 'maxthon', 'avant', 'slimjet',
  'google chrome', 'microsoft edge', 'brave browser',
]);

const COMMUNICATION_APPS = new Set([
  'slack', 'teams', 'zoom', 'discord', 'telegram', 'signal', 'whatsapp',
  'microsoft teams',
]);

const UNPRODUCTIVE_KEYWORDS = new Set([
  'youtube', 'netflix', 'hulu', 'twitch', 'reddit', 'facebook',
  'instagram', 'twitter', 'tiktok', 'snapchat', 'discord',
  'spotify', 'gaming', 'game', 'steam', 'fortnite', 'minecraft',
]);

const PRODUCTIVE_KEYWORDS = new Set([
  'github', 'gitlab', 'stackoverflow', 'jira', 'confluence',
  'figma', 'notion', 'slack', 'docs', 'sheets', 'code',
  'documentation', 'api', 'tutorial', 'coursera', 'udemy',
]);

// Swift appDatabase dictionary -> JS object.
// Values: 'productive' | 'neutral' | 'unproductive'
const APP_DATABASE = {
  // PRODUCTIVE - Development & IDEs
  'visual studio code': 'productive', 'vscode': 'productive', 'xcode': 'productive',
  'android studio': 'productive', 'intellij idea': 'productive', 'pycharm': 'productive',
  'webstorm': 'productive', 'phpstorm': 'productive', 'rubymine': 'productive',
  'clion': 'productive', 'goland': 'productive', 'rider': 'productive',
  'datagrip': 'productive', 'sublime text': 'productive', 'atom': 'productive',
  'brackets': 'productive', 'textmate': 'productive', 'bbedit': 'productive',
  'coderunner': 'productive', 'nova': 'productive', 'zed': 'productive',
  'cursor': 'productive', 'fleet': 'productive', 'eclipse': 'productive',
  'netbeans': 'productive', 'vim': 'productive', 'neovim': 'productive',
  'emacs': 'productive', 'macvim': 'productive', 'vimr': 'productive',
  'helix': 'productive', 'lapce': 'productive', 'terminal': 'productive',
  'iterm': 'productive', 'iterm2': 'productive', 'warp': 'productive',
  'hyper': 'productive', 'alacritty': 'productive', 'kitty': 'productive',

  // PRODUCTIVE - Office & Productivity
  'microsoft word': 'productive', 'microsoft excel': 'productive',
  'microsoft powerpoint': 'productive', 'microsoft outlook': 'productive',
  'microsoft onenote': 'productive', 'pages': 'productive', 'numbers': 'productive',
  'keynote': 'productive', 'google docs': 'productive', 'google sheets': 'productive',
  'google slides': 'productive', 'libreoffice': 'productive', 'openoffice': 'productive',
  'onlyoffice': 'productive', 'wps office': 'productive', 'airtable': 'productive',
  'notion': 'productive', 'obsidian': 'productive', 'roam research': 'productive',
  'evernote': 'productive', 'bear': 'productive', 'ulysses': 'productive',
  'ia writer': 'productive', 'typora': 'productive', 'mark text': 'productive',
  'quip': 'productive', 'craft': 'productive', 'agenda': 'productive',

  // PRODUCTIVE - Task Management
  'things': 'productive', 'things 3': 'productive', 'omnifocus': 'productive',
  'todoist': 'productive', 'ticktick': 'productive', 'any.do': 'productive',
  'remember the milk': 'productive', '2do': 'productive', 'taskwarrior': 'productive',
  'taskpaper': 'productive', 'trello': 'productive', 'asana': 'productive',
  'monday': 'productive', 'monday.com': 'productive', 'clickup': 'productive',
  'basecamp': 'productive', 'jira': 'productive', 'confluence': 'productive',
  'linear': 'productive', 'height': 'productive', 'shortcut': 'productive',

  // PRODUCTIVE - Communication (Work Context)
  'slack': 'productive', 'microsoft teams': 'productive', 'teams': 'productive',
  'zoom': 'productive', 'zoom.us': 'productive', 'webex': 'productive',
  'google meet': 'productive', 'skype for business': 'productive',
  'gotomeeting': 'productive', 'bluejeans': 'productive', 'whereby': 'productive',
  'around': 'productive', 'mmhmm': 'productive', 'tuple': 'productive',
  'pop': 'productive',

  // PRODUCTIVE - Design & Creative (Professional)
  'figma': 'productive', 'sketch': 'productive', 'adobe photoshop': 'productive',
  'photoshop': 'productive', 'adobe illustrator': 'productive', 'illustrator': 'productive',
  'adobe indesign': 'productive', 'indesign': 'productive', 'adobe xd': 'productive',
  'adobe after effects': 'productive', 'after effects': 'productive',
  'adobe premiere pro': 'productive', 'premiere pro': 'productive',
  'final cut pro': 'productive', 'davinci resolve': 'productive',
  'logic pro': 'productive', 'pro tools': 'productive', 'ableton live': 'productive',
  'fl studio': 'productive', 'affinity designer': 'productive',
  'affinity photo': 'productive', 'affinity publisher': 'productive',
  'pixelmator pro': 'productive', 'acorn': 'productive', 'procreate': 'productive',
  'blender': 'productive', 'cinema 4d': 'productive', 'maya': 'productive',
  '3ds max': 'productive', 'zbrush': 'productive', 'substance painter': 'productive',
  'unity': 'productive', 'unreal engine': 'productive', 'godot': 'productive',

  // PRODUCTIVE - Database & Dev Tools
  'tableplus': 'productive', 'sequel pro': 'productive', 'sequel ace': 'productive',
  'dbeaver': 'productive', 'navicat': 'productive', 'mongodb compass': 'productive',
  'robo 3t': 'productive', 'postman': 'productive', 'insomnia': 'productive',
  'paw': 'productive', 'rapidapi': 'productive', 'docker': 'productive',
  'docker desktop': 'productive', 'kubernetes': 'productive', 'vagrant': 'productive',
  'virtualbox': 'productive', 'parallels': 'productive', 'vmware fusion': 'productive',
  'utm': 'productive', 'sourcetree': 'productive', 'github desktop': 'productive',
  'gitkraken': 'productive', 'tower': 'productive', 'fork': 'productive',
  'sublime merge': 'productive',

  // PRODUCTIVE - File Management & Cloud
  'transmit': 'productive', 'cyberduck': 'productive', 'filezilla': 'productive',
  'forklift': 'productive', 'path finder': 'productive', 'commander one': 'productive',
  'total commander': 'productive',

  // PRODUCTIVE - Analytics & Data
  'tableau': 'productive', 'power bi': 'productive', 'looker': 'productive',
  'metabase': 'productive', 'superset': 'productive', 'jupyter': 'productive',
  'rstudio': 'productive', 'matlab': 'productive', 'mathematica': 'productive',
  'octave': 'productive', 'spyder': 'productive', 'anaconda': 'productive',

  // PRODUCTIVE - Finance & Accounting
  'quickbooks': 'productive', 'quicken': 'productive', 'moneywiz': 'productive',
  'banktivity': 'productive', 'ynab': 'productive', 'mint': 'productive',
  'personal capital': 'productive', 'wave': 'productive', 'freshbooks': 'productive',
  'xero': 'productive',

  // NEUTRAL - System & Utilities
  'finder': 'neutral', 'system settings': 'neutral', 'system preferences': 'neutral',
  'activity monitor': 'neutral', 'disk utility': 'neutral', 'console': 'neutral',
  'keychain access': 'neutral', 'time machine': 'neutral', 'migration assistant': 'neutral',
  'boot camp assistant': 'neutral', 'grapher': 'neutral', 'calculator': 'neutral',
  'calendar': 'neutral', 'contacts': 'neutral', 'reminders': 'neutral',
  'notes': 'neutral', 'preview': 'neutral', 'textedit': 'neutral',
  'stickies': 'neutral', 'font book': 'neutral', 'image capture': 'neutral',
  'digital color meter': 'neutral', 'voiceover utility': 'neutral', 'alfred': 'neutral',
  'raycast': 'neutral', 'spotlight': 'neutral', 'launchbar': 'neutral',
  'bartender': 'neutral', 'magnet': 'neutral', 'rectangle': 'neutral',
  'spectacle': 'neutral', 'moom': 'neutral', 'divvy': 'neutral',
  'bettertouchtool': 'neutral', 'karabiner': 'neutral', 'hammerspoon': 'neutral',
  'cleanmymac': 'neutral', 'appcleaner': 'neutral', 'pearcleaner': 'neutral',
  'onyx': 'neutral', 'hazel': 'neutral', 'the unarchiver': 'neutral',
  'keka': 'neutral', 'betterzip': 'neutral', 'istat menus': 'neutral',
  'menumeters': 'neutral', 'stats': 'neutral', 'monit': 'neutral',
  '1password': 'neutral', 'lastpass': 'neutral', 'dashlane': 'neutral',
  'bitwarden': 'neutral', 'keepass': 'neutral', 'nordvpn': 'neutral',
  'expressvpn': 'neutral', 'tunnelbear': 'neutral', 'protonvpn': 'neutral',
  'little snitch': 'neutral', 'micro snitch': 'neutral', 'lulu': 'neutral',
  'carbon copy cloner': 'neutral', 'super duper': 'neutral', 'backblaze': 'neutral',
  'crashplan': 'neutral', 'dropbox': 'neutral', 'google drive': 'neutral',
  'onedrive': 'neutral', 'icloud': 'neutral', 'box': 'neutral',
  'sync.com': 'neutral', 'mega': 'neutral', 'resilio sync': 'neutral',

  // NEUTRAL - Mail Clients
  'mail': 'neutral', 'apple mail': 'neutral', 'spark': 'neutral',
  'airmail': 'neutral', 'canary mail': 'neutral', 'mailmate': 'neutral',
  'thunderbird': 'neutral', 'postbox': 'neutral', 'mailspring': 'neutral',

  // NEUTRAL - Calendar & Time
  'fantastical': 'neutral', 'busycal': 'neutral', 'itsycal': 'neutral',
  'cron': 'neutral', 'timeular': 'neutral', 'toggl': 'neutral',
  'harvest': 'neutral', 'clockify': 'neutral', 'rescuetime': 'neutral',
  'timemator': 'neutral', 'timing': 'neutral',

  // UNPRODUCTIVE - Social Media Apps
  'tweetdeck': 'unproductive', 'tweetbot': 'unproductive', 'twitter': 'unproductive',
  'facebook': 'unproductive', 'instagram': 'unproductive', 'tiktok': 'unproductive',
  'snapchat': 'unproductive', 'reddit': 'unproductive', 'linkedin': 'unproductive',
  'pinterest': 'unproductive', 'tumblr': 'unproductive', 'mastodon': 'unproductive',
  'threads': 'unproductive', 'bluesky': 'unproductive', 'discord': 'unproductive',
  'telegram': 'unproductive', 'signal': 'unproductive', 'whatsapp': 'unproductive',
  'messenger': 'unproductive', 'wechat': 'unproductive', 'line': 'unproductive',
  'viber': 'unproductive',

  // UNPRODUCTIVE - Entertainment & Streaming
  'spotify': 'unproductive', 'apple music': 'unproductive', 'music': 'unproductive',
  'deezer': 'unproductive', 'tidal': 'unproductive', 'soundcloud': 'unproductive',
  'youtube music': 'unproductive', 'pandora': 'unproductive', 'amazon music': 'unproductive',
  'netflix': 'unproductive', 'hulu': 'unproductive', 'disney+': 'unproductive',
  'disney plus': 'unproductive', 'hbo max': 'unproductive', 'prime video': 'unproductive',
  'apple tv': 'unproductive', 'peacock': 'unproductive', 'paramount+': 'unproductive',
  'paramount plus': 'unproductive', 'youtube': 'unproductive', 'twitch': 'unproductive',
  'plex': 'unproductive', 'kodi': 'unproductive', 'vlc': 'unproductive',
  'iina': 'unproductive', 'quicktime': 'unproductive', 'imovie': 'unproductive',
  'garageband': 'unproductive', 'podcasts': 'unproductive', 'apple podcasts': 'unproductive',
  'overcast': 'unproductive', 'castro': 'unproductive', 'pocket casts': 'unproductive',

  // UNPRODUCTIVE - Gaming
  'steam': 'unproductive', 'epic games': 'unproductive', 'epic games launcher': 'unproductive',
  'battle.net': 'unproductive', 'blizzard': 'unproductive', 'origin': 'unproductive',
  'ea app': 'unproductive', 'ubisoft connect': 'unproductive', 'gog galaxy': 'unproductive',
  'itch': 'unproductive', 'minecraft': 'unproductive', 'roblox': 'unproductive',
  'league of legends': 'unproductive', 'fortnite': 'unproductive', 'valorant': 'unproductive',
  'dota 2': 'unproductive', 'counter-strike': 'unproductive', 'cs:go': 'unproductive',
  'cs2': 'unproductive', 'overwatch': 'unproductive', 'apex legends': 'unproductive',
  'world of warcraft': 'unproductive', 'final fantasy xiv': 'unproductive',
  'guild wars 2': 'unproductive', 'elder scrolls online': 'unproductive',
  'destiny 2': 'unproductive', 'warframe': 'unproductive', 'path of exile': 'unproductive',
  'diablo': 'unproductive', 'starcraft': 'unproductive', 'hearthstone': 'unproductive',
  'solitaire': 'unproductive', 'chess': 'unproductive', 'chess.com': 'unproductive',
  'lichess': 'unproductive',

  // UNPRODUCTIVE - Shopping & E-commerce
  'amazon': 'unproductive', 'ebay': 'unproductive', 'etsy': 'unproductive',
  'aliexpress': 'unproductive', 'walmart': 'unproductive', 'target': 'unproductive',
  'best buy': 'unproductive', 'costco': 'unproductive', 'home depot': 'unproductive',
  'wayfair': 'unproductive', 'ikea': 'unproductive', 'apple store': 'unproductive',
  'steam store': 'unproductive',

  // UNPRODUCTIVE - News & Media
  'apple news': 'unproductive', 'news': 'unproductive', 'flipboard': 'unproductive',
  'feedly': 'unproductive', 'reeder': 'unproductive', 'newsify': 'unproductive',
  'netnewswire': 'unproductive',
};

// App name partial patterns (from Swift appNamePatterns)
const APP_NAME_PATTERNS = [
  ['studio', 'productive'],
  ['code', 'productive'],
  ['dev', 'productive'],
  ['git', 'productive'],
  ['sql', 'productive'],
  ['database', 'productive'],
  ['terminal', 'productive'],
  ['console', 'productive'],
  ['compiler', 'productive'],
  ['debugger', 'productive'],
  ['office', 'productive'],
  ['word', 'productive'],
  ['excel', 'productive'],
  ['powerpoint', 'productive'],
  ['outlook', 'productive'],
  ['docs', 'productive'],
  ['sheets', 'productive'],
  ['slides', 'productive'],
  ['game', 'unproductive'],
  ['play', 'unproductive'],
  ['launcher', 'unproductive'],
];

// Window title content patterns (from Swift productive/unproductiveWindowPatterns)
const PRODUCTIVE_WINDOW_PATTERNS = [
  'github', 'gitlab', 'bitbucket', 'stackoverflow', 'stack overflow',
  'codepen', 'jsfiddle', 'codesandbox', 'replit', 'glitch',
  'npm', 'yarn', 'pypi', 'rubygems', 'packagist', 'maven',
  'docker hub', 'kubernetes', 'aws console', 'azure', 'google cloud',
  'heroku', 'netlify', 'vercel', 'railway', 'render',
  'postman', 'insomnia', 'swagger', 'api documentation',
  'jenkins', 'travis', 'circle ci', 'github actions', 'gitlab ci',
  'documentation', 'docs', 'api reference', 'tutorial', 'guide',
  'readme', 'wiki', 'confluence', 'notion', 'obsidian',
  'dev.to', 'medium - programming', 'hashnode', 'hackernoon',
  'mdn web docs', 'w3schools', 'freecodecamp', 'codecademy',
  'figma', 'sketch', 'adobe', 'canva', 'dribbble', 'behance',
  'invision', 'zeplin', 'marvel', 'framer', 'principle',
  'trello', 'asana', 'monday', 'clickup', 'jira', 'linear',
  'notion', 'obsidian', 'roam', 'evernote', 'onenote',
  'todoist', 'things', 'omnifocus', 'ticktick', 'any.do',
  'google docs', 'google sheets', 'google slides',
  'airtable', 'coda', 'quip', 'dropbox paper',
  'slack - ', 'teams - meeting', 'zoom - meeting',
  'google meet', 'webex', 'gotomeeting',
  'email', 'inbox', 'compose', 'calendar - meeting',
  'quickbooks', 'xero', 'freshbooks', 'wave accounting',
  'mint', 'ynab', 'personal capital', 'quicken',
  'google analytics', 'tableau', 'power bi', 'looker',
  'mixpanel', 'amplitude', 'segment', 'datadog',
  'grafana', 'kibana', 'splunk', 'new relic',
  'basecamp', 'wrike', 'smartsheet', 'teamwork',
  'podio', 'zoho projects', 'workfront',
  'salesforce', 'hubspot', 'pipedrive', 'zoho crm',
  'monday sales', 'copper', 'insightly',
  'mailchimp', 'constant contact', 'sendinblue', 'convertkit',
  'hootsuite', 'buffer', 'sprout social', 'later',
  'coursera', 'udemy', 'pluralsight', 'linkedin learning',
  'skillshare', 'edx', 'khan academy', 'codecademy',
  'udacity', 'datacamp', 'treehouse', 'frontendmasters',
  'google scholar', 'researchgate', 'academia.edu',
  'jstor', 'pubmed', 'arxiv', 'ieee xplore',
  'medium - writing', 'substack', 'ghost', 'wordpress admin',
  'blogger', 'tumblr - writing', 'dev.to - writing',
];

const UNPRODUCTIVE_WINDOW_PATTERNS = [
  'facebook', 'instagram', 'twitter', 'x.com', 'tiktok',
  'snapchat', 'reddit', 'linkedin - feed', 'pinterest',
  'tumblr', 'mastodon', 'threads', 'bluesky', 'truth social',
  'parler', 'gab', 'gettr', 'rumble', 'minds',
  'vk', 'ok.ru', 'weibo', 'wechat', 'line',
  'telegram', 'whatsapp', 'messenger', 'signal',
  'discord - ', 'slack - #random', 'slack - #memes',
  'youtube', 'netflix', 'hulu', 'disney+', 'disney plus',
  'hbo max', 'prime video', 'apple tv+', 'peacock',
  'paramount+', 'paramount plus', 'showtime', 'starz',
  'twitch', 'vimeo', 'dailymotion', 'tiktok', 'shorts',
  'crunchyroll', 'funimation', 'vrv', 'rooster teeth',
  'spotify', 'apple music', 'youtube music', 'soundcloud',
  'pandora', 'tidal', 'deezer', 'amazon music',
  'bandcamp', 'audiomack', 'mixcloud', '8tracks',
  'steam', 'epic games', 'gog', 'itch.io', 'humble bundle',
  'battle.net', 'origin', 'ubisoft', 'ea', 'rockstar',
  'minecraft', 'roblox', 'fortnite', 'league of legends',
  'valorant', 'dota', 'counter-strike', 'cs:go', 'cs2',
  'overwatch', 'apex', 'warzone', 'pubg', 'among us',
  'fall guys', 'rocket league', 'destiny', 'wow',
  'final fantasy', 'runescape', 'guild wars', 'warframe',
  'hearthstone', 'magic', 'chess.com', 'lichess',
  'poker', 'solitaire', 'wordle', 'nyt games',
  'twitch.tv', 'gaming', 'gameplay', "let's play",
  'cnn', 'fox news', 'msnbc', 'bbc news', 'reuters',
  'associated press', 'new york times', 'washington post',
  'wall street journal', 'usa today', 'npr', 'pbs',
  'buzzfeed', 'huffpost', 'vice', 'vox', 'the verge',
  'techcrunch', 'engadget', 'gizmodo', 'kotaku', 'ign',
  'polygon', 'gamespot', 'destructoid', 'rock paper shotgun',
  'tmz', 'people', 'e! online', 'entertainment weekly',
  'variety', 'hollywood reporter', 'deadline',
  'imdb', 'rotten tomatoes', 'metacritic',
  '9gag', 'imgur', 'giphy', 'tenor', 'meme',
  'amazon', 'ebay', 'etsy', 'aliexpress', 'wish',
  'walmart', 'target', 'costco', 'best buy',
  'wayfair', 'ikea', 'home depot', 'lowes',
  'zappos', 'nordstrom', 'macys', 'kohls',
  'shein', 'h&m', 'zara', 'uniqlo', 'gap',
  'nike', 'adidas', 'puma', 'under armour',
  'asos', 'boohoo', 'fashion nova', 'pretty little thing',
  'shopify', 'woocommerce', 'bigcommerce',
  'apple store', 'microsoft store', 'steam store',
  'uber eats', 'doordash', 'grubhub', 'postmates',
  'deliveroo', 'just eat', 'seamless', 'caviar',
  'yelp', 'zomato', 'tripadvisor', 'opentable',
  'instacart', 'amazon fresh', 'whole foods',
  'mcdonald', 'burger king', 'wendy', 'kfc',
  'subway', 'chipotle', 'taco bell', 'pizza',
  'expedia', 'booking.com', 'hotels.com', 'airbnb',
  'vrbo', 'tripadvisor', 'kayak', 'skyscanner',
  'priceline', 'orbitz', 'travelocity', 'hotwire',
  'tinder', 'bumble', 'hinge', 'okcupid', 'match',
  'plenty of fish', 'coffee meets bagel', 'eharmony',
  'espn', 'nfl', 'nba', 'mlb', 'nhl', 'mls',
  'premier league', 'champions league', 'fifa',
  'bleacher report', 'sports illustrated', 'yahoo sports',
  'fantasy football', 'draftkings', 'fanduel',
  'pinterest', 'houzz', 'apartment therapy', 'design milk',
  'instructables', 'wikihow', 'life hacks',
  'recipe', 'cooking', 'food network', 'tasty',
  'allrecipes', 'epicurious', 'bon appetit',
  'reddit', 'quora', 'stack exchange', 'hacker news',
  '4chan', '8chan', 'somethingawful', 'neogaf',
  'resetera', 'discord', 'slack - off-topic',
  'dating', 'hookup', 'meet singles',
  'coinbase', 'binance', 'crypto', 'bitcoin', 'ethereum',
  'robinhood', 'webull', 'etrade', 'td ameritrade',
  'trading', 'stocks', 'forex', 'day trading',
  'casino', 'poker', 'slots', 'betting', 'gambling',
  'draftkings', 'fanduel', 'bovada', 'bet365',
  'quiz', 'personality test', 'which character are you',
  'cat videos', 'dog videos', 'cute animals', 'aww',
  'fails', 'compilation', 'reaction', 'unboxing',
  'vlog', 'influencer', 'celebrity', 'gossip',
  'horoscope', 'astrology', 'zodiac',
];

// ---------------------------------------------------------------------------
// Classification helpers (ported from AppCategoryService.classifyUncached)
// ---------------------------------------------------------------------------

function isBrowser(appLower) {
  if (BROWSERS.has(appLower)) return true;
  for (const b of BROWSERS) {
    if (appLower.includes(b)) return true;
  }
  return false;
}

function classifyWindowTitle(title) {
  if (!title) return 'neutral';
  const words = title.split(' ').filter(Boolean);

  // Fast word-level check for unproductive
  for (const w of words) {
    if (UNPRODUCTIVE_KEYWORDS.has(w)) return 'unproductive';
  }
  for (const pattern of UNPRODUCTIVE_WINDOW_PATTERNS) {
    if (title.includes(pattern)) return 'unproductive';
  }

  // Fast word-level check for productive
  for (const w of words) {
    if (PRODUCTIVE_KEYWORDS.has(w)) return 'productive';
  }
  for (const pattern of PRODUCTIVE_WINDOW_PATTERNS) {
    if (title.includes(pattern)) return 'productive';
  }

  return 'neutral';
}

/**
 * Core classification (matches AppCategoryService.classifyUncached).
 * Returns 'productive' | 'neutral' | 'unproductive'.
 */
function classifyCategory(appLower, titleLower, urlLower, wordListService) {
  // 1. Browser -> URL then window title
  if (isBrowser(appLower)) {
    if (urlLower) {
      const urlCategory = classifyWindowTitle(urlLower);
      if (urlCategory !== 'neutral') return urlCategory;
    }
    return classifyWindowTitle(titleLower);
  }

  // 2. App DB exact match
  if (Object.prototype.hasOwnProperty.call(APP_DATABASE, appLower)) {
    const category = APP_DATABASE[appLower];
    if (category === 'productive' && COMMUNICATION_APPS.has(appLower)) {
      if (
        titleLower.includes('meme') ||
        titleLower.includes('funny') ||
        titleLower.includes('lol')
      ) {
        return 'unproductive';
      }
    }
    return category;
  }

  // 3. App name partial patterns
  for (const [pattern, category] of APP_NAME_PATTERNS) {
    if (appLower.includes(pattern)) return category;
  }

  // 4. Window title patterns
  const titleCategory = classifyWindowTitle(titleLower);
  if (titleCategory !== 'neutral') return titleCategory;

  // 4.5. User-defined word list as final attempt before defaulting
  if (wordListService && typeof wordListService.classifyApp === 'function') {
    const { list } = wordListService.classifyApp(appLower, titleLower, urlLower);
    if (list === 'productive') return 'productive';
    if (list === 'blocked' || list === 'distracting') return 'unproductive';
  }

  // 5. Default to unproductive for unknown apps (matches Swift)
  return 'unproductive';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a single sample into a coarse bucket.
 *
 * @param {object} sample - { appName, windowTitle, url, ... }
 * @param {WordListService} [wordListService] - optional user word list
 * @returns {'productive' | 'unproductive' | 'neutral' | 'afk'}
 */
export function classifySample(sample, wordListService) {
  if (!sample) return 'afk';
  const appName = sample.appName || '';
  const appLower = appName.toLowerCase();
  // AFK detection matches Swift: appName.lowercased() == "no activity"
  // Plus: treat empty appName as AFK (defensive for missing data).
  if (!appName || appLower === 'no activity') return 'afk';

  const titleLower = (sample.windowTitle || '').toLowerCase();
  const urlLower = sample.url ? sample.url.toLowerCase() : null;

  const category = classifyCategory(appLower, titleLower, urlLower, wordListService);
  if (category === 'productive') return 'productive';
  if (category === 'unproductive') return 'unproductive';
  return 'neutral';
}

/**
 * Compute daily stats from today's sample buffer.
 *
 * @param {Array} samples - array of sample objects (see module docstring)
 * @param {object} [options]
 * @param {WordListService} [options.wordListService] - word list for user-defined classification
 * @returns {{focusScore: number, activeSeconds: number, productiveSeconds: number, afkSeconds: number}}
 */
export function getDailyStats(samples, options = {}) {
  const empty = { focusScore: 0, activeSeconds: 0, productiveSeconds: 0, afkSeconds: 0 };
  if (!Array.isArray(samples) || samples.length === 0) return empty;

  // If no wordListService provided, fall back to null and rely on the hardcoded
  // app database + patterns (matches Swift where user lists are optional and
  // only consulted if earlier classification steps returned no decisive
  // category).
  const wordListService = options.wordListService || null;

  let productiveSeconds = 0;
  let neutralSeconds = 0;
  let unproductiveSeconds = 0;
  let afkSeconds = 0;

  for (const sample of samples) {
    const duration = Number(sample.durationSeconds) || 0;
    if (duration <= 0) continue;

    const bucket = classifySample(sample, wordListService);
    switch (bucket) {
      case 'afk':
        afkSeconds += duration;
        break;
      case 'productive':
        productiveSeconds += duration;
        break;
      case 'unproductive':
        unproductiveSeconds += duration;
        break;
      case 'neutral':
      default:
        neutralSeconds += duration;
        break;
    }
  }

  const activeSeconds = productiveSeconds + neutralSeconds + unproductiveSeconds;

  // focusScore formula from TodayUsageService.swift line 596-601:
  //   if todayActiveSeconds > 0 {
  //       focusScore = Int((todayProductiveSeconds / todayActiveSeconds) * 100)
  //   } else {
  //       focusScore = 0
  //   }
  // Swift's Int() truncates toward zero; Math.trunc matches that.
  const focusScore = activeSeconds > 0
    ? Math.trunc((productiveSeconds / activeSeconds) * 100)
    : 0;

  return {
    focusScore,
    activeSeconds: Math.trunc(activeSeconds),
    productiveSeconds: Math.trunc(productiveSeconds),
    afkSeconds: Math.trunc(afkSeconds),
  };
}
