#!/usr/bin/env node
/**
 * Simple script to import Codella plugin JS files directly from GitHub
 * and run the DocService loader to upsert them into the DB.
 *
 * Usage: from repository root
 *   node backend/scripts/import_codella_docs.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const REPO_DIR = path.join(process.cwd(), 'codella-documentations-repo');
const PLUGINS_DIR = path.join(REPO_DIR, 'plugins');
const API_URL = 'https://api.github.com/repos/CodellaAI/codella-documentations/contents/plugins';

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Velix-ImportScript' }, ...opts });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  return res.json();
}

async function downloadPlugins() {
  if (!fs.existsSync(REPO_DIR)) fs.mkdirSync(REPO_DIR, { recursive: true });
  if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });

  console.log('Listing plugin files from GitHub...');
  const items = await fetchJson(API_URL);
  if (!Array.isArray(items)) throw new Error('Unexpected GitHub API response');

  const jsItems = items.filter(i => i.name && i.name.endsWith('.js') && i.download_url);
  console.log(`Found ${jsItems.length} plugin files, downloading...`);

  for (const item of jsItems) {
    try {
      const text = await (await fetch(item.download_url)).text();
      const outPath = path.join(PLUGINS_DIR, item.name);
      fs.writeFileSync(outPath, text, 'utf8');
      console.log('Saved', item.name);
    } catch (err) {
      console.warn('Failed to download', item.name, err && err.message);
    }
  }
}

async function runLoader() {
  console.log('Invoking DocService loader...');
  const svc = require('../dist/services/DocService').DocService;
  if (!svc) throw new Error('DocService not found in dist');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '[set]' : '[not set]');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '[set]' : '[not set]');
  // loadPluginsIntoDB is a static method on the class in JS - call it
  if (typeof svc.loadPluginsIntoDB !== 'function') {
    console.warn('DocService.loadPluginsIntoDB not available; calling syncFromGitHub instead');
    const r = await svc.syncFromGitHub();
    console.log('Sync result:', r);
    return r;
  }
  const count = await svc.loadPluginsIntoDB();
  return { success: true, count };
}

(async function main(){
  try {
    await downloadPlugins();
    const res = await runLoader();
    console.log('Import complete:', res);
    process.exit(0);
  } catch (err) {
    console.error('Import failed:', err && err.message);
    process.exit(2);
  }
})();
