import { scanWithQueue, setConcurrency, DefaultQueue } from './index.js';
import { Cluster } from 'puppeteer-cluster';

// Example: Using Puppeteer Cluster
(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 5,
    puppeteerOptions: {
      headless: true,
    },
  });

  // Define the task function
  cluster.task(async ({ page, data: url }) => {
    const result = await scan(url, { browser: { headless: true } }, { page });
    console.log(result);
  });

  // Add URLs to the cluster queue
  const urls = ['https://example.com', 'https://anotherexample.com'];
  for (const url of urls) {
    cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();
})();

// Using default queue
(async () => {
  setConcurrency(5); // Set default concurrency

  const result = await scanWithQueue('https://example.com');
  console.log(result);
})();