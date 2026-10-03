// @ts-check
/** @fileoverview Header identity and responsive icon placement through the application page. */

import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";

const BRAND_SELECTOR = "#socialThreaderHeader .socialThreaderBrand";
const VIEWPORT_CASES = Object.freeze([
    { width: 1527, height: 1474 },
    { width: 390, height: 844 },
    { width: 320, height: 700 }
]);

/**
 * Verifies the decorative app icon beside the accessible home-link title.
 * @param {import("puppeteer").Page} page Application browser page.
 * @param {(name: string) => void} pass Result callback.
 * @param {(name: string, error: unknown) => void} fail Failure callback.
 * @param {string} indexUrl Application URL.
 * @returns {Promise<void>}
 */
export async function runHeaderBrandBrowserSuite(page, pass, fail, indexUrl) {
    const testName = "header app icon precedes the home-link title at desktop and mobile widths";
    const originalViewport = page.viewport();
    try {
        await page.goto(indexUrl, { waitUntil: "networkidle0" });
        assert.equal(await page.$$eval(BRAND_SELECTOR, (links) => links.length), 1, "Expected one branded header link");
        for (const viewport of VIEWPORT_CASES) {
            await page.setViewport(viewport);
            const state = await page.$eval(BRAND_SELECTOR, (link) => {
                const icon = link.querySelector("img");
                const title = link.querySelector("span");
                if (!(icon instanceof HTMLImageElement) || title === null) return null;
                const iconBounds = icon.getBoundingClientRect();
                const titleBounds = title.getBoundingClientRect();
                return {
                    title: link.textContent?.trim(), href: link.getAttribute("href"),
                    loaded: icon.complete && icon.naturalWidth > 0,
                    decorative: icon.alt === "" && icon.getAttribute("aria-hidden") === "true",
                    fits: document.documentElement.scrollWidth <= window.innerWidth,
                    aligned: iconBounds.width >= 24 && iconBounds.height >= 24 &&
                        iconBounds.right < titleBounds.left &&
                        Math.abs(iconBounds.top + iconBounds.height / 2 - titleBounds.top - titleBounds.height / 2) <= 2
                };
            });
            assert.ok(state, "Expected an icon and title in the header link");
            assert.equal(state.title, "Social Threader");
            assert.equal(state.href, "/");
            assert.ok(state.loaded && state.decorative && state.fits && state.aligned, `Invalid header at ${viewport.width}px: ${JSON.stringify(state)}`);
            await page.focus(BRAND_SELECTOR);
            assert.ok(await page.$eval(BRAND_SELECTOR, (link) => document.activeElement === link), "Home link must receive keyboard focus");
            const screenshotDirectory = process.env.SOCIAL_THREADER_HEADER_SCREENSHOT_DIR;
            if (screenshotDirectory) {
                await page.screenshot({ path: path.join(screenshotDirectory, `header-${viewport.width}.png`), fullPage: true });
            }
        }
        pass(testName);
    } catch (error) {
        fail(testName, error);
    } finally {
        if (originalViewport !== null) await page.setViewport(originalViewport);
    }
}
