// @ts-check
/**
 * @fileoverview Black-box SEO and crawlability checks for public static pages.
 */

import {
    PUBLIC_SEO_KINDS,
    PUBLIC_SEO_PATHS,
    SEO_TEST_LIMITS,
    assertCondition,
    inspectInternalPaths,
    inspectOpenGraphImage,
    inspectPublicPage,
    inspectRobots,
    inspectServerDeliveredRoot,
    inspectSitemap,
    loadEvidenceSource,
    loadPageCatalog,
    minimumWordCountForKind,
    normalizeCode,
    normalizeWhitespace
} from "./publicPagesSeoSupport.js";

/**
 * @param {import("./publicPagesSeoSupport.js").FaqItem[]} faqItems
 * @returns {string}
 */
function serializeFaqItems(faqItems) {
    return JSON.stringify(
        faqItems.map((faqItem) => ({
            question: normalizeWhitespace(faqItem.question),
            answer: normalizeWhitespace(faqItem.answer)
        }))
    );
}

/**
 * @param {import("./publicPagesSeoSupport.js").PublicPageDefinition} pageDefinition
 * @param {import("./publicPagesSeoSupport.js").PublicPageSnapshot} pageSnapshot
 * @param {string} publicOrigin
 * @returns {void}
 */
function assertPageIdentity(pageDefinition, pageSnapshot, publicOrigin) {
    assertCondition(pageDefinition.path.endsWith("/"), `${pageDefinition.path} must end in a slash`);
    assertCondition(
        pageDefinition.canonical === `${publicOrigin}${pageDefinition.path}`,
        `${pageDefinition.path} has a non-canonical URL`
    );
    assertCondition(pageSnapshot.title === pageDefinition.title, `${pageDefinition.path} title drifted`);
    assertCondition(
        pageSnapshot.description === pageDefinition.description,
        `${pageDefinition.path} description drifted`
    );
    assertCondition(
        pageSnapshot.title.length >= SEO_TEST_LIMITS.MINIMUM_TITLE_LENGTH &&
            pageSnapshot.title.length <= SEO_TEST_LIMITS.MAXIMUM_TITLE_LENGTH,
        `${pageDefinition.path} title length is ${pageSnapshot.title.length}`
    );
    assertCondition(
        pageSnapshot.description.length >= SEO_TEST_LIMITS.MINIMUM_DESCRIPTION_LENGTH &&
            pageSnapshot.description.length <= SEO_TEST_LIMITS.MAXIMUM_DESCRIPTION_LENGTH,
        `${pageDefinition.path} description length is ${pageSnapshot.description.length}`
    );
    assertCondition(
        pageSnapshot.canonical === pageDefinition.canonical,
        `${pageDefinition.path} canonical drifted`
    );
    assertCondition(
        pageSnapshot.openGraphUrl === pageDefinition.canonical,
        `${pageDefinition.path} Open Graph URL drifted`
    );
    assertCondition(
        pageSnapshot.openGraphImage === `${publicOrigin}${PUBLIC_SEO_PATHS.OG_IMAGE}`,
        `${pageDefinition.path} Open Graph image drifted`
    );
    assertCondition(
        !pageSnapshot.robots.toLowerCase().includes("noindex"),
        `${pageDefinition.path} is noindex`
    );
    assertCondition(
        pageSnapshot.headingCount === 1,
        `${pageDefinition.path} must have exactly one H1`
    );
    assertCondition(pageSnapshot.headingText.length > 0, `${pageDefinition.path} has an empty H1`);
    assertCondition(
        pageSnapshot.wordCount >= minimumWordCountForKind(pageDefinition.kind),
        `${pageDefinition.path} has only ${pageSnapshot.wordCount} words`
    );
    assertCondition(
        pageSnapshot.structuredDataItems.some(
            (structuredItem) => structuredItem["@type"] === pageDefinition.kind
        ),
        `${pageDefinition.path} lacks ${pageDefinition.kind} structured data`
    );
}

/**
 * @param {import("./publicPagesSeoSupport.js").PublicPageDefinition} pageDefinition
 * @param {import("./publicPagesSeoSupport.js").PublicPageSnapshot} pageSnapshot
 * @param {string} evidenceSource
 * @returns {void}
 */
