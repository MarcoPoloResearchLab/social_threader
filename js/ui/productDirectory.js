// @ts-check
import { PRODUCT_DIRECTORY } from '../constants.js';

/** Render the shared menu through the public MPR UI footer contract. */
export function mountProductDirectory() {
    const footer = document.querySelector(PRODUCT_DIRECTORY.FOOTER_SELECTOR);
    if (!footer) throw new Error(PRODUCT_DIRECTORY.ERROR_MESSAGE);
    requestAnimationFrame(() => {
        footer.setAttribute('prefix-text', PRODUCT_DIRECTORY.COPYRIGHT_TEMPLATE.replace('{year}', String(new Date().getFullYear())));
        footer.setAttribute('privacy-link-hidden', 'true');
        footer.setAttribute('horizontal-links', JSON.stringify(PRODUCT_DIRECTORY.FOOTER_LINKS));
        footer.setAttribute('menu', JSON.stringify(PRODUCT_DIRECTORY.MENU));
    });
}
