import * as fs from 'fs/promises';
import * as path from 'path';
import { ModelPricing, PriceChange, Provider } from '../types.js';
import type { ProviderFile, SnapshotModelPricing } from '../types.js';

const PRICES_DIR = path.join(process.cwd(), 'prices');
const HISTORY_DIR = path.join(PRICES_DIR, 'history');
const PER_TOKEN_AMOUNT = 1_000_000;
const PACIFIC_TIME_ZONE = 'America/Los_Angeles';

/** Format a calendar date in the project's Pacific time zone. */
export function getPacificDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(item => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

function getProviderFilePath(provider: Provider): string {
  return path.join(PRICES_DIR, `${provider}.json`);
}

function getProviderHistoryDir(provider: Provider): string {
  return path.join(HISTORY_DIR, provider);
}

/** Ensure provider history directories exist. */
export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(PRICES_DIR, { recursive: true });
  await Promise.all(
    (['openai', 'anthropic', 'google'] as Provider[]).map(provider =>
      fs.mkdir(getProviderHistoryDir(provider), { recursive: true })
    )
  );
}

/** Read a provider's current API snapshot. */
export async function readProviderHistory(provider: Provider): Promise<ProviderFile | null> {
  try {
    return JSON.parse(await fs.readFile(getProviderFilePath(provider), 'utf-8')) as ProviderFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Write a provider's current API snapshot. */
export async function writeProviderHistory(provider: Provider, snapshot: ProviderFile): Promise<void> {
  await ensureDataDirs();
  await fs.writeFile(getProviderFilePath(provider), JSON.stringify(snapshot, null, 2));
}

/** Convert public snapshot pricing to crawler pricing. */
export function snapshotToPrices(snapshot: ProviderFile): ModelPricing[] {
  return Object.entries(snapshot.models).map(([modelId, pricing]) => ({
    modelId,
    modelName: modelId,
    inputPricePerMillion: pricing.input ?? 0,
    outputPricePerMillion: pricing.output ?? 0,
    ...(pricing.cached !== undefined && { cachedInputPricePerMillion: pricing.cached }),
    ...(pricing.cacheWrite !== undefined && { cacheWritePricePerMillion: pricing.cacheWrite }),
    ...(pricing.context !== undefined && { contextWindow: pricing.context }),
    ...(pricing.maxOutput !== undefined && { maxOutputTokens: pricing.maxOutput }),
  }));
}

/** Convert crawler pricing to the public snapshot format. */
export function pricesToSnapshot(prices: ModelPricing[], lastUpdatedAt: string): ProviderFile {
  const models: Record<string, SnapshotModelPricing> = {};

  for (const price of [...prices].sort((a, b) => a.modelId.localeCompare(b.modelId))) {
    models[price.modelId] = {
      input: price.inputPricePerMillion,
      output: price.outputPricePerMillion,
      ...(price.cachedInputPricePerMillion !== undefined && { cached: price.cachedInputPricePerMillion }),
      ...(price.cacheWritePricePerMillion !== undefined && { cacheWrite: price.cacheWritePricePerMillion }),
      ...(price.contextWindow !== undefined && { context: price.contextWindow }),
      ...(price.maxOutputTokens !== undefined && { maxOutput: price.maxOutputTokens }),
    };
  }

  return { lastUpdatedAt, perTokenAmount: PER_TOKEN_AMOUNT, models };
}

/** Copy a snapshot into history using its embedded update date. */
export async function archiveProviderSnapshot(provider: Provider, snapshot: ProviderFile): Promise<string> {
  const historyDir = getProviderHistoryDir(provider);
  await fs.mkdir(historyDir, { recursive: true });

  const date = snapshot.lastUpdatedAt;
  let suffix = 0;
  let filePath: string;
  do {
    const filename = suffix === 0 ? `${date}.json` : `${date}-${suffix}.json`;
    filePath = path.join(historyDir, filename);
    suffix += 1;
    try {
      await fs.access(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  } while (true);

  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
  return filePath;
}

function arePricingsEqual(a: ModelPricing, b: ModelPricing): boolean {
  return a.modelId === b.modelId
    && a.inputPricePerMillion === b.inputPricePerMillion
    && a.outputPricePerMillion === b.outputPricePerMillion
    && a.cachedInputPricePerMillion === b.cachedInputPricePerMillion
    && a.cacheWritePricePerMillion === b.cacheWritePricePerMillion
    && a.contextWindow === b.contextWindow
    && a.maxOutputTokens === b.maxOutputTokens;
}

/** Detect additions, removals, and price changes between snapshots. */
export function detectChanges(currentPrices: ModelPricing[], newPrices: ModelPricing[], date: string): PriceChange[] {
  const changes: PriceChange[] = [];
  const currentMap = new Map(currentPrices.map(price => [price.modelId, price]));
  const newMap = new Map(newPrices.map(price => [price.modelId, price]));

  for (const [modelId, newPricing] of newMap) {
    const currentPricing = currentMap.get(modelId);
    if (!currentPricing) {
      changes.push({ date, changeType: 'added', pricing: newPricing });
    } else if (!arePricingsEqual(currentPricing, newPricing)) {
      changes.push({ date, changeType: 'updated', pricing: newPricing, previousPricing: currentPricing });
    }
  }

  for (const [modelId, currentPricing] of currentMap) {
    if (!newMap.has(modelId)) changes.push({ date, changeType: 'removed', pricing: currentPricing });
  }

  return changes;
}

/**
 * Update the current snapshot. When data changes, archive the exact prior file first.
 */
export async function updateProviderPrices(
  provider: Provider,
  _pricingUrl: string,
  newPrices: ModelPricing[]
): Promise<PriceChange[]> {
  const today = getPacificDate();
  const current = await readProviderHistory(provider);

  if (!current) {
    await writeProviderHistory(provider, pricesToSnapshot(newPrices, today));
    return newPrices.map(pricing => ({ date: today, changeType: 'added' as const, pricing }));
  }

  const changes = detectChanges(snapshotToPrices(current), newPrices, today);
  if (changes.length === 0) return changes;

  await archiveProviderSnapshot(provider, current);
  await writeProviderHistory(provider, pricesToSnapshot(newPrices, today));
  return changes;
}
