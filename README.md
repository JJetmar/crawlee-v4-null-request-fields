# crawlee v4: stored requests with `null` fields can't be read

Minimal reproduction for a crawlee v4 bug. `Request.fromSchema()` rejects request records that have explicit `null` fields (`payload`, `errorMessages`, ...). The Apify API returns such records, for example for requests written by crawlee v3.

## Run

```bash
npm install

# No network needed: Request.fromSchema() on a stored record
npm run repro

# Real Apify request queue: getRequest() throws, BasicCrawler hangs.
# Creates a temporary unnamed queue and deletes it at the end.
APIFY_TOKEN=... npm run repro:platform
```

## Expected

Stored requests with `null` optional fields load like requests where those fields are missing.

## Actual

- `payload: null` → `Invalid input: expected string, received null at payload in RequestOptions`
- `errorMessages: null` → `TypeError: errorMessages is not iterable`
- `BasicCrawler` logs `(retrying 1/3)` once and then never finishes.

The full write-up is in [ISSUE.md](ISSUE.md).

Versions: `crawlee@4.0.0-rc.1`, `apify@4.0.0-rc.0`, `apify-client@3.0.0-rc.0`, Node.js 26.
