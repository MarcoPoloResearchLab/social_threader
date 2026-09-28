// @ts-check
/**
 * @fileoverview Real-page coverage for conditional, compact AI controls.
 */

const SOURCE_TEXT_SELECTOR = "#sourceText";
const TOOLBAR_SELECTOR = "#transformationToolbar";
const OPERATION_SELECTOR = "[data-transformation-operation]";
const EXPECTED_LABELS = Object.freeze(["Polish", "Expand", "Punch Up"]);
const INPUT_EVENT_NAME = "input";
const AUTHENTICATED_EVENT_NAME = "mpr-ui:auth:authenticated";
const UNAUTHENTICATED_EVENT_NAME = "mpr-ui:auth:unauthenticated";
const LAYOUT_CASES = Object.freeze([
    { width: 907, height: 1474, maximumToolbarHeight: 120 },
    { width: 390, height: 844, maximumToolbarHeight: 160 },
    { width: 320, height: 700, maximumToolbarHeight: 180 }
]);
const EMPTY_DRAFT_CASES = Object.freeze([
    { name: "empty", markup: "" },
    { name: "whitespace", markup: "<div>   </div><div><br></div>" },
    { name: "image only", markup: '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="">' }
]);

/**
 * Checks the toolbar through the live editor at desktop and phone widths.
 * @param {import("puppeteer").Page} page Application page with its editor initialized.
 * @param {(name: string) => void} pass Result callback.
 * @param {(name: string, error: unknown) => void} fail Failure callback.
 * @returns {Promise<void>}
 */
export async function runTransformationToolbarBrowserSuite(page, pass, fail) {
    const originalViewport = page.viewport();
    for (const layoutCase of LAYOUT_CASES) {
        const testName = `AI toolbar icons, placement, visibility, and compact layout at ${layoutCase.width}px`;
        try {
            await page.setViewport({ width: layoutCase.width, height: layoutCase.height });
            for (const draftCase of EMPTY_DRAFT_CASES) {
                await replaceDraft(page, draftCase.markup);
                const hidden = await page.$eval(TOOLBAR_SELECTOR, (toolbarElement) => (
                    toolbarElement.hidden && toolbarElement.getBoundingClientRect().height === 0
                ));
                if (!hidden) {
                    throw new Error(`Toolbar occupies space for an ${draftCase.name} draft`);
                }
            }

            await replaceDraft(page, "A draft ready for AI editing.");
            await page.evaluate((eventName) => document.dispatchEvent(new CustomEvent(eventName)), AUTHENTICATED_EVENT_NAME);
            const layout = await page.evaluate((sourceSelector, toolbarSelector, operationSelector) => {
                const editorElement = document.querySelector(sourceSelector);
                const toolbarElement = document.querySelector(toolbarSelector);
                if (!(editorElement instanceof HTMLElement) || !(toolbarElement instanceof HTMLElement)) {
                    throw new Error("Editor or toolbar is missing");
                }
                const editorBounds = editorElement.getBoundingClientRect();
                const toolbarBounds = toolbarElement.getBoundingClientRect();
                const buttonElements = Array.from(toolbarElement.querySelectorAll(operationSelector));
                const buttonBounds = buttonElements.map((buttonElement) => buttonElement.getBoundingClientRect());
                return {
                    visible: !toolbarElement.hidden && toolbarBounds.height > 0,
                    belowEditor: toolbarBounds.top >= editorBounds.bottom,
                    height: toolbarBounds.height,
                    buttonCount: buttonBounds.length,
                    visibleHelperCount: Array.from(toolbarElement.querySelectorAll("p"))
                        .filter((paragraphElement) => paragraphElement.getBoundingClientRect().height > 0).length,
                    buttonsShareRow: buttonBounds.every((bounds) => bounds.top === buttonBounds[0].top),
                    buttonsFit: buttonBounds.every((bounds) => bounds.left >= toolbarBounds.left && bounds.right <= toolbarBounds.right),
                    labels: buttonElements.map((buttonElement) => buttonElement.textContent),
                    iconsBeforeLabels: buttonElements.every((buttonElement) => {
                        const iconElement = buttonElement.querySelector("svg");
                        const labelElement = buttonElement.querySelector("span");
                        if (iconElement === null || labelElement === null) return false;
                        const iconBounds = iconElement.getBoundingClientRect();
                        const labelBounds = labelElement.getBoundingClientRect();
                        const buttonRectangle = buttonElement.getBoundingClientRect();
                        return iconElement.getAttribute("aria-hidden") === "true" &&
                            iconElement.getAttribute("focusable") === "false" &&
                            iconBounds.width > 0 && iconBounds.height > 0 &&
                            iconBounds.right <= labelBounds.left &&
                            iconBounds.left >= buttonRectangle.left && labelBounds.right <= buttonRectangle.right;
                    }),
                    pageFits: document.documentElement.scrollWidth <= window.innerWidth
                };
            }, SOURCE_TEXT_SELECTOR, TOOLBAR_SELECTOR, OPERATION_SELECTOR);
            if (!layout.visible || !layout.belowEditor || layout.height > layoutCase.maximumToolbarHeight ||
                layout.buttonCount !== EXPECTED_LABELS.length || layout.visibleHelperCount !== 0 || !layout.buttonsShareRow || !layout.buttonsFit ||
                !layout.iconsBeforeLabels || JSON.stringify(layout.labels) !== JSON.stringify(EXPECTED_LABELS) || !layout.pageFits) {
                throw new Error(`Unexpected AI toolbar layout: ${JSON.stringify(layout)}`);
            }

            await replaceDraft(page, "");
            const hiddenAfterClear = await page.$eval(TOOLBAR_SELECTOR, (toolbarElement) => toolbarElement.hidden);
            if (!hiddenAfterClear) {
                throw new Error("Clearing the draft leaves the toolbar visible");
            }
            pass(testName);
        } catch (error) {
            fail(testName, error);
        }
    }
    await replaceDraft(page, "");
    await page.evaluate((eventName) => document.dispatchEvent(new CustomEvent(eventName)), UNAUTHENTICATED_EVENT_NAME);
    if (originalViewport !== null) {
        await page.setViewport(originalViewport);
    }
}

/**
 * @param {import("puppeteer").Page} page Application page.
 * @param {string} markup Draft markup entered through the editor input boundary.
 * @returns {Promise<void>}
 */
async function replaceDraft(page, markup) {
    await page.$eval(SOURCE_TEXT_SELECTOR, (editorElement, draftMarkup, inputEventName) => {
        editorElement.innerHTML = draftMarkup;
        editorElement.dispatchEvent(new Event(inputEventName, { bubbles: true }));
    }, markup, INPUT_EVENT_NAME);
}
