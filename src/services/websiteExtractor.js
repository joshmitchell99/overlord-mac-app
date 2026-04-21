/**
 * WebsiteExtractor - port of overlord-mac-app/.../WebsiteExtractor.swift
 *
 * Extracts a canonical website display name from a browser window title using:
 *   1. O(1) keyword dictionary lookup (split title on " -|·•:", check each token)
 *   2. Multi-word keyword contains() fallback
 *   3. Pattern parsing (e.g. "Page Title - Website - Chrome")
 *
 * Plus:
 *   - isBrowser(appName) - is this a browser we should extract from
 *   - isNativeMacApp(name) - is this a name that collides with a native app
 *   - isWebsite(name) - is this a name produced by browser extraction
 *
 * Mirrors the Swift WebsiteExtractor.swift exactly - keywords, display names,
 * matcher behavior, browser set, native-app disambiguation, and caching semantics.
 */

/** @typedef {{k: string[], n: string}} Entry */

/** @type {Entry[]} */
const WEBSITE_DATABASE = [
  // VIDEO & STREAMING
  { k: ['youtube', 'youtu.be'], n: 'YouTube' },
  { k: ['netflix.com', 'netflix -', '- netflix'], n: 'Netflix' },
  { k: ['twitch.tv', 'twitch -', '- twitch'], n: 'Twitch' },
  { k: ['kick.com', 'kick -', '- kick'], n: 'Kick' },
  { k: ['rumble.com', 'rumble -'], n: 'Rumble' },
  { k: ['vimeo.com', 'vimeo -'], n: 'Vimeo' },
  { k: ['primevideo', 'prime video', 'amazon video'], n: 'Prime Video' },
  { k: ['hulu.com', 'hulu -', '- hulu'], n: 'Hulu' },
  { k: ['disneyplus', 'disney+', 'disney plus'], n: 'Disney+' },
  { k: ['hbomax', 'hbo max', 'max.com', 'play.max'], n: 'Max (HBO)' },
  { k: ['peacock', 'peacocktv'], n: 'Peacock' },
  { k: ['paramount+', 'paramount plus', 'paramountplus'], n: 'Paramount+' },
  { k: ['apple tv+', 'tv.apple'], n: 'Apple TV+' },
  { k: ['crunchyroll'], n: 'Crunchyroll' },
  { k: ['dailymotion'], n: 'Dailymotion' },
  { k: ['funimation'], n: 'Funimation' },
  { k: ['hidive.com', 'hidive -'], n: 'HIDIVE' },
  { k: ['vrv.co'], n: 'VRV' },
  { k: ['pluto.tv', 'plutotv'], n: 'Pluto TV' },
  { k: ['tubi.tv', 'tubitv'], n: 'Tubi' },
  { k: ['vudu.com', 'vudu -'], n: 'Vudu' },
  { k: ['plex.tv', 'app.plex'], n: 'Plex' },
  { k: ['roku.com', 'therokuchannel'], n: 'Roku Channel' },
  { k: ['sling.com', 'slingtv'], n: 'Sling TV' },
  { k: ['fubo.tv', 'fubotv'], n: 'FuboTV' },
  { k: ['philo.com'], n: 'Philo' },
  { k: ['discovery+', 'discoveryplus'], n: 'Discovery+' },
  { k: ['espn.com/watch', 'espnplus', 'espn+'], n: 'ESPN+' },
  { k: ['dazn.com'], n: 'DAZN' },
  { k: ['curiositystream'], n: 'CuriosityStream' },
  { k: ['mubi.com'], n: 'MUBI' },
  { k: ['criterion.com', 'criterionchannel'], n: 'Criterion Channel' },
  { k: ['shudder.com'], n: 'Shudder' },
  { k: ['britbox.com'], n: 'BritBox' },
  { k: ['acorn.tv'], n: 'Acorn TV' },
  { k: ['amc+', 'amcplus'], n: 'AMC+' },
  { k: ['starz.com'], n: 'Starz' },
  { k: ['showtime.com', 'sho.com'], n: 'Showtime' },
  { k: ['bilibili.com', 'bilibili -'], n: 'Bilibili' },
  { k: ['niconico', 'nicovideo'], n: 'Niconico' },
  { k: ['iqiyi.com'], n: 'iQIYI' },
  { k: ['youku.com'], n: 'Youku' },
  { k: ['wetv.vip'], n: 'WeTV' },
  { k: ['viki.com'], n: 'Viki' },
  { k: ['kocowa.com'], n: 'Kocowa' },
  { k: ['dramafever'], n: 'DramaFever' },
  { k: ['kissasian'], n: 'KissAsian' },
  { k: ['kissanime'], n: 'KissAnime' },
  { k: ['9anime'], n: '9anime' },
  { k: ['gogoanime'], n: 'GoGoAnime' },
  { k: ['animesuge'], n: 'AnimeSuge' },
  { k: ['zoro.to', 'aniwatch'], n: 'AniWatch' },
  { k: ['anime-planet'], n: 'Anime-Planet' },
  { k: ['myanimelist'], n: 'MyAnimeList' },
  { k: ['anilist.co'], n: 'AniList' },
  { k: ['justwatch.com'], n: 'JustWatch' },
  { k: ['reelgood.com'], n: 'Reelgood' },
  { k: ['letterboxd.com'], n: 'Letterboxd' },
  { k: ['trakt.tv'], n: 'Trakt' },
  { k: ['simkl.com'], n: 'Simkl' },
  { k: ['taste.io'], n: 'Taste' },

  // SOCIAL MEDIA
  { k: ['twitter.com', 'x.com', '/ x', '- x -', 'on x:'], n: 'Twitter/X' },
  { k: ['facebook.com', 'facebook -', '- facebook', 'fb.com'], n: 'Facebook' },
  { k: ['instagram.com', 'instagram -'], n: 'Instagram' },
  { k: ['linkedin.com', 'linkedin -', '- linkedin'], n: 'LinkedIn' },
  { k: ['reddit.com', 'r/', 'reddit -', 'old.reddit'], n: 'Reddit' },
  { k: ['tiktok.com', 'tiktok -'], n: 'TikTok' },
  { k: ['pinterest.com', 'pinterest -', 'pin.it'], n: 'Pinterest' },
  { k: ['tumblr.com', 'tumblr -'], n: 'Tumblr' },
  { k: ['mastodon.social', 'mastodon -', 'joinmastodon'], n: 'Mastodon' },
  { k: ['threads.net', 'threads -'], n: 'Threads' },
  { k: ['bluesky', 'bsky.app'], n: 'Bluesky' },
  { k: ['snapchat.com', 'snap.com'], n: 'Snapchat' },
  { k: ['xiaohongshu', 'rednote', 'red note'], n: 'RedNote (Xiaohongshu)' },
  { k: ['noplace.com', 'noplace -'], n: 'Noplace' },
  { k: ['artifact.news'], n: 'Artifact' },
  { k: ['substack.com/notes', 'notes.substack'], n: 'Substack Notes' },
  { k: ['wechat.com', 'weixin.qq'], n: 'WeChat' },
  { k: ['weibo.com', 'weibo -'], n: 'Weibo' },
  { k: ['vk.com', 'vkontakte'], n: 'VK' },
  { k: ['ok.ru', 'odnoklassniki'], n: 'Odnoklassniki' },
  { k: ['line.me'], n: 'LINE' },
  { k: ['kakaotalk', 'kakao.com'], n: 'KakaoTalk' },
  { k: ['clubhouse.com'], n: 'Clubhouse' },
  { k: ['nextdoor.com'], n: 'Nextdoor' },
  { k: ['parler.com'], n: 'Parler' },
  { k: ['truth social', 'truthsocial'], n: 'Truth Social' },
  { k: ['gab.com'], n: 'Gab' },
  { k: ['gettr.com'], n: 'Gettr' },
  { k: ['minds.com'], n: 'Minds' },
  { k: ['diaspora'], n: 'Diaspora' },
  { k: ['ello.co'], n: 'Ello' },
  { k: ['mewe.com'], n: 'MeWe' },
  { k: ['cohost.org'], n: 'Cohost' },
  { k: ['post.news'], n: 'Post News' },
  { k: ['hive.social'], n: 'Hive Social' },
  { k: ['spoutible.com'], n: 'Spoutible' },
  { k: ['tribel.com'], n: 'Tribel' },
  { k: ['lemon8'], n: 'Lemon8' },
  { k: ['bereal.com'], n: 'BeReal' },
  { k: ['poparazzi.com'], n: 'Poparazzi' },
  { k: ['dispo.fun'], n: 'Dispo' },
  { k: ['vsco.co'], n: 'VSCO' },
  { k: ['500px.com'], n: '500px' },
  { k: ['flickr.com'], n: 'Flickr' },
  { k: ['deviantart.com'], n: 'DeviantArt' },
  { k: ['artstation.com'], n: 'ArtStation' },
  { k: ['pixiv.net'], n: 'Pixiv' },
  { k: ['newgrounds.com'], n: 'Newgrounds' },
  { k: ['furaffinity.net'], n: 'Fur Affinity' },
  { k: ['wattpad.com'], n: 'Wattpad' },
  { k: ['goodreads.com'], n: 'Goodreads' },
  { k: ['librarything.com'], n: 'LibraryThing' },
  { k: ['storygraph.com'], n: 'StoryGraph' },
  { k: ['ao3', 'archiveofourown'], n: 'Archive of Our Own' },
  { k: ['fanfiction.net'], n: 'FanFiction.net' },

  // COMMUNICATION & VIDEO CALLS
  { k: ['slack.com', 'app.slack'], n: 'Slack (Web)' },
  { k: ['discord.com', 'discord -', 'discordapp'], n: 'Discord (Web)' },
  { k: ['web.whatsapp', 'whatsapp web'], n: 'WhatsApp Web' },
  { k: ['messages.google', 'google messages'], n: 'Google Messages' },
  { k: ['telegram.org', 'web.telegram'], n: 'Telegram Web' },
  { k: ['teams.microsoft', 'microsoft teams'], n: 'Teams (Web)' },
  { k: ['zoom.us', 'zoom -'], n: 'Zoom (Web)' },
  { k: ['meet.google', 'google meet'], n: 'Google Meet' },
  { k: ['webex.com', 'webex -'], n: 'Webex' },
  { k: ['gotomeeting', 'goto.com'], n: 'GoToMeeting' },
  { k: ['bluejeans.com'], n: 'BlueJeans' },
  { k: ['whereby.com'], n: 'Whereby' },
  { k: ['jitsi.org', 'meet.jit.si'], n: 'Jitsi Meet' },
  { k: ['around.co'], n: 'Around' },
  { k: ['gather.town'], n: 'Gather' },
  { k: ['spatial.io'], n: 'Spatial' },
  { k: ['tandem.chat'], n: 'Tandem' },
  { k: ['loom.com'], n: 'Loom' },
  { k: ['vidyard.com'], n: 'Vidyard' },
  { k: ['ringcentral.com'], n: 'RingCentral' },
  { k: ['8x8.com'], n: '8x8' },
  { k: ['vonage.com'], n: 'Vonage' },
  { k: ['dialpad.com'], n: 'Dialpad' },
  { k: ['aircall.io'], n: 'Aircall' },
  { k: ['grasshopper.com'], n: 'Grasshopper' },
  { k: ['skype.com'], n: 'Skype' },
  { k: ['viber.com'], n: 'Viber' },
  { k: ['signal.org'], n: 'Signal' },
  { k: ['element.io', 'matrix.org'], n: 'Element/Matrix' },
  { k: ['keybase.io'], n: 'Keybase' },
  { k: ['wire.com'], n: 'Wire' },
  { k: ['threema.ch'], n: 'Threema' },
  { k: ['session.org'], n: 'Session' },
  { k: ['mattermost.com'], n: 'Mattermost' },
  { k: ['rocket.chat'], n: 'Rocket.Chat' },
  { k: ['zulip.com'], n: 'Zulip' },
  { k: ['twist.com'], n: 'Twist' },
  { k: ['flock.com'], n: 'Flock' },
  { k: ['chanty.com'], n: 'Chanty' },
  { k: ['ryver.com'], n: 'Ryver' },

  // PRODUCTIVITY - GOOGLE
  { k: ['docs.google', 'google docs', '- google docs'], n: 'Google Docs' },
  { k: ['sheets.google', 'google sheets', '- google sheets'], n: 'Google Sheets' },
  { k: ['slides.google', 'google slides', '- google slides'], n: 'Google Slides' },
  { k: ['drive.google', 'google drive', 'my drive -'], n: 'Google Drive' },
  { k: ['mail.google', 'gmail', 'inbox ('], n: 'Gmail' },
  { k: ['calendar.google', 'google calendar'], n: 'Google Calendar' },
  { k: ['keep.google', 'google keep'], n: 'Google Keep' },
  { k: ['forms.google', 'google forms'], n: 'Google Forms' },
  { k: ['sites.google', 'google sites'], n: 'Google Sites' },
  { k: ['jamboard.google'], n: 'Google Jamboard' },
  { k: ['earth.google', 'google earth'], n: 'Google Earth' },
  { k: ['maps.google', 'google maps'], n: 'Google Maps' },
  { k: ['photos.google', 'google photos'], n: 'Google Photos' },
  { k: ['contacts.google'], n: 'Google Contacts' },
  { k: ['tasks.google'], n: 'Google Tasks' },
  { k: ['chat.google', 'google chat'], n: 'Google Chat' },
  { k: ['admin.google'], n: 'Google Admin' },
  { k: ['analytics.google', 'google analytics'], n: 'Google Analytics' },
  { k: ['ads.google', 'google ads'], n: 'Google Ads' },
  { k: ['search.google.com/search-console', 'google search console'], n: 'Google Search Console' },
  { k: ['tagmanager.google'], n: 'Google Tag Manager' },
  { k: ['datastudio.google', 'looker studio'], n: 'Looker Studio' },
  { k: ['optimize.google'], n: 'Google Optimize' },
  { k: ['firebase.google', 'console.firebase'], n: 'Firebase' },

  // PRODUCTIVITY - MICROSOFT
  { k: ['outlook.live', 'outlook.com', 'outlook -', 'outlook.office'], n: 'Outlook (Web)' },
  { k: ['onedrive.live', 'onedrive.com'], n: 'OneDrive (Web)' },
  { k: ['office.com', 'microsoft 365', 'microsoft365'], n: 'Microsoft 365' },
  { k: ['word.office', 'word online'], n: 'Word Online' },
  { k: ['excel.office', 'excel online'], n: 'Excel Online' },
  { k: ['powerpoint.office', 'powerpoint online'], n: 'PowerPoint Online' },
  { k: ['onenote.com', 'onenote.office'], n: 'OneNote (Web)' },
  { k: ['sharepoint.com'], n: 'SharePoint' },
  { k: ['planner.cloud.microsoft', 'tasks.office'], n: 'Microsoft Planner' },
  { k: ['to-do.live', 'to-do.office'], n: 'Microsoft To Do' },
  { k: ['forms.office', 'forms.microsoft'], n: 'Microsoft Forms' },
  { k: ['whiteboard.microsoft'], n: 'Microsoft Whiteboard' },
  { k: ['loop.microsoft'], n: 'Microsoft Loop' },
  { k: ['sway.office', 'sway.com'], n: 'Microsoft Sway' },
  { k: ['stream.microsoft'], n: 'Microsoft Stream' },
  { k: ['yammer.com'], n: 'Yammer' },
  { k: ['power.microsoft', 'powerbi.com'], n: 'Power BI' },
  { k: ['flow.microsoft', 'powerautomate'], n: 'Power Automate' },
  { k: ['powerapps.microsoft'], n: 'Power Apps' },
  { k: ['dynamics.microsoft', 'dynamics365'], n: 'Dynamics 365' },
  { k: ['visualstudio.com', 'dev.azure'], n: 'Azure DevOps' },
  { k: ['copilot.microsoft'], n: 'Microsoft Copilot' },

  // PROJECT MANAGEMENT & NOTES
  { k: ['notion.so', 'notion -'], n: 'Notion' },
  { k: ['figma.com', 'figma -', '- figma'], n: 'Figma' },
  { k: ['trello.com', 'trello -'], n: 'Trello' },
  { k: ['asana.com', 'asana -'], n: 'Asana' },
  { k: ['monday.com', 'monday -'], n: 'Monday.com' },
  { k: ['clickup.com', 'clickup -'], n: 'ClickUp' },
  { k: ['linear.app', 'linear -'], n: 'Linear' },
  { k: ['airtable.com', 'airtable -'], n: 'Airtable' },
  { k: ['miro.com', 'miro -'], n: 'Miro' },
  { k: ['canva.com', 'canva -'], n: 'Canva' },
  { k: ['dropbox.com', 'dropbox -'], n: 'Dropbox' },
  { k: ['evernote.com', 'evernote -'], n: 'Evernote' },
  { k: ['todoist.com', 'todoist -'], n: 'Todoist' },
  { k: ['coda.io', 'coda -'], n: 'Coda' },
  { k: ['basecamp.com', 'basecamp -'], n: 'Basecamp' },
  { k: ['wrike.com', 'wrike -'], n: 'Wrike' },
  { k: ['smartsheet.com', 'smartsheet -'], n: 'Smartsheet' },
  { k: ['teamwork.com'], n: 'Teamwork' },
  { k: ['jira.atlassian', 'atlassian.net/jira'], n: 'Jira' },
  { k: ['confluence.atlassian', 'atlassian.net/wiki'], n: 'Confluence' },
  { k: ['atlassian.com'], n: 'Atlassian' },
  { k: ['height.app'], n: 'Height' },
  { k: ['shortcut.com'], n: 'Shortcut' },
  { k: ['productboard.com'], n: 'Productboard' },
  { k: ['aha.io'], n: 'Aha!' },
  { k: ['pendo.io'], n: 'Pendo' },
  { k: ['amplitude.com'], n: 'Amplitude' },
  { k: ['mixpanel.com'], n: 'Mixpanel' },
  { k: ['heap.io'], n: 'Heap' },
  { k: ['hotjar.com'], n: 'Hotjar' },
  { k: ['fullstory.com'], n: 'FullStory' },
  { k: ['logrocket.com'], n: 'LogRocket' },
  { k: ['obsidian.md'], n: 'Obsidian' },
  { k: ['roamresearch.com'], n: 'Roam Research' },
  { k: ['logseq.com'], n: 'Logseq' },
  { k: ['remnote.com'], n: 'RemNote' },
  { k: ['craft.do'], n: 'Craft' },
  { k: ['bear.app'], n: 'Bear' },
  { k: ['ulysses.app'], n: 'Ulysses' },
  { k: ['ia.net/writer', 'ia writer'], n: 'iA Writer' },
  { k: ['workflowy.com'], n: 'WorkFlowy' },
  { k: ['dynalist.io'], n: 'Dynalist' },
  { k: ['tana.inc'], n: 'Tana' },
  { k: ['capacities.io'], n: 'Capacities' },
  { k: ['anytype.io'], n: 'Anytype' },
  { k: ['appflowy.io'], n: 'AppFlowy' },
  { k: ['ticktick.com'], n: 'TickTick' },
  { k: ['any.do'], n: 'Any.do' },
  { k: ['things.app', 'culturedcode'], n: 'Things' },
  { k: ['omnifocus.com'], n: 'OmniFocus' },
  { k: ['fantastical.app'], n: 'Fantastical' },
  { k: ['busycal.com'], n: 'BusyCal' },
  { k: ['calendly.com'], n: 'Calendly' },
  { k: ['cal.com'], n: 'Cal.com' },
  { k: ['savvycal.com'], n: 'SavvyCal' },
  { k: ['acuityscheduling.com'], n: 'Acuity Scheduling' },
  { k: ['doodle.com'], n: 'Doodle' },
  { k: ['whenisgood.net'], n: 'When Is Good' },
  { k: ['reclaim.ai'], n: 'Reclaim.ai' },
  { k: ['clockwise.com'], n: 'Clockwise' },
  { k: ['motion.dev', 'usemotion.com'], n: 'Motion' },
  { k: ['sunsama.com'], n: 'Sunsama' },
  { k: ['akiflow.com'], n: 'Akiflow' },

  // DEVELOPER
  { k: ['github.com', 'github -', '· github', 'gist.github'], n: 'GitHub' },
  { k: ['gitlab.com', 'gitlab -', '· gitlab'], n: 'GitLab' },
  { k: ['bitbucket.org', 'bitbucket -'], n: 'Bitbucket' },
  { k: ['stackoverflow.com', 'stack overflow'], n: 'Stack Overflow' },
  { k: ['stackexchange.com'], n: 'Stack Exchange' },
  { k: ['codepen.io', 'codepen -'], n: 'CodePen' },
  { k: ['jsfiddle.net', 'jsfiddle -'], n: 'JSFiddle' },
  { k: ['codesandbox.io', 'codesandbox -'], n: 'CodeSandbox' },
  { k: ['replit.com', 'replit -', 'repl.it'], n: 'Replit' },
  { k: ['vercel.com', 'vercel -'], n: 'Vercel' },
  { k: ['netlify.com', 'netlify -'], n: 'Netlify' },
  { k: ['heroku.com', 'heroku -'], n: 'Heroku' },
  { k: ['railway.app'], n: 'Railway' },
  { k: ['render.com'], n: 'Render' },
  { k: ['fly.io'], n: 'Fly.io' },
  { k: ['digitalocean.com'], n: 'DigitalOcean' },
  { k: ['linode.com'], n: 'Linode' },
  { k: ['vultr.com'], n: 'Vultr' },
  { k: ['cloudflare.com'], n: 'Cloudflare' },
  { k: ['fastly.com'], n: 'Fastly' },
  { k: ['akamai.com'], n: 'Akamai' },
  { k: ['npmjs.com', 'npm -', 'npmjs.org'], n: 'npm' },
  { k: ['yarnpkg.com'], n: 'Yarn' },
  { k: ['pypi.org', 'pypi.python'], n: 'PyPI' },
  { k: ['rubygems.org'], n: 'RubyGems' },
  { k: ['crates.io'], n: 'crates.io' },
  { k: ['pkg.go.dev', 'golang.org'], n: 'Go Packages' },
  { k: ['packagist.org'], n: 'Packagist' },
  { k: ['nuget.org'], n: 'NuGet' },
  { k: ['maven.apache', 'mvnrepository'], n: 'Maven' },
  { k: ['cocoapods.org'], n: 'CocoaPods' },
  { k: ['swiftpackageindex.com'], n: 'Swift Package Index' },
  { k: ['pub.dev'], n: 'pub.dev' },
  { k: ['hex.pm'], n: 'Hex.pm' },
  { k: ['dev.to', 'dev community'], n: 'DEV Community' },
  { k: ['hashnode.com', 'hashnode -'], n: 'Hashnode' },
  { k: ['hackernoon.com', 'hackernoon -'], n: 'HackerNoon' },
  { k: ['freecodecamp.org', 'freecodecamp -'], n: 'freeCodeCamp' },
  { k: ['leetcode.com'], n: 'LeetCode' },
  { k: ['hackerrank.com'], n: 'HackerRank' },
  { k: ['codewars.com'], n: 'Codewars' },
  { k: ['exercism.org'], n: 'Exercism' },
  { k: ['topcoder.com'], n: 'TopCoder' },
  { k: ['codeforces.com'], n: 'Codeforces' },
  { k: ['atcoder.jp'], n: 'AtCoder' },
  { k: ['codechef.com'], n: 'CodeChef' },
  { k: ['geeksforgeeks.org'], n: 'GeeksforGeeks' },
  { k: ['tutorialspoint.com'], n: 'TutorialsPoint' },
  { k: ['javatpoint.com'], n: 'JavaTPoint' },
  { k: ['programiz.com'], n: 'Programiz' },
  { k: ['realpython.com'], n: 'Real Python' },
  { k: ['python.org'], n: 'Python.org' },
  { k: ['javascript.info'], n: 'JavaScript.info' },
  { k: ['typescriptlang.org'], n: 'TypeScript' },
  { k: ['rust-lang.org'], n: 'Rust' },
  { k: ['go.dev'], n: 'Go' },
  { k: ['kotlinlang.org'], n: 'Kotlin' },
  { k: ['swift.org'], n: 'Swift.org' },
  { k: ['reactjs.org', 'react.dev'], n: 'React' },
  { k: ['vuejs.org'], n: 'Vue.js' },
  { k: ['angular.io', 'angular.dev'], n: 'Angular' },
  { k: ['svelte.dev'], n: 'Svelte' },
  { k: ['nextjs.org'], n: 'Next.js' },
  { k: ['nuxt.com'], n: 'Nuxt' },
  { k: ['remix.run'], n: 'Remix' },
  { k: ['astro.build'], n: 'Astro' },
  { k: ['solidjs.com'], n: 'SolidJS' },
  { k: ['qwik.builder.io'], n: 'Qwik' },
  { k: ['htmx.org'], n: 'htmx' },
  { k: ['alpinejs.dev'], n: 'Alpine.js' },
  { k: ['tailwindcss.com'], n: 'Tailwind CSS' },
  { k: ['getbootstrap.com'], n: 'Bootstrap' },
  { k: ['bulma.io'], n: 'Bulma' },
  { k: ['materializecss.com'], n: 'Materialize' },
  { k: ['chakra-ui.com'], n: 'Chakra UI' },
  { k: ['mui.com', 'material-ui'], n: 'MUI' },
  { k: ['ant.design'], n: 'Ant Design' },
  { k: ['radix-ui.com'], n: 'Radix UI' },
  { k: ['headlessui.com'], n: 'Headless UI' },
  { k: ['shadcn.com', 'ui.shadcn'], n: 'shadcn/ui' },
  { k: ['daisyui.com'], n: 'DaisyUI' },
  { k: ['nodejs.org'], n: 'Node.js' },
  { k: ['deno.land', 'deno.com'], n: 'Deno' },
  { k: ['bun.sh'], n: 'Bun' },
  { k: ['expressjs.com'], n: 'Express.js' },
  { k: ['fastify.io'], n: 'Fastify' },
  { k: ['nestjs.com'], n: 'NestJS' },
  { k: ['djangoproject.com'], n: 'Django' },
  { k: ['flask.palletsprojects.com'], n: 'Flask' },
  { k: ['fastapi.tiangolo.com'], n: 'FastAPI' },
  { k: ['rubyonrails.org'], n: 'Ruby on Rails' },
  { k: ['laravel.com'], n: 'Laravel' },
  { k: ['symfony.com'], n: 'Symfony' },
  { k: ['spring.io'], n: 'Spring' },
  { k: ['dotnet.microsoft.com'], n: '.NET' },
  { k: ['aws.amazon', 'aws console', 'console.aws'], n: 'AWS' },
  { k: ['cloud.google', 'google cloud', 'console.cloud.google'], n: 'Google Cloud' },
  { k: ['azure.microsoft', 'azure portal', 'portal.azure'], n: 'Azure' },
  { k: ['docker.com', 'docker hub', 'hub.docker'], n: 'Docker' },
  { k: ['kubernetes.io'], n: 'Kubernetes' },
  { k: ['terraform.io'], n: 'Terraform' },
  { k: ['ansible.com'], n: 'Ansible' },
  { k: ['jenkins.io'], n: 'Jenkins' },
  { k: ['circleci.com'], n: 'CircleCI' },
  { k: ['travis-ci.com'], n: 'Travis CI' },
  { k: ['github.com/actions', 'actions/'], n: 'GitHub Actions' },
  { k: ['sentry.io'], n: 'Sentry' },
  { k: ['datadog.com'], n: 'Datadog' },
  { k: ['newrelic.com'], n: 'New Relic' },
  { k: ['grafana.com'], n: 'Grafana' },
  { k: ['prometheus.io'], n: 'Prometheus' },
  { k: ['elastic.co'], n: 'Elastic' },
  { k: ['splunk.com'], n: 'Splunk' },
  { k: ['supabase.com'], n: 'Supabase' },
  { k: ['planetscale.com'], n: 'PlanetScale' },
  { k: ['neon.tech'], n: 'Neon' },
  { k: ['mongodb.com'], n: 'MongoDB' },
  { k: ['redis.io', 'redis.com'], n: 'Redis' },
  { k: ['postgresql.org'], n: 'PostgreSQL' },
  { k: ['mysql.com'], n: 'MySQL' },
  { k: ['sqlite.org'], n: 'SQLite' },
  { k: ['prisma.io'], n: 'Prisma' },
  { k: ['drizzle.team'], n: 'Drizzle' },
  { k: ['sequelize.org'], n: 'Sequelize' },
  { k: ['typeorm.io'], n: 'TypeORM' },
  { k: ['graphql.org'], n: 'GraphQL' },
  { k: ['apollographql.com'], n: 'Apollo GraphQL' },
  { k: ['hasura.io'], n: 'Hasura' },
  { k: ['postman.com'], n: 'Postman' },
  { k: ['insomnia.rest'], n: 'Insomnia' },
  { k: ['swagger.io'], n: 'Swagger' },
  { k: ['stoplight.io'], n: 'Stoplight' },
  { k: ['hoppscotch.io'], n: 'Hoppscotch' },
  { k: ['regex101.com'], n: 'Regex101' },
  { k: ['regexr.com'], n: 'RegExr' },
  { k: ['jsoneditoronline.org'], n: 'JSON Editor Online' },
  { k: ['jwt.io'], n: 'JWT.io' },
  { k: ['caniuse.com'], n: 'Can I Use' },
  { k: ['bundlephobia.com'], n: 'Bundlephobia' },

  // DOCUMENTATION
  { k: ['developer.mozilla', 'mdn web docs'], n: 'MDN' },
  { k: ['w3schools.com', 'w3schools -'], n: 'W3Schools' },
  { k: ['developer.apple', 'apple developer'], n: 'Apple Developer' },
  { k: ['learn.microsoft', 'microsoft learn', 'docs.microsoft'], n: 'Microsoft Learn' },
  { k: ['developers.google', 'google developers'], n: 'Google Developers' },
  { k: ['developer.android', 'android developers'], n: 'Android Developers' },
  { k: ['developer.chrome', 'chrome developers'], n: 'Chrome Developers' },
  { k: ['web.dev'], n: 'web.dev' },
  { k: ['css-tricks.com'], n: 'CSS-Tricks' },
  { k: ['smashingmagazine.com'], n: 'Smashing Magazine' },
  { k: ['alistapart.com'], n: 'A List Apart' },
  { k: ['sitepoint.com'], n: 'SitePoint' },
  { k: ['digitalocean.com/community'], n: 'DigitalOcean Community' },
  { k: ['logrocket.com/blog'], n: 'LogRocket Blog' },
  { k: ['auth0.com/blog'], n: 'Auth0 Blog' },
  { k: ['martinfowler.com'], n: 'Martin Fowler' },
  { k: ['refactoring.guru'], n: 'Refactoring.Guru' },
  { k: ['sourcemaking.com'], n: 'SourceMaking' },
  { k: ['patterns.dev'], n: 'Patterns.dev' },
  { k: ['roadmap.sh'], n: 'roadmap.sh' },
  { k: ['devdocs.io'], n: 'DevDocs' },
  { k: ['devhints.io'], n: 'Devhints' },
  { k: ['cheatography.com'], n: 'Cheatography' },
  { k: ['overapi.com'], n: 'OverAPI' },
  { k: ['quickref.me'], n: 'QuickRef.ME' },
  { k: ['learnxinyminutes.com'], n: 'Learn X in Y Minutes' },
  { k: ['github.com/readme', 'readme.com'], n: 'ReadMe' },
  { k: ['gitbook.com'], n: 'GitBook' },
  { k: ['docusaurus.io'], n: 'Docusaurus' },
  { k: ['mkdocs.org'], n: 'MkDocs' },
  { k: ['readthedocs.org'], n: 'Read the Docs' },
  { k: ['notion.so/developers'], n: 'Notion API' },
  { k: ['stripe.com/docs'], n: 'Stripe Docs' },
  { k: ['twilio.com/docs'], n: 'Twilio Docs' },
  { k: ['sendgrid.com/docs'], n: 'SendGrid Docs' },
  { k: ['algolia.com/doc'], n: 'Algolia Docs' },
  { k: ['openai.com/docs', 'platform.openai'], n: 'OpenAI Docs' },
  { k: ['docs.anthropic.com'], n: 'Anthropic Docs' },
  { k: ['huggingface.co/docs'], n: 'Hugging Face Docs' },

  // AI ASSISTANTS
  { k: ['chatgpt.com', 'chat.openai', 'chatgpt -'], n: 'ChatGPT' },
  { k: ['claude.ai', 'claude -', '- claude'], n: 'Claude' },
  { k: ['gemini.google', 'bard.google'], n: 'Gemini' },
  { k: ['grok.com', 'grok.x.ai', 'x.ai/grok'], n: 'Grok' },
  { k: ['perplexity.ai', 'perplexity -'], n: 'Perplexity' },
  { k: ['copilot.microsoft', 'copilot.cloud'], n: 'Microsoft Copilot' },
  { k: ['meta.ai'], n: 'Meta AI' },
  { k: ['poe.com'], n: 'Poe' },
  { k: ['character.ai'], n: 'Character.AI' },
  { k: ['pi.ai'], n: 'Pi' },
  { k: ['you.com'], n: 'You.com' },
  { k: ['phind.com'], n: 'Phind' },
  { k: ['kagi.com'], n: 'Kagi' },

  // AI PLATFORMS
  { k: ['openai.com'], n: 'OpenAI' },
  { k: ['anthropic.com'], n: 'Anthropic' },
  { k: ['x.ai'], n: 'xAI' },
  { k: ['deepmind.google', 'deepmind.com'], n: 'DeepMind' },
  { k: ['ai.meta.com'], n: 'Meta AI Research' },
  { k: ['deepseek.com', 'deepseek.ai'], n: 'DeepSeek' },
  { k: ['mistral.ai'], n: 'Mistral AI' },
  { k: ['huggingface.co'], n: 'Hugging Face' },
  { k: ['cohere.ai', 'cohere.com'], n: 'Cohere' },
  { k: ['stability.ai'], n: 'Stability AI' },
  { k: ['inflection.ai'], n: 'Inflection AI' },
  { k: ['ai21.com'], n: 'AI21 Labs' },
  { k: ['aleph-alpha.com'], n: 'Aleph Alpha' },

  // AI INFRA
  { k: ['replicate.com'], n: 'Replicate' },
  { k: ['together.ai'], n: 'Together AI' },
  { k: ['anyscale.com'], n: 'Anyscale' },
  { k: ['modal.com'], n: 'Modal' },
  { k: ['banana.dev'], n: 'Banana' },
  { k: ['runpod.io'], n: 'RunPod' },
  { k: ['vast.ai'], n: 'Vast.ai' },
  { k: ['lambdalabs.com'], n: 'Lambda Labs' },
  { k: ['coreweave.com'], n: 'CoreWeave' },
  { k: ['groq.com'], n: 'Groq' },
  { k: ['cerebras.net'], n: 'Cerebras' },

  // AI IMAGE
  { k: ['midjourney.com', 'midjourney -'], n: 'Midjourney' },
  { k: ['leonardo.ai'], n: 'Leonardo.AI' },
  { k: ['playground.ai', 'playgroundai'], n: 'Playground AI' },
  { k: ['dreamstudio.ai', 'stability.ai/stable-diffusion'], n: 'DreamStudio' },
  { k: ['dall-e', 'labs.openai'], n: 'DALL-E' },
  { k: ['ideogram.ai'], n: 'Ideogram' },
  { k: ['nightcafe.studio'], n: 'NightCafe' },
  { k: ['artbreeder.com'], n: 'Artbreeder' },
  { k: ['civitai.com'], n: 'Civitai' },
  { k: ['lexica.art'], n: 'Lexica' },
  { k: ['openart.ai'], n: 'OpenArt' },
  { k: ['tensor.art'], n: 'Tensor.Art' },
  { k: ['seaart.ai'], n: 'SeaArt' },
  { k: ['getimg.ai'], n: 'getimg.ai' },
  { k: ['imagine.art'], n: 'Imagine Art' },
  { k: ['flux.ai', 'flux1'], n: 'Flux' },
  { k: ['krea.ai'], n: 'Krea AI' },
  { k: ['magnific.ai'], n: 'Magnific AI' },

  // AI VIDEO
  { k: ['sora.com', 'openai.com/sora'], n: 'Sora' },
  { k: ['runway.ml', 'runwayml'], n: 'Runway' },
  { k: ['pika.art'], n: 'Pika' },
  { k: ['lumalabs.ai', 'luma ai'], n: 'Luma AI' },
  { k: ['kaiber.ai'], n: 'Kaiber' },
  { k: ['genmo.ai'], n: 'Genmo' },
  { k: ['haiper.ai'], n: 'Haiper' },
  { k: ['morph.studio'], n: 'Morph Studio' },
  { k: ['kling.ai', 'kling.kuaishou'], n: 'Kling AI' },
  { k: ['minimax.io'], n: 'MiniMax' },
  { k: ['vidu.io'], n: 'Vidu' },
  { k: ['pixverse.ai'], n: 'PixVerse' },
  { k: ['invideo.io'], n: 'InVideo AI' },

  // AI WRITING
  { k: ['writesonic.com'], n: 'Writesonic' },
  { k: ['jasper.ai'], n: 'Jasper' },
  { k: ['copy.ai'], n: 'Copy.ai' },
  { k: ['rytr.me'], n: 'Rytr' },
  { k: ['anyword.com'], n: 'Anyword' },
  { k: ['grammarly.com'], n: 'Grammarly' },
  { k: ['quillbot.com'], n: 'QuillBot' },
  { k: ['wordtune.com'], n: 'Wordtune' },
  { k: ['hemingwayapp.com'], n: 'Hemingway Editor' },
  { k: ['prowritingaid.com'], n: 'ProWritingAid' },
  { k: ['languagetool.org'], n: 'LanguageTool' },
  { k: ['sudowrite.com'], n: 'Sudowrite' },
  { k: ['novelai.net'], n: 'NovelAI' },
  { k: ['hyperwriteai.com'], n: 'HyperWrite' },

  // AI AUDIO
  { k: ['otter.ai'], n: 'Otter.ai' },
  { k: ['descript.com'], n: 'Descript' },
  { k: ['elevenlabs.io'], n: 'ElevenLabs' },
  { k: ['murf.ai'], n: 'Murf AI' },
  { k: ['play.ht'], n: 'Play.ht' },
  { k: ['resemble.ai'], n: 'Resemble AI' },
  { k: ['wellsaidlabs.com'], n: 'WellSaid Labs' },
  { k: ['speechify.com'], n: 'Speechify' },
  { k: ['suno.ai', 'suno.com'], n: 'Suno' },
  { k: ['udio.com'], n: 'Udio' },
  { k: ['aiva.ai'], n: 'AIVA' },
  { k: ['soundraw.io'], n: 'Soundraw' },
  { k: ['boomy.com'], n: 'Boomy' },

  // AI AVATAR
  { k: ['synthesia.io'], n: 'Synthesia' },
  { k: ['heygen.com'], n: 'HeyGen' },
  { k: ['d-id.com'], n: 'D-ID' },
  { k: ['colossyan.com'], n: 'Colossyan' },
  { k: ['elai.io'], n: 'Elai' },
  { k: ['kapwing.com'], n: 'Kapwing' },
  { k: ['pictory.ai'], n: 'Pictory' },

  // AI IMAGE EDITING
  { k: ['remove.bg'], n: 'Remove.bg' },
  { k: ['cleanup.pictures'], n: 'Cleanup.pictures' },
  { k: ['photoroom.com'], n: 'PhotoRoom' },
  { k: ['clipdrop.co'], n: 'Clipdrop' },
  { k: ['topazlabs.com'], n: 'Topaz Labs' },

  // AI CODING
  { k: ['cursor.com', 'cursor.sh'], n: 'Cursor' },
  { k: ['replit.com/agent', 'replit agent'], n: 'Replit Agent' },
  { k: ['codeium.com'], n: 'Codeium' },
  { k: ['tabnine.com'], n: 'Tabnine' },
  { k: ['sourcegraph.com/cody', 'cody ai'], n: 'Cody' },
  { k: ['aider.chat'], n: 'Aider' },
  { k: ['continue.dev'], n: 'Continue' },
  { k: ['v0.dev'], n: 'v0' },
  { k: ['bolt.new'], n: 'Bolt' },
  { k: ['lovable.dev'], n: 'Lovable' },
  { k: ['devin.ai'], n: 'Devin' },

  // AI RESEARCH
  { k: ['elicit.com', 'elicit.org'], n: 'Elicit' },
  { k: ['consensus.app'], n: 'Consensus' },
  { k: ['scite.ai'], n: 'scite' },
  { k: ['explainpaper.com'], n: 'Explain Paper' },
  { k: ['chatpdf.com'], n: 'ChatPDF' },
  { k: ['notebooklm.google'], n: 'NotebookLM' },

  // NEWS & MEDIA
  { k: ['news.ycombinator', 'hacker news'], n: 'Hacker News' },
  { k: ['medium.com', 'medium -'], n: 'Medium' },
  { k: ['substack.com', 'substack -'], n: 'Substack' },
  { k: ['cnn.com', 'cnn -'], n: 'CNN' },
  { k: ['bbc.com', 'bbc news', 'bbc -'], n: 'BBC' },
  { k: ['nytimes.com', 'new york times', 'nyt -'], n: 'NY Times' },
  { k: ['theguardian.com', 'the guardian'], n: 'The Guardian' },
  { k: ['reuters.com', 'reuters -'], n: 'Reuters' },
  { k: ['techcrunch.com', 'techcrunch -'], n: 'TechCrunch' },
  { k: ['theverge.com', 'the verge'], n: 'The Verge' },
  { k: ['wired.com', 'wired -'], n: 'Wired' },
  { k: ['arstechnica.com', 'ars technica'], n: 'Ars Technica' },
  { k: ['engadget.com', 'engadget -'], n: 'Engadget' },
  { k: ['washingtonpost.com', 'washington post'], n: 'Washington Post' },
  { k: ['wsj.com', 'wall street journal'], n: 'Wall Street Journal' },
  { k: ['ft.com', 'financial times'], n: 'Financial Times' },
  { k: ['bloomberg.com', 'bloomberg -'], n: 'Bloomberg' },
  { k: ['cnbc.com', 'cnbc -'], n: 'CNBC' },
  { k: ['foxnews.com', 'fox news'], n: 'Fox News' },
  { k: ['msnbc.com', 'msnbc -'], n: 'MSNBC' },
  { k: ['npr.org', 'npr -'], n: 'NPR' },
  { k: ['apnews.com', 'ap news'], n: 'AP News' },
  { k: ['usatoday.com', 'usa today'], n: 'USA Today' },
  { k: ['latimes.com', 'la times'], n: 'LA Times' },
  { k: ['chicagotribune.com'], n: 'Chicago Tribune' },
  { k: ['sfchronicle.com'], n: 'SF Chronicle' },
  { k: ['bostonglobe.com'], n: 'Boston Globe' },
  { k: ['politico.com', 'politico -'], n: 'Politico' },
  { k: ['thehill.com', 'the hill'], n: 'The Hill' },
  { k: ['axios.com', 'axios -'], n: 'Axios' },
  { k: ['vox.com', 'vox -'], n: 'Vox' },
  { k: ['slate.com', 'slate -'], n: 'Slate' },
  { k: ['theatlantic.com', 'the atlantic'], n: 'The Atlantic' },
  { k: ['newyorker.com', 'new yorker'], n: 'The New Yorker' },
  { k: ['economist.com', 'the economist'], n: 'The Economist' },
  { k: ['time.com', 'time magazine'], n: 'TIME' },
  { k: ['forbes.com', 'forbes -'], n: 'Forbes' },
  { k: ['fortune.com', 'fortune -'], n: 'Fortune' },
  { k: ['businessinsider.com', 'business insider'], n: 'Business Insider' },
  { k: ['inc.com', 'inc magazine'], n: 'Inc.' },
  { k: ['entrepreneur.com'], n: 'Entrepreneur' },
  { k: ['fastcompany.com', 'fast company'], n: 'Fast Company' },
  { k: ['mashable.com', 'mashable -'], n: 'Mashable' },
  { k: ['gizmodo.com', 'gizmodo -'], n: 'Gizmodo' },
  { k: ['lifehacker.com', 'lifehacker -'], n: 'Lifehacker' },
  { k: ['kotaku.com', 'kotaku -'], n: 'Kotaku' },
  { k: ['jalopnik.com', 'jalopnik -'], n: 'Jalopnik' },
  { k: ['deadspin.com'], n: 'Deadspin' },
  { k: ['9to5mac.com'], n: '9to5Mac' },
  { k: ['9to5google.com'], n: '9to5Google' },
  { k: ['macrumors.com', 'macrumors -'], n: 'MacRumors' },
  { k: ['appleinsider.com'], n: 'AppleInsider' },
  { k: ['tomshardware.com'], n: "Tom's Hardware" },
  { k: ['anandtech.com'], n: 'AnandTech' },
  { k: ['pcmag.com'], n: 'PCMag' },
  { k: ['cnet.com', 'cnet -'], n: 'CNET' },
  { k: ['zdnet.com', 'zdnet -'], n: 'ZDNet' },
  { k: ['theinformation.com'], n: 'The Information' },
  { k: ['protocol.com'], n: 'Protocol' },
  { k: ['semafor.com'], n: 'Semafor' },
  { k: ['puck.news'], n: 'Puck' },
  { k: ['defector.com'], n: 'Defector' },
  { k: ['404media.co'], n: '404 Media' },
  { k: ['theintrinsicperspective.com'], n: 'Intrinsic Perspective' },
  { k: ['stratechery.com'], n: 'Stratechery' },
  { k: ['benthompson.com'], n: 'Ben Thompson' },
  { k: ['dkb.io'], n: 'DKB' },
  { k: ['thehustle.co'], n: 'The Hustle' },
  { k: ['morningbrew.com'], n: 'Morning Brew' },
  { k: ['theskim.com'], n: 'theSkimm' },
  { k: ['1440.co'], n: '1440' },

  // SHOPPING
  { k: ['amazon.com', 'amazon.co', 'amazon -'], n: 'Amazon' },
  { k: ['ebay.com', 'ebay -'], n: 'eBay' },
  { k: ['etsy.com', 'etsy -'], n: 'Etsy' },
  { k: ['aliexpress.com', 'aliexpress -'], n: 'AliExpress' },
  { k: ['alibaba.com'], n: 'Alibaba' },
  { k: ['walmart.com', 'walmart -'], n: 'Walmart' },
  { k: ['target.com', 'target -'], n: 'Target' },
  { k: ['bestbuy.com', 'best buy'], n: 'Best Buy' },
  { k: ['costco.com', 'costco -'], n: 'Costco' },
  { k: ['homedepot.com', 'home depot'], n: 'Home Depot' },
  { k: ['lowes.com', "lowe's"], n: "Lowe's" },
  { k: ['wayfair.com', 'wayfair -'], n: 'Wayfair' },
  { k: ['ikea.com', 'ikea -'], n: 'IKEA' },
  { k: ['overstock.com'], n: 'Overstock' },
  { k: ['bedbathandbeyond.com'], n: 'Bed Bath & Beyond' },
  { k: ['crateandbarrel.com'], n: 'Crate & Barrel' },
  { k: ['potterybarn.com'], n: 'Pottery Barn' },
  { k: ['westelm.com'], n: 'West Elm' },
  { k: ['anthropologie.com'], n: 'Anthropologie' },
  { k: ['urbanoutfitters.com'], n: 'Urban Outfitters' },
  { k: ['nordstrom.com', 'nordstrom -'], n: 'Nordstrom' },
  { k: ['macys.com', "macy's"], n: "Macy's" },
  { k: ['bloomingdales.com'], n: "Bloomingdale's" },
  { k: ['saksfifrthavenue.com', 'saks.com'], n: 'Saks Fifth Avenue' },
  { k: ['neimanmarcus.com'], n: 'Neiman Marcus' },
  { k: ['kohls.com', "kohl's"], n: "Kohl's" },
  { k: ['jcpenney.com'], n: 'JCPenney' },
  { k: ['gap.com'], n: 'Gap' },
  { k: ['oldnavy.com'], n: 'Old Navy' },
  { k: ['bananarepublic.com'], n: 'Banana Republic' },
  { k: ['hm.com', 'h&m'], n: 'H&M' },
  { k: ['zara.com', 'zara -'], n: 'Zara' },
  { k: ['uniqlo.com', 'uniqlo -'], n: 'Uniqlo' },
  { k: ['forever21.com'], n: 'Forever 21' },
  { k: ['asos.com', 'asos -'], n: 'ASOS' },
  { k: ['shein.com', 'shein -'], n: 'Shein' },
  { k: ['fashionnova.com'], n: 'Fashion Nova' },
  { k: ['boohoo.com'], n: 'boohoo' },
  { k: ['prettylittlething.com'], n: 'PrettyLittleThing' },
  { k: ['revolve.com'], n: 'Revolve' },
  { k: ['nike.com', 'nike -'], n: 'Nike' },
  { k: ['adidas.com', 'adidas -'], n: 'Adidas' },
  { k: ['puma.com'], n: 'Puma' },
  { k: ['underarmour.com'], n: 'Under Armour' },
  { k: ['lululemon.com'], n: 'Lululemon' },
  { k: ['footlocker.com'], n: 'Foot Locker' },
  { k: ['finishline.com'], n: 'Finish Line' },
  { k: ['dickssportinggoods.com'], n: "Dick's Sporting Goods" },
  { k: ['rei.com', 'rei co-op'], n: 'REI' },
  { k: ['patagonia.com'], n: 'Patagonia' },
  { k: ['thenorthface.com'], n: 'The North Face' },
  { k: ['apple.com/shop', 'store.apple'], n: 'Apple Store' },
  { k: ['samsung.com/shop'], n: 'Samsung Store' },
  { k: ['newegg.com', 'newegg -'], n: 'Newegg' },
  { k: ['bhphotovideo.com'], n: 'B&H Photo' },
  { k: ['adorama.com'], n: 'Adorama' },
  { k: ['microcenter.com'], n: 'Micro Center' },
  { k: ['gamestop.com'], n: 'GameStop' },
  { k: ['chewy.com', 'chewy -'], n: 'Chewy' },
  { k: ['petco.com'], n: 'Petco' },
  { k: ['petsmart.com'], n: 'PetSmart' },
  { k: ['sephora.com', 'sephora -'], n: 'Sephora' },
  { k: ['ulta.com', 'ulta beauty'], n: 'Ulta' },
  { k: ['glossier.com'], n: 'Glossier' },
  { k: ['fenty.com'], n: 'Fenty' },
  { k: ['walgreens.com'], n: 'Walgreens' },
  { k: ['cvs.com'], n: 'CVS' },
  { k: ['riteaid.com'], n: 'Rite Aid' },
  { k: ['instacart.com', 'instacart -'], n: 'Instacart' },
  { k: ['shipt.com'], n: 'Shipt' },
  { k: ['freshdirect.com'], n: 'FreshDirect' },
  { k: ['thrivemarket.com'], n: 'Thrive Market' },
  { k: ['boxed.com'], n: 'Boxed' },
  { k: ['wish.com', 'wish -'], n: 'Wish' },
  { k: ['temu.com', 'temu -'], n: 'Temu' },
  { k: ['shopify.com'], n: 'Shopify' },
  { k: ['squarespace.com'], n: 'Squarespace' },
  { k: ['wix.com', 'wix -'], n: 'Wix' },
  { k: ['bigcommerce.com'], n: 'BigCommerce' },
  { k: ['woocommerce.com'], n: 'WooCommerce' },
  { k: ['mercari.com', 'mercari -'], n: 'Mercari' },
  { k: ['poshmark.com', 'poshmark -'], n: 'Poshmark' },
  { k: ['depop.com', 'depop -'], n: 'Depop' },
  { k: ['thredup.com'], n: 'ThredUp' },
  { k: ['grailed.com'], n: 'Grailed' },
  { k: ['stockx.com', 'stockx -'], n: 'StockX' },
  { k: ['goat.com'], n: 'GOAT' },

  // LEARNING
  { k: ['coursera.org', 'coursera -'], n: 'Coursera' },
  { k: ['udemy.com', 'udemy -'], n: 'Udemy' },
  { k: ['udacity.com', 'udacity -'], n: 'Udacity' },
  { k: ['pluralsight.com', 'pluralsight -'], n: 'Pluralsight' },
  { k: ['skillshare.com', 'skillshare -'], n: 'Skillshare' },
  { k: ['linkedin.com/learning', 'linkedin learning'], n: 'LinkedIn Learning' },
  { k: ['edx.org', 'edx -'], n: 'edX' },
  { k: ['khanacademy.org', 'khan academy'], n: 'Khan Academy' },
  { k: ['codecademy.com', 'codecademy -'], n: 'Codecademy' },
  { k: ['datacamp.com', 'datacamp -'], n: 'DataCamp' },
  { k: ['duolingo.com', 'duolingo -'], n: 'Duolingo' },
  { k: ['babbel.com'], n: 'Babbel' },
  { k: ['rosettastone.com'], n: 'Rosetta Stone' },
  { k: ['busuu.com'], n: 'Busuu' },
  { k: ['memrise.com'], n: 'Memrise' },
  { k: ['lingodeer.com'], n: 'LingoDeer' },
  { k: ['hellotalk.com'], n: 'HelloTalk' },
  { k: ['tandem.net'], n: 'Tandem Language' },
  { k: ['italki.com'], n: 'iTalki' },
  { k: ['preply.com'], n: 'Preply' },
  { k: ['verbling.com'], n: 'Verbling' },
  { k: ['cambly.com'], n: 'Cambly' },
  { k: ['ankiweb.net', 'ankiapp'], n: 'Anki' },
  { k: ['quizlet.com', 'quizlet -'], n: 'Quizlet' },
  { k: ['brainscape.com'], n: 'Brainscape' },
  { k: ['cram.com'], n: 'Cram' },
  { k: ['studyblue.com'], n: 'StudyBlue' },
  { k: ['chegg.com', 'chegg -'], n: 'Chegg' },
  { k: ['coursehero.com', 'course hero'], n: 'Course Hero' },
  { k: ['studocu.com'], n: 'StuDocu' },
  { k: ['bartleby.com'], n: 'Bartleby' },
  { k: ['sparknotes.com'], n: 'SparkNotes' },
  { k: ['cliffsnotes.com'], n: 'CliffsNotes' },
  { k: ['shmoop.com'], n: 'Shmoop' },
  { k: ['gradesaver.com'], n: 'GradeSaver' },
  { k: ['masterclass.com', 'masterclass -'], n: 'MasterClass' },
  { k: ['brilliant.org', 'brilliant -'], n: 'Brilliant' },
  { k: ['outschool.com'], n: 'Outschool' },
  { k: ['varsitytutors.com'], n: 'Varsity Tutors' },
  { k: ['wyzant.com'], n: 'Wyzant' },
  { k: ['tutor.com'], n: 'Tutor.com' },
  { k: ['kaplan.com'], n: 'Kaplan' },
  { k: ['princetonreview.com'], n: 'Princeton Review' },
  { k: ['testmasters.com'], n: 'TestMasters' },
  { k: ['magoosh.com'], n: 'Magoosh' },
  { k: ['prepscholar.com'], n: 'PrepScholar' },
  { k: ['collegeboard.org'], n: 'College Board' },
  { k: ['act.org'], n: 'ACT' },
  { k: ['ets.org'], n: 'ETS' },
  { k: ['commonapp.org'], n: 'Common App' },
  { k: ['niche.com'], n: 'Niche' },
  { k: ['usnews.com/education', 'us news rankings'], n: 'US News Rankings' },
  { k: ['mit.edu'], n: 'MIT' },
  { k: ['stanford.edu'], n: 'Stanford' },
  { k: ['harvard.edu'], n: 'Harvard' },
  { k: ['berkeley.edu'], n: 'UC Berkeley' },
  { k: ['ocw.mit.edu'], n: 'MIT OpenCourseWare' },
  { k: ['open.edu'], n: 'Open University' },
  { k: ['futurelearn.com'], n: 'FutureLearn' },
  { k: ['alison.com'], n: 'Alison' },
  { k: ['openlearning.com'], n: 'OpenLearning' },
  { k: ['class-central.com'], n: 'Class Central' },
  { k: ['mooc.org'], n: 'MOOC.org' },
  { k: ['instructables.com'], n: 'Instructables' },
  { k: ['wikihow.com', 'wikihow -'], n: 'WikiHow' },
  { k: ['howstuffworks.com'], n: 'HowStuffWorks' },
  { k: ['ted.com', 'ted talks'], n: 'TED' },
  { k: ['ted-ed.com', 'ed.ted.com'], n: 'TED-Ed' },
  { k: ['lumosity.com'], n: 'Lumosity' },
  { k: ['elevateapp.com'], n: 'Elevate' },
  { k: ['peakapp.com'], n: 'Peak' },
  { k: ['cognifit.com'], n: 'CogniFit' },
  { k: ['brainhq.com'], n: 'BrainHQ' },

  // MUSIC & AUDIO
  { k: ['open.spotify', 'spotify.com', 'spotify -'], n: 'Spotify (Web)' },
  { k: ['music.apple', 'apple music'], n: 'Apple Music (Web)' },
  { k: ['music.youtube', 'youtube music'], n: 'YouTube Music' },
  { k: ['soundcloud.com', 'soundcloud -'], n: 'SoundCloud' },
  { k: ['bandcamp.com', 'bandcamp -'], n: 'Bandcamp' },
  { k: ['tidal.com', 'tidal -'], n: 'Tidal' },
  { k: ['deezer.com', 'deezer -'], n: 'Deezer' },
  { k: ['pandora.com', 'pandora -'], n: 'Pandora' },
  { k: ['iheartradio.com', 'iheart -'], n: 'iHeartRadio' },
  { k: ['tunein.com'], n: 'TuneIn' },
  { k: ['last.fm'], n: 'Last.fm' },
  { k: ['discogs.com'], n: 'Discogs' },
  { k: ['genius.com', 'genius lyrics'], n: 'Genius' },
  { k: ['azlyrics.com'], n: 'AZLyrics' },
  { k: ['musixmatch.com'], n: 'Musixmatch' },
  { k: ['songsterr.com'], n: 'Songsterr' },
  { k: ['ultimate-guitar.com', 'ultimate guitar'], n: 'Ultimate Guitar' },
  { k: ['chordify.net'], n: 'Chordify' },
  { k: ['hooktheory.com'], n: 'Hooktheory' },
  { k: ['splice.com'], n: 'Splice' },
  { k: ['landr.com'], n: 'LANDR' },
  { k: ['distrokid.com'], n: 'DistroKid' },
  { k: ['cdbaby.com'], n: 'CD Baby' },
  { k: ['tunecore.com'], n: 'TuneCore' },
  { k: ['beatstars.com'], n: 'BeatStars' },
  { k: ['audiojungle.net'], n: 'AudioJungle' },
  { k: ['epidemicsound.com'], n: 'Epidemic Sound' },
  { k: ['artlist.io'], n: 'Artlist' },
  { k: ['musicbed.com'], n: 'Musicbed' },
  { k: ['audible.com', 'audible -'], n: 'Audible' },
  { k: ['libro.fm'], n: 'Libro.fm' },
  { k: ['chirpbooks.com'], n: 'Chirp' },
  { k: ['podcasts.apple', 'apple podcasts'], n: 'Apple Podcasts' },
  { k: ['pocketcasts.com'], n: 'Pocket Casts' },
  { k: ['overcast.fm'], n: 'Overcast' },
  { k: ['castro.fm'], n: 'Castro' },
  { k: ['anchor.fm'], n: 'Anchor' },
  { k: ['buzzsprout.com'], n: 'Buzzsprout' },
  { k: ['transistor.fm'], n: 'Transistor' },
  { k: ['podbean.com'], n: 'Podbean' },

  // FINANCE
  { k: ['robinhood.com', 'robinhood -'], n: 'Robinhood' },
  { k: ['coinbase.com', 'coinbase -'], n: 'Coinbase' },
  { k: ['binance.com', 'binance -'], n: 'Binance' },
  { k: ['paypal.com', 'paypal -'], n: 'PayPal' },
  { k: ['venmo.com', 'venmo -'], n: 'Venmo' },
  { k: ['chase.com', 'chase bank'], n: 'Chase' },
  { k: ['bankofamerica.com', 'bank of america'], n: 'Bank of America' },
  { k: ['wellsfargo.com', 'wells fargo'], n: 'Wells Fargo' },
  { k: ['citi.com', 'citibank'], n: 'Citibank' },
  { k: ['capitalone.com', 'capital one'], n: 'Capital One' },
  { k: ['discover.com', 'discover card'], n: 'Discover' },
  { k: ['americanexpress.com', 'amex'], n: 'American Express' },
  { k: ['usbank.com', 'us bank'], n: 'US Bank' },
  { k: ['pnc.com', 'pnc bank'], n: 'PNC Bank' },
  { k: ['tdbank.com', 'td bank'], n: 'TD Bank' },
  { k: ['ally.com', 'ally bank'], n: 'Ally Bank' },
  { k: ['marcus.com', 'marcus by goldman'], n: 'Marcus' },
  { k: ['sofi.com', 'sofi -'], n: 'SoFi' },
  { k: ['chime.com', 'chime -'], n: 'Chime' },
  { k: ['current.com'], n: 'Current' },
  { k: ['varo.com'], n: 'Varo' },
  { k: ['monzo.com'], n: 'Monzo' },
  { k: ['revolut.com', 'revolut -'], n: 'Revolut' },
  { k: ['n26.com'], n: 'N26' },
  { k: ['wise.com', 'transferwise'], n: 'Wise' },
  { k: ['zelle.com'], n: 'Zelle' },
  { k: ['cashapp.com', 'cash app'], n: 'Cash App' },
  { k: ['stripe.com', 'dashboard.stripe'], n: 'Stripe' },
  { k: ['braintree.com', 'braintreegateway'], n: 'Braintree' },
  { k: ['square.com'], n: 'Square' },
  { k: ['plaid.com'], n: 'Plaid' },
  { k: ['fidelity.com', 'fidelity -'], n: 'Fidelity' },
  { k: ['schwab.com', 'charles schwab'], n: 'Charles Schwab' },
  { k: ['vanguard.com', 'vanguard -'], n: 'Vanguard' },
  { k: ['tdameritrade.com'], n: 'TD Ameritrade' },
  { k: ['etrade.com', 'e*trade'], n: 'E*TRADE' },
  { k: ['interactivebrokers.com'], n: 'Interactive Brokers' },
  { k: ['webull.com', 'webull -'], n: 'Webull' },
  { k: ['m1finance.com'], n: 'M1 Finance' },
  { k: ['acorns.com'], n: 'Acorns' },
  { k: ['stash.com'], n: 'Stash' },
  { k: ['betterment.com'], n: 'Betterment' },
  { k: ['wealthfront.com'], n: 'Wealthfront' },
  { k: ['personalcapital.com'], n: 'Personal Capital' },
  { k: ['mint.com', 'mint -'], n: 'Mint' },
  { k: ['ynab.com', 'youneedabudget'], n: 'YNAB' },
  { k: ['copilot.money'], n: 'Copilot Money' },
  { k: ['simplifi.com'], n: 'Simplifi' },
  { k: ['nerdwallet.com'], n: 'NerdWallet' },
  { k: ['bankrate.com'], n: 'Bankrate' },
  { k: ['creditkarma.com', 'credit karma'], n: 'Credit Karma' },
  { k: ['experian.com'], n: 'Experian' },
  { k: ['equifax.com'], n: 'Equifax' },
  { k: ['transunion.com'], n: 'TransUnion' },
  { k: ['annualcreditreport.com'], n: 'Annual Credit Report' },
  { k: ['kraken.com', 'kraken -'], n: 'Kraken' },
  { k: ['gemini.com', 'gemini exchange'], n: 'Gemini Exchange' },
  { k: ['crypto.com'], n: 'Crypto.com' },
  { k: ['ftx.com'], n: 'FTX' },
  { k: ['kucoin.com'], n: 'KuCoin' },
  { k: ['bybit.com'], n: 'Bybit' },
  { k: ['okx.com'], n: 'OKX' },
  { k: ['blockchain.com'], n: 'Blockchain.com' },
  { k: ['metamask.io'], n: 'MetaMask' },
  { k: ['phantom.app'], n: 'Phantom' },
  { k: ['opensea.io'], n: 'OpenSea' },
  { k: ['rarible.com'], n: 'Rarible' },
  { k: ['foundation.app'], n: 'Foundation' },
  { k: ['blur.io'], n: 'Blur' },
  { k: ['uniswap.org'], n: 'Uniswap' },
  { k: ['aave.com'], n: 'Aave' },
  { k: ['compound.finance'], n: 'Compound' },
  { k: ['lido.fi'], n: 'Lido' },
  { k: ['etherscan.io'], n: 'Etherscan' },
  { k: ['polygonscan.com'], n: 'PolygonScan' },
  { k: ['bscscan.com'], n: 'BscScan' },
  { k: ['dextools.io'], n: 'DEXTools' },
  { k: ['coingecko.com'], n: 'CoinGecko' },
  { k: ['coinmarketcap.com'], n: 'CoinMarketCap' },
  { k: ['tradingview.com', 'tradingview -'], n: 'TradingView' },
  { k: ['investing.com', 'investing -'], n: 'Investing.com' },
  { k: ['seekingalpha.com', 'seeking alpha'], n: 'Seeking Alpha' },
  { k: ['marketwatch.com', 'marketwatch -'], n: 'MarketWatch' },
  { k: ['finance.yahoo', 'yahoo finance'], n: 'Yahoo Finance' },
  { k: ['google.com/finance', 'google finance'], n: 'Google Finance' },

  // ENTERTAINMENT
  { k: ['imdb.com', 'imdb -'], n: 'IMDb' },
  { k: ['rottentomatoes.com', 'rotten tomatoes'], n: 'Rotten Tomatoes' },
  { k: ['metacritic.com'], n: 'Metacritic' },
  { k: ['9gag.com', '9gag -'], n: '9GAG' },
  { k: ['imgur.com', 'imgur -'], n: 'Imgur' },
  { k: ['giphy.com'], n: 'Giphy' },
  { k: ['tenor.com'], n: 'Tenor' },
  { k: ['knowyourmeme.com'], n: 'Know Your Meme' },
  { k: ['fandom.com'], n: 'Fandom' },
  { k: ['tvtropes.org'], n: 'TV Tropes' },
  { k: ['screenrant.com'], n: 'Screen Rant' },
  { k: ['collider.com'], n: 'Collider' },
  { k: ['ew.com', 'entertainment weekly'], n: 'Entertainment Weekly' },
  { k: ['variety.com', 'variety -'], n: 'Variety' },
  { k: ['hollywoodreporter.com'], n: 'Hollywood Reporter' },
  { k: ['deadline.com', 'deadline -'], n: 'Deadline' },
  { k: ['indiewire.com'], n: 'IndieWire' },
  { k: ['vulture.com'], n: 'Vulture' },
  { k: ['avclub.com'], n: 'AV Club' },
  { k: ['pitchfork.com'], n: 'Pitchfork' },
  { k: ['rollingstone.com'], n: 'Rolling Stone' },
  { k: ['billboard.com'], n: 'Billboard' },
  { k: ['nme.com'], n: 'NME' },
  { k: ['consequence.net'], n: 'Consequence' },
  { k: ['stereogum.com'], n: 'Stereogum' },
  { k: ['brooklynvegan.com'], n: 'Brooklyn Vegan' },
  { k: ['tmz.com'], n: 'TMZ' },
  { k: ['people.com'], n: 'People' },
  { k: ['usmagazine.com'], n: 'Us Weekly' },
  { k: ['etonline.com'], n: 'ET Online' },
  { k: ['buzzfeed.com', 'buzzfeed -'], n: 'BuzzFeed' },
  { k: ['boredpanda.com'], n: 'Bored Panda' },
  { k: ['digg.com'], n: 'Digg' },
  { k: ['ranker.com'], n: 'Ranker' },
  { k: ['cracked.com'], n: 'Cracked' },
  { k: ['theonion.com'], n: 'The Onion' },
  { k: ['babylonbee.com'], n: 'Babylon Bee' },

  // GAMING
  { k: ['store.steampowered', 'steampowered.com', 'steam community'], n: 'Steam' },
  { k: ['epicgames.com', 'epic games'], n: 'Epic Games' },
  { k: ['gog.com'], n: 'GOG' },
  { k: ['humblebundle.com'], n: 'Humble Bundle' },
  { k: ['fanatical.com'], n: 'Fanatical' },
  { k: ['greenmangaming.com'], n: 'Green Man Gaming' },
  { k: ['itch.io', 'itch -'], n: 'itch.io' },
  { k: ['gamejolt.com'], n: 'Game Jolt' },
  { k: ['chess.com', 'chess -'], n: 'Chess.com' },
  { k: ['lichess.org', 'lichess -'], n: 'Lichess' },
  { k: ['wordle', 'nytimes.com/games'], n: 'NYT Games' },
  { k: ['ign.com', 'ign -'], n: 'IGN' },
  { k: ['gamespot.com', 'gamespot -'], n: 'GameSpot' },
  { k: ['polygon.com', 'polygon -'], n: 'Polygon' },
  { k: ['pcgamer.com'], n: 'PC Gamer' },
  { k: ['rockpapershotgun.com'], n: 'Rock Paper Shotgun' },
  { k: ['eurogamer.net'], n: 'Eurogamer' },
  { k: ['gamesradar.com'], n: 'GamesRadar+' },
  { k: ['destructoid.com'], n: 'Destructoid' },
  { k: ['dualshockers.com'], n: 'DualShockers' },
  { k: ['gameinformer.com'], n: 'Game Informer' },
  { k: ['thegamer.com'], n: 'TheGamer' },
  { k: ['gamerant.com'], n: 'Game Rant' },
  { k: ['gamefaqs.com', 'gamefaqs -'], n: 'GameFAQs' },
  { k: ['howlongtobeat.com'], n: 'HowLongToBeat' },
  { k: ['steamdb.info'], n: 'SteamDB' },
  { k: ['protondb.com'], n: 'ProtonDB' },
  { k: ['isthereanydeal.com'], n: 'IsThereAnyDeal' },
  { k: ['gg.deals'], n: 'GG.deals' },
  { k: ['nexusmods.com'], n: 'Nexus Mods' },
  { k: ['moddb.com'], n: 'ModDB' },
  { k: ['curseforge.com'], n: 'CurseForge' },
  { k: ['modrinth.com'], n: 'Modrinth' },
  { k: ['pcgamingwiki.com'], n: 'PCGamingWiki' },
  { k: ['speedrun.com'], n: 'Speedrun.com' },
  { k: ['tracker.gg'], n: 'Tracker.gg' },
  { k: ['op.gg'], n: 'OP.GG' },
  { k: ['u.gg'], n: 'U.GG' },
  { k: ['blitz.gg'], n: 'Blitz.gg' },
  { k: ['dotabuff.com'], n: 'Dotabuff' },
  { k: ['stratz.com'], n: 'Stratz' },
  { k: ['overbuff.com'], n: 'Overbuff' },
  { k: ['destinytracker.com'], n: 'Destiny Tracker' },
  { k: ['wowhead.com'], n: 'Wowhead' },
  { k: ['icy-veins.com'], n: 'Icy Veins' },
  { k: ['wowprogress.com'], n: 'WoWProgress' },
  { k: ['raider.io'], n: 'Raider.IO' },
  { k: ['warframe.market'], n: 'Warframe Market' },
  { k: ['prydwen.gg'], n: 'Prydwen' },
  { k: ['paimon.moe'], n: 'Paimon.moe' },
  { k: ['genshin.gg'], n: 'Genshin.gg' },
  { k: ['game8.co'], n: 'Game8' },
  { k: ['fextralife.com'], n: 'Fextralife' },
  { k: ['serebii.net'], n: 'Serebii' },
  { k: ['bulbapedia.bulbagarden'], n: 'Bulbapedia' },
  { k: ['smogon.com'], n: 'Smogon' },
  { k: ['pokemondb.net'], n: 'Pokémon Database' },
  { k: ['mariowiki.com'], n: 'Super Mario Wiki' },
  { k: ['zeldadungeon.net'], n: 'Zelda Dungeon' },
  { k: ['battlenet.com', 'battle.net'], n: 'Battle.net' },
  { k: ['playstation.com'], n: 'PlayStation' },
  { k: ['xbox.com'], n: 'Xbox' },
  { k: ['nintendo.com'], n: 'Nintendo' },
  { k: ['ubisoft.com'], n: 'Ubisoft' },
  { k: ['ea.com'], n: 'EA' },
  { k: ['roblox.com', 'roblox -'], n: 'Roblox' },
  { k: ['minecraft.net'], n: 'Minecraft' },
  { k: ['fortnite.com'], n: 'Fortnite' },
  { k: ['leagueoflegends.com'], n: 'League of Legends' },
  { k: ['dota2.com'], n: 'Dota 2' },
  { k: ['valorant.com'], n: 'Valorant' },
  { k: ['counter-strike.net'], n: 'Counter-Strike' },
  { k: ['faceit.com'], n: 'FACEIT' },
  { k: ['esea.net'], n: 'ESEA' },
  { k: ['esportsearnings.com'], n: 'Esports Earnings' },
  { k: ['liquipedia.net'], n: 'Liquipedia' },
  { k: ['hltv.org'], n: 'HLTV' },
  { k: ['vlr.gg'], n: 'VLR.gg' },
  { k: ['over.gg'], n: 'Over.gg' },

  // TRAVEL
  { k: ['booking.com', 'booking -'], n: 'Booking.com' },
  { k: ['airbnb.com', 'airbnb -'], n: 'Airbnb' },
  { k: ['vrbo.com'], n: 'Vrbo' },
  { k: ['hotels.com', 'hotels -'], n: 'Hotels.com' },
  { k: ['expedia.com', 'expedia -'], n: 'Expedia' },
  { k: ['priceline.com'], n: 'Priceline' },
  { k: ['hotwire.com'], n: 'Hotwire' },
  { k: ['orbitz.com'], n: 'Orbitz' },
  { k: ['travelocity.com'], n: 'Travelocity' },
  { k: ['cheaptickets.com'], n: 'CheapTickets' },
  { k: ['kayak.com', 'kayak -'], n: 'Kayak' },
  { k: ['skyscanner.com', 'skyscanner -'], n: 'Skyscanner' },
  { k: ['google.com/flights', 'google flights'], n: 'Google Flights' },
  { k: ['momondo.com'], n: 'Momondo' },
  { k: ['hopper.com'], n: 'Hopper' },
  { k: ['kiwi.com'], n: 'Kiwi.com' },
  { k: ['flightaware.com'], n: 'FlightAware' },
  { k: ['flightradar24.com'], n: 'Flightradar24' },
  { k: ['seatguru.com'], n: 'SeatGuru' },
  { k: ['tripadvisor.com', 'tripadvisor -'], n: 'TripAdvisor' },
  { k: ['lonelyplanet.com'], n: 'Lonely Planet' },
  { k: ['frommers.com'], n: "Frommer's" },
  { k: ['fodors.com'], n: "Fodor's" },
  { k: ['atlasobscura.com'], n: 'Atlas Obscura' },
  { k: ['roadtrippers.com'], n: 'Roadtrippers' },
  { k: ['rome2rio.com'], n: 'Rome2Rio' },
  { k: ['wanderlog.com'], n: 'Wanderlog' },
  { k: ['tripit.com'], n: 'TripIt' },
  { k: ['hostelworld.com'], n: 'Hostelworld' },
  { k: ['couchsurfing.com'], n: 'Couchsurfing' },
  { k: ['homeaway.com'], n: 'HomeAway' },
  { k: ['trustedhousesitters.com'], n: 'TrustedHousesitters' },
  { k: ['rentalcars.com'], n: 'Rentalcars.com' },
  { k: ['enterprise.com'], n: 'Enterprise' },
  { k: ['hertz.com'], n: 'Hertz' },
  { k: ['avis.com'], n: 'Avis' },
  { k: ['budget.com'], n: 'Budget' },
  { k: ['turo.com'], n: 'Turo' },
  { k: ['getaround.com'], n: 'Getaround' },
  { k: ['uber.com'], n: 'Uber' },
  { k: ['lyft.com'], n: 'Lyft' },
  { k: ['amtrak.com'], n: 'Amtrak' },
  { k: ['greyhound.com'], n: 'Greyhound' },
  { k: ['flixbus.com'], n: 'FlixBus' },
  { k: ['megabus.com'], n: 'Megabus' },
  { k: ['cruisecritic.com'], n: 'Cruise Critic' },
  { k: ['carnival.com'], n: 'Carnival Cruise' },
  { k: ['royalcaribbean.com'], n: 'Royal Caribbean' },
  { k: ['norwegian.com'], n: 'Norwegian Cruise' },
  { k: ['united.com'], n: 'United Airlines' },
  { k: ['aa.com', 'american airlines'], n: 'American Airlines' },
  { k: ['delta.com'], n: 'Delta Airlines' },
  { k: ['southwest.com'], n: 'Southwest Airlines' },
  { k: ['jetblue.com'], n: 'JetBlue' },
  { k: ['spirit.com'], n: 'Spirit Airlines' },
  { k: ['frontier.com'], n: 'Frontier Airlines' },
  { k: ['alaskaair.com'], n: 'Alaska Airlines' },
  { k: ['britishairways.com'], n: 'British Airways' },
  { k: ['lufthansa.com'], n: 'Lufthansa' },
  { k: ['emirates.com'], n: 'Emirates' },

  // FOOD
  { k: ['yelp.com', 'yelp -'], n: 'Yelp' },
  { k: ['doordash.com', 'doordash -'], n: 'DoorDash' },
  { k: ['ubereats.com', 'uber eats'], n: 'Uber Eats' },
  { k: ['grubhub.com', 'grubhub -'], n: 'Grubhub' },
  { k: ['postmates.com'], n: 'Postmates' },
  { k: ['seamless.com'], n: 'Seamless' },
  { k: ['caviar.com'], n: 'Caviar' },
  { k: ['delivery.com'], n: 'Delivery.com' },
  { k: ['gopuff.com'], n: 'GoPuff' },
  { k: ['allrecipes.com', 'allrecipes -'], n: 'Allrecipes' },
  { k: ['epicurious.com', 'epicurious -'], n: 'Epicurious' },
  { k: ['foodnetwork.com', 'food network'], n: 'Food Network' },
  { k: ['bonappetit.com', 'bon appetit'], n: 'Bon Appetit' },
  { k: ['tasty.co', 'buzzfeedtasty'], n: 'Tasty' },
  { k: ['seriouseats.com'], n: 'Serious Eats' },
  { k: ['cooking.nytimes.com', 'nyt cooking'], n: 'NYT Cooking' },
  { k: ['food52.com'], n: 'Food52' },
  { k: ['thekitchn.com'], n: 'The Kitchn' },
  { k: ['simplyrecipes.com'], n: 'Simply Recipes' },
  { k: ['delish.com'], n: 'Delish' },
  { k: ['tasteofhome.com'], n: 'Taste of Home' },
  { k: ['bettycrocker.com'], n: 'Betty Crocker' },
  { k: ['pillsbury.com'], n: 'Pillsbury' },
  { k: ['cookinglight.com'], n: 'Cooking Light' },
  { k: ['eatingwell.com'], n: 'EatingWell' },
  { k: ['myrecipes.com'], n: 'MyRecipes' },
  { k: ['yummly.com'], n: 'Yummly' },
  { k: ['supercook.com'], n: 'Supercook' },
  { k: ['budgetbytes.com'], n: 'Budget Bytes' },
  { k: ['skinnytaste.com'], n: 'Skinnytaste' },
  { k: ['minimalistbaker.com'], n: 'Minimalist Baker' },
  { k: ['halfbakedharvest.com'], n: 'Half Baked Harvest' },
  { k: ['smittenkitchen.com'], n: 'Smitten Kitchen' },
  { k: ['thepioneerwoman.com'], n: 'Pioneer Woman' },
  { k: ['damndelicious.net'], n: 'Damn Delicious' },
  { k: ['sallysbakingaddiction.com'], n: "Sally's Baking Addiction" },
  { k: ['kingarthurbaking.com'], n: 'King Arthur Baking' },
  { k: ['hellofresh.com'], n: 'HelloFresh' },
  { k: ['blueapron.com'], n: 'Blue Apron' },
  { k: ['homechef.com'], n: 'Home Chef' },
  { k: ['sunbasket.com'], n: 'Sun Basket' },
  { k: ['greenchef.com'], n: 'Green Chef' },
  { k: ['factor75.com', 'factor meals'], n: 'Factor' },

  // SPORTS
  { k: ['espn.com', 'espn -'], n: 'ESPN' },
  { k: ['sports.yahoo.com', 'yahoo sports'], n: 'Yahoo Sports' },
  { k: ['cbssports.com', 'cbs sports'], n: 'CBS Sports' },
  { k: ['foxsports.com', 'fox sports'], n: 'Fox Sports' },
  { k: ['nbcsports.com', 'nbc sports'], n: 'NBC Sports' },
  { k: ['bleacherreport.com', 'bleacher report'], n: 'Bleacher Report' },
  { k: ['si.com', 'sports illustrated'], n: 'Sports Illustrated' },
  { k: ['theathletic.com', 'the athletic'], n: 'The Athletic' },
  { k: ['nfl.com', 'nfl -'], n: 'NFL' },
  { k: ['nba.com', 'nba -'], n: 'NBA' },
  { k: ['mlb.com', 'mlb -'], n: 'MLB' },
  { k: ['nhl.com', 'nhl -'], n: 'NHL' },
  { k: ['mls.com', 'mls soccer'], n: 'MLS' },
  { k: ['premierleague.com'], n: 'Premier League' },
  { k: ['laliga.com'], n: 'La Liga' },
  { k: ['bundesliga.com'], n: 'Bundesliga' },
  { k: ['seriea.com'], n: 'Serie A' },
  { k: ['ligue1.com'], n: 'Ligue 1' },
  { k: ['uefa.com'], n: 'UEFA' },
  { k: ['fifa.com'], n: 'FIFA' },
  { k: ['transfermarkt.com'], n: 'Transfermarkt' },
  { k: ['flashscore.com'], n: 'Flashscore' },
  { k: ['sofascore.com'], n: 'Sofascore' },
  { k: ['livescore.com'], n: 'LiveScore' },
  { k: ['365scores.com'], n: '365Scores' },
  { k: ['pgatour.com'], n: 'PGA Tour' },
  { k: ['atptour.com'], n: 'ATP Tour' },
  { k: ['wtatennis.com'], n: 'WTA' },
  { k: ['formula1.com'], n: 'Formula 1' },
  { k: ['nascar.com'], n: 'NASCAR' },
  { k: ['motogp.com'], n: 'MotoGP' },
  { k: ['ufc.com'], n: 'UFC' },
  { k: ['wwe.com'], n: 'WWE' },
  { k: ['olympics.com'], n: 'Olympics' },
  { k: ['ncaa.com', 'ncaa -'], n: 'NCAA' },
  { k: ['247sports.com'], n: '247Sports' },
  { k: ['rivals.com'], n: 'Rivals' },
  { k: ['on3.com'], n: 'On3' },
  { k: ['espnfc.com', 'espn fc'], n: 'ESPN FC' },
  { k: ['goal.com'], n: 'Goal.com' },
  { k: ['skysports.com'], n: 'Sky Sports' },
  { k: ['bbc.com/sport'], n: 'BBC Sport' },
  { k: ['draftkings.com'], n: 'DraftKings' },
  { k: ['fanduel.com'], n: 'FanDuel' },
  { k: ['espn.com/fantasy', 'espn fantasy'], n: 'ESPN Fantasy' },
  { k: ['fantasypros.com'], n: 'FantasyPros' },
  { k: ['rotowire.com'], n: 'RotoWire' },
  { k: ['numberfire.com'], n: 'numberFire' },
  { k: ['strava.com', 'strava -'], n: 'Strava' },
  { k: ['mapmyrun.com'], n: 'MapMyRun' },
  { k: ['runkeeper.com'], n: 'Runkeeper' },

  // HEALTH
  { k: ['myfitnesspal.com', 'myfitnesspal -'], n: 'MyFitnessPal' },
  { k: ['fitbit.com'], n: 'Fitbit' },
  { k: ['peloton.com'], n: 'Peloton' },
  { k: ['nike.com/ntc', 'nike training club'], n: 'Nike Training Club' },
  { k: ['headspace.com', 'headspace -'], n: 'Headspace' },
  { k: ['calm.com', 'calm -'], n: 'Calm' },
  { k: ['insighttimer.com'], n: 'Insight Timer' },
  { k: ['ten percent happier', 'tenpercent.com'], n: 'Ten Percent Happier' },
  { k: ['waking up', 'wakingup.com'], n: 'Waking Up' },
  { k: ['balance.app'], n: 'Balance' },
  { k: ['noom.com'], n: 'Noom' },
  { k: ['weightwatchers.com', 'ww.com'], n: 'WW (Weight Watchers)' },
  { k: ['loseit.com'], n: 'Lose It!' },
  { k: ['cronometer.com'], n: 'Cronometer' },
  { k: ['lifesum.com'], n: 'Lifesum' },
  { k: ['carbmanager.com'], n: 'Carb Manager' },
  { k: ['fatsecret.com'], n: 'FatSecret' },
  { k: ['webmd.com', 'webmd -'], n: 'WebMD' },
  { k: ['mayoclinic.org'], n: 'Mayo Clinic' },
  { k: ['healthline.com'], n: 'Healthline' },
  { k: ['medicalnewstoday.com'], n: 'Medical News Today' },
  { k: ['verywellhealth.com'], n: 'Verywell Health' },
  { k: ['clevelandclinic.org'], n: 'Cleveland Clinic' },
  { k: ['nih.gov'], n: 'NIH' },
  { k: ['cdc.gov'], n: 'CDC' },
  { k: ['who.int'], n: 'WHO' },
  { k: ['drugs.com'], n: 'Drugs.com' },
  { k: ['rxlist.com'], n: 'RxList' },
  { k: ['goodrx.com'], n: 'GoodRx' },
  { k: ['zocdoc.com'], n: 'Zocdoc' },
  { k: ['teladoc.com'], n: 'Teladoc' },
  { k: ['mdlive.com'], n: 'MDLIVE' },
  { k: ['amwell.com'], n: 'Amwell' },
  { k: ['onemedical.com'], n: 'One Medical' },
  { k: ['hims.com'], n: 'Hims' },
  { k: ['forhers.com'], n: 'Hers' },
  { k: ['ro.co'], n: 'Ro' },
  { k: ['nurx.com'], n: 'Nurx' },
  { k: ['23andme.com'], n: '23andMe' },
  { k: ['ancestry.com'], n: 'Ancestry' },
  { k: ['bodybuilding.com'], n: 'Bodybuilding.com' },
  { k: ['muscleandstrength.com'], n: 'Muscle & Strength' },
  { k: ['t-nation.com'], n: 'T-Nation' },
  { k: ['strengthlevel.com'], n: 'Strength Level' },
  { k: ['exrx.net'], n: 'ExRx.net' },
  { k: ['fitnessblender.com'], n: 'Fitness Blender' },
  { k: ['blogilates.com'], n: 'Blogilates' },
  { k: ['darebee.com'], n: 'DAREBEE' },
  { k: ['yogawithadriene.com'], n: 'Yoga With Adriene' },
  { k: ['downdog.com', 'down dog'], n: 'Down Dog' },

  // DESIGN & CREATIVE
  { k: ['dribbble.com', 'dribbble -'], n: 'Dribbble' },
  { k: ['behance.net', 'behance -'], n: 'Behance' },
  { k: ['awwwards.com'], n: 'Awwwards' },
  { k: ['siteinspire.com'], n: 'siteInspire' },
  { k: ['cssdesignawards.com'], n: 'CSS Design Awards' },
  { k: ['onepagelove.com'], n: 'One Page Love' },
  { k: ['landingfolio.com'], n: 'Landingfolio' },
  { k: ['lapa.ninja'], n: 'Lapa Ninja' },
  { k: ['godly.website'], n: 'Godly' },
  { k: ['mobbin.com'], n: 'Mobbin' },
  { k: ['screenlane.com'], n: 'Screenlane' },
  { k: ['uigarage.net'], n: 'UI Garage' },
  { k: ['collectui.com'], n: 'Collect UI' },
  { k: ['uxarchive.com'], n: 'UX Archive' },
  { k: ['designspiration.com'], n: 'Designspiration' },
  { k: ['muzli.com'], n: 'Muzli' },
  { k: ['abduzeedo.com'], n: 'Abduzeedo' },
  { k: ['thedesigninspiration.com'], n: 'The Design Inspiration' },
  { k: ['creativebloq.com'], n: 'Creative Bloq' },
  { k: ['designmodo.com'], n: 'Designmodo' },
  { k: ['uxdesign.cc'], n: 'UX Collective' },
  { k: ['nngroup.com'], n: 'Nielsen Norman Group' },
  { k: ['uxplanet.org'], n: 'UX Planet' },
  { k: ['uxpin.com'], n: 'UXPin' },
  { k: ['invisionapp.com'], n: 'InVision' },
  { k: ['sketch.com'], n: 'Sketch' },
  { k: ['adobe.com', 'adobe -'], n: 'Adobe' },
  { k: ['creative.adobe.com'], n: 'Adobe Creative Cloud' },
  { k: ['color.adobe.com'], n: 'Adobe Color' },
  { k: ['fonts.adobe.com'], n: 'Adobe Fonts' },
  { k: ['stock.adobe.com'], n: 'Adobe Stock' },
  { k: ['unsplash.com', 'unsplash -'], n: 'Unsplash' },
  { k: ['pexels.com', 'pexels -'], n: 'Pexels' },
  { k: ['pixabay.com'], n: 'Pixabay' },
  { k: ['shutterstock.com'], n: 'Shutterstock' },
  { k: ['istockphoto.com', 'istock'], n: 'iStock' },
  { k: ['gettyimages.com'], n: 'Getty Images' },
  { k: ['envato.com'], n: 'Envato' },
  { k: ['elements.envato.com'], n: 'Envato Elements' },
  { k: ['themeforest.net'], n: 'ThemeForest' },
  { k: ['graphicriver.net'], n: 'GraphicRiver' },
  { k: ['creativemarket.com'], n: 'Creative Market' },
  { k: ['designcuts.com'], n: 'Design Cuts' },
  { k: ['fonts.google.com', 'google fonts'], n: 'Google Fonts' },
  { k: ['fontsquirrel.com'], n: 'Font Squirrel' },
  { k: ['dafont.com'], n: 'DaFont' },
  { k: ['fontshare.com'], n: 'Fontshare' },
  { k: ['typewolf.com'], n: 'Typewolf' },
  { k: ['fontpair.co'], n: 'FontPair' },
  { k: ['coolors.co'], n: 'Coolors' },
  { k: ['colorhunt.co'], n: 'Color Hunt' },
  { k: ['colorsinspo.com'], n: 'Colors & Fonts' },
  { k: ['happyhues.co'], n: 'Happy Hues' },
  { k: ['flatuicolors.com'], n: 'Flat UI Colors' },
  { k: ['materialui.co'], n: 'Material UI Colors' },

  // REFERENCE & TOOLS
  { k: ['wikipedia.org', 'wikipedia -'], n: 'Wikipedia' },
  { k: ['quora.com', 'quora -'], n: 'Quora' },
  { k: ['translate.google', 'google translate'], n: 'Google Translate' },
  { k: ['deepl.com', 'deepl translator'], n: 'DeepL' },
  { k: ['reverso.net'], n: 'Reverso' },
  { k: ['linguee.com'], n: 'Linguee' },
  { k: ['wordreference.com'], n: 'WordReference' },
  { k: ['thesaurus.com'], n: 'Thesaurus.com' },
  { k: ['dictionary.com'], n: 'Dictionary.com' },
  { k: ['merriam-webster.com'], n: 'Merriam-Webster' },
  { k: ['oxfordlearnersdictionaries.com'], n: 'Oxford Dictionary' },
  { k: ['cambridge.org/dictionary'], n: 'Cambridge Dictionary' },
  { k: ['urbandictionary.com'], n: 'Urban Dictionary' },
  { k: ['weather.com', 'weather channel'], n: 'Weather.com' },
  { k: ['accuweather.com'], n: 'AccuWeather' },
  { k: ['wunderground.com', 'weather underground'], n: 'Weather Underground' },
  { k: ['weather.gov'], n: 'Weather.gov' },
  { k: ['windy.com'], n: 'Windy' },
  { k: ['timeanddate.com'], n: 'Time and Date' },
  { k: ['worldtimebuddy.com'], n: 'World Time Buddy' },
  { k: ['xe.com', 'xe currency'], n: 'XE' },
  { k: ['oanda.com'], n: 'OANDA' },
  { k: ['calculator.net'], n: 'Calculator.net' },
  { k: ['wolframalpha.com', 'wolfram alpha'], n: 'Wolfram Alpha' },
  { k: ['mathway.com'], n: 'Mathway' },
  { k: ['symbolab.com'], n: 'Symbolab' },
  { k: ['desmos.com'], n: 'Desmos' },
  { k: ['geogebra.org'], n: 'GeoGebra' },
  { k: ['archive.org', 'internet archive'], n: 'Internet Archive' },
  { k: ['web.archive.org', 'wayback machine'], n: 'Wayback Machine' },
  { k: ['gutenberg.org', 'project gutenberg'], n: 'Project Gutenberg' },
  { k: ['libgen', 'library genesis'], n: 'Library Genesis' },
  { k: ['sci-hub'], n: 'Sci-Hub' },
  { k: ['scholar.google', 'google scholar'], n: 'Google Scholar' },
  { k: ['jstor.org'], n: 'JSTOR' },
  { k: ['researchgate.net'], n: 'ResearchGate' },
  { k: ['academia.edu'], n: 'Academia.edu' },
  { k: ['arxiv.org'], n: 'arXiv' },
  { k: ['ssrn.com'], n: 'SSRN' },
  { k: ['pubmed.ncbi', 'pubmed.gov'], n: 'PubMed' },
  { k: ['semanticscholar.org'], n: 'Semantic Scholar' },
  { k: ['paperswithcode.com'], n: 'Papers With Code' },
  { k: ['overleaf.com'], n: 'Overleaf' },
  { k: ['sharelatex.com'], n: 'ShareLaTeX' },
  { k: ['zotero.org'], n: 'Zotero' },
  { k: ['mendeley.com'], n: 'Mendeley' },

  // SEARCH ENGINES
  { k: ['google.com/search', 'google -', 'www.google'], n: 'Google Search' },
  { k: ['bing.com', 'bing -'], n: 'Bing' },
  { k: ['duckduckgo.com', 'duckduckgo -'], n: 'DuckDuckGo' },
  { k: ['yahoo.com/search', 'search.yahoo'], n: 'Yahoo Search' },
  { k: ['ecosia.org'], n: 'Ecosia' },
  { k: ['startpage.com'], n: 'Startpage' },
  { k: ['qwant.com'], n: 'Qwant' },
  { k: ['brave.com/search', 'search.brave'], n: 'Brave Search' },
  { k: ['neeva.com'], n: 'Neeva' },
  { k: ['mojeek.com'], n: 'Mojeek' },
  { k: ['swisscows.com'], n: 'Swisscows' },
  { k: ['searx.me'], n: 'SearX' },
  { k: ['yandex.com'], n: 'Yandex' },
  { k: ['baidu.com'], n: 'Baidu' },
  { k: ['naver.com'], n: 'Naver' },

  // REAL ESTATE
  { k: ['zillow.com', 'zillow -'], n: 'Zillow' },
  { k: ['redfin.com', 'redfin -'], n: 'Redfin' },
  { k: ['realtor.com', 'realtor -'], n: 'Realtor.com' },
  { k: ['trulia.com', 'trulia -'], n: 'Trulia' },
  { k: ['apartments.com'], n: 'Apartments.com' },
  { k: ['rent.com'], n: 'Rent.com' },
  { k: ['hotpads.com'], n: 'HotPads' },
  { k: ['padmapper.com'], n: 'PadMapper' },
  { k: ['zumper.com'], n: 'Zumper' },
  { k: ['cozy.co'], n: 'Cozy' },
  { k: ['compass.com'], n: 'Compass' },
  { k: ['coldwellbanker.com'], n: 'Coldwell Banker' },
  { k: ['century21.com'], n: 'Century 21' },
  { k: ['kw.com', 'keller williams'], n: 'Keller Williams' },
  { k: ['remax.com', 're/max'], n: 'RE/MAX' },
  { k: ['sothebysrealty.com'], n: "Sotheby's Realty" },
  { k: ['loopnet.com'], n: 'LoopNet' },
  { k: ['crexi.com'], n: 'Crexi' },
  { k: ['reonomy.com'], n: 'Reonomy' },

  // JOBS
  { k: ['indeed.com', 'indeed -'], n: 'Indeed' },
  { k: ['linkedin.com/jobs', 'linkedin jobs'], n: 'LinkedIn Jobs' },
  { k: ['glassdoor.com', 'glassdoor -'], n: 'Glassdoor' },
  { k: ['monster.com', 'monster -'], n: 'Monster' },
  { k: ['ziprecruiter.com'], n: 'ZipRecruiter' },
  { k: ['careerbuilder.com'], n: 'CareerBuilder' },
  { k: ['dice.com'], n: 'Dice' },
  { k: ['simplyhired.com'], n: 'SimplyHired' },
  { k: ['snagajob.com'], n: 'Snagajob' },
  { k: ['flexjobs.com'], n: 'FlexJobs' },
  { k: ['remote.co'], n: 'Remote.co' },
  { k: ['weworkremotely.com'], n: 'We Work Remotely' },
  { k: ['remoteok.com'], n: 'Remote OK' },
  { k: ['angel.co/jobs', 'wellfound.com'], n: 'Wellfound (AngelList)' },
  { k: ['workatastartup.com'], n: 'Work at a Startup' },
  { k: ['ycombinator.com/jobs'], n: 'YC Jobs' },
  { k: ['levels.fyi'], n: 'Levels.fyi' },
  { k: ['teamblind.com', 'blind -'], n: 'Blind' },
  { k: ['comparably.com'], n: 'Comparably' },
  { k: ['vault.com'], n: 'Vault' },
  { k: ['theladders.com'], n: 'The Ladders' },
  { k: ['hired.com'], n: 'Hired' },
  { k: ['triplebyte.com'], n: 'Triplebyte' },
  { k: ['turing.com'], n: 'Turing' },
  { k: ['toptal.com'], n: 'Toptal' },
  { k: ['upwork.com', 'upwork -'], n: 'Upwork' },
  { k: ['fiverr.com', 'fiverr -'], n: 'Fiverr' },
  { k: ['freelancer.com'], n: 'Freelancer' },
  { k: ['99designs.com'], n: '99designs' },
  { k: ['contra.com'], n: 'Contra' },

  // SECURITY & VPN
  { k: ['1password.com'], n: '1Password' },
  { k: ['lastpass.com'], n: 'LastPass' },
  { k: ['dashlane.com'], n: 'Dashlane' },
  { k: ['bitwarden.com'], n: 'Bitwarden' },
  { k: ['nordpass.com'], n: 'NordPass' },
  { k: ['keepersecurity.com'], n: 'Keeper' },
  { k: ['nordvpn.com'], n: 'NordVPN' },
  { k: ['expressvpn.com'], n: 'ExpressVPN' },
  { k: ['surfshark.com'], n: 'Surfshark' },
  { k: ['protonvpn.com'], n: 'ProtonVPN' },
  { k: ['privateinternetaccess.com', 'privateinternetaccess'], n: 'Private Internet Access' },
  { k: ['mullvad.net'], n: 'Mullvad VPN' },
  { k: ['cyberghostvpn.com'], n: 'CyberGhost' },
  { k: ['ipvanish.com'], n: 'IPVanish' },
  { k: ['tunnelbear.com'], n: 'TunnelBear' },
  { k: ['windscribe.com'], n: 'Windscribe' },
  { k: ['haveibeenpwned.com'], n: 'Have I Been Pwned' },
  { k: ['virustotal.com'], n: 'VirusTotal' },
  { k: ['shodan.io'], n: 'Shodan' },
]

