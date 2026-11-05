#!/usr/bin/env node
/**
 * ==============================================================================
 * SOCIAL PUBLISHER — AUTONOMOUS MULTI-PLATFORM PUBLISHER CLI
 * ==============================================================================
 * Supported Channels:
 *   - Reddit Direct API (Self-posts, Link posts, Flairs to any Subreddit, 100 QPM)
 *   - X / Twitter API v2 (Single Tweets & Multi-Tweet Threads via twitter-api-v2)
 *   - LinkedIn REST API (Personal & Organization Feed Updates)
 *
 * Author: Rayyan Mustafa
 * License: MIT
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [k, ...v] = trimmed.split('=');
        if (k && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    }
  }
}

// ------------------------------------------------------------------------------
// REDDIT DIRECT PUBLISHER (OAuth Script App)
// ------------------------------------------------------------------------------
async function publishToReddit({ subreddit, title, text, url, dryRun = false }) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error(
      'Missing Reddit credentials in .env (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD).'
    );
  }

  const cleanSub = subreddit.replace(/^r\//i, '').trim();
  if (!cleanSub) throw new Error('Subreddit is required for Reddit posts (--subreddit <name>).');
  if (!title) throw new Error('Title is required for Reddit posts (--title <title>).');

  if (dryRun) {
    return {
      platform: 'reddit',
      status: 'DRY_RUN',
      subreddit: `r/${cleanSub}`,
      title,
      textLength: text ? text.length : 0,
      url: url || null,
    };
  }

  // 1. Authenticate with Reddit OAuth
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const userAgent = `SocialPublisher/1.0.0 (by /u/${username})`;

  const tokenParams = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
  });

  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: tokenParams.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Reddit Auth Failed (${tokenRes.status}): ${errText}`);
  }

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    throw new Error(`Reddit Auth Error: ${tokenData.error} ${tokenData.message || ''}`);
  }

  const accessToken = tokenData.access_token;

  // 2. Submit post to subreddit
  const submitParams = new URLSearchParams({
    api_type: 'json',
    sr: cleanSub,
    title,
    resubmit: 'true',
    sendreplies: 'true',
  });

  if (url) {
    submitParams.append('kind', 'link');
    submitParams.append('url', url);
  } else {
    submitParams.append('kind', 'self');
    submitParams.append('text', text || '');
  }

  const submitRes = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: submitParams.toString(),
  });

  const submitData = await submitRes.json();
  if (submitData.json && submitData.json.errors && submitData.json.errors.length > 0) {
    const err = submitData.json.errors[0];
    throw new Error(`Reddit API Error: [${err[0]}] ${err[1]}`);
  }

  const postUrl = submitData.json?.data?.url || `https://reddit.com/r/${cleanSub}`;
  const postId = submitData.json?.data?.id || 'unknown';

  return {
    platform: 'reddit',
    status: 'PUBLISHED',
    id: postId,
    url: postUrl,
    subreddit: `r/${cleanSub}`,
  };
}

// ------------------------------------------------------------------------------
// X / TWITTER DIRECT PUBLISHER (API v2)
// ------------------------------------------------------------------------------
async function publishToTwitter({ text, dryRun = false }) {
  const appKey = process.env.TWITTER_API_KEY;
  const appSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error(
      'Missing X / Twitter credentials in .env (TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET).'
    );
  }

  if (!text) throw new Error('Text is required for X post (--text <content>).');

  // Check for thread splitting with ---
  const posts = text
    .split(/\n\s*---\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (dryRun) {
    return {
      platform: 'x',
      status: 'DRY_RUN',
      isThread: posts.length > 1,
      postCount: posts.length,
      preview: posts[0].substring(0, 100),
    };
  }

  let TwitterApi;
  try {
    TwitterApi = require('twitter-api-v2').TwitterApi;
  } catch {
    throw new Error('Package twitter-api-v2 not installed. Run: npm install');
  }

  const client = new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });

  if (posts.length === 1) {
    const res = await client.v2.tweet(posts[0]);
    return {
      platform: 'x',
      status: 'PUBLISHED',
      id: res.data.id,
      url: `https://x.com/i/status/${res.data.id}`,
    };
  } else {
    const res = await client.v2.tweetThread(posts);
    const firstTweetId = res[0]?.data?.id;
    return {
      platform: 'x',
      status: 'PUBLISHED',
      isThread: true,
      threadCount: posts.length,
      id: firstTweetId,
      url: `https://x.com/i/status/${firstTweetId}`,
      allIds: res.map((r) => r.data.id),
    };
  }
}

// ------------------------------------------------------------------------------
// LINKEDIN DIRECT PUBLISHER (REST Posts API)
// ------------------------------------------------------------------------------
async function publishToLinkedIn({ text, dryRun = false }) {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('Missing LINKEDIN_ACCESS_TOKEN in .env.');
  }

  if (!text) throw new Error('Text is required for LinkedIn post (--text <content>).');

  let authorUrn = process.env.LINKEDIN_PERSON_URN;

  if (dryRun) {
    return {
      platform: 'linkedin',
      status: 'DRY_RUN',
      textLength: text.length,
      authorUrn: authorUrn || 'Will resolve via /v2/userinfo',
    };
  }

  if (!authorUrn) {
    const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) {
      throw new Error(`LinkedIn User Info Error (${userRes.status}): Could not resolve author URN.`);
    }
    const userData = await userRes.json();
    authorUrn = `urn:li:person:${userData.sub}`;
  }

  const postBody = {
    author: authorUrn,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
  };

  const postRes = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': '202401',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postBody),
  });

  if (!postRes.ok) {
    const errText = await postRes.text();
    throw new Error(`LinkedIn Publish Error (${postRes.status}): ${errText}`);
  }

  const postId = postRes.headers.get('x-restli-id') || 'published';
  return {
    platform: 'linkedin',
    status: 'PUBLISHED',
    id: postId,
    url: 'https://www.linkedin.com/feed/',
  };
}

// ------------------------------------------------------------------------------
// STATUS CHECK
// ------------------------------------------------------------------------------
async function checkStatus() {
  console.log('\n================================================================');
  console.log('       SOCIAL PUBLISHER — CONNECTED PLATFORMS STATUS');
  console.log('================================================================\n');

  const check = (name, hasKeys, notes) => {
    const status = hasKeys ? '✓ CONFIGURED' : '✗ NOT CONFIGURED';
    const color = hasKeys ? '\x1b[32m' : '\x1b[33m';
    console.log(`  ${color}${status.padEnd(16)}\x1b[0m ${name.padEnd(12)} — ${notes}`);
  };

  const hasReddit = Boolean(
    process.env.REDDIT_CLIENT_ID &&
      process.env.REDDIT_CLIENT_SECRET &&
      process.env.REDDIT_USERNAME &&
      process.env.REDDIT_PASSWORD
  );
  check('Reddit', hasReddit, 'Direct API (100 QPM, $0 Free Tier)');

  const hasTwitter = Boolean(
    process.env.TWITTER_API_KEY &&
      process.env.TWITTER_API_SECRET &&
      process.env.TWITTER_ACCESS_TOKEN &&
      process.env.TWITTER_ACCESS_SECRET
  );
  check('X / Twitter', hasTwitter, 'API v2 (500 posts/mo, $0 Free Tier)');

  const hasLinkedIn = Boolean(process.env.LINKEDIN_ACCESS_TOKEN);
  check('LinkedIn', hasLinkedIn, 'REST API ($0 Free Developer Tier)');

  console.log('\n----------------------------------------------------------------');
  console.log('Provide your credentials in .env to activate posting.\n');
}

// ------------------------------------------------------------------------------
// CLI ARGUMENT PARSER
// ------------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    platforms: [],
    subreddit: null,
    title: null,
    text: null,
    url: null,
    dryRun: false,
    statusOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--status') {
      options.statusOnly = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--platform' || arg === '-p') {
      options.platforms = (args[++i] || '').split(',').map((p) => p.trim().toLowerCase());
    } else if (arg === '--subreddit' || arg === '-s') {
      options.subreddit = args[++i];
    } else if (arg === '--title' || arg === '-t') {
      options.title = args[++i];
    } else if (arg === '--text') {
      options.text = args[++i];
    } else if (arg === '--url' || arg === '-u') {
      options.url = args[++i];
    } else if (arg === '--file' || arg === '-f') {
      const filePath = args[++i];
      if (fs.existsSync(filePath)) {
        options.text = fs.readFileSync(filePath, 'utf8');
      } else {
        console.error(`Error: File not found at ${filePath}`);
        process.exit(1);
      }
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: node social-publisher.js [options]

Options:
  --status                     Check configuration status of all social platforms
  --platform, -p <platforms>   Target platform(s): reddit, x, linkedin, all (comma-separated)
  --subreddit, -s <name>       Target subreddit for Reddit (e.g. SaaS, SideProject)
  --title, -t <title>          Post title (required for Reddit)
  --text <content>             Post content (use '---' on a new line for Twitter threads)
  --file, -f <path>            Read content from file instead of --text
  --url, -u <link>             Link URL for link-posts (Reddit)
  --dry-run                    Simulate the publish without sending
  --help, -h                   Show this help message

Examples:
  # Check connection status
  node social-publisher.js --status

  # Post to Reddit r/SaaS
  node social-publisher.js --platform reddit --subreddit SaaS --title "Launched my tool" --text "Story..."

  # Post a thread to X (Twitter)
  node social-publisher.js --platform x --text "Tweet 1\\n---\\nTweet 2\\n---\\nTweet 3"

  # Post to LinkedIn
  node social-publisher.js --platform linkedin --text "Excited to share our milestone..."
`);
}

async function main() {
  const opts = parseArgs();

  if (opts.statusOnly || process.argv.length <= 2) {
    await checkStatus();
    return;
  }

  if (opts.platforms.length === 0) {
    console.error('Error: Please specify target platform(s) with --platform <reddit|x|linkedin|all>');
    process.exit(1);
  }

  const platforms = opts.platforms.includes('all')
    ? ['reddit', 'x', 'linkedin']
    : opts.platforms;

  console.log(`\n[Publisher] Dispatching post to: ${platforms.join(', ')}...`);
  if (opts.dryRun) console.log('[Publisher] (DRY-RUN MODE ACTIVE — No live posts will be sent)\n');

  for (const p of platforms) {
    try {
      if (p === 'reddit') {
        const res = await publishToReddit({
          subreddit: opts.subreddit,
          title: opts.title,
          text: opts.text,
          url: opts.url,
          dryRun: opts.dryRun,
        });
        console.log(`  ✓ Reddit: ${res.status} -> ${res.url}`);
      } else if (p === 'x' || p === 'twitter') {
        const res = await publishToTwitter({
          text: opts.text,
          dryRun: opts.dryRun,
        });
        console.log(`  ✓ X (Twitter): ${res.status} -> ${res.url}`);
      } else if (p === 'linkedin') {
        const res = await publishToLinkedIn({
          text: opts.text,
          dryRun: opts.dryRun,
        });
        console.log(`  ✓ LinkedIn: ${res.status} -> ${res.url}`);
      } else {
        console.warn(`  ! Unsupported platform: ${p}`);
      }
    } catch (err) {
      console.error(`  ✗ [${p.toUpperCase()}] Failed: ${err.message}`);
    }
  }

  console.log('\n[Publisher] Batch completed.\n');
}

main().catch((err) => {
  console.error('\nFatal Error:', err.message);
  process.exit(1);
});
