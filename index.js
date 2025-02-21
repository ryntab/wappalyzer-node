import { extractTechnologies } from "./src/scrape.js";
import { load_technologies } from "./src/technologies/__loader.js";
import categories from "./src/categories.json" assert { type: "json" };
import WappalyzerCore from "./src/wappalyzer.js";
import BrowserPool from "./src/browserPool.js";
import normalizeURL from "./src/utils/normalizeURL.js";
import deepmerge from "deepmerge"; // Install via npm: `npm install deepmerge`

// Define DefaultQueue if not imported from elsewhere
class DefaultQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  setConcurrency(concurrency) {
    console.log(`🔧 Setting queue concurrency: ${concurrency}`);
    this.concurrency = concurrency;
    this.run();
  }

  push(task) {
    console.log(`📌 Queuing a new task. Current queue size: ${this.queue.length}`);
    this.queue.push(task);
    this.run();
  }

  async run() {
    if (this.running >= this.concurrency) {
      console.log(`⏳ Max concurrency reached. Waiting for a slot...`);
      return;
    }

    if (this.queue.length === 0) {
      console.log(`✅ Queue is empty. All tasks completed.`);
      return;
    }

    const task = this.queue.shift();
    this.running++;

    console.log(
      `🚀 Running task. Active tasks: ${this.running} / ${this.concurrency}`
    );

    try {
      await task(); // ✅ Wait for the task to fully complete before continuing
    } catch (error) {
      console.error("❌ Error processing task:", error);
    } finally {
      this.running--;
      console.log(
        `✅ Task completed. Active tasks: ${this.running} / ${this.concurrency}`
      );

      // ✅ Trigger the next task after this one fully completes
      this.run();
    }
  }
}


class Wappalyzer {
  constructor(config = {}) {

    this.isInitialized = false;
    this.initializing = null; // 🚀 Add a lock to track initialization state
    
    const defaultConfig = {
      target: "playwright",
      helpers: { run: true },
      debug: {
        enabled: true,
        silent: true,
      },
      browser: {
        headless: false,
        maxBrowsers: 2, // ✅ Ensure max browser control
        maxContextsPerBrowser: 1,
      },
      maxTime: 60000, // default max time 60 seconds
      minTime: 3000, // default min time 3 seconds
      scrollToBottom: false, // default do not scroll to bottom
      concurrency: 2, // ✅ Match concurrency to browsers
    };

    this.defaultConfig = deepmerge(defaultConfig, config);
    this.browserPool = new BrowserPool(
      this.defaultConfig.browser.maxBrowsers,
      this.defaultConfig.browser.maxContextsPerBrowser
    );
    this.queue = new DefaultQueue(this.defaultConfig.concurrency);
  }

  async initialize() {
    if (this.isInitialized) return; // ✅ Already initialized
    if (this.initializing) return this.initializing; // ✅ Prevent parallel calls

    console.log("🔧 Initializing Wappalyzer...");
    
    this.initializing = (async () => { // 🔒 Lock initialization
      try {
        const techLib = await load_technologies();
        await WappalyzerCore.setTechnologies(techLib);
        await WappalyzerCore.setCategories(categories);
        await this.browserPool.init();
        this.isInitialized = true;
        console.log("✅ Wappalyzer initialized successfully");
      } catch (error) {
        console.error("❌ Error initializing Wappalyzer:", error);
        throw new Error("Failed to initialize Wappalyzer");
      } finally {
        this.initializing = null; // 🔓 Release lock
      }
    })();

    return this.initializing;
  }

  async init() {
    await this.initialize();
    this.setConcurrency(this.defaultConfig.concurrency || 2);
  }

  async initBrowserPool() {
    if (!this.browserPool) {
      const { maxBrowsers, maxContextsPerBrowser } = this.defaultConfig.browser;
      this.browserPool = new BrowserPool(maxBrowsers, maxContextsPerBrowser);
      await this.browserPool.init();
    }
  }

  async analyze(payload) {
    try {
      const analysis = await WappalyzerCore.analyze(payload);
      return { analysis, helpers: payload.helpers };
    } catch (error) {
      console.error("Error during analysis:", error);
      throw new Error("Failed to analyze technologies");
    }
  }

  async scan(url) {
    let browser, context;
    try {
      await this.initialize();

      console.log(`🔮 Scanning: ${url}`);
      const { browser: b, context: c } =
        await this.browserPool.getBrowserContext();
      browser = b;
      context = c;

      const technologies = await extractTechnologies(normalizeURL(url), {
        ...this.defaultConfig,
        browserPool: this.browserPool,
      });

      const { performance } = technologies;
      const { analysis, helpers } = await this.analyze(technologies);
      const resolvedTechnologies = await WappalyzerCore.resolve({
        detections: analysis,
        helpers,
      });

      return { technologies: resolvedTechnologies, performance };
    } catch (error) {
      console.error("❌ Error during scan:", error);
      return { error: "Failed to scan technologies" };
    } finally {
      if (browser && context) {
        await this.browserPool.releaseBrowserContext(browser, context);
      }
    }
  }

  async scanWithQueue(url) {
    if (typeof url !== "string") throw new Error("URL must be a string");

    
    await this.initialize(); // Ensure browser pool is initialized

    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        let browser, context;
        try {
          console.log(`📌 Queue Processing: ${url}`);

          const { browser: b, context: c } =
            await this.browserPool.getBrowserContext();
          browser = b;
          context = c;

          console.log(`🔮 Running scan for: ${url}`);

          const result = await this.scan(url);
          resolve(result); // ✅ Return as soon as it's processed
        } catch (error) {
          console.error(`❌ Error scanning ${url}:`, error);
          reject(error);
        } finally {
          if (browser && context) {
            await this.browserPool.releaseBrowserContext(browser, context);
          }
        }
      });
    });
  }

  setConcurrency(concurrency) {
    if (this.queue) {
      this.queue.setConcurrency(concurrency);
    } else {
      this.queue = new DefaultQueue(concurrency);
    }
  }

  _queueScanTask(url) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        let browser, context;
        try {
          await this.initialize(); // Ensure Wappalyzer is initialized

          // ✅ WAIT FOR AN AVAILABLE BROWSER
          const { browser: b, context: c } =
            await this.browserPool.getBrowserContext();
          browser = b;
          context = c;

          console.log(`🔮 Scanning (via queue): ${url}`);

          // ✅ Perform the scan
          const technologies = await extractTechnologies(normalizeURL(url), {
            ...this.defaultConfig,
            browserPool: this.browserPool, // Pass browser pool
          });

          const { performance } = technologies;
          const { analysis, helpers } = await this.analyze(technologies);
          const resolvedTechnologies = await WappalyzerCore.resolve({
            detections: analysis,
            helpers,
          });

          resolve({ technologies: resolvedTechnologies, performance });
        } catch (error) {
          console.error(`❌ Error scanning ${url}:`, error);
          reject(error);
        } finally {
          if (browser && context) {
            await this.browserPool.releaseBrowserContext(browser, context);
          }
        }
      });
    });
  }

  async shutdown() {
    if (this.browserPool) {
      await this.browserPool.closeAll();
    }
  }
}

// Export an instance for easy use
const wappalyzer = new Wappalyzer();
export { Wappalyzer, wappalyzer };
