// @ts-check
import { readFile } from "node:fs/promises";
import path from "node:path";

const ASSET_NAMES = Object.freeze(["mpr-ui-config.js", "mpr-ui.js", "mpr-ui.css"]);
const CDN_ROOT = "https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/";

/**
 * Loads the shared library from the selected source or its current CDN release.
 * @returns {Promise<Map<string, Buffer>>} Browser dependency assets.
 */
export async function loadSharedUiAssets() {
    const sourceDirectory = process.env.SOCIAL_THREADER_MPR_UI_SOURCE;
    const assetEntries = await Promise.all(ASSET_NAMES.map(async (assetName) => {
        if (sourceDirectory) {
            return [assetName, await readFile(path.join(sourceDirectory, assetName))];
        }
        const response = await fetch(`${CDN_ROOT}${assetName}`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Shared UI asset ${assetName}: HTTP ${response.status}`);
        return [assetName, Buffer.from(await response.arrayBuffer())];
    }));
    return new Map(assetEntries);
}
