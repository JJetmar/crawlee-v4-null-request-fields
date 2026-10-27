import { Actor } from 'apify';
import { ApifyClient } from 'apify-client';
import { BasicCrawler } from 'crawlee';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const { id: queueId } = await client.requestQueues().getOrCreate();

try {
    // The API accepts and returns explicit nulls; queues written by crawlee v3 contain such records.
    await client.requestQueue(queueId).addRequest({
        url: 'https://example.com/',
        uniqueKey: 'https://example.com/',
        method: 'GET',
        payload: null,
    });

    await Actor.init();
    const queue = await Actor.openRequestQueue(queueId, { forceCloud: true });

    try {
        await queue.getRequest('https://example.com/');
        console.log('getRequest -> OK');
    } catch (error) {
        console.log('getRequest ->', error.message);
    }

    const crawler = new BasicCrawler({
        requestManager: queue,
        requestHandler: async ({ request }) => console.log('handled', request.url),
    });
    const watchdog = new Promise((resolve) => setTimeout(() => resolve('timeout'), 60_000));
    const result = await Promise.race([crawler.run().then(() => 'finished'), watchdog]);
    console.log(result === 'timeout' ? 'crawler.run -> still running after 60 s (hang)' : 'crawler.run -> finished');
} finally {
    await client.requestQueue(queueId).delete();
    process.exit(0);
}
