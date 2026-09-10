# Marketplace Analyzer

Local ranking tool for the Chrome Web Store and the Jira Marketplace. Use it to see what is already in demand before you pick a product to build.

## Just open this. No install.

Double-click **[public/ideas.html](public/ideas.html)**. That is the GMB Everywhere feature map. It is plain HTML. No npm. No server.

Same way, no install:

- [public/lanes.html](public/lanes.html) — GBP and WhatsApp brief
- [public/cs.html](public/cs.html) — Helpdesk AI brief
- [public/how.html](public/how.html) — How the tool works

Or send this link: [https://pdomingo-coder.github.io/marketplace-analyzer/ideas.html](https://pdomingo-coder.github.io/marketplace-analyzer/ideas.html)

`index.html` (the live shelf) and `movers.html` (week growth) need a local server. Skip those unless you want the sorter.

Nothing is uploaded. Chrome comes from a CSV on disk. Jira comes from Atlassian’s public Marketplace API.

## Run the live shelf (optional)

```bash
cd /Users/paolodomingo/Projects/marketplace-analyzer
npm install
npm run ingest:chrome
npm run ingest:jira
npm start
```

Open [http://127.0.0.1:4747](http://127.0.0.1:4747).

Share the week-growth list: [https://pdomingo-coder.github.io/marketplace-analyzer/movers.html](https://pdomingo-coder.github.io/marketplace-analyzer/movers.html)

Chrome ingest defaults to:

`/Users/paolodomingo/Downloads/ranking-stats-20260825.csv`

Override with:

```bash
npm run ingest:chrome -- /path/to/ranking-stats.csv
```

Jira has no week-over-week feed. Freeze today’s installs, wait a week, ingest again:

```bash
npm run snapshot:jira
# one week later
npm run ingest:jira
```

Snapshots land in `data/jira-snapshot-YYYY-MM-DD.json` and in `data/app.db`. The first snapshot of a day is kept; a same-day ingest will not overwrite it.

Chrome week growth (10k+ users) is a separate page. Ingest the Chrome-Stats results file, then open `/movers.html`:

```bash
npm run ingest:movers
```

Default file: `/Users/paolodomingo/Downloads/results (1).csv`. That list is joined to the Aug 25 dump for type, maker, and store URL. Week % is `this week’s users ÷ last week’s users − 1`.

## What the sorts mean

- **Demand** — Chrome `userCount`, Jira `totalInstalls`
- **Reviews** — review volume
- **Rating** — average stars (raise “Min reviews” so a 5.0 with 3 reviews does not win)
- **Opportunity** — high demand × review volume × room under 5.0 stars, with a bump if the listing is older than a year

## Files

Frontend follows GMB Everywhere HTML / JS / CSS layout (local Tailwind, Inter, official logo):

- [`public/index.html`](public/index.html)
- [`public/css/styles.css`](public/css/styles.css)
- [`public/js/tailwind.min.js`](public/js/tailwind.min.js)
- [`public/js/app.js`](public/js/app.js)
- [`public/images/`](public/images/)
- [`scripts/ingest-chrome.mjs`](scripts/ingest-chrome.mjs)
- [`scripts/ingest-jira.mjs`](scripts/ingest-jira.mjs)
- [`server.mjs`](server.mjs)
- `data/app.db` — generated, gitignored
