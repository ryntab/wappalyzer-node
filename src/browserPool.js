import { chromium } from 'playwright';

class BrowserPool {
  constructor(maxBrowsers, maxContextsPerBrowser) {
    this.maxBrowsers = maxBrowsers || 5; // Default to 5 if not provided
    this.maxContextsPerBrowser = maxContextsPerBrowser || 5; // Default to 5 contexts per browser if not provided
    this.browsers = [];
    this.idleBrowsers = [];
    this.browserContextMap = new Map();
    this.isInitialized = false;
  }

  async init() {
    try {
      for (let i = 0; i < this.maxBrowsers; i++) {
        const browser = await chromium.launch({ headless: true });
        this.browsers.push(browser);
        this.idleBrowsers.push(browser);
        this.browserContextMap.set(browser, []); // Initialize an empty context list for each browser
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize browser pool:', error);
      throw error;
    }
  }

  async getBrowserContext() {
    if (!this.isInitialized) {
      throw new Error('Browser pool is not initialized');
    }

    let selectedBrowser;
    for (const browser of this.idleBrowsers) {
      const contexts = this.browserContextMap.get(browser);
      if (contexts.length < this.maxContextsPerBrowser) {
        selectedBrowser = browser;
        break;
      }
    }

    if (!selectedBrowser) {
      while (this.idleBrowsers.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait for an idle browser
      }
      selectedBrowser = this.idleBrowsers.pop();
    }

    const context = await selectedBrowser.newContext();
    const contexts = this.browserContextMap.get(selectedBrowser);
    contexts.push(context);
    this.browserContextMap.set(selectedBrowser, contexts);

    return { browser: selectedBrowser, context };
  }

  async releaseBrowserContext(browser, context) {
    const contexts = this.browserContextMap.get(browser);
    const contextIndex = contexts.indexOf(context);
    if (contextIndex > -1) {
      contexts.splice(contextIndex, 1);
    }

    await context.close();

    if (contexts.length === 0) {
      this.idleBrowsers.push(browser);
    }
  }

  async closeAll() {
    for (const browser of this.browsers) {
      await browser.close();
    }
    this.browsers = [];
    this.idleBrowsers = [];
    this.browserContextMap.clear();
    this.isInitialized = false;
  }
}

export default BrowserPool;
