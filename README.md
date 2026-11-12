
# Warframe Market Dashboard

A dashboard for tracking the most traded items on [Warframe Market](https://warframe.market) over the last 7 days. Shows volume, average price, and median price per item with daily data synced automatically via GitHub Actions.

## Setup

1. Create a Postgres database (e.g. [Neon](https://neon.tech))
2. Copy `.env.example` to `.env.local` and set `POSTGRES_URL`
3. Run `npm run db:push` to create the tables
4. Run `npm run sync-items` to populate the item catalog
5. Run `npm run sync-stats` to import the last 7 completed UTC days of trading stats from [Relics.run](https://relics.run/history/)
6. Run `npm run dev` to start the dashboard

## Keeping data fresh

Add `POSTGRES_URL` as a secret in your GitHub repository. The `sync-stats` workflow runs every three hours (UTC) and can also be triggered manually from the Actions tab. It imports closed trades from the daily Relics.run exports. If yesterday’s export is pending publication, the workflow imports the older dates and checks for the missing file again on its next run. To sync items when new ones are added to the game, trigger the `sync-items` workflow manually from the Actions tab.
