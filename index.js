import wappalyzer from "./src/wappalyzer.js";
import { extractTechnologies } from "./src/scrape.js";
import { load_technologies } from "./src/technologies/__loader.js";
import categories from "./src/categories.json" assert { type: "json" };
import Wappalyzer from "./src/wappalyzer.js";
import BrowserPool from './src/browserPool.js'; // Import the updated BrowserPool
import normalizeURL from "./src/utils/normalizeURL.js";

let isInitialized = false;
let browserPool;
let defaultQueue;

const defaultConfig = {
  target: "playwright",
  helpers: {
    run: true,
  },
  browser: {
    headless: true,
    maxBrowsers: 5, // Default number of browsers
    maxContextsPerBrowser: 5, // Default number of contexts per browser
  },
};

const initialize = async (config = defaultConfig) => {
  if (!isInitialized) {
    const techLib = await load_technologies();
    await Wappalyzer.setTechnologies(techLib);
    await Wappalyzer.setCategories(categories);
    
    const maxBrowsers = config.browser.maxBrowsers || defaultConfig.browser.maxBrowsers;
    const maxContextsPerBrowser = config.browser.maxContextsPerBrowser || defaultConfig.browser.maxContextsPerBrowser;

    browserPool = new BrowserPool(maxBrowsers, maxContextsPerBrowser);
    await browserPool.init(); // Initialize the browser pool with custom settings
    isInitialized = true;
  }
};

const init = async (config = defaultConfig) => {
  await initialize(config);
  setConcurrency(config.concurrency || 2); // Default concurrency is 2
};

class DefaultQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  setConcurrency(concurrency) {
    this.concurrency = concurrency;
    this.run();
  }

  push(task) {
    this.queue.push(task);
    this.run();
  }

  async run() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    this.running++;
    await task();
    this.running--;
    this.run();
  }
}

const setConcurrency = (concurrency) => {
  if (defaultQueue) {
    defaultQueue.setConcurrency(concurrency);
  } else {
    defaultQueue = new DefaultQueue(concurrency);
  }
};

const analyze = async (payload) => {
  try {
    const {
      url,
      html,
      css,
      scriptSrc,
      scripts,
      headers,
      cookies,
      meta,
      dns,
      text,
      certIssuer,
      dom,
      helpers,
    } = payload;

    const analysis = await wappalyzer.analyze({
      url,
      html,
      css,
      scriptSrc,
      scripts,
      headers,
      cookies,
      meta,
      dns,
      text,
      certIssuer,
      dom,
      helpers
    });

    return {
      analysis,
      helpers,
    };

  } catch (error) {
    console.error("Error during analysis:", error);
    throw new Error("Failed to analyze technologies");
  }
};

const scan = async (url, config = defaultConfig) => {
  let browser, context;
  try {
    if (!isInitialized) {
      await initialize(config);
    }

    const { browser: b, context: c } = await browserPool.getBrowserContext();
    browser = b;
    context = c;

    const technologies = await extractTechnologies(normalizeURL(url), { ...config, browserInstance: context });
    const { performance } = technologies;
    const { analysis, helpers } = await analyze(technologies);
    
    const resolvedTechnologies = await wappalyzer.resolve({
      detections: analysis,
      helpers,
    });

    return {
      technologies: resolvedTechnologies,
      performance,
    };
  } catch (error) {
    console.error("Error during scan:", error);
    return {
      error: "Failed to scan technologies",
    };
  } finally {
    if (browser && context) {
      await browserPool.releaseBrowserContext(browser, context);
    }
  }
};

const scanWithQueue = (url, config = defaultConfig, customQueue = null) => {
  const queue = customQueue || defaultQueue;
  if (!queue) {
    throw new Error("No queue provided");
  }

  if (typeof url !== "string") {
    throw new Error("URL must be a string, or an array of strings");
  }

  if (Array.isArray(url)) {
    return Promise.all(url.map((u) => scanWithQueue(u, config, queue)));
  }

  return new Promise((resolve, reject) => {
    queue.push(async () => {
      let browser, context;
      try {
        if (!isInitialized) {
          await initialize(config);
        }

        const { browser: b, context: c } = await browserPool.getBrowserContext();
        browser = b;
        context = c;

        const result = await scan(url, { ...config, browserInstance: context });
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        if (browser && context) {
          await browserPool.releaseBrowserContext(browser, context);
        }
      }
    });
  });
};

export { analyze, scan, scanWithQueue, setConcurrency, DefaultQueue, init };
