# Marketplace Analyzer

Local ranking tool for the Chrome Web Store and the Jira Marketplace. Use it to see what is already in demand before you pick a product to build.

Nothing is uploaded. Chrome comes from a CSV on disk. Jira comes from Atlassian’s public Marketplace API.

## Run

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

- [`scripts/ingest-chrome.mjs`](scripts/ingest-chrome.mjs)
- [`scripts/ingest-jira.mjs`](scripts/ingest-jira.mjs)
- [`server.mjs`](server.mjs)
- [`public/`](public/)
- `data/app.db` — generated, gitignored
