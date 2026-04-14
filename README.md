# @ryntab/wappalyzer-node

Technology detection built on the Wappalyzer fingerprint database. Pass in a Playwright/Puppeteer page you already have open, or raw HTML — the module never launches or manages a browser itself.

## Installation

```sh
npm i @ryntab/wappalyzer-node
```

## API

### `scanPage(page, url?)`

Analyze an existing Playwright or Puppeteer page. Navigation and browser lifecycle are entirely the caller's responsibility — the module reads from the page as-is.

```js
import { Wappalyzer } from '@ryntab/wappalyzer-node'

const wappalyzer = new Wappalyzer()

// -- Playwright example --
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('https://example.com')

const { technologies } = await wappalyzer.scanPage(page)
console.log(technologies.map(t => t.name))

await browser.close()
```

```js
// -- Puppeteer example --
import puppeteer from 'puppeteer'

const browser = await puppeteer.launch()
const page = await browser.newPage()
await page.goto('https://example.com')

const { technologies } = await wappalyzer.scanPage(page)
console.log(technologies.map(t => t.name))

await browser.close()
```

An optional `url` string can be passed as the second argument to override the URL used for resolving relative links (useful when the page has already navigated or you want a canonical base):

```js
const { technologies } = await wappalyzer.scanPage(page, 'https://example.com')
```

---

### `scanHTML(html, opts?)`

Analyze a raw HTML string — no browser required at all. External CSS and JS files referenced in the markup are fetched and fingerprinted automatically.

```js
import { Wappalyzer } from '@ryntab/wappalyzer-node'

const wappalyzer = new Wappalyzer()

const html = await fetch('https://example.com').then(r => r.text())

const { technologies } = await wappalyzer.scanHTML(html, {
  url: 'https://example.com',   // base URL for resolving relative assets
  headers: {},                  // optional response headers to include in detection
  cookies: [],                  // optional cookies array
})

console.log(technologies.map(t => t.name))
```

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `"about:blank"` | Base URL for resolving relative script/CSS URLs |
| `headers` | `object` | `{}` | HTTP response headers |
| `cookies` | `array` | `[]` | Cookie objects |

---

## Response shape

Both methods return the same structure:

```js
{
  technologies: [
    {
      name: 'WordPress',
      slug: 'wordpress',
      description: '...',
      confidence: 100,
      version: '6.4',
      categories: [ { id: 1, name: 'CMS', slug: 'cms' } ],
      icon: 'WordPress.svg',
      website: 'https://wordpress.org',
      pricing: [],
      cpe: 'cpe:2.3:a:wordpress:wordpress:*:*:*:*:*:*:*:*',
    },
    // ...
  ],
  performance: {
    fetchDuration: 1200,  // ms
    helperDuration: 340,  // ms from CMS-specific deep scans (WordPress, Shopify, Magento)
    errors: [],
  }
}
```

---

## Helpers

Deep-scan helpers run automatically for WordPress, Shopify, and Magento when detected. They enrich the matched technology entry with a `helper` object containing CMS-specific metadata (plugins, theme, version info, etc.).

---

## Using with an existing browser pool (e.g. lighthouse-api)

Because the module never touches the browser, it integrates cleanly into any existing automation pipeline. Just open a page, pass it in, close it yourself:

```js
// Inside an audit worker that already has a Puppeteer browser
const page = await browser.newPage()
await page.goto(url, { waitUntil: 'domcontentloaded' })

const { technologies } = await wappalyzer.scanPage(page)

await page.close()
```