// ============================================================================
// Pre-computed structures
// ============================================================================

/** @type {Map<string, string>} single-word keyword -> displayName (O(1) lookup) */
const KEYWORD_LOOKUP = (() => {
  const map = new Map()
  for (const entry of WEBSITE_DATABASE) {
    for (const kw of entry.k) {
      map.set(kw, entry.n)
    }
  }
  return map
})()

/** @type {Array<[string, string]>} multi-word keywords for contains() fallback.
 * Single-token keywords (no space/dot/slash) are handled by the fast exact-match
 * lookup above. Anything with a separator character won't survive the tokenizer,
 * so it needs the contains() path - this includes "r/" for Reddit, "actions/"
 * for GitHub Actions, etc. */
const MULTI_WORD_KEYWORDS = (() => {
  const out = []
  for (const entry of WEBSITE_DATABASE) {
    for (const kw of entry.k) {
      if (kw.includes(' ') || kw.includes('.') || kw.includes('/')) {
        out.push([kw, entry.n])
      }
    }
  }
  return out
})()

/** @type {Set<string>} set of displayNames that came from the website DB */
const KNOWN_WEBSITE_NAMES = new Set(WEBSITE_DATABASE.map(e => e.n))

/** Browser app names (lowercase). Matches Swift browsersSet exactly. */
const BROWSERS_SET = new Set([
  'safari', 'chrome', 'google chrome', 'firefox', 'edge', 'microsoft edge',
  'brave', 'arc', 'opera', 'vivaldi', 'tor browser', 'duckduckgo',
  'chromium', 'waterfox', 'pale moon', 'seamonkey', 'maxthon', 'slimjet',
  'orion', 'zen browser', 'floorp', 'librewolf', 'ungoogled-chromium', 'dia',
])

