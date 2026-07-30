// @ts-check
/**
 * @fileoverview Browser-level inspection helpers for the public SEO page suite.
 */

export const SEO_TEST_LIMITS = Object.freeze({
    HTTP_OK_STATUS: 200,
    MINIMUM_TITLE_LENGTH: 50,
    MAXIMUM_TITLE_LENGTH: 60,
    MINIMUM_DESCRIPTION_LENGTH: 120,
    MAXIMUM_DESCRIPTION_LENGTH: 155,
    MINIMUM_ROOT_WORD_COUNT: 25,
    MINIMUM_COLLECTION_WORD_COUNT: 150,
    MINIMUM_ARTICLE_WORD_COUNT: 500,
    MINIMUM_CODE_LENGTH: 20,
    MINIMUM_FAQ_COUNT: 5,
    MINIMUM_RELATED_LINK_COUNT: 2,
    EXPECTED_OG_IMAGE_WIDTH: 1200,
    EXPECTED_OG_IMAGE_HEIGHT: 630
});

export const PUBLIC_SEO_PATHS = Object.freeze({
    PAGE_CATALOG: "/data/resource-pages.json",
    SITEMAP: "/sitemap.xml",
    ROBOTS: "/robots.txt",
    OG_IMAGE: "/assets/img/social-threader-og.png",
    ROOT: "/",
    RESOURCE_HUB: "/resources/"
});

export const PUBLIC_SEO_KINDS = Object.freeze({
    WEB_APPLICATION: "WebApplication",
    COLLECTION_PAGE: "CollectionPage",
    ARTICLES: Object.freeze(new Set(["Article", "TechArticle"]))
});

/**
 * @typedef {Object} PublicPageDefinition
 * @property {string} source
 * @property {string} path
 * @property {string} canonical
 * @property {string} title
 * @property {string} description
 * @property {string} kind
 * @property {string} lastModified
 * @property {string} primaryKeyword
 * @property {string} conversionGoal
 * @property {string} [evidenceSource]
 */

/**
 * @typedef {Object} PublicPageCatalog
 * @property {number} schemaVersion
 * @property {string} publicOrigin
 * @property {PublicPageDefinition[]} pages
 */

/**
 * @typedef {{ question: string; answer: string }} FaqItem
 */

/**
 * @typedef {Object} PublicPageSnapshot
 * @property {string} title
 * @property {string} description
 * @property {string} robots
 * @property {string} canonical
 * @property {string} openGraphUrl
 * @property {string} openGraphImage
 * @property {number} headingCount
 * @property {string} headingText
 * @property {string} mainText
 * @property {number} wordCount
 * @property {boolean} hasQuickVerdict
 * @property {string} codeText
 * @property {string} authorProfile
 * @property {string} visibleModifiedDate
 * @property {Array<Record<string, unknown>>} structuredDataItems
 * @property {FaqItem[]} faqDetails
 * @property {FaqItem[]} structuredFaqs
 * @property {string[]} internalPaths
 * @property {string[]} relatedPaths
 * @property {string[]} resourceCardPaths
 */

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {asserts condition}
 */
