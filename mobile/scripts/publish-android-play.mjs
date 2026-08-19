#!/usr/bin/env node
// @ts-check
/// <reference types="node" />

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_MOBILE_DIR = path.join(REPO_ROOT, "mobile");
const BUNDLE_SCHEMA = "social-threader.mobile-android-bundle.v1";
const PUBLISH_SCHEMA = "social-threader.mobile-android-play-publish.v1";
const ANDROID_PUBLISHER_API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const ANDROID_PUBLISHER_UPLOAD_BASE = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications";
const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const DEFAULT_TRACK = "production";
const DEFAULT_STATUS = "completed";
const PROVIDER_MODES = Object.freeze({
  PREFLIGHT: "preflight",
  RECONCILE: "reconcile",
  SUBMIT: "submit"
});

class PublishError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = "PublishError";
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = await publishAndroidBundle(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  if (error instanceof PublishError) {
    process.stderr.write(`mobile android play publish failed: ${error.message}\n`);
    process.exit(2);
  }
  throw error;
}

/**
 * @typedef {{
 *   mobileDir: string;
 *   aab: string;
 *   mapping: string;
 *   buildManifest: string;
 *   packageName: string;
 *   quotaProject: string;
 *   track: string;
 *   status: string;
 *   releaseName: string;
 *   mode: string;
 *   versioning: { artifactVersion: string; releaseTimestamp: string } | null;
 * }} PublishArgs
 */

/**
 * @param {string[]} argv
 * @returns {PublishArgs}
 */
function parseArgs(argv) {
  const options = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run" || token === "--reconcile") {
      flags.add(token.slice(2));
      continue;
    }
    if (!token.startsWith("--")) {
      throw new PublishError(`unexpected positional argument: ${token}`);
    }
    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 0) {
      options.set(token.slice(2, equalsIndex), token.slice(equalsIndex + 1));
      continue;
    }
    const optionName = token.slice(2);
    const optionValue = argv[index + 1];
    if (!optionValue || optionValue.startsWith("--")) {
      throw new PublishError(`missing value for --${optionName}`);
    }
    options.set(optionName, optionValue);
    index += 1;
  }

  const mobileDir = resolvePath(String(options.get("mobile-dir") || DEFAULT_MOBILE_DIR));
  const appConfig = readAndroidAppConfig(mobileDir);
  const releaseIdentity = readAndroidReleaseIdentity(mobileDir);
  const packageName = String(options.get("package-name") || releaseIdentity.packageName || appConfig.packageName);
  if (packageName !== appConfig.packageName) {
    throw new PublishError(`package name mismatch: app.json has ${appConfig.packageName}, publish target is ${packageName}`);
  }
  if (releaseIdentity.packageName && packageName !== releaseIdentity.packageName) {
    throw new PublishError(`package name mismatch: release identity has ${releaseIdentity.packageName}, publish target is ${packageName}`);
  }

  const aab = resolvePath(String(options.get("aab") || defaultAabPath(mobileDir, appConfig.version)));
  const mapping = resolvePath(String(options.get("mapping") || matchingOutputPath(aab, "-mapping.txt")));
  const buildManifest = resolvePath(String(options.get("build-manifest") || matchingBuildManifestPath(aab)));
  const quotaProject = String(
    options.get("quota-project") ||
      process.env.GOOGLE_CLOUD_QUOTA_PROJECT ||
      process.env.GCLOUD_QUOTA_PROJECT ||
      releaseIdentity.googleCloudProjectId ||
      ""
  );
  const track = String(options.get("track") || process.env.SOCIAL_THREADER_ANDROID_PLAY_TRACK || DEFAULT_TRACK);
  const status = String(options.get("status") || process.env.SOCIAL_THREADER_ANDROID_PLAY_STATUS || DEFAULT_STATUS);
  const releaseName = String(options.get("release-name") || appConfig.version);
  requireTrack(track);
  requireReleaseStatus(status);
  if (flags.has("dry-run") && flags.has("reconcile")) {
    throw new PublishError("--dry-run and --reconcile cannot be used together");
  }
  const mode = flags.has("dry-run")
    ? PROVIDER_MODES.PREFLIGHT
    : flags.has("reconcile")
      ? PROVIDER_MODES.RECONCILE
      : PROVIDER_MODES.SUBMIT;
  const versioning = parseLifecycleVersioning(
    String(process.env.MPRLAB_ARTIFACT_VERSION || ""),
    String(options.get("release-timestamp") || "")
  );

  return {
    mobileDir,
    aab,
    mapping,
    buildManifest,
    packageName,
    quotaProject,
    track,
    status,
    releaseName,
    mode,
    versioning
  };
}

