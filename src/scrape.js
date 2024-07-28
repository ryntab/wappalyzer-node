import fetch from "node-fetch";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import UserAgent from "user-agents";
import * as cheerio from "cheerio";
import dns from "dns/promises";
import https from 'https';

const chromiumArgs = [
    "--no-sandbox",
    "--no-zygote",
    "--disable-gpu",
    "--ignore-certificate-errors",
    "--allow-running-insecure-content",
    "--disable-web-security",
];

const agent = new https.Agent({
    rejectUnauthorized: false,
});

const fetchWithAgent = (url, options = {}) => {
    return fetch(url, { ...options, agent });
};

/**
 * Fetches a webpage using Puppeteer and returns the HTML content, cookies, headers, and certificate issuer.
 * 
 * @param {string} url - The URL of the webpage to fetch.
 * @param {Object} config - The configuration object for Puppeteer.
 * @param {Object} [browserInstance] - An optional Puppeteer browser instance.
 * @returns {Promise<Object>} - An object containing the HTML content, cookies, headers, and certificate issuer.
 */
const puppeteerFetch = async (url, config, browserInstance) => {
    try {
        const browser = browserInstance || await puppeteer.use(StealthPlugin()).launch({
            ...config.browser,
            args: chromiumArgs,
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000); // Set navigation timeout to 60 seconds

        // Disable images and other unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (resourceType === 'image' || resourceType === 'font') {
                req.abort();
            } else {
                req.continue();
            }
        });

        let mainResponse = null;
        let certIssuer = null;

        page.on("response", async (response) => {
            if (response.url() === url) {
                mainResponse = response;
                const securityDetails = await response.securityDetails();
                if (securityDetails) {
                    certIssuer = securityDetails.issuer();
                }
            }
        });

        await page.goto(url, { waitUntil: "networkidle2" });
        const HTML = await page.content();
        const cookies = await page.cookies();
        const headers = mainResponse ? mainResponse.headers() : {};
        if (!browserInstance) {
            await browser.close();
        }
        return { HTML, cookies, headers, certIssuer };
    } catch (error) {
        console.error(`Puppeteer fetch error: ${error.message}`);
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
const fetchCSSContent = async (cssUrls) => {
    // Create a custom agent that ignores SSL certificate errors
    const agent = new https.Agent({
        rejectUnauthorized: false,
    });

    try {
        const cssContents = await Promise.all(
            cssUrls.map(async (url) => {
                const response = await fetch(url, { agent });
                if (!response.ok) {
                    throw new Error(`Failed to fetch CSS: ${response.status}`);
                }
                return await response.text();
            })
        );
        return cssContents.join("\n");
    } catch (error) {
        console.error(`CSS fetch error: ${error.message}`);
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

    async function targetBrowserFetch() {
        try {
            const { HTML, cookies, headers, certIssuer } = await puppeteerFetch(
                url,
                config
            );
            const $ = cheerio.load(HTML);
            return { $, HTML, headers, cookies, certIssuer };
        } catch (error) {
            console.error(
                `Puppeteer fetch failed, falling back to basic fetch. Error: ${error.message}`
            );
            return targetBasicFetch();
        }
    }

    async function targetBasicFetch() {
        try {
            const { HTML, headers, cookies } = await basicFetch(url);
            const $ = cheerio.load(HTML);
            return { $, HTML, headers, cookies, certIssuer: null };
        } catch (error) {
            console.error(`Failed to fetch HTML: ${error.message}`);
            throw error;
        }
    }

    if (config.target === "browser") {
        return await targetBrowserFetch();
    } else {
        return await targetBasicFetch();
    }
};

/**
 * Extracts technologies and other relevant data from a webpage.
 * 
 * @param {string} url - The URL of the webpage to extract data from.
 * @param {Object} [config={ browser: { headless: true } }] - The configuration object for fetching.
 * @returns {Promise<Object>} - An object containing various extracted data including meta tags, scripts, CSS, headers, cookies, DNS records, and certificate issuer.
 */
const extractTechnologies = async (
    url,
    config = {
        browser: {
            headless: false,
        },
    }
) => {
    try {
        const { $, HTML, headers, cookies, certIssuer } = await getHTML(
            url,
            config
        );

        const baseUrl = new URL(url);

        const scriptSrc = [];
        $("script[src]").each((i, elem) => {
            const src = $(elem).attr("src");
            const fullSrc = new URL(src, baseUrl).toString();
            scriptSrc.push(fullSrc);
        });

        const inlineScripts = [];
        $("script:not([src])").each((i, elem) =>
            inlineScripts.push(JSON.stringify($(elem).html()))
        );

        const cssUrls = [];
        $('link[rel="stylesheet"]').each((i, elem) => {
            const href = $(elem).attr("href");
            const fullHref = new URL(href, baseUrl).toString();
            cssUrls.push(fullHref);
        });

        const externalCssContent = await fetchCSSContent(cssUrls);

        const inlineStyles = [];
        $("style").each((i, elem) => inlineStyles.push($(elem).html()));

        const cssContent = externalCssContent + "\n" + inlineStyles.join("\n");

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
        const reducedHostName = hostname.replace(/^www\./, "").replace(/^http\./, "").replace(/^https\./, "");
        const dnsRecords = { TXT: [], MX: [] };
        try {
            dnsRecords.TXT = await dns.resolveTxt(reducedHostName);
            dnsRecords.MX = await dns.resolveMx(reducedHostName);
        } catch (error) {
            console.error(`DNS lookup error: ${error.message}`);
        }

        return {
            url,
            meta,
            scriptSrc,
            scripts: inlineScripts,
            css: cssContent,
            html: HTML,
            headers: formattedHeaders,
            cookies: cookiesParsed,
            dns: {
                txt: dnsRecords.TXT,
                mx: dnsRecords.MX,
            },
            certIssuer,
        };
    } catch (error) {
        console.error(`Error extracting data: ${error.message}`);
        throw error;
    }
};

export { getHTML, extractTechnologies };
