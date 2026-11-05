# Social Publisher

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Direct APIs](https://img.shields.io/badge/Direct_APIs-Reddit_%7C_X_%7C_LinkedIn-orange.svg)]()

A lightweight, zero-middleware social media publishing CLI and automation engine. Direct-to-API publishing across **Reddit**, **X (Twitter)**, and **LinkedIn** without paying for third-party SaaS scheduling platforms.

---

## Features

- **Reddit API Direct:** Submit self-posts, link-posts, and targeted flairs to any subreddit (100 QPM free tier).
- **X (Twitter) API v2:** Single tweets and multi-tweet threads with auto-split (`---` separator) using official developer keys (500 posts/month free tier).
- **LinkedIn REST API:** Direct posts to personal and organizational feeds ($0 developer tier).
- **Simulation Mode:** Built-in `--dry-run` flag to validate payloads and credentials before publishing.
- **AI Agent Native:** Zero-dependency CLI structure designed to be easily called by AI coding assistants and background daemons.

---

## Installation

```bash
git clone https://github.com/rayyan-mustafa/social-publisher.git
cd social-publisher
npm install
```

---

## Configuration

Copy the template configuration file:

```bash
cp .env.example .env
```

Fill in your API credentials:

```env
# Reddit (Create a "script" app at https://www.reddit.com/prefs/apps)
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password

# X / Twitter (Keys from https://developer.x.com/en/portal/dashboard)
TWITTER_API_KEY=your_consumer_key
TWITTER_API_SECRET=your_consumer_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret

# LinkedIn (Tokens from https://developer.linkedin.com/)
LINKEDIN_ACCESS_TOKEN=your_access_token
```

Verify your setup:

```bash
node social-publisher.js --status
```

---

## Usage

### 1. Post to Reddit

```bash
node social-publisher.js --platform reddit --subreddit SaaS --title "Launched our open source tool" --text "Here is the story..."
```

### 2. Post a Thread to X (Twitter)

Split posts into a threaded tweet chain using `---` on a new line:

```bash
node social-publisher.js --platform x --text "First tweet in the thread\n---\nSecond tweet with details\n---\nFinal tweet with CTA"
```

### 3. Post to LinkedIn

```bash
node social-publisher.js --platform linkedin --text "Excited to share our latest product milestone..."
```

### 4. Cross-Post Simultaneously

```bash
node social-publisher.js --platform reddit,x --subreddit SideProject --title "Built an AI tool" --text "Check it out..."
```

### 5. Dry-Run (Validate Payload Without Sending)

```bash
node social-publisher.js --platform reddit,x --dry-run --subreddit SaaS --title "Preview" --text "Test"
```

---

## License

MIT License. Copyright (c) 2026 Rayyan Mustafa.
