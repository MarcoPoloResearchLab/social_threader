// @ts-check
import { PRODUCT_DIRECTORY } from '../constants.js';

/** Render the shared menu through the public MPR UI footer contract. */
export async function mountProductDirectory(loadMenu) {
    const footer = document.querySelector(PRODUCT_DIRECTORY.FOOTER_SELECTOR);
    if (!footer) throw new Error(PRODUCT_DIRECTORY.ERROR_MESSAGE);
    requestAnimationFrame(() => {
        footer.setAttribute('privacy-link-href', PRODUCT_DIRECTORY.PRIVACY_HREF);
        footer.setAttribute('privacy-link-label', PRODUCT_DIRECTORY.PRIVACY_LABEL);
        footer.setAttribute('horizontal-links', JSON.stringify(PRODUCT_DIRECTORY.FOOTER_LINKS));
    });
    try {
        const menu = await loadMenu();
        requestAnimationFrame(() => footer.setAttribute('menu', JSON.stringify(menu)));
    } catch {
        const error = document.createElement('p');
        error.id = PRODUCT_DIRECTORY.ERROR_ID;
        error.setAttribute('role', 'alert');
        error.textContent = PRODUCT_DIRECTORY.ERROR_MESSAGE;
        footer.before(error);
    }
}
