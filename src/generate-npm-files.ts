/**
 * Validate current provider snapshots.
 * Crawlers write snapshots directly to docs/api/v1 and archive prior versions.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ProviderFile } from './npm/types.js';

const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'api', 'v1');
const PROVIDERS = ['openai', 'anthropic', 'google'] as const;
type Provider = (typeof PROVIDERS)[number];

export function isSupportedProvider(provider: string): provider is Provider {
  return PROVIDERS.includes(provider as Provider);
}

async function loadProviderFile(provider: Provider): Promise<ProviderFile> {
  const content = await fs.readFile(path.join(OUTPUT_DIR, `${provider}.json`), 'utf-8');
  return JSON.parse(content) as ProviderFile;
}

async function generateFiles(targetProvider?: string): Promise<void> {
  const providers = targetProvider ? [targetProvider] : PROVIDERS;

  for (const provider of providers) {
    if (!isSupportedProvider(provider)) {
      throw new Error(`Invalid provider: ${provider}. Valid providers: ${PROVIDERS.join(', ')}`);
    }

    const data = await loadProviderFile(provider);
    console.log(`  ${provider}.json: ${Object.keys(data.models).length} models`);
  }
}

const scriptPath = process.argv[1];
if (scriptPath && scriptPath.includes('generate-npm-files')) {
  generateFiles(process.argv[2]).catch(error => {
    console.error(error);
    process.exit(1);
  });
}
