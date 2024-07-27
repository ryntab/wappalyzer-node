import wappalyzer from "./src/wappalyzer.js";
import { extractTechnologies } from "./src/scrape.js";
import { load_technologies } from "./src/technologies/__loader.js";
import categories from "./src/categories.json" assert { type: "json" };
import Wappalyzer from "./src/wappalyzer.js";

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
      certIssuer,
    } = payload;

    return await wappalyzer.analyze({
      url,
      html,
      css,
      scriptSrc,
      scripts,
      headers,
      cookies,
      meta,
      dns,
      certIssuer,
    });
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
const scan = async (url, config = {
  browser: {
    headless: false,
  }
}) => {
  const techLib = await load_technologies();
  await Wappalyzer.setTechnologies(techLib);
  await Wappalyzer.setCategories(categories);

  try {
    const technologies = await extractTechnologies(url, config);
    const parsedTechnologies = await analyze(technologies);
    return await wappalyzer.resolve(parsedTechnologies);
  } catch (error) {
    console.error("Error during scan:", error);
    throw new Error("Failed to scan and analyze technologies");
  }
};

export { analyze, scan };
