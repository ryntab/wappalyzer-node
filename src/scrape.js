import fetch from "node-fetch";
import UserAgent from "user-agents";
import * as cheerio from "cheerio";
import dns from "dns/promises";
import https from "https";
import { chromium as playwrightChromium } from "playwright"; // Correct import
import Wordpress_Helpers from "./helpers/Wordpress.js";
import Shopify_Helpers from "./helpers/Shopify.js";
import Magento_Helpers from "./helpers/Magento.js";

const chromiumArgs = [
  "--no-sandbox",
  "--no-zygote",
  "--disable-gpu",
  "--ignore-certificate-errors",
  "--allow-running-insecure-content",
  "--disable-web-security",
  "--disable-http2", // 🔧 Disable HTTP/2 support
];

const createLogger = (config = {}) => {
  return (errors, functionName, message) => {
    if (!config.debug.enabled) return;

    if (!config.debug.silent) {
      console.error(`❌ [${functionName}] ${message}`);
    }
    if (errors) {
      errors.push({ function: functionName, message });
    }
  };
};

const extractCSSClasses = (cssText) => {
  const classNames = new Set();

  // Match class names like .woocommerce, .elementor-header
  const classMatches = cssText.match(/\.[a-zA-Z0-9_-]+/g);
  if (classMatches) {
    classMatches.forEach((cls) => classNames.add(cls));
  }

  // Match ID selectors like #main-header, #site-footer
  const idMatches = cssText.match(/#[a-zA-Z0-9_-]+/g);
  if (idMatches) {
    idMatches.forEach((id) => classNames.add(id));
  }

  return [...classNames]; // Convert Set to array
};


/**
 * Fetches a webpage using Playwright and returns the HTML content, cookies, headers, and certificate issuer.
 *
 * @param {string} url - The URL of the webpage to fetch.
 * @param {Object} config - The configuration object for Playwright.
 * @param {Object} [browserInstance] - An optional Playwright browser instance.
 * @returns {Promise<Object>} - An object containing the HTML content, cookies, headers, and certificate issuer.
 */
const playwrightFetch = async (url, config, browserPool) => {
  const start = performance.now();
  let browser, context;

  console.log(config);

  try {
    if (browserPool) {
      // ✅ Always use browser pool instead of launching a new browser
      const { browser: b, context: c } = await browserPool.getBrowserContext();
      browser = b;
      context = c;
    } else {
      // ❌ Fallback (should rarely happen)
      browser = await playwrightChromium.launch({
        ...config.browser,
        args: chromiumArgs,
      });
      context = await browser.newContext();
    }

    const page = await context.newPage();
    await page.setDefaultNavigationTimeout(60000);

    // Disable images and other unnecessary resources
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (["image", "font", "media"].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    let mainResponse = null;
    let certIssuer = null;

    await page.goto(url, { waitUntil: "domcontentloaded" });

    page.on("response", async (response) => {
      if (response.url() === url) {
        mainResponse = response;
        const securityDetails = await response.securityDetails();
        if (securityDetails && typeof securityDetails.issuer === "function") {
          certIssuer = securityDetails.issuer();
        }
      }
    });

    // Scroll to the bottom of the page if specified in the config
    if (config.scrollToBottom) {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          const scrollInterval = setInterval(() => {
            window.scrollBy(0, window.innerHeight);
            if (
              window.innerHeight + window.scrollY >=
              document.body.offsetHeight
            ) {
              clearInterval(scrollInterval);
              resolve();
            }
          }, 100);
        });
      });
    }

    // Wait for minTime if specified
    if (config.minTime) {
      const elapsed = performance.now() - start;
      if (elapsed < config.minTime) {
        await new Promise((resolve) =>
          setTimeout(resolve, config.minTime - elapsed)
        );
      }
    }

    // Extract all JavaScript properties
    const jsProperties = await page.evaluate(() => {
      function extractProperties(
        obj,
        depth = 0,
        maxDepth = 3,
        seen = new WeakSet()
      ) {
        if (
          !obj ||
          typeof obj !== "object" ||
          seen.has(obj) ||
          depth > maxDepth
        )
          return {};
        seen.add(obj);

        const extracted = {};
        for (const key in obj) {
          try {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              const value = obj[key];

              if (typeof value === "function") {
                extracted[key] = "Function()"; // Store function signatures
              } else if (typeof value === "object" && value !== null) {
                extracted[key] = extractProperties(
                  value,
                  depth + 1,
                  maxDepth,
                  seen
                ); // Recursively extract objects
              } else {
                extracted[key] = value;
              }
            }
          } catch (err) {
            extracted[key] = `Error: ${err.message}`; // Catch security restrictions
          }
        }
        return extracted;
      }

      return extractProperties(window);
    });

    const HTML = await page.content();
    const cookies = await page.context().cookies();
    const headers = await page.evaluate(async () => {
      const response = await fetch(window.location.href, { method: "GET" });
      return Object.fromEntries(response.headers.entries());
    });

    const payload = {
      url,
      headers,
      HTML,
      cookies,
      js: jsProperties,
      page,
      browser,
      duration: performance.now() - start,
    }

    return payload;
  } catch (error) {
    console.error(`Playwright fetch error: ${error.message}`);
    throw error;
  } finally {
    if (browserPool) {
      // ✅ Always release browser context back to the pool
      if (browser && context) {
        await browserPool.releaseBrowserContext(browser, context);
      }
    } else {
      // ❌ Close browser manually if not using the pool
      if (browser) {
        await browser.close();
      }
    }
  }
};