/** Apps that exist as both native macOS apps AND websites. */
const NATIVE_MAC_APPS = new Set([
  // Productivity & Notes
  'Notion', 'Figma', 'Canva', 'Miro', 'Airtable', 'Coda',
  'Evernote', 'Todoist', 'TickTick', 'Any.do', 'Things',
  'Obsidian', 'Craft', 'Bear', 'Ulysses', 'Roam Research',
  // Communication
  'Slack', 'Discord', 'Telegram', 'WhatsApp', 'Signal',
  'Zoom', 'Microsoft Teams', 'Webex', 'Skype',
  // Development
  'Cursor', 'Visual Studio Code', 'VS Code', 'Atom',
  'Sublime Text', 'WebStorm', 'PyCharm', 'IntelliJ IDEA',
  'Xcode', 'Android Studio', 'Postman', 'Insomnia',
  'GitHub Desktop', 'GitKraken', 'Sourcetree', 'Tower',
  'iTerm', 'Terminal', 'Warp', 'Hyper',
  // Design
  'Sketch', 'Adobe XD', 'Adobe Photoshop', 'Adobe Illustrator',
  'Adobe Premiere Pro', 'Adobe After Effects', 'Affinity Designer',
  'Affinity Photo', 'Pixelmator Pro', 'Procreate',
  // Music & Media
  'Spotify', 'Apple Music', 'Music', 'VLC', 'IINA',
  'Plex', 'Infuse',
  // Office
  'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint',
  'Microsoft Outlook', 'Microsoft OneNote', 'Pages', 'Numbers',
  'Keynote',
  // Browsers
  'Safari', 'Google Chrome', 'Firefox', 'Microsoft Edge',
  'Brave Browser', 'Arc', 'Opera', 'Vivaldi', 'Chromium',
  // System
  'Finder', 'Preview', 'Calendar', 'Mail', 'Messages',
  'Notes', 'Reminders', 'Photos', 'FaceTime',
  'System Preferences', 'System Settings', 'Activity Monitor',
  // Other popular apps
  '1Password', 'Bitwarden', 'LastPass', 'Dashlane',
  'CleanMyMac', 'Alfred', 'Raycast', 'Bartender',
  'Dropbox', 'Google Drive', 'OneDrive', 'iCloud Drive',
  'Transmit', 'Cyberduck', 'FileZilla',
  'Linear', 'Height', 'Asana', 'Monday.com', 'ClickUp',
  'Trello', 'Basecamp', 'Wrike',
])

