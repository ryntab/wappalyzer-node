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
];

/**
 * Fetches a webpage using Playwright and returns the HTML content, cookies, headers, and certificate issuer.
 *
 * @param {string} url - The URL of the webpage to fetch.
 * @param {Object} config - The configuration object for Playwright.
 * @param {Object} [browserInstance] - An optional Playwright browser instance.
 * @returns {Promise<Object>} - An object containing the HTML content, cookies, headers, and certificate issuer.
 */
const playwrightFetch = async (url, config, browserInstance) => {
  const start = performance.now();
  try {
    const browser =
      browserInstance ||
      (await playwrightChromium.launch({
        ...config.browser,
        args: chromiumArgs,
      }));

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(config.maxTime || 60000); // Set navigation timeout to maxTime or 60 seconds

    // Disable images and other unnecessary resources
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (
        resourceType === "image" ||
        resourceType === "font" ||
        resourceType === "media"
      ) {
        route.abort();
      } else {
        route.continue();
      }
    });

    let mainResponse = null;
    let certIssuer = null;

    page.on("response", async (response) => {
      if (response.url() === url) {
        mainResponse = response;
        const securityDetails = await response.securityDetails();
        if (securityDetails && typeof securityDetails.issuer === "function") {
          certIssuer = securityDetails.issuer();
        }
      }
    });

    await page.goto(url, { waitUntil: config.waitUntil || "domcontentloaded" });

    // Scroll to the bottom of the page if specified in the config
    if (config.scrollToBottom) {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          const scrollInterval = setInterval(() => {
            window.scrollBy(0, window.innerHeight);
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
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
        await new Promise((resolve) => setTimeout(resolve, config.minTime - elapsed));
      }
    }

    const HTML = await page.content();
    const cookies = await page.context().cookies();
    const headers = mainResponse ? mainResponse.headers() : {};

    // Close the browser if not reusing
    if (!config.reuseBrowser && !browserInstance) {
      await browser.close();
    }

    return {
      HTML,
      cookies,
      headers,
      certIssuer,
      page,
      browser,
      duration: performance.now() - start,
    };
  } catch (error) {
    console.error(`Playwright fetch error: ${error.message}`);
    throw error;
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
const fetchCSSContent = async (cssUrls, timeout = 3000) => {
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
        console.error(`Failed to fetch CSS from ${url}: ${response.status}`);
        return ""; // Return an empty string on failure
      }
      const text = await response.text();
      return text;
    } catch (err) {
      console.error(`Error fetching CSS from ${url}: ${err.message}`);
      return ""; // Return an empty string on error
    }
  };

  // Create a custom agent that ignores SSL certificate errors
  const agent = new https.Agent({
    rejectUnauthorized: false,
  });

  try {
    const cssContents = await Promise.all(
      cssUrls.map((url) =>
        fetchSingleCSS(url).catch((err) => {
          console.error(`Caught error for ${url}: ${err.message}`);
          return ""; // Ensure we return an empty string on error
        })
      )
    );
    return cssContents.join("\n");
  } catch (error) {
    console.error(`CSS fetch error in Promise.all: ${error.message}`);
    // Ensure the function never fails by returning an empty string or partial result
    return "";
  }
};

/**
 * Fetches the content of multiple JS files.
 *
 * @param {string[]} jsUrls - An array of JS file URLs.
 * @returns {Promise<string>} - A concatenated string of JS contents.
 */
