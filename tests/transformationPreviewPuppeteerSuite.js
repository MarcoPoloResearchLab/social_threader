// @ts-check
/** @fileoverview Real-page coverage for preview action and applied-status layout. */

import path from "node:path";
import process from "node:process";

const PREVIEW_SELECTOR = "#transformationPreview";
const ACTION_SELECTOR = "[data-transformation-action]";
const LAYOUT_CASES = Object.freeze([
    { width: 1527, height: 1474, singleLine: true },
    { width: 907, height: 1000, singleLine: false },
    { width: 390, height: 844, singleLine: false },
    { width: 320, height: 700, singleLine: false }
]);
const POSITION_TOLERANCE = 2;

/**
 * Examines the visible preview after an API result or the user's Apply action.
 * @param {import("puppeteer").Page} page Real application page.
 * @param {"result" | "applied"} state Expected preview state.
 * @returns {Promise<void>}
 */
export async function assertTransformationPreviewLayout(page, state) {
    const originalViewport = page.viewport();
    try {
        for (const layoutCase of LAYOUT_CASES) {
            await page.setViewport({ width: layoutCase.width, height: layoutCase.height });
            const layout = await page.evaluate((previewSelector, actionSelector, expectedState, tolerance) => {
                const previewElement = document.querySelector(previewSelector);
                if (!(previewElement instanceof HTMLElement)) throw new Error("Preview is missing");
                const previewBounds = previewElement.getBoundingClientRect();
                const previewStyle = getComputedStyle(previewElement);
                const contentRight = previewBounds.right - parseFloat(previewStyle.paddingRight) - parseFloat(previewStyle.borderRightWidth);
                const buttons = Array.from(previewElement.querySelectorAll(actionSelector))
                    .filter((button) => button.getBoundingClientRect().height > 0);
                const buttonBounds = buttons.map((button) => button.getBoundingClientRect());
                const headingBounds = previewElement.querySelector("h2")?.getBoundingClientRect();
                const statusElement = previewElement.querySelector(".transformationUndo span");
                const statusBounds = statusElement?.getBoundingClientRect();
                return {
                    state: previewElement.dataset.transformationState,
                    labels: buttons.map((button) => button.textContent),
                    rightAligned: buttonBounds.length > 0 && Math.abs(buttonBounds[buttonBounds.length - 1].right - contentRight) <= tolerance,
                    shareRow: buttonBounds.every((bounds) => Math.abs(bounds.top - buttonBounds[0].top) <= tolerance),
                    fit: buttonBounds.every((bounds) => bounds.left >= previewBounds.left && bounds.right <= contentRight + tolerance),
                    icons: buttons.every((button) => {
                        const icon = button.querySelector("svg");
                        const label = button.querySelector("span");
                        if (icon === null || label === null) return false;
                        const iconBounds = icon.getBoundingClientRect();
                        const labelBounds = label.getBoundingClientRect();
                        return icon.getAttribute("aria-hidden") === "true" && icon.getAttribute("focusable") === "false" &&
                            iconBounds.width > 0 && iconBounds.height > 0 && iconBounds.right <= labelBounds.left;
                    }),
                    singleLine: expectedState !== "applied" || (!!headingBounds && !!statusBounds && buttonBounds.length === 1 &&
                        Math.abs(headingBounds.top + headingBounds.height / 2 - statusBounds.top - statusBounds.height / 2) <= tolerance &&
                        Math.abs(statusBounds.top + statusBounds.height / 2 - buttonBounds[0].top - buttonBounds[0].height / 2) <= tolerance),
                    statusReadable: expectedState !== "applied" || (!!statusElement && !!statusBounds &&
                        statusElement.scrollWidth <= statusElement.clientWidth && statusBounds.right <= buttonBounds[0].left),
                    pageFits: document.documentElement.scrollWidth <= window.innerWidth
                };
            }, PREVIEW_SELECTOR, ACTION_SELECTOR, state, POSITION_TOLERANCE);
            const expectedLabels = state === "result" ? ["Apply", "Discard", "Try again"] : ["Undo"];
            if (layout.state !== state || JSON.stringify(layout.labels) !== JSON.stringify(expectedLabels) ||
                !layout.rightAligned || !layout.shareRow || !layout.fit || !layout.icons || !layout.statusReadable ||
                !layout.pageFits || (layoutCase.singleLine && !layout.singleLine)) {
                throw new Error(`Unexpected ${state} preview layout at ${layoutCase.width}px: ${JSON.stringify(layout)}`);
            }
            const screenshotDirectory = process.env.SOCIAL_THREADER_PREVIEW_SCREENSHOT_DIR;
            if (screenshotDirectory && (layoutCase.singleLine || layoutCase.width === 320)) {
                await page.screenshot({
                    path: path.join(screenshotDirectory, `preview-${state}-${layoutCase.width}.png`),
                    fullPage: true
                });
            }
        }
    } finally {
        if (originalViewport !== null) await page.setViewport(originalViewport);
    }
}
