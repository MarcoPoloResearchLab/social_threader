// @ts-check
import path from "node:path";
import { spawnSync } from "node:child_process";
const INPUT = "SOCIAL_THREADER_ANDROID_KEYSTORE_PROPERTIES";

/** Select a provider-native artifact through the captured manifest boundary.
 * @param {Map<string,string>} options @returns {string}
 */
export function selectAndroidSigningProperties(options) {
 if (options.has("keystore")) throw new AndroidSigningError("--keystore is not supported; specify storeFile in signing properties");
 const applicationRoot=process.env.MPRLAB_APP_ROOT;
 if (applicationRoot || process.env.MPRLAB_LIFECYCLE_OPERATION) {
  const executable=process.env.MPRLAB_GATEWAY_EXECUTABLE;
  if (!applicationRoot || !path.isAbsolute(applicationRoot) || !executable || !path.isAbsolute(executable)) throw new AndroidSigningError("Android signing requires an absolute captured application root and Gateway executable");
  if (options.has("keystore-properties")) throw new AndroidSigningError("Lifecycle Android signing uses only the manifest capture");
  const result=spawnSync(executable,["private-environment-operation"],{input:JSON.stringify({root:applicationRoot,keys:[INPUT]}),env:process.env,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
  if (result.error || result.status!==0) throw new AndroidSigningError("Read captured Android signing selection failed");
  let values;
  try { values=JSON.parse(result.stdout); } catch { throw new AndroidSigningError("Invalid captured Android signing selection"); }
  if (!values || typeof values!=="object" || Array.isArray(values) || Object.keys(values).length!==1 || typeof values[INPUT]!=="string" || !values[INPUT].trim()) throw new AndroidSigningError("Missing captured Android signing selection");
  return path.resolve(applicationRoot,values[INPUT]);
 }
 const selected=options.get("keystore-properties");
 if (!selected) throw new AndroidSigningError("Direct Android builds require --keystore-properties");
 return path.resolve(selected);
}

/** A public signing-input boundary error. */
export class AndroidSigningError extends Error {}