// ============================================================================
// Caches (match Swift LRU semantics: drop half when size >= max)
// ============================================================================

const MAX_CACHE_SIZE = 5000
/** @type {Map<string, string|null>} lowercased windowTitle -> displayName | null */
const extractionCache = new Map()

/** @type {Map<string, boolean>} lowercased appName -> isBrowser */
const browserCache = new Map()

function cacheGet(map, key) {
  return map.get(key)
}

function cacheSet(map, key, value) {
  if (map.size >= MAX_CACHE_SIZE) {
    // Drop oldest half. Map iterates in insertion order.
    const toDrop = Math.floor(MAX_CACHE_SIZE / 2)
    let i = 0
    for (const k of map.keys()) {
      if (i++ >= toDrop) break
      map.delete(k)
    }
  }
  map.set(key, value)
}

// ============================================================================
// Browser Detection
// ============================================================================

/**
 * Check if an application name is a known browser. Mirrors Swift isBrowser:
 *   - exact match in BROWSERS_SET, OR
 *   - appLower contains any entry in BROWSERS_SET (e.g. "google chrome canary").
 */
export function isBrowser(appName) {
  if (!appName) return false
  const appLower = appName.toLowerCase()

  const cached = cacheGet(browserCache, appLower)
  if (cached !== undefined) return cached

  if (BROWSERS_SET.has(appLower)) {
    cacheSet(browserCache, appLower, true)
    return true
  }

  let result = false
  for (const b of BROWSERS_SET) {
    if (appLower.includes(b)) {
      result = true
      break
    }
  }
  cacheSet(browserCache, appLower, result)
  return result
}

