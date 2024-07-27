# Wappalyzer-Wrapper

Fork of a archived project, using wappalyzers last public commit.

Convenience wrapper around [wappalyzer](https://www.npmjs.com/package/wappalyzer) library.

* Cannonicalizes technologies by adding an `id` that remains constant between versions.
* Png version of all the logo's with the same name as those ids.
* CDN hosted logo's under https://assets.woorank.com/tech-icons/google-analytics.png
* Easier to use API.

## Example:

```js
const wappalyzerWrapper = require('wappalyzer-wrapper');

wappalyzerWrapper.analyze({ 
      certIssuer,
      cookies,
      css,
      dns,
      headers,
      html,
      meta,
      probe,
      robots,
      scriptSrc,
      scripts,
      text,
      url,
      xhr
});

// [ 
//   { app: 'Google Analytics',
//     version: 'UA',
//     id: 'google-analytics',
//     categories: [ 'analytics' ] },
//   { app: 'jQuery',
//     version: '',
//     id: 'jquery',
//     categories: [ 'javascript-frameworks' ] } 
// ]

```

## API

Analyze html, scripts, headers, js, dns TXT and MX records for detecting used technologies.
```js
const wappalyzerWrapper = require('wappalyzer-wrapper');

const url = 'https://example.blogspot.com';

const html = `
  <!DOCTYPE HTML>
  <html>
    <head>
    </head>
    <body>
    <!-- Google Tag Manager -->
      <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KAAOEOE"
      height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    <!-- End Google Tag Manager -->
    </body>
  </html>
`;

const scripts = [
  'http://www.google-analytics.com/analytics.js',
  'http://example.com/assets/js/jquery.min.js'
];

const headers = {
  'date': [ 'Thu, 01 Feb 2018 11:34:18 GMT' ],
  'connection': [ 'keep-alive' ],
  'x-powered-by': [ 'Express' ],
  'content-length': [ '293' ],
  'content-type': [ 'text/html; charset=utf-8' ]
};

const js = {
  'momentjs': { 'moment': { '0': true } },
  'google-font-api': { 'WebFonts': { '0': true } }
};

const cookies = {
  'phpsessid': [ 'abc123' ],
  'fesessionid': [ 'xyz456' ]
};

const meta = {
  'generator': [ 'WordPress 5.2.4', 'WooCommerce 3.6.4' ],
  'csrf-param': [ 'authenticity_token' ],
  'sim.medium': [ 'Home' ]
};

const dnsTxtRecords = [
  [ 'facebook-domain-verification=abc123' ],
  [ 'google-site-verification=xyz456' ],
  [ 'spf2.0/pra include:spf.recurly.com include:amazonses.com ~all' ],
  [ 'v=spf1 include:spf.mailjet.com include:spf.recurly.com include:amazonses.com include:spf.mandrillapp.com include:servers.mcsv.net ~all' ]
];

const dnsMxRecords = [
  { exchange: 'alt1.aspmx.l.google.com', priority: 20 },
  { exchange: 'aspmx3.googlemail.com', priority: 30 },
  { exchange: 'aspmx.l.google.com', priority: 10 },
  { exchange: 'aspmx2.googlemail.com', priority: 30 },
  { exchange: 'alt2.aspmx.l.google.com', priority: 20 }
];

const technologies = wappalyzerWrapper.analyze({ url, html, scripts, headers, js, cookies, meta, dnsTxtRecords, dnsMxRecords });
```

Wappalyzer apps list curated with consistent syntax id's.
```js
const wappalyzerWrapper = require('wappalyzer-wrapper');
const apps = wappalyzerWrapper.apps;
```

Wappalyzer categories list curated with consistent syntax id's.
```js
const wappalyzerWrapper = require('wappalyzer-wrapper');
const categories = wappalyzerWrapper.categories;
```

Wappalyzer jsPatterns.
```js
const wappalyzerWrapper = require('wappalyzer-wrapper');
const jsPatterns = wappalyzerWrapper.jsPatterns;
```

Wappalyzer apps list curated with consistent syntax id's in CSV format in the command line.
```
npm run apps
```

Wappalyzer categories list curated with consistent syntax id's in CSV format in the command line.
```
npm run categories
```

## Debugging

```
npm run debug-test
```

1. Add `debugger;` statement anywhere in the code to stop the execution.
2. Type `chrome://inspect/#devices` in your chrome browser.
3. Click on the remote target to start the debugging console from devtools.

## Optimize icons

```
npm run optimize-icons
```
