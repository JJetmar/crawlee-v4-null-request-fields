<!-- Title: v4: stored requests with `null` fields (`payload`, `errorMessages`) can't be read, and the crawler hangs -->
<!-- Bug report template: copy each section into the matching field. -->

### Which package is this bug report for?

@crawlee/core

### Issue description

In crawlee v4, `Request.fromSchema()` throws on request records that contain explicit `null` fields. The Apify API returns such records: requests written by crawlee v3 come back with `payload: null`, `errorMessages: null`, `handledAt: null` and `loadedUrl: null`. The API also still accepts and stores `null` for these fields today.

So a v4 crawler can't read a request queue that a v3 crawler (or any other API client) wrote:

1. `RequestQueue.getRequest(uniqueKey)` throws:
   ```
   ArgumentValidationError: Invalid input: expected string, received null at `payload` in `RequestOptions`
   Invalid input: expected Uint8Array, received null at `payload` in `RequestOptions`
   ```
2. If `payload` is fixed, the next problem is `errorMessages: null`, which throws `TypeError: errorMessages is not iterable`.
3. **`BasicCrawler` hangs.** When such a request reaches the head of the queue, the crawler logs `... (retrying 1/3)` once and then never finishes. The request is never handled and never marked as failed.

Where it happens (on `master`, 912e7e3):

- [`packages/core/src/request.ts#L35`](https://github.com/apify/crawlee/blob/912e7e3c317c316b595939400831b5689f5b287f/packages/core/src/request.ts#L35): `payload` is `z.union([z.string(), z.instanceof(Uint8Array)]).optional()`, so `null` is rejected.
- [`packages/core/src/request.ts#L257-L262`](https://github.com/apify/crawlee/blob/912e7e3c317c316b595939400831b5689f5b287f/packages/core/src/request.ts#L257-L262): `fromSchema` uses destructuring defaults (`errorMessages = []`). These only apply to `undefined`, so `[...errorMessages]` throws on `null`.
- [`packages/core/src/storages/request-queue.ts#L696`](https://github.com/apify/crawlee/blob/912e7e3c317c316b595939400831b5689f5b287f/packages/core/src/storages/request-queue.ts#L696) (`getRequest`) and [`#L730`](https://github.com/apify/crawlee/blob/912e7e3c317c316b595939400831b5689f5b287f/packages/core/src/storages/request-queue.ts#L730) (`fetchNextRequest`) pass backend records straight to `Request.fromSchema`.
- [`packages/basic-crawler/src/internals/basic-crawler.ts#L1493`](https://github.com/apify/crawlee/blob/912e7e3c317c316b595939400831b5689f5b287f/packages/basic-crawler/src/internals/basic-crawler.ts#L1493): the crawler calls `CrawlingRequest.fromSchema(fetched)` inside `#timeoutAndRetry`.
- In `apify` v4, [`src/apify_request_queue_backend.ts#L123-L125`](https://github.com/apify/apify-sdk-js/blob/ee507d3242e8c32a707306fb5fa050a7d71a734b/src/apify_request_queue_backend.ts#L123-L125) (`getRequestById`) returns the API record as is, with a cast to `UpdateRequestSchema`, so the `null`s reach crawlee.

Likely cause of the hang: the first `fetchNextRequest()` takes the request off the head (it becomes "in progress"), and then `fromSchema` throws. The retry finds the head empty and returns `null`. So the request is never handled or reclaimed, and the queue never finishes.

Suggested fix: treat `null` like `undefined` for optional fields when rebuilding a stored request. For example, drop `null` values in `Request.fromSchema` before the constructor runs, or use `.nullish()` for `payload` (and the other optional fields) plus `errorMessages ?? []`. Separately, a request that fails to rebuild should fail the request rather than leave it locked forever.

Reproduction repo: https://github.com/JJetmar/crawlee-v4-null-request-fields (`npm run repro` needs no network; `npm run repro:platform` needs `APIFY_TOKEN` and shows the crawler hang).

### Code sample

<!-- Paste into the "Code sample" field without fences; the form wraps it. The output below goes to "Other context". -->

import { Request } from 'crawlee';

// A request record shaped like the Apify API returns it, e.g. for requests written by crawlee v3.
const stored = {
    id: '01YbeZIQ2S1K6E1',
    url: 'https://example.com/',
    uniqueKey: 'https://example.com/',
    method: 'GET',
    payload: null,
    noRetry: false,
    errorMessages: null,
    headers: {},
    userData: {},
    handledAt: null,
    loadedUrl: null,
    retryCount: 0,
};

try {
    Request.fromSchema(stored);
    console.log('payload: null -> OK');
} catch (error) {
    console.log('payload: null ->', error.message);
}

try {
    Request.fromSchema({ ...stored, payload: undefined });
    console.log('errorMessages: null -> OK');
} catch (error) {
    console.log('errorMessages: null ->', error.message);
}

Output:

```
payload: null -> Invalid input: expected string, received null at `payload` in `RequestOptions`
Invalid input: expected Uint8Array, received null at `payload` in `RequestOptions`
errorMessages: null -> errorMessages is not iterable
```

### Package version

crawlee@4.0.0-rc.1, apify@4.0.0-rc.0 (code still unchanged on crawlee `master` 912e7e3)

### Node.js version

v26.12.1

### Operating system

Linux (Fedora 44)

### Apify platform

- [x] Tick me if you encountered this issue on the Apify platform

### I have tested this on the `next` release

No. Tested on `4.0.0-rc.1` (`rc` tag). The `next` tag points to v3 (`3.18.2-beta.6`).

### Other context

End-to-end repro against a real Apify request queue (`repro-platform.mjs` in the repo above):

```
getRequest -> Invalid input: expected string, received null at `payload` in `RequestOptions`
Invalid input: expected Uint8Array, received null at `payload` in `RequestOptions`
INFO  BasicCrawler: Starting the crawler.
WARN  BasicCrawler: Invalid input: expected string, received null at `payload` in `RequestOptions`
Invalid input: expected Uint8Array, received null at `payload` in `RequestOptions` (retrying 1/3)
crawler.run -> still running after 60 s (hang)
```

This matters for migrating to v4: existing named request queues (often used to remember visited URLs across runs) contain v3-written records. Reading them is enough to hit the bug.

Related issues:

- #4087 and #1351: a `null` *inside* `errorMessages` (`[null]`) poisons persisted requests. Same family, but here the whole field is `null`, and it comes from the storage rather than from `pushErrorMessage`.
- #4241: another v3 → v4 compatibility gap (persisted `RequestList` state is not picked up).
- #3764: a different cause, but also a crawler that hangs forever instead of failing on one bad request.
