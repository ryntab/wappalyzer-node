import * as cheerio from "cheerio";
import https from "https";
import Wordpress_Helpers from "./helpers/Wordpress.js";
import Shopify_Helpers from "./helpers/Shopify.js";
import Magento_Helpers from "./helpers/Magento.js";

const createLogger = (config = {}) => {
  return (errors, functionName, message) => {
    if (!config.debug?.enabled) return;

    if (errors) {
      errors.push({ function: functionName, message });
    }
  };
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


const runHelpers = async (url, dom, config) => {
  const shouldRunHelpers = config?.helpers?.run !== false;

  if (shouldRunHelpers) {
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
 * Extracts technologies from an already-open Puppeteer/Playwright page.
 *
 * @param {Object} page - Puppeteer or Playwright page object.
 * @param {string} [url] - Optional URL override.
 * @param {Object} [config={}] - Configuration object.
 * @returns {Promise<Object>} - Payload ready for Wappalyzer analysis.
 */
const extractTechnologiesFromPage = async (page, url, config = {}) => {
  const errors = [];
  const logError = createLogger(config);

  if (!page || typeof page.content !== "function") {
    throw new Error("A valid Puppeteer or Playwright page is required");
  }

  const start = performance.now();

  try {
    const pageUrl =
      url || (typeof page.url === "function" ? page.url() : "") || "about:blank";

    const HTML = await page.content();
    const $ = cheerio.load(HTML);

    const js = await page
      .evaluate(() => {
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
          ) {
            return {};
          }

          seen.add(obj);
          const extracted = {};

          for (const key in obj) {
            try {
              if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];

                if (typeof value === "function") {
                  extracted[key] = "Function()";
                } else if (typeof value === "object" && value !== null) {
                  extracted[key] = extractProperties(
                    value,
                    depth + 1,
                    maxDepth,
                    seen
                  );
                } else {
                  extracted[key] = value;
                }
              }
            } catch (err) {
              extracted[key] = `Error: ${err.message}`;
            }
          }

          return extracted;
        }

        return extractProperties(window);
      })
      .catch((err) => {
        logError(errors, "extractTechnologiesFromPage", `JS extraction failed: ${err.message}`);
        return {};
      });

    const headers = await page
      .evaluate(async () => {
        try {
          const response = await fetch(window.location.href, { method: "GET" });
          return Object.fromEntries(response.headers.entries());
        } catch {
          return {};
        }
      })
      .catch((err) => {
        logError(errors, "extractTechnologiesFromPage", `Header extraction failed: ${err.message}`);
        return {};
      });

    let cookies = [];
    try {
      if (typeof page.context === "function") {
        cookies = await page.context().cookies();
      } else if (typeof page.cookies === "function") {
        cookies = await page.cookies();
      }
    } catch (err) {
      logError(errors, "extractTechnologiesFromPage", `Cookie extraction failed: ${err.message}`);
    }

    const { helpers, duration: helperDuration } = await runHelpers(
      pageUrl,
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
        scriptSrc.push(new URL($(elem).attr("src"), pageUrl).toString());
      } catch (err) {
        logError(
          errors,
          "extractTechnologiesFromPage",
          `Failed to parse script URL: ${err.message}`
        );
      }
    });

    const cssUrls = [];
    $('link[rel="stylesheet"]').each((i, elem) => {
      try {
        cssUrls.push(new URL($(elem).attr("href"), pageUrl).toString());
      } catch (err) {
        logError(
          errors,
          "extractTechnologiesFromPage",
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

    return {
      url: pageUrl,
      js,
      scriptSrc,
      scripts: externalJsContent,
      css: externalCssContent,
      headers,
      cookies,
      certIssuer: null,
      dom: $,
      helpers,
      performance: {
        fetchDuration: performance.now() - start,
        helperDuration,
        errors,
      },
    };
  } catch (error) {
    logError(
      errors,
      "extractTechnologiesFromPage",
      `Error extracting data: ${error.message}`
    );
    throw error;
  }
};

/**
 * Extracts technologies from raw HTML.
 *
 * @param {string} html - Raw HTML string.
 * @param {object} [opts]
 * @param {string}   [opts.url="about:blank"] - Base URL for resolving relative links.
 * @param {object}   [opts.headers={}]        - Response headers.
 * @param {Array}    [opts.cookies=[]]        - Cookies array.
 * @returns {Promise<Object>} - Payload ready for WappalyzerCore analysis.
 */
const extractTechnologiesFromHTML = async (
  html,
  { url = "about:blank", headers = {}, cookies = [] } = {}
) => {
  const config = { helpers: { run: true }, debug: { enabled: false } };
  const errors = [];
  const logError = createLogger(config);
  const start = performance.now();

  try {
    const $ = cheerio.load(html);

    const scriptSrc = [];
    $("script[src]").each((i, elem) => {
      try {
        scriptSrc.push(new URL($(elem).attr("src"), url).toString());
      } catch (err) {
        logError(errors, "extractTechnologiesFromHTML", `Failed to parse script URL: ${err.message}`);
      }
    });

    const cssUrls = [];
    $('link[rel="stylesheet"]').each((i, elem) => {
      try {
        cssUrls.push(new URL($(elem).attr("href"), url).toString());
      } catch (err) {
        logError(errors, "extractTechnologiesFromHTML", `Failed to parse CSS URL: ${err.message}`);
      }
    });

    const externalCssContent = await fetchCSSContent(cssUrls, errors, logError).catch(() => "");
    const externalJsContent = await fetchJSContent(scriptSrc, errors, logError).catch(() => "");

    const { helpers, duration: helperDuration } = await runHelpers(url, $, config).catch((err) => {
      logError(errors, "runHelpers", err.message);
      return { helpers: [], duration: 0 };
    });

    return {
      url,
      js: {},
      scriptSrc,
      scripts: externalJsContent,
      css: externalCssContent,
      headers,
      cookies,
      certIssuer: null,
      dom: $,
      helpers,
      performance: {
        fetchDuration: performance.now() - start,
        helperDuration,
        errors,
      },
    };
  } catch (error) {
    logError(errors, "extractTechnologiesFromHTML", `Error extracting data: ${error.message}`);
    throw error;
  }
};

export { extractTechnologiesFromPage, extractTechnologiesFromHTML };
