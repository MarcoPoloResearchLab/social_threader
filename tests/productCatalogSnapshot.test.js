// @ts-check
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createProductMenu } from '../js/core/productCatalog.js';

test('the native directory uses the verified MPR UI catalog snapshot', async () => {
    const root = new URL('../', import.meta.url);
    const receipt = JSON.parse(await readFile(new URL('data/product-catalog-source.json', root), 'utf8'));
    assert.equal(receipt.sourceRepository, 'https://github.com/MarcoPoloResearchLab/mpr-ui');
    for (const entry of receipt.files) {
        const bytes = await readFile(new URL(entry.destination, root));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.destination);
    }
    const web = await readFile(new URL('data/product-catalog.json', root));
    const mobile = await readFile(new URL('mobile/src/shared-web/product-catalog.json', root));
    assert.deepEqual(web, mobile);
    assert.deepEqual(await readFile(new URL('js/core/productCatalog.js', root)), await readFile(new URL('mobile/src/shared-web/core/productCatalog.js', root)));
    assert.equal(createProductMenu(JSON.parse(web.toString())).label, 'Explore MPR Lab');
});