/**
 * @param {string} artifactVersion
 * @param {string} releaseTimestamp
 * @returns {{ artifactVersion: string; releaseTimestamp: string } | null}
 */
function parseLifecycleVersioning(artifactVersion, releaseTimestamp) {
  if (!artifactVersion && !releaseTimestamp) {
    return null;
  }
  if (!artifactVersion || !releaseTimestamp) {
    throw new PublishError("MPRLAB_ARTIFACT_VERSION and --release-timestamp must be provided together");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(artifactVersion)) {
    throw new PublishError("MPRLAB_ARTIFACT_VERSION is not canonical");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(releaseTimestamp)) {
    throw new PublishError("--release-timestamp must be an RFC 3339 UTC timestamp");
  }
  return { artifactVersion, releaseTimestamp };
}

/**
 * @param {PublishArgs} args
 * @returns {Promise<Record<string, unknown>>}
 */
async function publishAndroidBundle(args) {
  const appConfig = readAndroidAppConfig(args.mobileDir);
  requireFile(args.aab, "Android App Bundle");
  requireFile(args.mapping, "R8 deobfuscation mapping file");
  const buildArtifact = readAndroidBuildManifest(
    args.buildManifest,
    args.aab,
    args.mapping,
    appConfig,
    args.versioning
  );
  if (buildArtifact.androidPackage !== args.packageName) {
    throw new PublishError(`build manifest package mismatch: manifest has ${buildArtifact.androidPackage}, publish target is ${args.packageName}`);
  }
  if (!args.quotaProject) {
    throw new PublishError("missing Google Cloud quota project; pass --quota-project or set GOOGLE_CLOUD_QUOTA_PROJECT");
  }

  const providerToken = accessTokenFromApplicationDefaultCredentials();
  const providerHeaders = googleAuthHeaders(providerToken, args.quotaProject);
  const providerState = await inspectGooglePlayState(args, buildArtifact, providerHeaders);
  const result = {
    schema: PUBLISH_SCHEMA,
    status: PROVIDER_MODES.PREFLIGHT === args.mode ? "planned" : "absent",
    androidPackage: args.packageName,
    versionName: buildArtifact.versionName,
    versionCode: buildArtifact.versionCode,
    sourceVersionCode: buildArtifact.sourceVersionCode,
    versionCodeSource: buildArtifact.versionCodeSource,
    versionCodePolicy: buildArtifact.versionCodePolicy,
    googlePlayMaxVersionCode: buildArtifact.googlePlayMaxVersionCode,
    buildManifest: args.buildManifest,
    track: args.track,
    releaseName: args.releaseName,
    releaseStatus: args.status,
    aab: args.aab,
    aabSha256: sha256File(args.aab),
    deobfuscationFile: args.mapping,
    deobfuscationSha256: sha256File(args.mapping),
    quotaProject: args.quotaProject,
    publisherAccess: "verified"
  };
  if (args.mode === PROVIDER_MODES.PREFLIGHT) {
    return result;
  }
  if (args.mode === PROVIDER_MODES.RECONCILE) {
    return {
      ...result,
      status: providerState.submitted ? "submitted" : "absent"
    };
  }
  if (providerState.submitted) {
    return {
      ...result,
      status: "submitted"
    };
  }

  await submitGooglePlayRelease(args, buildArtifact, providerHeaders);
  const verifiedState = await inspectGooglePlayState(args, buildArtifact, providerHeaders);
  if (!verifiedState.submitted) {
    throw new PublishError(`Google Play did not expose versionCode ${buildArtifact.versionCode} on track ${args.track} after submission`);
  }
  return {
    ...result,
    status: "submitted",
    uploadedVersionCode: buildArtifact.versionCode
  };
}

