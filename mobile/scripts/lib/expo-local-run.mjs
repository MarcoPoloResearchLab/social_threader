import process from "node:process";

import { parsePort } from "./ports.mjs";

const DEFAULT_EXPO_PORT = 8081;
const DEFAULT_PORT_SEARCH_LIMIT = 40;
const NODE_DNS_IPV4_FIRST_OPTION = "--dns-result-order=ipv4first";

/**
 * Resolves the Metro port requested by CLI args or local-run environment.
 * @param {number | null} explicitPort CLI-provided port, when present.
 * @returns {number}
 */
export function resolveRequestedPort(explicitPort) {
  return (
    explicitPort
    || parsePort(process.env.SOCIAL_THREADER_MOBILE_PORT)
    || parsePort(process.env.EXPO_PORT)
    || parsePort(process.env.RCT_METRO_PORT)
    || DEFAULT_EXPO_PORT
  );
}

/**
 * Resolves how many consecutive ports the local launcher may probe.
 * @returns {number}
 */
export function resolvePortSearchLimit() {
  return parsePort(process.env.SOCIAL_THREADER_MOBILE_PORT_SEARCH_LIMIT) || DEFAULT_PORT_SEARCH_LIMIT;
}

/**
 * Builds the Expo child-process environment for a selected Metro port.
 * @param {number} port Selected Metro port.
 * @param {Record<string, string>} additionalEnvironment Extra environment overrides.
 * @returns {NodeJS.ProcessEnv}
 */
export function createExpoEnvironment(port, additionalEnvironment = {}) {
  const childEnvironment = {
    ...process.env,
    ...additionalEnvironment,
    EXPO_NO_TELEMETRY: "1",
    EXPO_PACKAGER_PORT: String(port),
    RCT_METRO_PORT: String(port),
    SOCIAL_THREADER_MOBILE_PORT: String(port)
  };
  childEnvironment.NODE_OPTIONS = appendNodeOption(process.env.NODE_OPTIONS, NODE_DNS_IPV4_FIRST_OPTION);
  delete childEnvironment.FORCE_COLOR;
  delete childEnvironment.NO_COLOR;
  return childEnvironment;
}

/**
 * Formats a command and args for diagnostic output.
 * @param {string} command Executable name or path.
 * @param {string[]} args Command arguments.
 * @returns {string}
 */
export function toShellCommand(command, args) {
  return [command, ...args].map(shellQuote).join(" ");
}

function appendNodeOption(currentValue, option) {
  const existingValue = String(currentValue || "").trim();
  if (existingValue.split(/\s+/).includes(option)) {
    return existingValue;
  }
  return existingValue ? `${existingValue} ${option}` : option;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
