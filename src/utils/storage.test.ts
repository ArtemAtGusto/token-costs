import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  archiveProviderSnapshot,
  detectChanges,
  pricesToSnapshot,
  readProviderHistory,
  snapshotToPrices,
  updateProviderPrices,
} from './storage.js';
import type { ModelPricing } from '../types.js';

const historyDate = '2099-01-01';
const historyDirectory = path.join(process.cwd(), 'history', 'openai');

afterEach(async () => {
  await Promise.all([
    fs.rm(path.join(historyDirectory, `${historyDate}.json`), { force: true }),
    fs.rm(path.join(historyDirectory, `${historyDate}-1.json`), { force: true }),
  ]);
});

describe('snapshot storage', () => {
  const originalPrices: ModelPricing[] = [{
    modelId: 'gpt-4',
    modelName: 'GPT-4',
    inputPricePerMillion: 30,
    outputPricePerMillion: 60,
    cachedInputPricePerMillion: 15,
    cacheWritePricePerMillion: 0,
  }];

  it('uses a one-million-token price unit in snapshots', () => {
    const snapshot = pricesToSnapshot(originalPrices, '2026-07-20');

    expect(snapshot).toEqual({
      lastUpdatedAt: '2026-07-20',
      perTokenAmount: 1_000_000,
      models: {
        'gpt-4': { input: 30, output: 60, cached: 15, cacheWrite: 0 },
      },
    });
    expect(snapshotToPrices(snapshot)).toEqual([{ ...originalPrices[0], modelName: 'gpt-4' }]);
  });

  it('detects price updates', () => {
    const changes = detectChanges(originalPrices, [{ ...originalPrices[0], inputPricePerMillion: 25 }], '2026-07-27');

    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe('updated');
    expect(changes[0].previousPricing?.inputPricePerMillion).toBe(30);
  });

  it('archives snapshots by their embedded date and avoids collisions', async () => {
    const snapshot = pricesToSnapshot(originalPrices, historyDate);

    const first = await archiveProviderSnapshot('openai', snapshot);
    const second = await archiveProviderSnapshot('openai', snapshot);

    expect(path.basename(first)).toBe(`${historyDate}.json`);
    expect(path.basename(second)).toBe(`${historyDate}-1.json`);
    await expect(fs.readFile(first, 'utf-8')).resolves.toBe(JSON.stringify(snapshot, null, 2));
  });

  it('archives the current provider file before writing changed prices', async () => {
    const provider = 'google' as const;
    const currentPath = path.join(process.cwd(), 'docs', 'api', 'v1', `${provider}.json`);
    const original = await fs.readFile(currentPath, 'utf-8');
    const snapshot = JSON.parse(original);
    const before = new Set(await fs.readdir(path.join(process.cwd(), 'history', provider)));
    const [modelId, model] = Object.entries(snapshot.models)[0] as [string, { input: number; output: number }];

    try {
      const changes = await updateProviderPrices(provider, 'https://example.com/pricing', [{
        modelId,
        modelName: modelId,
        inputPricePerMillion: model.input + 1,
        outputPricePerMillion: model.output,
      }]);

      expect(changes).toHaveLength(Object.keys(snapshot.models).length);
      expect((await readProviderHistory(provider))?.models[modelId].input).toBe(model.input + 1);

      const after = await fs.readdir(path.join(process.cwd(), 'history', provider));
      const archive = after.find(file => !before.has(file));
      expect(archive).toBeDefined();
      const archived = JSON.parse(await fs.readFile(path.join(process.cwd(), 'history', provider, archive!), 'utf-8'));
      expect(archived).toEqual(snapshot);
    } finally {
      await fs.writeFile(currentPath, original);
      const after = await fs.readdir(path.join(process.cwd(), 'history', provider));
      await Promise.all(after.filter(file => !before.has(file)).map(file => fs.rm(path.join(process.cwd(), 'history', provider, file))));
    }
  });
});
