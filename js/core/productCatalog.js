// @ts-check
/** @typedef {{id: string, name: string, purpose: string, category: string, href: string}} Product */
/** @typedef {{id: string, label: string, mode: string}} ProductSection */
/** @typedef {{schemaVersion: number, label: string, overview: {id: string, label: string, links: {label: string, href: string}[]}, sections: ProductSection[], products: Product[]}} ProductCatalog */

const SCHEMA_VERSION = 1;
const SECTION_MODES = Object.freeze(['expanded', 'collapsed']);
const IDENTIFIER = /^[a-z][a-z0-9-]*$/;
const INVALID_CATALOG = 'Invalid product catalog';
const LINK_TARGET = '_blank';
const LINK_REL = 'noopener noreferrer';
const LABEL_SEPARATOR = ' — ';

function requireCondition(condition) {
  if (!condition) throw new Error(INVALID_CATALOG);
}

function requireText(value) {
  requireCondition(typeof value === 'string' && value.trim().length > 0);
}

function requireDestination(value) {
  requireText(value);
  let destination;
  try { destination = new URL(value); } catch { throw new Error(INVALID_CATALOG); }
  requireCondition(destination.protocol === 'https:' && !destination.username && !destination.password);
}

function requireKeys(value, keys) {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value));
  requireCondition(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}

/** Validate an imported catalog once and produce the public mpr-dropdown menu.
 * @param {ProductCatalog} catalog
 * @returns {{label: string, placement: string, sections: {id: string, label: string, mode: string, links: {label: string, href: string, target: string, rel: string}[]}[]}}
 */
export function createProductMenu(catalog) {
  requireKeys(catalog, ['schemaVersion', 'label', 'overview', 'sections', 'products']);
  requireCondition(catalog.schemaVersion === SCHEMA_VERSION);
  requireText(catalog.label);
  requireKeys(catalog.overview, ['id', 'label', 'links']);
  requireCondition(IDENTIFIER.test(catalog.overview.id));
  requireText(catalog.overview.label);
  requireCondition(Array.isArray(catalog.overview.links) && catalog.overview.links.length > 0);
  for (const link of catalog.overview.links) {
    requireKeys(link, ['label', 'href']);
    requireText(link.label);
    requireDestination(link.href);
  }
  requireCondition(Array.isArray(catalog.sections) && catalog.sections.length > 0);
  const identifiers = new Set([catalog.overview.id]);
  for (const section of catalog.sections) {
    requireKeys(section, ['id', 'label', 'mode']);
    requireCondition(IDENTIFIER.test(section.id) && !identifiers.has(section.id));
    identifiers.add(section.id);
    requireText(section.label);
    requireCondition(SECTION_MODES.includes(section.mode));
  }
  requireCondition(Array.isArray(catalog.products) && catalog.products.length > 0);
  const productIdentifiers = new Set();
  for (const product of catalog.products) {
    requireKeys(product, ['id', 'name', 'purpose', 'category', 'href']);
    requireCondition(IDENTIFIER.test(product.id) && !productIdentifiers.has(product.id));
    productIdentifiers.add(product.id);
    requireText(product.name);
    requireText(product.purpose);
    requireDestination(product.href);
    requireCondition(catalog.sections.some(section => section.id === product.category));
  }
  return {
    label: catalog.label,
    placement: 'top',
    sections: [
      { ...catalog.overview, mode: 'static', links: catalog.overview.links.map(link => ({ ...link, target: LINK_TARGET, rel: LINK_REL })) },
      ...catalog.sections.map(section => {
        const products = catalog.products.filter(product => product.category === section.id);
        requireCondition(products.length > 0);
        return { ...section, links: products.map(product => ({ label: product.name + LABEL_SEPARATOR + product.purpose, href: product.href, target: LINK_TARGET, rel: LINK_REL })) };
      })
    ]
  };
}
