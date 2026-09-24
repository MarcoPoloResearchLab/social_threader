// @ts-check
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sharedUiCandidate } from "./sharedUiCandidate.js";

const TRIGGER = 'mpr-dropdown [data-mpr-dropdown="trigger"]';
const PANEL = 'mpr-dropdown [data-mpr-dropdown="panel"]';
const SECTION = '[data-mpr-dropdown="section-trigger"]';

/** Verify the guest directory through every public page. */
export async function runProductDirectorySuite(browser, pass, fail, origin) {
    const assets = await sharedUiCandidate();
    const config = (await readFile(new URL('../config-ui.yaml', import.meta.url), 'utf8')).replace('http://localhost:4173', origin);
    const { pages } = JSON.parse(await readFile(new URL('../data/resource-pages.json', import.meta.url), 'utf8'));
    for (const width of [320, 390, 768, 1280]) {
        const page = await browser.newPage();
        page.setDefaultTimeout(3000);
        await page.setViewport({ width, height: 800 });
        await page.setRequestInterception(true);
        page.on('request', async request => {
            const url = new URL(request.url());
            const name = url.pathname.split('/').at(-1);
            if (url.hostname === 'cdn.jsdelivr.net' && assets.has(name)) {
                await request.respond({ status: 200, contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: assets.get(name) });
            } else if (url.pathname === '/config-ui.yaml') {
                await request.respond({ status: 200, contentType: 'text/yaml', body: config });
            } else if (url.hostname === 'cdn.jsdelivr.net') {
                await request.continue();
            } else if (url.origin !== origin) {
                await request.abort();
            } else await request.continue();
        });
        try {
            for (const definition of pages) {
                const name = `F003 guest directory: ${definition.path} at ${width}px`;
                try {
                    await page.goto(`${origin}${definition.path}`, { waitUntil: 'domcontentloaded' });
                    await page.waitForSelector(TRIGGER);
                    assert.equal(await page.$$eval('footer', elements => elements.length), 1, 'Each page must have one footer');
                    const utilityLinks = await page.$$eval('footer [data-mpr-footer="horizontal-links"] a', elements => elements.map(element => ({ label: element.textContent, href: element.getAttribute('href') })));
                    assert.deepEqual(utilityLinks, [
                        { label: 'Thread splitter', href: '/' },
                        { label: 'Resources', href: '/resources/' },
                        { label: 'Open source on GitHub', href: 'https://github.com/MarcoPoloResearchLab/social_threader' },
                        { label: 'Privacy', href: '/privacy/' }
                    ]);
                    assert.equal(await page.$$eval('footer a[href="/privacy/"]', elements => elements.length), 1);
                    assert.equal(await page.$$eval('footer [data-mpr-footer="prefix"]', elements => elements.length), 1);
                    assert.equal(await page.$$eval('footer a[href="https://mprlab.com/"]', elements => elements.filter(element => element.checkVisibility()).length), 0, 'The lab credit must not repeat in utility links');
                    const utilitySizes = await page.$$eval('footer [data-mpr-footer="horizontal-links"] a', elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
                    assert.ok(utilitySizes.every(size => size.width >= 44 && size.height >= 44), JSON.stringify(utilitySizes));
                    if (definition.path === '/') {
                        assert.equal(await page.$$eval('mpr-header a[href="/resources/"]', elements => elements.length), 0);
                    }
                    assert.equal(await page.$eval(TRIGGER, element => element.textContent.trim().replace(/\s*[▾▴▼▲⌄⌃]$/, '')), 'Marco Polo Research Lab LLC');
                    assert.equal(await page.$eval('footer [data-mpr-footer="prefix"]', element => element.textContent), `© ${new Date().getFullYear()}`);
                    await page.focus(TRIGGER);
                    await page.keyboard.press('Enter');
                    await page.waitForSelector(PANEL, { visible: true });
                    assert.deepEqual(await page.$$eval(SECTION, elements => elements.map(element => element.getAttribute('aria-expanded'))), ['true', 'false', 'false']);
                    assert.deepEqual(await page.$$eval(`${SECTION} > span:first-child`, elements => elements.map(element => element.textContent)), ['Productivity', 'Web and health tools', 'Creative tools']);
                    const labels = await page.$$eval(`${PANEL} a`, elements => elements.map(element => element.textContent));
                    assert.deepEqual(labels, ['MPR Lab', 'Gravity Notes', 'Social Threader', 'RSVP', 'Countdown Calendar', 'LoopAware', 'Allergy Wheel', 'LLM Crossword', 'Prompt Bubbles', 'Wallpapers']);
                    const initialGeometry = await page.$eval(PANEL, element => {
                        const bounds = element.getBoundingClientRect();
                        return { width: bounds.width, height: bounds.height, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
                    });
                    assert.ok(initialGeometry.width <= 300 && initialGeometry.height <= 400, JSON.stringify(initialGeometry));
                    assert.equal(initialGeometry.scrollHeight, initialGeometry.clientHeight, 'The initial menu must fit without a scrollbar');
                    for (const section of await page.$$(SECTION)) {
                        if (await section.evaluate(element => element.getAttribute('aria-expanded')) === 'false') await section.click();
                    }
                    const geometry = await page.$eval(PANEL, element => {
                        const bounds = element.getBoundingClientRect();
                        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, height: bounds.height, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, pageWidth: document.documentElement.scrollWidth };
                    });
                    assert.ok(geometry.left >= 0 && geometry.right <= width && geometry.top >= 0 && geometry.bottom <= 800, JSON.stringify(geometry));
                    const overflowing = await page.$$eval('body *', elements => elements.filter(element => element.getBoundingClientRect().right > innerWidth && element.getBoundingClientRect().width > 0).slice(0, 8).map(element => `${element.tagName}.${element.className}`));
                    assert.ok(geometry.pageWidth <= width, JSON.stringify({ ...geometry, overflowing }));
                    assert.ok(geometry.scrollHeight > geometry.clientHeight, 'Expanded catalog must scroll internally');
                    const sizes = await page.$$eval(`${PANEL} a, ${SECTION}, ${TRIGGER}`, elements => elements.map(element => { const bounds = element.getBoundingClientRect(); return { label: element.textContent, height: bounds.height, width: bounds.width }; }));
                    assert.ok(sizes.every(size => size.height >= 24 && size.width >= 24), JSON.stringify(sizes.filter(size => size.height < 24 || size.width < 24)));
                    await page.keyboard.press('Escape');
                    assert.equal(await page.$eval(TRIGGER, element => document.activeElement === element), true);
                    await page.click(TRIGGER);
                    await page.click('main', { offset: { x: 5, y: 5 } });
                    assert.equal(await page.$eval(PANEL, element => element.hidden), true);
                    assert.ok(await page.$('footer a[href="/privacy/"]'));
                    assert.ok(await page.$('footer a[href="https://github.com/MarcoPoloResearchLab/social_threader"]'));
                    if (definition.path === '/') {
                        await page.$eval('#sourceText', element => {
                            element.textContent = 'Guest draft with an image.';
                            const attachment = document.createElement('img');
                            attachment.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
                            element.append(attachment);
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                        });
                        const draft = await page.$eval('#sourceText', element => element.innerHTML);
                        await page.click(TRIGGER);
                        const previousTargets = new Set(browser.targets());
                        await page.$eval(`${PANEL} a`, element => element.focus());
                        const [popupTarget] = await Promise.all([
                            browser.waitForTarget(target => !previousTargets.has(target) && target.type() === 'page', { timeout: 3000 }),
                            page.keyboard.press('Enter')
                        ]);
                        const popup = await popupTarget.page();
                        await popup.close();
                        assert.equal(await page.$eval(PANEL, element => element.hidden), true);
                        assert.equal(await page.$eval('#sourceText', element => element.innerHTML), draft);
                    }
                    pass(name);
                } catch (error) { fail(name, error); }
            }
        } finally { await page.close(); }
    }
}
