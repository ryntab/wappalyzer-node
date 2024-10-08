import wappalyzer from "./src/wappalyzer.js";
import { extractTechnologies } from "./src/scrape.js";
import { load_technologies } from "./src/technologies/__loader.js";
import categories from "./src/categories.json" assert { type: "json" };
import Wappalyzer from "./src/wappalyzer.js";

let isInitialized = false;

const initialize = async () => {
  if (!isInitialized) {
    const techLib = await load_technologies();
    await Wappalyzer.setTechnologies(techLib);
    await Wappalyzer.setCategories(categories);
    isInitialized = true;
  }
};

const normalizeURL = (url) => {
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
};

const defaultConfig = {
  target: "playwright",
  helpers: {
    run: true,
  },
  browser: {
    headless: false,
  },
  maxTime: 60000, // default max time 60 seconds
  minTime: 10500, // default min time 0 seconds
  scrollToBottom: true, // default do not scroll to bottom

  /*

  https://playwright.dev/docs/api/class-page
  "load" | "domcontentloaded" | "networkidle" | "commit" (optional)#
  */
  waitUntil: "domcontentloaded", // default wait for dom content loaded
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

let defaultQueue;

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
      helpers,
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
  try {
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
    return {
      error: "Failed to scan technologies",
    };
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
  return new Promise((resolve, reject) => {
    queue.push(async () => {
      try {
        const result = await scan(url, config);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
};

// Initialize the default queue with a default concurrency level
setConcurrency(2);

await initialize();

export { analyze, scan, scanWithQueue, setConcurrency, DefaultQueue };
