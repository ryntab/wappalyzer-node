import wappalyzer from "./src/wappalyzer.js";
import { extractTechnologies } from "./src/scrape.js";
import { load_technologies } from "./src/technologies/__loader.js";
import categories from "./src/categories.json" assert { type: "json" };
import Wappalyzer from "./src/wappalyzer.js";
import BrowserPool from './src/browserPool.js'; // Add this import
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
  },
};

const initialize = async (config) => {
  if (!isInitialized) {
    const techLib = await load_technologies();
    await Wappalyzer.setTechnologies(techLib);
    await Wappalyzer.setCategories(categories);
    browserPool = new BrowserPool(config.maxBrowsers || 5);
    await browserPool.init(); // Initialize the browser pool
    isInitialized = true;
  }
};

const init = async (config = { maxBrowsers: 5, concurrency: 2 }) => {
  await initialize(config);
  setConcurrency(config.concurrency);
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

// let defaultQueue = new DefaultQueue(2);

const setConcurrency = (concurrency) => {
  if (defaultQueue) {
    defaultQueue.setConcurrency(concurrency);
  } else {
    defaultQueue = new DefaultQueue(concurrency);
  }
};

/**
 * Analyzes the given payload to identify technologies used on a webpage.
 *
 * @async
 * @function analyze
 * @param {Object} payload - The payload containing various website data.
 * @param {string} payload.url - The URL of the website.
 * @param {string} payload.html - The HTML content of the website.
 * @param {string} payload.css - The combined CSS content of the website.
 * @param {Array<string>} payload.scriptSrc - Array of script source URLs.
 * @param {Array<string>} payload.scripts - Array of inline script contents.
 * @param {Object} payload.headers - HTTP headers of the website.
 * @param {Object} payload.cookies - Cookies set by the website.
 * @param {Object} payload.meta - Meta tags from the website.
 * @param {Object} payload.dns - DNS records of the website, including txt and mx.
 * @param {Array<string>} payload.dns.txt - DNS TXT records of the website.
 * @param {Array<string>} payload.dns.mx - DNS MX records of the website.
 * @param {string} payload.certIssuer - The certificate issuer of the website.
 * @returns {Promise<Object>} A promise that resolves to the identified technologies.
 * @throws {Error} Throws an error if the analysis fails.
 */
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

    // Append helper functions to the analysis
    return {
      analysis,
      helpers,
    };

  } catch (error) {
    console.error("Error during analysis:", error);
    throw new Error("Failed to analyze technologies");
  }
};

/**
 * Extracts technologies and analyzes them for the given URL.
 *
 * @async
 * @function scan
 * @param {string} url - The URL of the website to scan.
 * @returns {Promise<Object>} A promise that resolves to the identified technologies.
 * @throws {Error} Throws an error if the scan or analysis fails.
 */
const scan = async (url, config = defaultConfig) => {
  let browser;
  try {

    if (!isInitialized) {
      await initialize(config);
    }

    if (!config.browserInstance) {
      browser = await browserPool.getBrowser();
      config.browserInstance = browser;
    }

    const technologies = await extractTechnologies(normalizeURL(url), config);
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
    if (browser) {
      browserPool.releaseBrowser(browser);
    }
  }
};


/**
 * Queues a scan for the given URL and ensures that no more than the specified
 * number of concurrent scans are running at any time.
 *
 * @function scanWithQueue
 * @param {string} url - The URL of the website to scan.
 * @param {Object} [config] - The configuration options for scanning.
 * @param {Object} [config.browser] - The browser configuration options.
 * @param {boolean} [config.browser.headless=false] - Whether to run the browser in headless mode.
 * @returns {Promise<Object>} A promise that resolves to the identified technologies.
 * @throws {Error} Throws an error if the scan or analysis fails.
 */
const scanWithQueue = (url, config = defaultConfig, customQueue = null) => {
  const queue = customQueue || defaultQueue;
  if (!queue) {
    throw new Error("No queue provided");
  }
  return new Promise((resolve, reject) => {
    queue.push(async () => {
      let browser;
      try {
        browser = await browserPool.getBrowser();
        const result = await scan(url, { ...config, browserInstance: browser });
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        if (browser) {
          browserPool.releaseBrowser(browser);
        }
      }
    });
  });
};

export { analyze, scan, scanWithQueue, setConcurrency, DefaultQueue, init };