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
