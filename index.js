import { extractTechnologiesFromPage, extractTechnologiesFromHTML } from "./src/scrape.js";
import { load_technologies } from "./src/technologies/__loader.js";
import categories from "./src/categories.json" with { type: "json" };
import WappalyzerCore from "./src/wappalyzer.js";

class Wappalyzer {
  #isInitialized = false;
  #initializing = null;

  async #initialize() {
    if (this.#isInitialized) return;
    if (this.#initializing) return this.#initializing;

    console.log("🔧 Initializing Wappalyzer...");

    this.#initializing = (async () => {
      try {
        const techLib = await load_technologies();
        await WappalyzerCore.setTechnologies(techLib);
        await WappalyzerCore.setCategories(categories);
        this.#isInitialized = true;
        console.log("✅ Wappalyzer initialized");
      } catch (error) {
        console.error("❌ Failed to initialize Wappalyzer:", error);
        throw error;
      } finally {
        this.#initializing = null;
      }
    })();

    return this.#initializing;
  }

  async #resolve(payload) {
    const analysis = await WappalyzerCore.analyze(payload);
    const technologies = await WappalyzerCore.resolve({
      detections: analysis,
      helpers: payload.helpers,
    });
    return { technologies, performance: payload.performance };
  }

  /**
   * Analyze an existing Puppeteer or Playwright page.
   * The caller is responsible for navigation and lifecycle of the page.
   *
   * @param {import('playwright').Page|import('puppeteer').Page} page
   * @param {string} [url] - Optional URL override (defaults to page.url())
   */
  async scanPage(page, url = null) {
    if (!page || typeof page.content !== "function") {
      throw new Error("A valid Puppeteer or Playwright page object is required");
    }

    await this.#initialize();

    const pageUrl =
      typeof url === "string" && url
        ? url
        : typeof page.url === "function"
          ? page.url()
          : "about:blank";

    try {
      const payload = await extractTechnologiesFromPage(page, pageUrl);
      return await this.#resolve(payload);
    } catch (error) {
      console.error("❌ Error during page scan:", error);
      return { error: "Failed to scan page technologies" };
    }
  }

  /**
   * Analyze raw HTML. Useful when you already have the response body.
   *
   * @param {string} html
   * @param {object} [opts]
   * @param {string}   [opts.url="about:blank"] - Base URL for resolving relative links
   * @param {object}   [opts.headers={}]        - Response headers
   * @param {Array}    [opts.cookies=[]]        - Cookies
   */
  async scanHTML(html, { url = "about:blank", headers = {}, cookies = [] } = {}) {
    if (typeof html !== "string" || !html.trim()) {
      throw new Error("html must be a non-empty string");
    }

    await this.#initialize();

    try {
      const payload = await extractTechnologiesFromHTML(html, { url, headers, cookies });
      return await this.#resolve(payload);
    } catch (error) {
      console.error("❌ Error during HTML scan:", error);
      return { error: "Failed to scan HTML technologies" };
    }
  }
}

const wappalyzer = new Wappalyzer();

export { Wappalyzer, wappalyzer };
