// @ts-check
/** @fileoverview Real-page platform links, preset icons, and independent documentation navigation. */

import path from "node:path";
import process from "node:process";

const PLATFORM_CASES = Object.freeze([
    { id: "threads", label: "Threads", homepage: "https://www.threads.com/", documentation: "https://about.fb.com/news/2023/07/introducing-threads-new-app-text-sharing/", length: 500 },
    { id: "mastodon", label: "Mastodon", homepage: "https://joinmastodon.org/", documentation: "https://docs.joinmastodon.org/user/posting/#text", length: 500 },
    { id: "bluesky", label: "Bluesky", homepage: "https://bsky.app/", documentation: "https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json", length: 300 },
    { id: "twitter", label: "Twitter/X", homepage: "https://x.com/", documentation: "https://help.x.com/en/using-x/types-of-posts", length: 280 }
]);
const VIEWPORT_CASES = Object.freeze([
    { width: 1527, height: 1474 },
    { width: 390, height: 844 },
    { width: 320, height: 700 }
]);
const ROW_SELECTOR = ".platformPresetRow";
const SOURCE_SELECTOR = "#sourceText";

/**
 * Exercises independent help links and the shared 500-character preset through the page.
 * @param {import("puppeteer").Page} page Application browser page.
 * @param {(name: string) => void} pass Result callback.
 * @param {(name: string, error: unknown) => void} fail Failure callback.
 * @param {string} indexUrl Application URL.
 * @returns {Promise<void>}
 */
export async function runPlatformControlsBrowserSuite(page, pass, fail, indexUrl) {
    const testName = "platform homepages, icons, help tabs, and shared preset selection";
    const originalViewport = page.viewport();
    try {
        await page.goto(indexUrl, { waitUntil: "networkidle0" });
        const rowCount = await page.$$eval(ROW_SELECTOR, (rows) => rows.length);
        if (rowCount !== PLATFORM_CASES.length) throw new Error(`Expected four platform rows, received ${rowCount}`);
        for (const viewport of VIEWPORT_CASES) {
            await page.setViewport(viewport);
            const layout = await page.evaluate((rowSelector) => {
                const rows = Array.from(document.querySelectorAll(rowSelector));
                return {
                    fits: document.documentElement.scrollWidth <= window.innerWidth,
                    helpUnobstructed: rows.every((row) => {
                        const help = row.querySelector("a");
                        if (help === null) return false;
                        const bounds = help.getBoundingClientRect();
                        const centerX = bounds.left + bounds.width / 2;
                        const centerY = bounds.top + bounds.height / 2;
                        return centerY < 0 || centerY >= window.innerHeight || help.contains(document.elementFromPoint(centerX, centerY));
                    }),
                    rowsFit: rows.every((row) => {
                        const bounds = row.getBoundingClientRect();
                        const button = row.querySelector("button");
                        const help = row.querySelector("a");
                        const icon = button?.querySelector("img");
                        if (!(button instanceof HTMLButtonElement) || !(help instanceof HTMLAnchorElement) || !(icon instanceof HTMLImageElement)) return false;
                        const buttonBounds = button.getBoundingClientRect();
                        const helpBounds = help.getBoundingClientRect();
                        return icon.complete && icon.naturalWidth > 0 && icon.alt === "" && icon.getAttribute("aria-hidden") === "true" &&
                            buttonBounds.width > 0 && buttonBounds.height >= 40 && helpBounds.width >= 40 && helpBounds.height >= 40 &&
                            buttonBounds.right <= helpBounds.left && Math.abs(helpBounds.right - bounds.right) <= 2 &&
                            button.scrollWidth <= button.clientWidth;
                    })
                };
            }, ROW_SELECTOR);
            if (!layout.fits || !layout.rowsFit || !layout.helpUnobstructed) throw new Error(`Platform controls fail at ${viewport.width}px: ${JSON.stringify(layout)}`);
            const screenshotDirectory = process.env.SOCIAL_THREADER_PLATFORM_SCREENSHOT_DIR;
            if (screenshotDirectory && viewport.width !== 390) {
                await page.screenshot({ path: path.join(screenshotDirectory, `platforms-${viewport.width}.png`), fullPage: true });
            }
        }
        for (const platform of PLATFORM_CASES) {
            const rowSelector = `${ROW_SELECTOR}[data-platform="${platform.id}"]`;
            const metadata = await page.$eval(rowSelector, (row) => {
                const button = row.querySelector("button");
                const help = row.querySelector("a");
                return { label: button?.textContent, documentation: help?.href, target: help?.target, rel: help?.rel, accessibleLabel: help?.getAttribute("aria-label") };
            });
            const homepage = await page.$eval(`#platformIntroduction a[data-platform="${platform.id}"]`, (link) => ({
                label: link.textContent, href: link.getAttribute("href")
            }));
            if (metadata.label !== `${platform.label} (${platform.length})` || metadata.documentation !== platform.documentation ||
                metadata.target !== "_blank" || !metadata.rel?.includes("noopener") || !metadata.accessibleLabel?.includes(platform.label) ||
                homepage.label !== platform.label || homepage.href !== platform.homepage) {
                throw new Error(`Invalid ${platform.label} links or labels: ${JSON.stringify({ metadata, homepage })}`);
            }
            const before = await page.$$eval(`${ROW_SELECTOR} button`, (buttons) => buttons.map((button) => button.classList.contains("active")));
            const newTabPromise = page.browser().waitForTarget((target) => target.opener() === page.target() && target.url() === platform.documentation);
            if (platform.id === "threads") {
                await page.focus(`${rowSelector} a`);
                await page.keyboard.press("Enter");
            } else {
                await page.click(`${rowSelector} a`);
            }
            const newTab = await (await newTabPromise).page();
            if (newTab === null) throw new Error("Documentation did not open a new tab");
            await newTab.close();
            const after = await page.$$eval(`${ROW_SELECTOR} button`, (buttons) => buttons.map((button) => button.classList.contains("active")));
            if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Help navigation changes preset selection");
        }
        await page.$eval(SOURCE_SELECTOR, (editor) => {
            editor.textContent = "Platform preset draft.";
            editor.dispatchEvent(new Event("input", { bubbles: true }));
        });
        for (const platform of PLATFORM_CASES) {
            await page.click(`${ROW_SELECTOR}[data-platform="${platform.id}"] button`);
            const selection = await page.$$eval(`${ROW_SELECTOR} button`, (buttons) => buttons.map((button) => button.classList.contains("active")));
            const expected = PLATFORM_CASES.map((candidate) => candidate.length === platform.length);
            if (JSON.stringify(selection) !== JSON.stringify(expected)) throw new Error(`Incorrect ${platform.label} selection: ${JSON.stringify(selection)}`);
            await page.click(`${ROW_SELECTOR}[data-platform="${platform.id}"] button`);
        }
        pass(testName);
    } catch (error) {
        fail(testName, error);
    } finally {
        if (originalViewport !== null) await page.setViewport(originalViewport);
    }
}