/**
 * Fetches a webpage using basic fetch and returns the HTML content, headers, and cookies.
 *
 * @param {string} url - The URL of the webpage to fetch.
 * @returns {Promise<Object>} - An object containing the HTML content, headers, and cookies.
 */
const basicFetch = async (url) => {
  // Start performance timer ⏱️
  const start = performance.now();

  // Create a custom agent that ignores SSL certificate errors
  const agent = new https.Agent({
    rejectUnauthorized: false,
  });

  try {
    const userAgent = new UserAgent();
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent.toString() },
      agent, // Use the custom agent
    });
    if (!response.ok) {
      throw new Error(`Response error: ${response.status}`);
    }
    const HTML = await response.text();
    const headers = response.headers.raw();
    const cookies = headers["set-cookie"] || [];
    return {
      HTML,
      headers,
      cookies,
      duration: performance.now() - start,
    };
  } catch (error) {
    console.error(`Basic fetch error: ${error.message}`);
    throw error;
  }
};

/**
 * Fetches the content of multiple CSS files.
 *
 * @param {string[]} cssUrls - An array of CSS file URLs.
 * @returns {Promise<string>} - A concatenated string of CSS contents.
 */
const fetchCSSContent = async (cssUrls, errors, logError, timeout = 3000) => {
  const fetchWithTimeout = (url, options, timeout) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Request timed out"));
      }, timeout);

      fetch(url, options)
        .then((response) => {
          clearTimeout(timer);
          resolve(response);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  const fetchSingleCSS = async (url) => {
    try {
      const response = await fetchWithTimeout(url, { agent }, timeout);
      if (!response.ok) {
        logError(
          errors,
          "fetchCSSContent",
          `Failed to fetch CSS from ${url}: ${response.status}`
        );
        return "";
      }
      return await response.text();
    } catch (err) {
      logError(
        errors,
        "fetchCSSContent",
        `Error fetching CSS from ${url}: ${err.message}`
      );
      return "";
    }
  };

  const agent = new https.Agent({ rejectUnauthorized: false });

  try {
    const cssContents = await Promise.all(
      cssUrls.map((url) => fetchSingleCSS(url))
    );
    return cssContents.join("\n");
  } catch (error) {
    logError(errors, "fetchCSSContent", `Promise.all failed: ${error.message}`);
    return "";
  }
};

/**
 * Fetches the content of multiple JS files.
 *
 * @param {string[]} jsUrls - An array of JS file URLs.
 * @returns {Promise<string>} - A concatenated string of JS contents.
 */
const fetchJSContent = async (scriptUrls, errors, logError, timeout = 3000) => {
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });

    const fetchWithTimeout = (url, options, timeout) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Request timed out"));
          logError(errors, "fetchJSContent", `Request timed out for ${url}`);
        }, timeout);

        fetch(url, options)
          .then((response) => {
            clearTimeout(timer);
            resolve(response);
          })
          .catch((err) => {
            clearTimeout(timer);
            reject(err);
          });
      });
    };

    const jsContents = await Promise.all(
      scriptUrls.map(async (url) => {
        if (url.startsWith("blob:")) return "";

        try {
          const response = await fetchWithTimeout(url, { agent }, timeout);
          if (!response.ok) {
            logError(
              errors,
              "fetchJSContent",
              `Failed to fetch JS from ${url}: ${response.status}`
            );
            return "";
          }
          return await response.text();
        } catch (err) {
          logError(
            errors,
            "fetchJSContent",
            `Failed to fetch JS from ${url}: ${err.message}`
          );
          return "";
        }
      })
    );

    return jsContents.join("\n");
  } catch (error) {
    logError(errors, "fetchJSContent", `JS fetch error: ${error.message}`);
    throw error;
  }
};

/**
 * Fetches the HTML content of a webpage, using either Puppeteer or basic fetch based on configuration.
 *
 * @param {string} url - The URL of the webpage to fetch.
 * @param {Object} config - The configuration object for fetching.
 * @returns {Promise<Object>} - An object containing the Cheerio instance, HTML content, headers, cookies, and certificate issuer.
 */