export function assertCondition(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeCode(value) {
    return value.replace(/\s+/g, "");
}

/**
 * @param {string} pageKind
 * @returns {number}
 */
export function minimumWordCountForKind(pageKind) {
    if (pageKind === PUBLIC_SEO_KINDS.WEB_APPLICATION) {
        return SEO_TEST_LIMITS.MINIMUM_ROOT_WORD_COUNT;
    }
    if (pageKind === PUBLIC_SEO_KINDS.COLLECTION_PAGE) {
        return SEO_TEST_LIMITS.MINIMUM_COLLECTION_WORD_COUNT;
    }
    return SEO_TEST_LIMITS.MINIMUM_ARTICLE_WORD_COUNT;
}

/**
 * @param {import("puppeteer").Page} page
 * @param {string} publicOrigin
 * @returns {Promise<PublicPageCatalog>}
 */
export async function loadPageCatalog(page, publicOrigin) {
    await page.goto(`${publicOrigin}${PUBLIC_SEO_PATHS.ROOT}`, { waitUntil: "load" });
    return /** @type {Promise<PublicPageCatalog>} */ (
        page.evaluate(async (catalogUrl) => {
            const response = await fetch(catalogUrl);
            if (!response.ok) {
                throw new Error(`Page catalog returned ${response.status}`);
            }
            return response.json();
        }, `${publicOrigin}${PUBLIC_SEO_PATHS.PAGE_CATALOG}`)
    );
}

/**
 * @param {import("puppeteer").Page} page
 * @param {string} pageUrl
 * @returns {Promise<PublicPageSnapshot>}
 */
export async function inspectPublicPage(page, pageUrl) {
    const response = await page.goto(pageUrl, { waitUntil: "load" });
    assertCondition(response !== null, `No navigation response for ${pageUrl}`);
    assertCondition(
        response.status() === SEO_TEST_LIMITS.HTTP_OK_STATUS,
        `${pageUrl} returned ${response.status()}`
    );

    return /** @type {Promise<PublicPageSnapshot>} */ (
        page.evaluate((rootPath) => {
            const metadataContent = (selector) =>
                document.querySelector(selector)?.getAttribute("content")?.trim() || "";
            const canonical =
                document.querySelector('link[rel="canonical"]')?.getAttribute("href")?.trim() || "";
            const headingElements = Array.from(document.querySelectorAll("h1"));
            const mainText = document.querySelector("main")?.innerText || document.body.innerText;
            const structuredDataItems = Array.from(
                document.querySelectorAll('script[type="application/ld+json"]')
            ).flatMap((scriptElement) => {
                const parsedValue = JSON.parse(scriptElement.textContent || "{}");
                return Array.isArray(parsedValue["@graph"]) ? parsedValue["@graph"] : [parsedValue];
            });
            const faqDetails = Array.from(document.querySelectorAll(".faq-list details")).map(
                (detailsElement) => ({
                    question: detailsElement.querySelector("summary")?.textContent?.trim() || "",
                    answer: detailsElement.querySelector("p")?.textContent?.trim() || ""
                })
            );
            const faqStructuredData = structuredDataItems.find(
                (structuredItem) => structuredItem["@type"] === "FAQPage"
            );
            const structuredFaqs = Array.isArray(faqStructuredData?.mainEntity)
                ? faqStructuredData.mainEntity.map((questionItem) => ({
                      question: questionItem.name || "",
                      answer: questionItem.acceptedAnswer?.text || ""
                  }))
                : [];
            const pathsForSelector = (selector) =>
                Array.from(document.querySelectorAll(selector)).map(
                    (linkElement) =>
                        new URL(
                            linkElement.getAttribute("href") || rootPath,
                            window.location.origin
                        ).pathname
                );

            return {
                title: document.title.trim(),
                description: metadataContent('meta[name="description"]'),
                robots: metadataContent('meta[name="robots"]'),
                canonical,
                openGraphUrl: metadataContent('meta[property="og:url"]'),
                openGraphImage: metadataContent('meta[property="og:image"]'),
                headingCount: headingElements.length,
                headingText: headingElements[0]?.textContent?.trim() || "",
                mainText,
                wordCount: mainText.trim().split(/\s+/).filter(Boolean).length,
                hasQuickVerdict: Boolean(document.querySelector(".quick-verdict")),
                codeText: document.querySelector("pre code")?.textContent || "",
                authorProfile:
                    document
                        .querySelector('.byline a[href="https://github.com/MarcoPoloResearchLab"]')
                        ?.getAttribute("href") || "",
                visibleModifiedDate:
                    document.querySelector(".byline time")?.getAttribute("datetime") || "",
                structuredDataItems,
                faqDetails,
                structuredFaqs,
                internalPaths: Array.from(new Set(pathsForSelector('a[href^="/"]'))),
                relatedPaths: Array.from(new Set(pathsForSelector('.related-grid a[href^="/"]'))),
                resourceCardPaths: Array.from(
                    new Set(pathsForSelector('.resource-grid a[href^="/"]'))
                )
            };
        }, PUBLIC_SEO_PATHS.ROOT)
    );
}

/**
 * @param {import("puppeteer").Page} page
 * @param {string} publicOrigin
 * @returns {Promise<Record<string, string>>}
 */
export async function inspectSitemap(page, publicOrigin) {
    return page.evaluate(async (sitemapUrl) => {
        const response = await fetch(sitemapUrl);
        if (!response.ok) {
            throw new Error(`Sitemap returned ${response.status}`);
        }
        const sitemapText = await response.text();
        const sitemapDocument = new DOMParser().parseFromString(sitemapText, "application/xml");
        if (sitemapDocument.querySelector("parsererror")) {
            throw new Error("Sitemap is not valid XML");
        }
        if (sitemapDocument.querySelector("priority, changefreq")) {
            throw new Error("Sitemap contains unsupported priority or changefreq values");
        }
        return Object.fromEntries(
            Array.from(sitemapDocument.querySelectorAll("url")).map((urlElement) => [
                urlElement.querySelector("loc")?.textContent?.trim() || "",
                urlElement.querySelector("lastmod")?.textContent?.trim() || ""
            ])
        );
    }, `${publicOrigin}${PUBLIC_SEO_PATHS.SITEMAP}`);
}

/**
 * @param {import("puppeteer").Page} page
 * @param {string} publicOrigin
 * @returns {Promise<string>}
 */
export async function inspectRobots(page, publicOrigin) {
    return page.evaluate(async (robotsUrl) => {
        const response = await fetch(robotsUrl);
        if (!response.ok) {
            throw new Error(`robots.txt returned ${response.status}`);
        }
        return response.text();
    }, `${publicOrigin}${PUBLIC_SEO_PATHS.ROBOTS}`);
}

/**
 * @param {import("puppeteer").Page} page
 * @param {string} publicOrigin
 * @returns {Promise<{ width: number; height: number }>}
 */
export async function inspectOpenGraphImage(page, publicOrigin) {
    return page.evaluate(
        (imageUrl) =>
            new Promise((resolve, reject) => {
                const imageElement = new Image();
                imageElement.onload = () => {
                    resolve({
                        width: imageElement.naturalWidth,
                        height: imageElement.naturalHeight
                    });
                };
                imageElement.onerror = () => reject(new Error("Open Graph image failed to load"));
                imageElement.src = imageUrl;
            }),
        `${publicOrigin}${PUBLIC_SEO_PATHS.OG_IMAGE}`
    );
}

/**
 * @param {import("puppeteer").Page} page
 * @param {string} publicOrigin
 * @param {string[]} internalPaths
 * @returns {Promise<Record<string, number>>}
 */
export async function inspectInternalPaths(page, publicOrigin, internalPaths) {
    return page.evaluate(
        async ({ origin, paths }) =>
            Object.fromEntries(
                await Promise.all(
                    paths.map(async (internalPath) => {
                        const response = await fetch(`${origin}${internalPath}`, {
                            redirect: "manual"
                        });
                        return [internalPath, response.status];
                    })
                )
            ),
        { origin: publicOrigin, paths: internalPaths }
    );
}

/**
 * @param {import("puppeteer").Page} page
 * @param {string} publicOrigin
 * @returns {Promise<{ hasHeading: boolean; hasResourceLink: boolean }>}
 */
export async function inspectServerDeliveredRoot(page, publicOrigin) {
    return page.evaluate(async (rootUrl) => {
        const response = await fetch(rootUrl);
        const sourceDocument = new DOMParser().parseFromString(await response.text(), "text/html");
        return {
            hasHeading:
                (sourceDocument.querySelector("h1")?.textContent?.trim() || "") ===
                "Social Threader",
            hasResourceLink: sourceDocument.querySelector('a[href="/resources/"]') !== null
        };
    }, `${publicOrigin}${PUBLIC_SEO_PATHS.ROOT}`);
}

/**
 * @param {import("puppeteer").Page} page
 * @param {string} publicOrigin
 * @param {string} sourcePath
 * @returns {Promise<string>}
 */
export async function loadEvidenceSource(page, publicOrigin, sourcePath) {
    return page.evaluate(async (sourceUrl) => {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
            throw new Error(`Evidence source returned ${response.status}`);
        }
        return response.text();
    }, `${publicOrigin}/${sourcePath}`);
}