// ============================================================================
// Native App / Website Disambiguation
// ============================================================================

/**
 * Is this name a known native macOS app? Used to avoid treating e.g. "Notion"
 * the native app as the "Notion" website.
 *
 * Note: Swift version also checks /Applications/<Name>.app on disk. In JS we
 * can't do that synchronously from the renderer without a file-system bridge,
 * so we rely on the hardcoded list. That covers the vast majority of collisions.
 */
export function isNativeMacApp(name) {
  if (!name) return false
  return NATIVE_MAC_APPS.has(name)
}

/**
 * Is this display name a "website" (produced by browser extraction) rather
 * than a native app?
 */
export function isWebsite(name) {
  if (!name) return false
  if (name.includes('(Web)')) return true
  if (isNativeMacApp(name)) return false
  return KNOWN_WEBSITE_NAMES.has(name)
}

// ============================================================================
// Keyword Matching
// ============================================================================

/**
 * Fast keyword matching using the pre-built dictionary + multi-word contains.
 * Mirrors Swift matchKeywordFast: splits on " -|·•:", checks each token in the
 * O(1) map, then falls back to contains() for multi-word keywords.
 */
function matchKeywordFast(titleLower) {
  // Split on separators identical to Swift's CharacterSet(" -|·•:")
  const words = titleLower.split(/[ \-|·•:]+/).map(s => s.trim()).filter(Boolean)

  for (const word of words) {
    const found = KEYWORD_LOOKUP.get(word)
    if (found) return found
  }

  for (const [kw, name] of MULTI_WORD_KEYWORDS) {
    if (titleLower.includes(kw)) return name
  }

  return null
}

