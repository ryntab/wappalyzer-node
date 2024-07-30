const Magento_Helpers = {
    isMagento(dom) {
        return dom.html().match(/skin\/frontend\/|\/static\//i) !== null;
    },

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
