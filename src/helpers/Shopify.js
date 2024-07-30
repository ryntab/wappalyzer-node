import getDomain from "../utils/getDomain.js";

const Shopify_Helpers = {
    /**
     * Checks if the DOM represents a Shopify site by searching for the specific Boomerang script.
     * @param {object} dom - The Cheerio DOM object.
     * @returns {boolean} - True if the site is a Shopify site, otherwise false.
     */
    isShopify(dom) {
        const boomerangScript = dom('script.boomerang').html();
        return boomerangScript !== null && boomerangScript.includes('window.BOOMR.themeName');
    },

    /**
     * Parses the Boomerang script to extract theme metadata.
     * @param {string} boomerangScript - The content of the Boomerang script.
     * @returns {object|null} - An object containing the parsed metadata, or null if no metadata found.
     */
    parseThemeMetadata(boomerangScript) {
        const start = performance.now();
        const metadata = {};

        const themeNameMatch = boomerangScript.match(/window\.BOOMR\.themeName\s*=\s*"([^"]+)"/);
        const themeVersionMatch = boomerangScript.match(/window\.BOOMR\.themeVersion\s*=\s*"([^"]+)"/);
        const shopIdMatch = boomerangScript.match(/window\.BOOMR\.shopId\s*=\s*(\d+)/);
        const themeIdMatch = boomerangScript.match(/window\.BOOMR\.themeId\s*=\s*(\d+)/);

        if (themeNameMatch) metadata.themeName = themeNameMatch[1];
        if (themeVersionMatch) metadata.themeVersion = themeVersionMatch[1];
        if (shopIdMatch) metadata.shopId = shopIdMatch[1];
        if (themeIdMatch) metadata.themeId = themeIdMatch[1];

        const end = performance.now();
        return {
            metadata,
            duration: end - start,
        };
    },

    /**
     * Detects the theme of a Shopify site by searching for the Boomerang script.
     * @param {object} param - The parameters object.
     * @param {string} param.url - The URL of the site.
     * @param {object} param.dom - The Cheerio DOM object.
     * @returns {Promise<void>} - A promise that resolves when the theme detection is complete.
     */
    async detectTheme({ url, dom }) {
        const start = performance.now();

        let boomerangScript = dom('script.boomerang').html();

        if (boomerangScript) {
            const { metadata, duration: parseDuration } = this.parseThemeMetadata(boomerangScript);

            return {
                themeMetadata: metadata,
                duration: performance.now() - start + parseDuration,
            };
        } else {
            console.log('No Boomerang script detected');
        }
    },

    /**
     * Scans the provided URL and DOM to detect if the site is a Shopify site, and its theme metadata.
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

        // If not a Shopify site, return
        if (!this.isShopify(dom)) {
            return false;
        }

        const { hostname: domain } = getDomain(url);

        const theme = await this.detectTheme({ url, dom });

        // End performance timer ⏱️
        const end = performance.now();

        return {
            name: 'Shopify',
            domain,
            theme,
            duration: end - start,
        }
    }
};

export default Shopify_Helpers;