/**
 * @param {PublishArgs} args
 * @param {{ versionCode: number }} buildArtifact
 * @param {Record<string, string>} providerHeaders
 * @returns {Promise<{ submitted: boolean; bundleExists: boolean }>}
 */
async function inspectGooglePlayState(args, buildArtifact, providerHeaders) {
  const editId = await createGooglePlayEdit(args.packageName, providerHeaders);
  try {
    const bundles = await listGooglePlayBundles(args.packageName, editId, providerHeaders);
    const existingBundle = findBundleByVersionCode(bundles, buildArtifact.versionCode);
    if (existingBundle) {
      requireMatchingBundleDigest(existingBundle, args.aab);
    }
    const tracks = await listGooglePlayTracks(args.packageName, editId, providerHeaders);
    const trackReleaseState = inspectTrackReleaseState(
      tracks,
      args.track,
      buildArtifact.versionCode,
      args.releaseName,
      args.status
    );
    if (trackReleaseState.containsVersion && !existingBundle) {
      throw new PublishError(`Google Play track ${args.track} references absent versionCode ${buildArtifact.versionCode}`);
    }
    return {
      submitted: trackReleaseState.matchesRequestedRelease,
      bundleExists: Boolean(existingBundle)
    };
  } finally {
    await deleteGooglePlayEdit(args.packageName, editId, providerHeaders);
  }
}

/**
 * @param {PublishArgs} args
 * @param {{ versionCode: number }} buildArtifact
 * @param {Record<string, string>} providerHeaders
 */
async function submitGooglePlayRelease(args, buildArtifact, providerHeaders) {
  const editId = await createGooglePlayEdit(args.packageName, providerHeaders);
  let editCommitted = false;
  try {
    let uploadedVersionCode = buildArtifact.versionCode;
    const bundles = await listGooglePlayBundles(args.packageName, editId, providerHeaders);
    const existingBundle = findBundleByVersionCode(bundles, buildArtifact.versionCode);
    if (existingBundle) {
      requireMatchingBundleDigest(existingBundle, args.aab);
    } else {
      const bundle = await requestJson({
        method: "POST",
        url: publisherUploadUrl(args.packageName, `edits/${encodeURIComponent(editId)}/bundles`, { uploadType: "media" }),
        headers: { ...providerHeaders, "Content-Type": "application/octet-stream" },
        body: fs.readFileSync(args.aab),
        label: "upload Android App Bundle"
      });
      uploadedVersionCode = requirePositiveInteger(bundle.versionCode, "uploaded bundle versionCode");
      if (uploadedVersionCode !== buildArtifact.versionCode) {
        throw new PublishError(`uploaded bundle versionCode ${uploadedVersionCode} does not match build manifest ${buildArtifact.versionCode}`);
      }
    }

    await requestJson({
      method: "POST",
      url: publisherUploadUrl(
        args.packageName,
        `edits/${encodeURIComponent(editId)}/apks/${uploadedVersionCode}/deobfuscationFiles/proguard`,
        { uploadType: "media" }
      ),
      headers: { ...providerHeaders, "Content-Type": "application/octet-stream" },
      body: fs.readFileSync(args.mapping),
      label: "upload Android deobfuscation mapping"
    });

    await requestJson({
      method: "PUT",
      url: publisherUrl(args.packageName, `edits/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(args.track)}`),
      headers: { ...providerHeaders, "Content-Type": "application/json" },
      body: Buffer.from(
        JSON.stringify({
          releases: [
            {
              name: args.releaseName,
              versionCodes: [String(uploadedVersionCode)],
              status: args.status
            }
          ]
        })
      ),
      label: `update ${args.track} track`
    });

    await requestJson({
      method: "POST",
      url: publisherUrl(args.packageName, `edits/${encodeURIComponent(editId)}:commit`),
      headers: providerHeaders,
      label: "commit Android Publisher edit"
    });
    editCommitted = true;
  } finally {
    if (!editCommitted) {
      await deleteGooglePlayEdit(args.packageName, editId, providerHeaders);
    }
  }
}

