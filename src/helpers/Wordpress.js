import getDomain from "../utils/getDomain.js";

const Wordpress_Helpers = {
    /**
     * Checks if the DOM represents a WordPress site by searching for common WordPress directories.
     * @param {object} dom - The Cheerio DOM object.
     * @returns {boolean} - True if the site is a WordPress site, otherwise false.
     */
    isWordpress(dom) {
        return dom.html().match(/<(img|link|script) [^>]+wp-content/i) !== null;
    },

    /**
     * Checks if the home page contains WordPress-specific directories.
     * @param {object} param - The parameters object.
     * @param {string} param.url - The URL of the site.
     * @param {object} param.dom - The Cheerio DOM object.
     * @returns {object} - An object containing the URL, home URL, and time taken.
     */
    hasHome({ url, dom }) {
        const start = performance.now();
        let domainPart = getDomain(url);
        let html = dom.html().slice(0, 100000);
        let urlPart = "[A-Za-z0-9/./-/_/]+";
        let httpPart = "[A-Za-z0-9/:/./-/_/]+";
        let regex = new RegExp(
            `(${httpPart})(${domainPart})(${urlPart})(wp-includes|wp-content)(${urlPart})`,
            "im"
        );
        let matches = html.match(regex);
        let home = "";
        if (matches && matches.length > 3) {
            home = matches[1] + matches[2] + matches[3];
        }
        const end = performance.now();
        return {
            url: url,
            home: home,
            duration: end - start,
        };
    },

    /**
     * Extracts the URLs of WordPress plugins used by the site.
     * @param {object} param - The parameters object.
     * @param {string} param.url - The URL of the site.
     * @param {object} param.dom - The Cheerio DOM object.
     * @returns {object} - An object containing the URL, list of plugin URLs, and time taken.
     */
    detectWPPlugins({ url, dom }) {
        let start = performance.now();
        let list = [];
        let domainPart = getDomain(url);
        let html = dom.html().slice(0, 100000);
        let urlPart = "[A-Za-z0-9/./-/_/]*";
        let httpPart = "[A-Za-z0-9/:/./-/_/]+";
        let filePart = "(.css|.js)";
        let regex = new RegExp(
            `(${httpPart})(${domainPart})(${urlPart})(wp-includes|wp-content)(${urlPart})(${filePart})(${urlPart})`,
            "img"
        );
        let matches = html.match(regex);
        let pattern = /\.(css|js)/;
        if (matches && matches.length > 3) {
            for (let i = 0; i < matches.length; i++) {
                if (pattern.test(matches[i])) {
                    list.push(matches[i]);
                }
            }
        }
        const end = performance.now();
        return {
            url: url,
            list: list,
            duration: end - start,
        };
    },

    /**
     * Parses the theme metadata from the style.css content.
     * @param {string} styleCssContent - The content of the style.css file.
     * @returns {object|null} - An object containing the parsed metadata, or null if no metadata found.
     */
    parseThemeMetadata(styleCssContent) {
        const start = performance.now();
        const metadataPattern = /\/\*([\s\S]*?)\*\//;
        const match = styleCssContent.match(metadataPattern);

        if (!match) return null;

        const metadataBlock = match[1].trim();
        const lines = metadataBlock.split('\n');
        const metadata = {};

        lines.forEach(line => {
            const [key, ...value] = line.split(':');
            if (key && value.length) {
                const cleanedKey = key.replace(/[*]/g, '').trim();
                metadata[cleanedKey] = value.join(':').trim();
            }
        });

        const end = performance.now();
        return {
            metadata,
            duration: end - start,
        }
    },

    /**
     * Detects the theme of a WordPress site by fetching and parsing the style.css file.
     * @param {object} param - The parameters object.
     * @param {string} param.url - The URL of the site.
     * @param {string} param.domain - The domain of the site.
     * @param {object} param.dom - The Cheerio DOM object.
     * @returns {Promise<void>} - A promise that resolves when the theme detection is complete.
     */
    async detectTheme({ url, domain, dom }) {
        const start = performance.now();

        let html = dom.html();
        let regex = /wp-content\/themes\/([\w.-]+)/i; // Updated regex to match more characters
        let matches = html.match(regex);
        let theme = matches ? matches[1] : null;

        if (theme) {
            const ensureProtocol = (link) => {
                if (!link.startsWith('http://') && !link.startsWith('https://')) {
                    return 'http://' + link;
                }
                return link;
            };

            const formattedUrl = ensureProtocol(url);
            const formattedDomain = ensureProtocol(domain);

            const cssUrlsToCheck = [
                `${new URL(formattedUrl).origin}/wp-content/themes/${theme}/style.css`,
                `${new URL(formattedDomain).origin}/wp-content/themes/${theme}/style.css`
            ];

            const cssFetches = cssUrlsToCheck.map(attemptURL =>
                fetch(attemptURL)
                    .then(response => response.ok ? response.text() : null)
                    .catch(error => {
                        console.error(`Error fetching ${attemptURL}:`, error);
                        return null;
                    })
            );

            const screenshotUrlsToCheck = [
                `${new URL(formattedUrl).origin}/wp-content/themes/${theme}/screenshot.png`,
                `${new URL(formattedDomain).origin}/wp-content/themes/${theme}/screenshot.png`
            ];

            const screenshotFetches = screenshotUrlsToCheck.map(attemptURL =>
                fetch(attemptURL)
                    .then(response => response.ok ? attemptURL : null)
                    .catch(error => {
                        console.error(`Error fetching ${attemptURL}:`, error);
                        return null;
                    })
            );

            try {
                const [cssResults, screenshotResults] = await Promise.all([
                    Promise.all(cssFetches),
                    Promise.all(screenshotFetches)
                ]);

                const validCssResult = cssResults.find(result => result !== null);
                const validScreenshotResult = screenshotResults.find(result => result !== null);

                if (validCssResult) {
                    const { metadata } = this.parseThemeMetadata(validCssResult);
                    metadata.screenshot = validScreenshotResult || 'Screenshot not found';
                    return {
                        themeDirectory: theme,
                        ...metadata,
                        duration: performance.now() - start,
                    };
                } else {
                    console.log('No valid style.css found at the provided URLs');
                }
            } catch (error) {
                console.error('Error during fetching process:', error);
            }
        } else {
            console.log('No theme detected');
        }
    },

    /**
     * Scans the provided URL and DOM to detect if the site is a WordPress site, its theme, and plugins.
     * @param {object} param - The parameters object.
     * @param {string} param.url - The URL of the site.
     * @param {object} param.dom - The Cheerio DOM object.
     * @returns {Promise<void>} - A promise that resolves when the scan is complete.
     */
    async scan({ url, dom }) {

        // Start performance timer ⏱️
        const start = performance.now();

        // Check if valid URL
        if (!url || !dom) {
            throw new Error("Invalid URL or DOM was not passed.");
        }

        // If not a WordPress site, return
        if (!this.isWordpress(dom)) {
            return false;
        }

        const { hostname: domain } = getDomain(url);
        const hasHome = this.hasHome({ url, dom });
        const plugins = this.detectWPPlugins({ url, dom });

        const theme = await this.detectTheme({
            url,
            domain,
            dom,
        });

        // End performance timer ⏱️
        const end = performance.now();

        return {
            name: 'WordPress',
            domain,
            hasHome,
            plugins,
            theme,
            duration: end - start,
        }
    }
};

export default Wordpress_Helpers;
