// ./Web_Toolkit/sourcing_doctor/tests/wix.test.mjs
/**
 * Offline unit tests for public Wix harvest helpers.
 * No network. Fixtures cover JSON-LD Product, shop slug scrape, and media URLs.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildShopPageUrl,
  extractJsonLdBlocks,
  extractProductSlugs,
  normalizeShopPaths
} from '../src/lib/wix/client.mjs';
import {
  compileCategoryRules,
  extractPhone,
  inferCategory,
  inferSku,
  pickProductJsonLd,
  productFromJsonLd,
  upgradeWixMediaUrl,
  visibleText
} from '../src/lib/wix/transformer.mjs';

const PRODUCT_HTML = `
<html>
  <body>
    <a href="/product-page/abc-motor-12">Motor</a>
    <a href="https://example.com/product-page/xyz-slider">Slider</a>
    <script type="application/ld+json">
      {
        "@type": ["Product", "Offer"],
        "name": "ABC12 Cover Motor",
        "description": "<p>Replacement motor</p>",
        "image": "https://static.wixstatic.com/media/abcd1234.jpg/v1/fill/w_100,h_100/abcd1234.jpg",
        "offers": [
          {
            "price": "129.00",
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock",
            "url": "https://shop.example.com/product-page/abc12-cover-motor"
          }
        ]
      }
    </script>
  </body>
</html>
`;

test('extractProductSlugs finds Wix product-page paths', () => {
  const slugs = extractProductSlugs(PRODUCT_HTML);
  assert.deepEqual(slugs.sort(), ['abc-motor-12', 'abc12-cover-motor', 'xyz-slider']);
});

test('normalizeShopPaths and pagination URLs', () => {
  assert.deepEqual(normalizeShopPaths(undefined, undefined), ['/', '/shop']);
  assert.deepEqual(normalizeShopPaths('/store'), ['/store']);
  assert.equal(buildShopPageUrl('https://shop.example.com', '/', 1), 'https://shop.example.com/');
  assert.equal(buildShopPageUrl('https://shop.example.com', '/', 2), 'https://shop.example.com/?page=2');
  assert.equal(buildShopPageUrl('https://shop.example.com', '/shop', 2), 'https://shop.example.com/shop?page=2');
});

test('productFromJsonLd maps Product JSON-LD, offers arrays, and @type arrays', () => {
  const blocks = extractJsonLdBlocks(PRODUCT_HTML);
  assert.ok(pickProductJsonLd(blocks));
  const product = productFromJsonLd('abc12-cover-motor', 'https://shop.example.com', blocks, '', {
    categoryRules: [{ category: 'Motors', pattern: '\\bmotor\\b' }],
    defaultCategory: 'Hardware',
    rebuildProductPath: '/parts/'
  });
  assert.equal(product.name, 'ABC12 Cover Motor');
  assert.equal(product.sku, 'ABC12');
  assert.equal(product.price, 129);
  assert.equal(product.availability, 'InStock');
  assert.equal(product.category, 'Motors');
  assert.equal(product.path, '/parts/abc12-cover-motor');
  assert.equal(product.imageRemote, 'https://static.wixstatic.com/media/abcd1234.jpg');
  assert.equal(product.description, 'Replacement motor');
});

test('category rules stay in the profile; default is Uncategorized', () => {
  assert.equal(inferCategory('Cover Motor', compileCategoryRules()), 'Uncategorized');
  const rules = compileCategoryRules([{ category: 'Motors', pattern: 'motor' }], 'Hardware');
  assert.equal(inferCategory('Cover Motor', rules), 'Motors');
  assert.equal(inferCategory('Clamp', rules), 'Hardware');
});

test('upgradeWixMediaUrl strips fit/fill derivatives', () => {
  const derived = 'https://static.wixstatic.com/media/abcd.jpg/v1/fill/w_980,h_980,al_c/abcd.jpg';
  assert.equal(upgradeWixMediaUrl(derived), 'https://static.wixstatic.com/media/abcd.jpg');
  assert.equal(upgradeWixMediaUrl('https://cdn.example.com/x.jpg'), 'https://cdn.example.com/x.jpg');
});

test('inferSku and phone extraction do not hardcode a client', () => {
  assert.equal(inferSku('PC4000 Slider'), 'PC4000');
  assert.equal(extractPhone('Call 555-123-4567 today', ''), '555-123-4567');
  assert.equal(extractPhone('no phone here', '555-0100'), '555-0100');
  assert.equal(extractPhone('nothing', ''), '');
});

test('visibleText strips scripts and tags', () => {
  assert.equal(visibleText('<script>x</script><p>Hello&nbsp;world</p>'), 'Hello world');
});