function assertResourceEvidence(pageDefinition, pageSnapshot, evidenceSource) {
    assertCondition(pageSnapshot.hasQuickVerdict, `${pageDefinition.path} lacks a quick verdict`);
    assertCondition(
        pageSnapshot.authorProfile === "https://github.com/MarcoPoloResearchLab",
        `${pageDefinition.path} lacks the author profile`
    );
    assertCondition(
        pageSnapshot.visibleModifiedDate === pageDefinition.lastModified,
        `${pageDefinition.path} visible date drifted`
    );
    assertCondition(
        pageSnapshot.codeText.length >= SEO_TEST_LIMITS.MINIMUM_CODE_LENGTH,
        `${pageDefinition.path} lacks repository evidence`
    );
    assertCondition(
        normalizeCode(evidenceSource).includes(normalizeCode(pageSnapshot.codeText)),
        `${pageDefinition.path} code excerpt does not match ${pageDefinition.evidenceSource}`
    );
}

/**
 * @param {import("./publicPagesSeoSupport.js").PublicPageDefinition} pageDefinition
 * @param {import("./publicPagesSeoSupport.js").PublicPageSnapshot} pageSnapshot
 * @returns {void}
 */
function assertArticleContract(pageDefinition, pageSnapshot) {
    assertCondition(
        pageSnapshot.mainText.toLowerCase().includes(pageDefinition.primaryKeyword.toLowerCase()),
        `${pageDefinition.path} does not naturally include its primary keyword`
    );
    assertCondition(
        pageSnapshot.relatedPaths.length >= SEO_TEST_LIMITS.MINIMUM_RELATED_LINK_COUNT,
        `${pageDefinition.path} lacks contextual related links`
    );
    assertCondition(
        pageSnapshot.faqDetails.length >= SEO_TEST_LIMITS.MINIMUM_FAQ_COUNT,
        `${pageDefinition.path} lacks a complete visible FAQ`
    );
    assertCondition(
        serializeFaqItems(pageSnapshot.faqDetails) === serializeFaqItems(pageSnapshot.structuredFaqs),
        `${pageDefinition.path} FAQ schema does not match visible content`
    );
    const articleData = pageSnapshot.structuredDataItems.find(
        (structuredItem) => structuredItem["@type"] === pageDefinition.kind
    );
    assertCondition(articleData !== undefined, `${pageDefinition.path} lacks article data`);
    assertCondition(
        articleData.mainEntityOfPage === pageDefinition.canonical,
        `${pageDefinition.path} mainEntityOfPage drifted`
    );
    assertCondition(
        articleData.dateModified === pageDefinition.lastModified,
        `${pageDefinition.path} structured date drifted`
    );
}

/**
 * @param {Set<string>} titles
 * @param {Set<string>} descriptions
 * @param {Set<string>} headings
 * @param {import("./publicPagesSeoSupport.js").PublicPageDefinition} pageDefinition
 * @param {import("./publicPagesSeoSupport.js").PublicPageSnapshot} pageSnapshot
 * @returns {void}
 */
function assertUniquePageCopy(titles, descriptions, headings, pageDefinition, pageSnapshot) {
    assertCondition(!titles.has(pageSnapshot.title), `${pageDefinition.path} duplicates a title`);
    assertCondition(
        !descriptions.has(pageSnapshot.description),
        `${pageDefinition.path} duplicates a description`
    );
    assertCondition(
        !headings.has(pageSnapshot.headingText),
        `${pageDefinition.path} duplicates an H1`
    );
    titles.add(pageSnapshot.title);
    descriptions.add(pageSnapshot.description);
    headings.add(pageSnapshot.headingText);
}

/**
 * Executes public-page SEO checks using the same static server as the browser suite.
 * @param {import("puppeteer").Page} page
 * @param {(name: string) => void} pass
 * @param {(name: string, error: unknown) => void} fail
 * @param {string} publicOrigin
 * @returns {Promise<void>}
 */