const fetchJSContent = async (scriptUrls, timeout = 3000) => {
  try {
    // Create a custom agent that ignores SSL certificate errors
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

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

    const jsContents = await Promise.all(
      scriptUrls.map(async (url) => {
        // Skip URLs with the "blob:" scheme
        if (url.startsWith("blob:")) {
          return "";
        }
        try {
          const response = await fetchWithTimeout(url, { agent }, timeout);
          if (!response.ok) {
            console.error(`Failed to fetch JS: ${url}: ${response.status}`);
            return ""; // Return an empty string on failure
          }
          return await response.text();
        } catch (err) {
          console.error(`Failed to fetch JS: ${url}: ${err.message}`);
          return ""; // Return an empty string on failure
        }
      })
    );

    return jsContents.join("\n");
  } catch (error) {
    console.error(`JS fetch error: ${error.message}`);
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
      const { HTML, cookies, headers, certIssuer, page, browser, duration } =
        await playwrightFetch(url, config);
      const $ = cheerio.load(HTML);
      return { $, HTML, headers, cookies, certIssuer, page, browser, duration };
    } catch (error) {
      console.error(
        `Puppeteer fetch failed, falling back to basic fetch. Error: ${error.message}`
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
const extractTechnologies = async (url, config) => {
  try {
    const {
      $,
      HTML,
      headers,
      cookies,
      certIssuer,
      page,
      browser,
      duration: fetchDuration,
    } = await getHTML(url, config);

    console.log("Fetched HTML for", url);

    const { helpers, duration: helperDuration } = await runHelpers(
      url,
      $,
      config.helpers
    );

    const baseUrl = new URL(url);

    const scriptSrc = [];
    $("script[src]").each((i, elem) => {
      const src = $(elem).attr("src");
      const fullSrc = new URL(src, baseUrl).toString();
      scriptSrc.push(fullSrc);
    });

    const inlineScripts = [];
    $("script:not([src])").each((i, elem) => {
      inlineScripts.push(JSON.stringify($(elem).html()));
    });

    const cssUrls = [];
    $('link[rel="stylesheet"]').each((i, elem) => {
      const href = $(elem).attr("href");
      const fullHref = new URL(href, baseUrl).toString();
      cssUrls.push(fullHref);
    });

    const externalCssContent = await fetchCSSContent(cssUrls);
    const externalJsContent = await fetchJSContent(scriptSrc);

    const inlineStyles = [];
    $("style").each((i, elem) => inlineStyles.push($(elem).html()));

    const cssContent = externalCssContent
      ? externalCssContent + "\n" + inlineStyles.join("\n")
      : inlineStyles.join("\n");

    const meta = {};
    $("meta").each((i, elem) => {
      const name = $(elem).attr("name") || $(elem).attr("property");
      if (name) {
        if (!meta[name]) meta[name] = [];
        meta[name].push($(elem).attr("content"));
      }
    });

    const cookiesParsed = {};
    cookies.forEach((cookie) => {
      cookiesParsed[cookie.name] = [
        cookie.value,
        cookie.domain,
        cookie.path,
        cookie.expires,
        cookie.size,
        cookie.httpOnly,
        cookie.secure,
        cookie.session,
        cookie.sameSite,
      ];
    });

    const formattedHeaders = {};
    Object.entries(headers).forEach(([key, value]) => {
      if (!formattedHeaders[key]) formattedHeaders[key] = [];
      formattedHeaders[key].push(value);
    });

    const hostname = new URL(url).hostname;
    const reducedHostName = hostname
      .replace(/^www\./, "")
      .replace(/^http\./, "")
      .replace(/^https\./, "");
    const dnsRecords = { TXT: [], MX: [] };
    try {
      dnsRecords.TXT = await dns.resolveTxt(reducedHostName);
      dnsRecords.MX = await dns.resolveMx(reducedHostName);
    } catch (error) {
      console.error(`DNS lookup error: ${error.message}`);
    }

    // const jsTechnologies = page ? await getJs(page, Wappalyzer.technologies) : [];

    if (browser) {
      await browser.close();
    }

    return {
      url,
      meta,
      scriptSrc,
      // js: externalJsContent,
      scripts: inlineScripts,
      css: cssContent,
      html: HTML,
      headers: formattedHeaders,
      cookies: cookiesParsed,
      dns: {
        txt: dnsRecords.TXT,
        mx: dnsRecords.MX,
      },
      text: externalJsContent,
      certIssuer,
      dom: $,
      helpers,
      performance: {
        fetchDuration,
        helperDuration,
      },
      // jsTechnologies
    };
  } catch (error) {
    console.error(`Error extracting data: ${error.message}`);
    throw error;
  }
};

export { getHTML, extractTechnologies };