// ============================================================================
// Pattern Parsing (fallback)
// ============================================================================

const BROWSER_SUFFIXES = [
  ' - Google Chrome', ' - Chrome', ' - Safari', ' - Firefox',
  ' - Microsoft Edge', ' - Brave', ' - Arc', ' - Opera',
  ' - Vivaldi', ' \u2014 Mozilla Firefox',
]

const INVALID_TITLE_WORD_PREFIXES = [
  'how to', 'what is', 'why', 'when', 'where',
  'watch', 'read', 'play', 'episode', 'chapter',
]

function isValidWebsiteName(name) {
  if (!name) return false
  if (name.length === 0 || name.length >= 40) return false
  if (name.includes('...') || name.endsWith('\u2026')) return false
  const lower = name.toLowerCase()
  for (const p of INVALID_TITLE_WORD_PREFIXES) {
    if (lower.startsWith(p)) return false
  }
  return true
}

function parsePattern(title) {
  let working = title

  // Strip trailing browser chrome
  for (const suffix of BROWSER_SUFFIXES) {
    if (working.endsWith(suffix)) {
      working = working.slice(0, -suffix.length)
      break
    }
  }

  // Try " - " (from the right)
  const dashIdx = working.lastIndexOf(' - ')
  if (dashIdx >= 0) {
    const candidate = working.slice(dashIdx + 3).trim()
    if (isValidWebsiteName(candidate)) return candidate
  }

  // Try " | "
  const pipeIdx = working.lastIndexOf(' | ')
  if (pipeIdx >= 0) {
    const candidate = working.slice(pipeIdx + 3).trim()
    if (isValidWebsiteName(candidate)) return candidate
  }

  // Try leading colon (e.g. "Gmail: Subject")
  const colonIdx = working.indexOf(': ')
  if (colonIdx >= 0) {
    const candidate = working.slice(0, colonIdx).trim()
    if (isValidWebsiteName(candidate) && candidate.length < 20) return candidate
  }

  return null
}

