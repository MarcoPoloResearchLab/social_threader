// @ts-check
import { loadProductDirectory } from './core/gateway.js';
import { mountProductDirectory } from './ui/productDirectory.js';

await mountProductDirectory(loadProductDirectory);