/**
 * @param {string} packageName
 * @param {Record<string, string>} providerHeaders
 * @returns {Promise<string>}
 */
async function createGooglePlayEdit(packageName, providerHeaders) {
  const edit = await requestJson({
    method: "POST",
    url: publisherUrl(packageName, "edits"),
    headers: providerHeaders,
    label: "create Android Publisher edit"
  });
  return requireString(edit.id, "edit id");
}

/**
 * @param {string} packageName
 * @param {string} editId
 * @param {Record<string, string>} providerHeaders
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function listGooglePlayBundles(packageName, editId, providerHeaders) {
  const payload = await requestJson({
    method: "GET",
    url: publisherUrl(packageName, `edits/${encodeURIComponent(editId)}/bundles`),
    headers: providerHeaders,
    label: "list Android App Bundles"
  });
  return requireObjectArray(payload.bundles, "Android App Bundles");
}

/**
 * @param {string} packageName
 * @param {string} editId
 * @param {Record<string, string>} providerHeaders
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function listGooglePlayTracks(packageName, editId, providerHeaders) {
  const payload = await requestJson({
    method: "GET",
    url: publisherUrl(packageName, `edits/${encodeURIComponent(editId)}/tracks`),
    headers: providerHeaders,
    label: "list Google Play tracks"
  });
  return requireObjectArray(payload.tracks, "Google Play tracks");
}

/**
 * @param {string} packageName
 * @param {string} editId
 * @param {Record<string, string>} providerHeaders
 */
async function deleteGooglePlayEdit(packageName, editId, providerHeaders) {
  await requestJson({
    method: "DELETE",
    url: publisherUrl(packageName, `edits/${encodeURIComponent(editId)}`),
    headers: providerHeaders,
    label: "delete Android Publisher edit"
  });
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>[]}
 */
function requireObjectArray(value, label) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new PublishError(`${label} must be an array of objects`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string[]}
 */
function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new PublishError(`${label} must be an array of strings`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function readOptionalString(value, label) {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string") {
    throw new PublishError(`${label} must be a string`);
  }
  return value;
}

/**
 * @param {Record<string, unknown>[]} bundles
 * @param {number} versionCode
 * @returns {Record<string, unknown> | null}
 */
function findBundleByVersionCode(bundles, versionCode) {
  const matches = bundles.filter((bundle) => requirePositiveInteger(bundle.versionCode, "Google Play bundle versionCode") === versionCode);
  if (matches.length > 1) {
    throw new PublishError(`Google Play returned duplicate bundle versionCode ${versionCode}`);
  }
  return matches[0] || null;
}

/**
 * @param {Record<string, unknown>} bundle
 * @param {string} aabPath
 */
function requireMatchingBundleDigest(bundle, aabPath) {
  const expectedHex = sha256File(aabPath);
  const expectedBase64 = Buffer.from(expectedHex, "hex").toString("base64");
  const expectedBase64URL = expectedBase64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const providerDigest = requireString(bundle.sha256, "Google Play bundle SHA-256");
  if (![expectedHex, expectedBase64, expectedBase64URL].includes(providerDigest)) {
    throw new PublishError(`Google Play versionCode ${bundle.versionCode} has a different Android App Bundle digest`);
  }
}

