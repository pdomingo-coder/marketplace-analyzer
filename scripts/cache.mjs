import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "ai-cache.json");
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

let mem = null;
let loadedAt = 0;

function load() {
  let mtime = 0;
  try {
    mtime = statSync(PATH).mtimeMs;
  } catch {
    mtime = 0;
  }
  if (mem && mtime && mtime <= loadedAt) return mem;
  try {
    mem = existsSync(PATH) ? JSON.parse(readFileSync(PATH, "utf8")) : {};
  } catch {
    mem = {};
  }
  if (!mem.pain) mem.pain = {};
  if (!mem.reviews) mem.reviews = {};
  if (!mem.growth) mem.growth = {};
  loadedAt = mtime || Date.now();
  return mem;
}

function save() {
  mkdirSync(dirname(PATH), { recursive: true });
  writeFileSync(PATH, JSON.stringify(mem));
  try {
    loadedAt = statSync(PATH).mtimeMs;
  } catch {
    loadedAt = Date.now();
  }
}

export function cacheGet(store, key) {
  const row = load()[store]?.[key];
  if (!row || Date.now() - row.at > TTL_MS) return null;
  return row.value;
}

export function cacheSet(store, key, value) {
  load();
  mem[store][key] = { at: Date.now(), value };
  save();
}