const getHTML = async (url, config) => {
  if (!url) throw new Error("No URL provided");

  async function targetPlaywrightFetch() {
    try {
      const response = await playwrightFetch(url, config);
      const $ = cheerio.load(response.HTML);
      
      return { ...response, $ }; // ✅ Spread response to keep all properties, including `js`
    } catch (error) {
      console.error(
        `Playwright fetch failed, falling back to basic fetch. Error: ${error.message}`
      );
      return targetBasicFetch();
    }
  }

  async function targetBasicFetch() {
    try {
      const { HTML, headers, cookies, duration } = await basicFetch(url);
      const $ = cheerio.load(HTML);
      return {
        $,
        HTML,
        headers,
        cookies,
        certIssuer: null,
        page: null,
        browser: null,
        duration,
      };
    } catch (error) {
      console.error(`Failed to fetch HTML: ${error.message}`);
      throw error;
    }
  }

  if (config.target === "playwright") {
    return await targetPlaywrightFetch();
  } else {
    return await targetBasicFetch();
  }
};

/**
 * Injects a script into the Puppeteer page context.
 *
 * @param {Object} page - The Puppeteer page instance.
 * @param {string} src - The script source URL.
 * @param {string} id - The ID to identify the script's message.
 * @param {Object} message - The message to send to the injected script.
 * @returns {Promise<Object>} - The result of the script execution.
 */
const inject = (page, src, id, message) => {
  return;
};

/**
 * Gets JavaScript-based technologies using Puppeteer.
 *
 * @param {Object} page - The Puppeteer page instance.
 * @param {Array} technologies - The technologies to analyze.
 * @returns {Promise<Array>} - The detected technologies.
 */
const getJs = async (page, technologies) => {
  try {
    return inject(page, "js/js.js", "js", {
      technologies: technologies
        .filter(({ js }) => Object.keys(js).length)
        .map(({ name, js }) => ({ name, chains: Object.keys(js) })),
    });
  } catch (error) {
    console.error(`Error getting JS technologies: ${error.message}`);
    return [];
  }
};

const runHelpers = async (url, dom, config) => {
  if (config.helpers && config.helpers.run) {
    const helperStart = performance.now();

    const wordpress = await Wordpress_Helpers.scan({
      url,
      dom,
    });

    const shopify = await Shopify_Helpers.scan({
      url,
      dom,
    });

    const magento = await Magento_Helpers.scan({
      url,
      dom,
    });

    const helperDuration = performance.now() - helperStart;
    return {
      helpers: [wordpress, shopify, magento],
      duration: helperDuration,
    };
  } else {
    return {
      helpers: [],
      duration: 0,
    };
  }
};

/**
 * Extracts technologies and other relevant data from a webpage.
 *
 * @param {string} url - The URL of the webpage to extract data from.
 * @param {Object} [config={ browser: { headless: true } }] - The configuration object for fetching.
 * @returns {Promise<Object>} - An object containing various extracted data including meta tags, scripts, CSS, headers, cookies, DNS records, and certificate issuer.
 */
const extractTechnologies = async (url, config = {}) => {
  const errors = [];
  const logError = createLogger(config);

  try {
    const response = await getHTML(url, config, config.browserPool).catch((err) => {
      logError(errors, "getHTML", err.message);
      throw err;
    });

    const {
      $,
      HTML,
      js,
      headers,
      cookies,
      certIssuer,
      page,
      browser,
      duration: fetchDuration,
    } = response;

    if (browser) {
      await browser.close();
    }

    const { helpers, duration: helperDuration } = await runHelpers(
      url,
      $,
      config,
      logError,
      errors
    ).catch((err) => {
      logError(errors, "runHelpers", err.message);
      return { helpers: [], duration: 0 };
    });

    const scriptSrc = [];
    $("script[src]").each((i, elem) => {
      try {
        scriptSrc.push(new URL($(elem).attr("src"), url).toString());
      } catch (err) {
        logError(
          errors,
          "extractTechnologies",
          `Failed to parse script URL: ${err.message}`
        );
      }
    });

    const cssUrls = [];
    $('link[rel="stylesheet"]').each((i, elem) => {
      try {
        cssUrls.push(new URL($(elem).attr("href"), url).toString());
      } catch (err) {
        logError(
          errors,
          "extractTechnologies",
          `Failed to parse CSS URL: ${err.message}`
        );
      }
    });

    const externalCssContent = await fetchCSSContent(
      cssUrls,
      errors,
      logError
    ).catch(() => "");

    const externalJsContent = await fetchJSContent(
      scriptSrc,
      errors,
      logError
    ).catch(() => "");

    const css = await extractCSSClasses(externalCssContent);

    return {
      url,
      js,
      scriptSrc,
      scripts: externalJsContent,
      css: externalCssContent,
      headers,
      cookies,
      certIssuer,
      dom: $,
      helpers,
      performance: {
        fetchDuration,
        helperDuration,
        errors, // Attach collected errors
      },
    };
  } catch (error) {
    logError(
      errors,
      "extractTechnologies",
      `Error extracting data: ${error.message}`
    );
    throw error;
  }
};

export { getHTML, extractTechnologies };