/**
 * @param {Record<string, unknown>[]} tracks
 * @param {string} trackName
 * @param {number} versionCode
 * @param {string} releaseName
 * @param {string} releaseStatus
 * @returns {{ containsVersion: boolean; matchesRequestedRelease: boolean }}
 */
function inspectTrackReleaseState(tracks, trackName, versionCode, releaseName, releaseStatus) {
  const matchingTracks = tracks.filter((track) => requireString(track.track, "Google Play track name") === trackName);
  if (matchingTracks.length > 1) {
    throw new PublishError(`Google Play returned duplicate track ${trackName}`);
  }
  if (matchingTracks.length === 0) {
    return { containsVersion: false, matchesRequestedRelease: false };
  }
  const releases = requireObjectArray(matchingTracks[0].releases, `Google Play track ${trackName} releases`);
  const matchingReleases = releases
    .map((release) => ({
      release,
      versionCodes: requireStringArray(release.versionCodes, `Google Play track ${trackName} versionCodes`)
    }))
    .filter((releaseState) => releaseState.versionCodes.includes(String(versionCode)));
  if (matchingReleases.length > 1) {
    throw new PublishError(`Google Play track ${trackName} returned duplicate release versionCode ${versionCode}`);
  }
  if (matchingReleases.length === 0) {
    return { containsVersion: false, matchesRequestedRelease: false };
  }
  const matchingRelease = matchingReleases[0];
  const providerReleaseName = readOptionalString(matchingRelease.release.name, `Google Play track ${trackName} release name`);
  const providerReleaseStatus = readOptionalString(matchingRelease.release.status, `Google Play track ${trackName} release status`);
  return {
    containsVersion: true,
    matchesRequestedRelease:
      matchingRelease.versionCodes.length === 1 &&
      matchingRelease.versionCodes[0] === String(versionCode) &&
      providerReleaseName === releaseName &&
      providerReleaseStatus === releaseStatus
  };
}

/**
 * @param {string} mobileDir
 * @returns {{ version: string; versionCode: number; packageName: string }}
 */
function readAndroidAppConfig(mobileDir) {
  const appJsonPath = path.join(mobileDir, "app.json");
  requireFile(appJsonPath, "mobile app.json");
  const appConfig = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  const expoConfig = appConfig.expo || {};
  const androidConfig = expoConfig.android || {};
  return {
    version: requireString(expoConfig.version, `expo.version in ${appJsonPath}`),
    versionCode: requirePositiveInteger(androidConfig.versionCode, `expo.android.versionCode in ${appJsonPath}`),
    packageName: requireString(androidConfig.package, `expo.android.package in ${appJsonPath}`)
  };
}

/**
 * @param {string} mobileDir
 * @returns {{ packageName: string; googleCloudProjectId: string }}
 */
function readAndroidReleaseIdentity(mobileDir) {
  const identityPath = path.join(mobileDir, "android-release-identity.json");
  if (!fs.existsSync(identityPath)) {
    return { packageName: "", googleCloudProjectId: "" };
  }
  const identity = JSON.parse(fs.readFileSync(identityPath, "utf8"));
  return {
    packageName: typeof identity.packageName === "string" ? identity.packageName : "",
    googleCloudProjectId: typeof identity.googleCloudProjectId === "string" ? identity.googleCloudProjectId : ""
  };
}

/**
 * @param {string} manifestPath
 * @param {string} aabPath
 * @param {string} mappingPath
 * @param {{ version: string; packageName: string }} appConfig
 * @param {{ artifactVersion: string; releaseTimestamp: string } | null} expectedVersioning
 * @returns {{ androidPackage: string; versionName: string; versionCode: number; sourceVersionCode: number; versionCodeSource: string; versionCodePolicy: string; googlePlayMaxVersionCode: number | null }}
 */