// ============================================================================
// Indicator stripping (Chrome audio/recording indicators + unread counts)
// ============================================================================

/**
 * Strip leading browser status indicators that Chrome/Safari prepend to titles.
 * Covers: 🔊 (audio playing), 🔇 (muted), 🔈🔉 (volume), 🔴 (recording/casting),
 * 🎥📹 (camera), 🎙️ (mic), and leading "(N)" unread counts like "(3) Inbox".
 *
 * Applied before keyword matching so a title like "🔊 X" produces "Twitter/X"
 * via the "/ x" keyword (strip leaves "x" which... well, actually for "🔊 X"
 * there's no "/" so this won't match the DB - that falls through to rawApp).
 * More importantly this cleans up the final fallback so we never display
 * "🔊 X" literally.
 */
const LEADING_INDICATOR_RE = /^(?:[\u{1F509}\u{1F508}\u{1F507}\u{1F50A}\u{1F534}\u{1F4F9}\u{1F3A5}\u{1F399}\u23F8\u25B6\uFE0F]|\([0-9]+\)|\u2022|\s)+/u

export function stripIndicators(title) {
  if (!title) return title
  return title.replace(LEADING_INDICATOR_RE, '').trim()
}

// ============================================================================
// Public extractor
// ============================================================================

/**
 * Extract website display name from browser window title.
 * Returns null if not determinable (caller should fall back to app name).
 *
 * Mirrors Swift WebsiteExtractor.extractWebsite exactly:
 *   1. Must be a browser app
 *   2. Check cache (keyed by lowercased title)
 *   3. Try fast keyword match
 *   4. Try pattern parsing
 *   5. Return null
 */
export function extractWebsite(appName, windowTitle) {
  if (!appName || !windowTitle) return null
  if (!isBrowser(appName)) return null

  const cleanedTitle = stripIndicators(windowTitle)
  const titleLower = cleanedTitle.toLowerCase()
  const cacheKey = titleLower

  const cached = cacheGet(extractionCache, cacheKey)
  if (cached !== undefined) return cached

  let result = matchKeywordFast(titleLower)
  if (!result) {
    result = parsePattern(cleanedTitle)
  }

  cacheSet(extractionCache, cacheKey, result)
  return result
}

/** Clear the extraction cache (useful for tests or rule changes). */
export function clearCache() {
  extractionCache.clear()
  browserCache.clear()
}
