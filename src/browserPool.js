import { chromium } from 'playwright';

class BrowserPool {
  constructor(maxBrowsers) {
    this.maxBrowsers = maxBrowsers || 5; // Default to 5 if not provided
    this.browsers = [];
    this.idleBrowsers = [];
    this.isInitialized = false;
  }

  async init() {
    try {
      for (let i = 0; i < this.maxBrowsers; i++) {
        const browser = await chromium.launch({ headless: true });
        this.browsers.push(browser);
        this.idleBrowsers.push(browser);
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize browser pool:', error);
      throw error;
    }
  }

  async getBrowser() {
    if (!this.isInitialized) {
      throw new Error('Browser pool is not initialized');
    }

    while (this.idleBrowsers.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for an idle browser
    }
    return this.idleBrowsers.pop();
  }

  releaseBrowser(browser) {
    this.idleBrowsers.push(browser);
  }

  async closeAll() {
    for (const browser of this.browsers) {
      await browser.close();
    }
    this.browsers = [];
    this.idleBrowsers = [];
    this.isInitialized = false;
  }
}

export default BrowserPool;
