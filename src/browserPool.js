import { chromium } from 'playwright';

class BrowserPool {
  constructor(maxBrowsers = 5, maxContextsPerBrowser = 5) {
    this.maxBrowsers = maxBrowsers;
    this.maxContextsPerBrowser = maxContextsPerBrowser;
    this.browsers = []; // ✅ Using an array, .includes() is the correct check
    this.contexts = new Map(); // ✅ Track browser usage
  }

  async init() {
    console.log(`🔧 Initializing Browser Pool with max ${this.maxBrowsers} browsers.`);
    for (let i = 0; i < this.maxBrowsers; i++) {
      const browser = await this._launchBrowser();
      this.browsers.push(browser);
      this.contexts.set(browser, []);
    }
  }

  async _launchBrowser() {
    console.log(`🚀 Launching a new browser (Total: ${this.browsers.length + 1})`);
    return await chromium.launch({ headless: false });
  }

  async getBrowserContext() {
    console.log(`📌 Browsers in pool: ${this.browsers.length}`);
    console.log(`📌 Contexts in pool: ${Array.from(this.contexts.values()).flat().length}`);
    console.log(`📌 Max contexts per browser: ${this.maxContextsPerBrowser}`);
    console.log(`📌 Max browsers: ${this.maxBrowsers}`);

    // ✅ Check for available browser context
    for (const browser of this.browsers) {
      const contexts = this.contexts.get(browser) || [];
      if (contexts.length < this.maxContextsPerBrowser) {
        console.log(`✅ Using existing browser. Contexts used: ${contexts.length}`);
        const context = await browser.newContext();
        contexts.push(context);
        this.contexts.set(browser, contexts);
        return { browser, context };
      }
    }

    // ✅ If max browsers are running, WAIT instead of creating a new one
    if (this.browsers.length >= this.maxBrowsers) {
      console.warn("⚠️ Max browsers reached. Waiting for a free one...");

      return new Promise((resolve) => {
        const interval = setInterval(async () => {
          for (const browser of this.browsers) {
            const contexts = this.contexts.get(browser) || [];
            if (contexts.length < this.maxContextsPerBrowser) {
              clearInterval(interval);
              const context = await browser.newContext();
              contexts.push(context);
              this.contexts.set(browser, contexts);
              resolve({ browser, context });
              return;
            }
          }
        }, 500); // Check every 500ms
      });
    }

    // ✅ Otherwise, launch a new browser if allowed
    if (this.browsers.length < this.maxBrowsers) {
      console.log("🚀 Launching a new browser...");
      const newBrowser = await this._launchBrowser();
      this.browsers.push(newBrowser);
      const context = await newBrowser.newContext();
      this.contexts.set(newBrowser, [context]);
      return { browser: newBrowser, context };
    }

    throw new Error("❌ No available browsers or contexts.");
  }

  async releaseBrowserContext(browser, context) {
    if (!this.contexts.has(browser)) return;

    const contexts = this.contexts.get(browser);
    const index = contexts.indexOf(context);

    if (index > -1) {
      contexts.splice(index, 1);
      await context.close();
    }

    // ✅ Keep the browser alive for future scans (no forced close)
  }

  async closeAll() {
    for (const browser of this.browsers) {
      await browser.close();
    }
    this.browsers = [];
    this.contexts.clear();
  }
}

export default BrowserPool;