function readAndroidBuildManifest(manifestPath, aabPath, mappingPath, appConfig, expectedVersioning) {
  requireFile(manifestPath, "Android bundle build manifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schema !== BUNDLE_SCHEMA) {
    throw new PublishError(`invalid Android bundle build manifest schema in ${manifestPath}`);
  }
  if (manifest.status !== "passed") {
    throw new PublishError(`Android bundle build manifest is not passed: ${manifestPath}`);
  }
  const manifestAab = resolvePath(requireString(manifest.output, `output in ${manifestPath}`));
  const manifestMapping = resolvePath(requireString(manifest.deobfuscationFile, `deobfuscationFile in ${manifestPath}`));
  if (manifestAab !== aabPath) {
    throw new PublishError(`Android bundle build manifest output mismatch: ${manifestAab} != ${aabPath}`);
  }
  if (manifestMapping !== mappingPath) {
    throw new PublishError(`Android bundle build manifest mapping mismatch: ${manifestMapping} != ${mappingPath}`);
  }
  if (manifest.sha256 !== sha256File(aabPath)) {
    throw new PublishError(`Android App Bundle hash changed since build manifest: ${aabPath}`);
  }
  if (manifest.deobfuscationSha256 !== sha256File(mappingPath)) {
    throw new PublishError(`R8 deobfuscation mapping hash changed since build manifest: ${mappingPath}`);
  }
  if (expectedVersioning) {
    if (!manifest.versioning || typeof manifest.versioning !== "object" || Array.isArray(manifest.versioning)) {
      throw new PublishError(`missing lifecycle versioning in ${manifestPath}`);
    }
    if (manifest.versioning.artifactVersion !== expectedVersioning.artifactVersion) {
      throw new PublishError(`build manifest artifact version does not match MPRLAB_ARTIFACT_VERSION in ${manifestPath}`);
    }
    if (manifest.versioning.releaseTimestamp !== expectedVersioning.releaseTimestamp) {
      throw new PublishError(`build manifest release timestamp does not match --release-timestamp in ${manifestPath}`);
    }
  }
  const versionName = requireString(manifest.versionName, `versionName in ${manifestPath}`);
  if (versionName !== appConfig.version) {
    throw new PublishError(`build manifest versionName ${versionName} does not match app.json ${appConfig.version}`);
  }
  return {
    androidPackage: requireString(manifest.androidPackage, `androidPackage in ${manifestPath}`),
    versionName,
    versionCode: requirePositiveInteger(manifest.versionCode, `versionCode in ${manifestPath}`),
    sourceVersionCode: requirePositiveInteger(manifest.sourceVersionCode, `sourceVersionCode in ${manifestPath}`),
    versionCodeSource: requireString(manifest.versionCodeSource, `versionCodeSource in ${manifestPath}`),
    versionCodePolicy: requireString(manifest.versionCodePolicy, `versionCodePolicy in ${manifestPath}`),
    googlePlayMaxVersionCode:
      manifest.googlePlayMaxVersionCode === null || manifest.googlePlayMaxVersionCode === undefined
        ? null
        : requireNonNegativeInteger(manifest.googlePlayMaxVersionCode, `googlePlayMaxVersionCode in ${manifestPath}`)
  };
}

/**
 * @returns {string}
 */
