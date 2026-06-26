// Runnable check: node --import tsx lib/install-mode.check.ts
import assert from "node:assert";
import { installMode } from "./install-mode";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

assert.equal(installMode(IOS_SAFARI, false), "ios");
assert.equal(installMode(IOS_CHROME, false), "none"); // Chrome on iOS can't install
assert.equal(installMode(ANDROID_CHROME, false), "none"); // handled by event
assert.equal(installMode(DESKTOP_CHROME, false), "none");
assert.equal(installMode(IOS_SAFARI, true), "standalone"); // already installed wins
console.log("install-mode: OK");
