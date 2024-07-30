const Magento_Helpers = {
    /**
     * Checks if the given DOM represents a Magento site.
     *
     * @param {Object} dom - The DOM object of the webpage.
     * @returns {boolean} - Returns true if the site is identified as Magento, false otherwise.
     */
    isMagento(dom) {
        return dom.html().match(/skin\/frontend\/|\/static\//i) !== null;
    },

    /**
     * Detects Magento themes from the given URL and DOM.
     *
     * @param {Object} param0 - An object containing the URL and DOM.
     * @param {string} param0.url - The URL of the webpage.
     * @param {Object} param0.dom - The DOM object of the webpage.
     * @returns {Object|boolean} - Returns an object with the URL, detected themes, and duration, or false if no themes are detected.
     */
    detectMagentoThemes({ url, dom }) {
        let start = performance.now();
        let themes = [];
        let html = dom.html().slice(0, 100000);
        let regex = /\/skin\/frontend\/([\w-]+)\/([\w-]+)/ig;
        let matches = html.match(regex);
        if (matches) {
            matches.forEach(match => {
                let theme = match.split('/')[3];
                if (!themes.includes(theme)) {
                    themes.push(theme);
                }
            });
        }

        if (themes.length === 0) {
            regex = /\/static\/version([\w-]+)\/frontend\/([\w-]+)\/([\w-]+)/ig;
            matches = html.match(regex);
            if (matches) {
                matches.forEach(match => {
                    let theme = match.split('/')[4];
                    if (!themes.includes(theme)) {
                        themes.push(theme);
                    }
                });
            }
        }

        if (themes.length === 0) {
            regex = /\/static\/frontend\/([\w-]+)\/([\w-]+)/ig;
            matches = html.match(regex);
            if (matches) {
                matches.forEach(match => {
                    let theme = match.split('/')[3];
                    if (!themes.includes(theme)) {
                        themes.push(theme);
                    }
                });
            }
        }

        if (themes.length === 0) {
           return false;
        }

        const end = performance.now();
        return {
            url: url,
            themes: themes,
            duration: end - start,
        };
    },

    /**
     * Scans the given URL and DOM to detect if the site is a Magento site and identifies the themes used.
     *
     * @param {Object} param0 - An object containing the URL and DOM.
     * @param {string} param0.url - The URL of the webpage.
     * @param {Object} param0.dom - The DOM object of the webpage.
     * @returns {Object|boolean} - Returns an object with the name 'Magento', detected themes, and duration, or false if the site is not identified as Magento.
     */
    async scan({ url, dom }) {
        const start = performance.now();
        if (!this.isMagento(dom)) {
            return false;
        }
        const themes = this.detectMagentoThemes({ url, dom });
        const end = performance.now();
        return {
            name: 'Magento',
            themes,
            duration: end - start,
        };
    }
};

export default Magento_Helpers;