function accessTokenFromApplicationDefaultCredentials() {
  const result = spawnSync("gcloud", ["auth", "application-default", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error) {
    throw new PublishError(`could not run gcloud for ADC token: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stdout || ""}${result.stderr || ""}`.trim();
    throw new PublishError(
      `could not read Google Application Default Credentials token with ${ANDROID_PUBLISHER_SCOPE}; ` +
        `run gcloud auth application-default login --scopes=${ANDROID_PUBLISHER_SCOPE},https://www.googleapis.com/auth/cloud-platform` +
        (detail ? `: ${detail}` : "")
    );
  }
  return result.stdout.trim();
}

/**
 * @param {string} token
 * @param {string} quotaProject
 * @returns {Record<string, string>}
 */
function googleAuthHeaders(token, quotaProject) {
  const headers = { Authorization: `Bearer ${token}` };
  if (quotaProject) {
    headers["X-Goog-User-Project"] = quotaProject;
  }
  return headers;
}

/**
 * @param {{ method: string; url: string; headers: Record<string, string>; body?: Buffer; label: string }} request
 * @returns {Promise<Record<string, unknown>>}
 */
async function requestJson(request) {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body ? new Uint8Array(request.body) : undefined
  });
  const body = await response.text();
  if (!response.ok) {
    throw new PublishError(`${request.label} failed with HTTP ${response.status}: ${body.slice(0, 4096)}`);
  }
  if (!body.trim()) {
    return {};
  }
  const payload = JSON.parse(body);
  if (!payload || typeof payload !== "object") {
    throw new PublishError(`${request.label} returned a non-object JSON response`);
  }
  return payload;
}

/**
 * @param {string} packageName
 * @param {string} pathSuffix
 * @returns {string}
 */
function publisherUrl(packageName, pathSuffix) {
  return `${ANDROID_PUBLISHER_API_BASE}/${encodeURIComponent(packageName)}/${pathSuffix}`;
}

/**
 * @param {string} packageName
 * @param {string} pathSuffix
 * @param {Record<string, string>} query
 * @returns {string}
 */
function publisherUploadUrl(packageName, pathSuffix, query) {
  return `${ANDROID_PUBLISHER_UPLOAD_BASE}/${encodeURIComponent(packageName)}/${pathSuffix}?${new URLSearchParams(query).toString()}`;
}

/**
 * @param {string} mobileDir
 * @param {string} version
 * @returns {string}
 */
function defaultAabPath(mobileDir, version) {
  const safeVersion = version.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "release";
  return path.join(mobileDir, "dist", `social-threader-${safeVersion}-android-release.aab`);
}

/**
 * @param {string} outputPath
 * @param {string} suffix
 * @returns {string}
 */
function matchingOutputPath(outputPath, suffix) {
  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}${suffix}`);
}

/**
 * @param {string} outputPath
 * @returns {string}
 */
function matchingBuildManifestPath(outputPath) {
  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}.json`);
}

/**
 * @param {string} value
 * @returns {string}
 */
function resolvePath(value) {
  if (!value) {
    return "";
  }
  if (value === "~") {
    return process.env.HOME || "";
  }
  if (value.startsWith("~/")) {
    return path.join(process.env.HOME || "", value.slice(2));
  }
  return path.resolve(value);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requireString(value, label) {
  if (!value || typeof value !== "string") {
    throw new PublishError(`missing ${label}`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function requirePositiveInteger(value, label) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new PublishError(`${label} must be a positive integer`);
  }
  return numberValue;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function requireNonNegativeInteger(value, label) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new PublishError(`${label} must be a non-negative integer`);
  }
  return numberValue;
}

/**
 * @param {string} filePath
 * @param {string} label
 */
function requireFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new PublishError(`missing ${label}: ${filePath}`);
  }
  if (fs.statSync(filePath).size <= 0) {
    throw new PublishError(`empty ${label}: ${filePath}`);
  }
}

/**
 * @param {string} track
 */
function requireTrack(track) {
  if (!/^[A-Za-z0-9._-]+$/.test(track)) {
    throw new PublishError(`invalid Play track: ${track}`);
  }
}

/**
 * @param {string} status
 */
function requireReleaseStatus(status) {
  if (!new Set(["completed", "draft", "inProgress", "halted"]).has(status)) {
    throw new PublishError(`invalid Play release status: ${status}`);
  }
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}