export async function runPublicPagesSeoSuite(page, pass, fail, publicOrigin) {
    const testName = "public pages - catalog, metadata, schema, and crawlability";
    try {
        const pageCatalog = await loadPageCatalog(page, publicOrigin);
        assertCondition(pageCatalog.schemaVersion === 1, "Unsupported page catalog schema");
        assertCondition(
            pageCatalog.publicOrigin === "https://threader.mprlab.com",
            "Unexpected public origin"
        );

        /** @type {Map<string, import("./publicPagesSeoSupport.js").PublicPageSnapshot>} */
        const pageSnapshots = new Map();
        const titles = new Set();
        const descriptions = new Set();
        const headings = new Set();
        const allInternalPaths = new Set();
        const incomingLinkCounts = new Map(
            pageCatalog.pages.map((pageDefinition) => [pageDefinition.path, 0])
        );

        for (const pageDefinition of pageCatalog.pages) {
            const pageSnapshot = await inspectPublicPage(
                page,
                `${publicOrigin}${pageDefinition.path}`
            );
            pageSnapshots.set(pageDefinition.path, pageSnapshot);
            assertPageIdentity(pageDefinition, pageSnapshot, pageCatalog.publicOrigin);

            if (pageDefinition.kind !== PUBLIC_SEO_KINDS.WEB_APPLICATION) {
                assertCondition(
                    typeof pageDefinition.evidenceSource === "string",
                    `${pageDefinition.path} lacks an evidence source`
                );
                const evidenceSource = await loadEvidenceSource(
                    page,
                    publicOrigin,
                    pageDefinition.evidenceSource
                );
                assertResourceEvidence(pageDefinition, pageSnapshot, evidenceSource);
            }

            if (PUBLIC_SEO_KINDS.ARTICLES.has(pageDefinition.kind)) {
                assertArticleContract(pageDefinition, pageSnapshot);
            }

            assertUniquePageCopy(titles, descriptions, headings, pageDefinition, pageSnapshot);
            for (const internalPath of pageSnapshot.internalPaths) {
                allInternalPaths.add(internalPath);
                if (incomingLinkCounts.has(internalPath) && internalPath !== pageDefinition.path) {
                    const incomingLinkCount = incomingLinkCounts.get(internalPath);
                    assertCondition(
                        typeof incomingLinkCount === "number",
                        `${internalPath} lacks an incoming-link counter`
                    );
                    incomingLinkCounts.set(internalPath, incomingLinkCount + 1);
                }
            }
        }

        const hubSnapshot = pageSnapshots.get(PUBLIC_SEO_PATHS.RESOURCE_HUB);
        assertCondition(hubSnapshot !== undefined, "Resource hub was not inspected");
        const articlePaths = pageCatalog.pages
            .filter((pageDefinition) => PUBLIC_SEO_KINDS.ARTICLES.has(pageDefinition.kind))
            .map((pageDefinition) => pageDefinition.path);
        assertCondition(
            articlePaths.every((articlePath) => hubSnapshot.resourceCardPaths.includes(articlePath)),
            "Resource hub does not link every article"
        );
        for (const [publicPath, incomingLinkCount] of incomingLinkCounts.entries()) {
            if (publicPath !== PUBLIC_SEO_PATHS.ROOT) {
                assertCondition(incomingLinkCount > 0, `${publicPath} has no incoming public link`);
            }
        }

        const knownPaths = new Set(
            pageCatalog.pages.map((pageDefinition) => pageDefinition.path)
        );
        assertCondition(
            Array.from(allInternalPaths).every((internalPath) => knownPaths.has(internalPath)),
            "A public page links to an uncataloged internal path"
        );
        const internalStatuses = await inspectInternalPaths(
            page,
            publicOrigin,
            Array.from(allInternalPaths)
        );
        for (const [internalPath, responseStatus] of Object.entries(internalStatuses)) {
            assertCondition(
                responseStatus === SEO_TEST_LIMITS.HTTP_OK_STATUS,
                `${internalPath} returned ${responseStatus}`
            );
        }

        const sitemapEntries = await inspectSitemap(page, publicOrigin);
        assertCondition(
            Object.keys(sitemapEntries).length === pageCatalog.pages.length,
            "Sitemap and page catalog counts differ"
        );
        for (const pageDefinition of pageCatalog.pages) {
            assertCondition(
                sitemapEntries[pageDefinition.canonical] === pageDefinition.lastModified,
                `${pageDefinition.path} sitemap lastmod drifted`
            );
        }

        const robotsText = await inspectRobots(page, publicOrigin);
        assertCondition(/User-agent:\s*\*/i.test(robotsText), "robots.txt lacks the default user agent");
        assertCondition(
            /Allow:\s*\/(?:\s|$)/i.test(robotsText),
            "robots.txt does not allow public crawling"
        );
        assertCondition(
            robotsText.includes(`${pageCatalog.publicOrigin}${PUBLIC_SEO_PATHS.SITEMAP}`),
            "robots.txt lacks the canonical sitemap"
        );

        const serverDeliveredRoot = await inspectServerDeliveredRoot(page, publicOrigin);
        assertCondition(serverDeliveredRoot.hasHeading, "Server-delivered root lacks its H1");
        assertCondition(
            serverDeliveredRoot.hasResourceLink,
            "Server-delivered root lacks the resource link"
        );

        const openGraphImage = await inspectOpenGraphImage(page, publicOrigin);
        assertCondition(
            openGraphImage.width === SEO_TEST_LIMITS.EXPECTED_OG_IMAGE_WIDTH &&
                openGraphImage.height === SEO_TEST_LIMITS.EXPECTED_OG_IMAGE_HEIGHT,
            `Open Graph image is ${openGraphImage.width}x${openGraphImage.height}`
        );

        pass(testName);
    } catch (error) {
        fail(testName, error);
    }
}
