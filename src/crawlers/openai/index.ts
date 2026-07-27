import { BaseCrawler, runCrawlerFromCli } from '../base.js';
import { ModelPricing, Provider } from '../../types.js';
import { withPricingPage } from '../playwright.js';

/**
 * OpenAI price crawler
 * Uses Playwright to scrape prices from OpenAI's developer pricing page
 */
export class OpenAICrawler extends BaseCrawler {
  readonly provider: Provider = 'openai';
  readonly pricingUrl = 'https://developers.openai.com/api/docs/pricing';

  async crawlPrices(): Promise<ModelPricing[]> {
    return withPricingPage(
      this.pricingUrl,
      {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      },
      async page => {

      // Wait for the pricing table to load (may need extra time due to JS)
      // Use waitForFunction to wait for table to exist in DOM (not just visible)
      await page.waitForFunction(() => document.querySelectorAll('table').length > 0, { timeout: 30000 });
      // Extra wait for JS to finish rendering
      await page.waitForTimeout(2000);

      // Older text models are hidden behind the first "All models" control, which
      // belongs to the text-pricing section before Multimodal models.
      const allModelsButton = page.getByRole('button', { name: 'All models', exact: true }).first();
      await allModelsButton.click();
      await page.waitForTimeout(500);

      // Extract every text-model table before the Multimodal models section. The
      // expanded All models table contains legacy models such as GPT-5.2 and GPT-4.1.
      const models = await page.evaluate(() => {
        const results: {
          modelId: string;
          modelName: string;
          input: number;
          output: number;
          cached?: number;
          cacheWrite: number;
        }[] = [];

        // Helper to parse price string like "$1.75" or "$0.175" to number
        const parsePrice = (str: string): number => {
          const match = str.match(/\$([0-9.]+)/);
          return match ? parseFloat(match[1]) : NaN;
        };

        // Find all tables and look for one with the right header structure
        const tables = Array.from(document.querySelectorAll('table'));
        const multimodalHeading = Array.from(document.querySelectorAll('h2')).find(heading =>
          heading.textContent?.toLowerCase().includes('multimodal models')
        );

        for (const table of tables) {
          if (
            multimodalHeading &&
            !(table.compareDocumentPosition(multimodalHeading) & Node.DOCUMENT_POSITION_FOLLOWING)
          ) {
            break;
          }

          // Some pricing tables have a grouped first header row (for example,
          // short- and long-context prices). Select the row with real columns.
          const headerRow = Array.from(table.querySelectorAll('thead tr, tr')).find(row =>
            Array.from(row.querySelectorAll('th, td')).some(cell =>
              cell.textContent?.toLowerCase().trim() === 'model'
            )
          );
          if (!headerRow) continue;

          const headers = Array.from(headerRow.querySelectorAll('th, td'))
            .map(h => h.textContent?.toLowerCase().trim() || '');

          // Look for text token table: Model | Input | Cached input | Output
          const hasModel = headers.some(h => h.includes('model'));
          const hasInput = headers.some(h => h === 'input');
          const cachedIndex = headers.findIndex(h => h.includes('cached'));
          const cacheWriteIndex = headers.findIndex(h => h === 'cache writes');
          const outputIndex = headers.findIndex(h => h === 'output');
          const hasCached = cachedIndex !== -1;
          const hasOutput = outputIndex !== -1;

          if (!hasModel || !hasInput || !hasOutput) continue;

          // Parse all rows from this table
          const rows = Array.from(table.querySelectorAll('tbody tr'));
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) continue;

            const modelName = cells[0].textContent?.trim() || '';
            const inputStr = cells[1].textContent?.trim() || '';
            // Use header positions rather than assuming adjacent columns. The current
            // page includes a cache-writes column between cached input and output.
            const cachedStr = hasCached ? cells[cachedIndex]?.textContent?.trim() || '' : '';
            const cacheWriteStr = cacheWriteIndex !== -1 ? cells[cacheWriteIndex]?.textContent?.trim() || '' : '';
            const outputStr = cells[outputIndex]?.textContent?.trim() || '';

            const inputPrice = parsePrice(inputStr);
            const outputPrice = parsePrice(outputStr);
            const cachedPrice = cachedStr === '-' || !cachedStr ? undefined : parsePrice(cachedStr);
            const cacheWritePrice = cacheWriteStr === '-' || !cacheWriteStr ? 0 : parsePrice(cacheWriteStr);

            if (!isNaN(inputPrice) && !isNaN(outputPrice) && modelName) {
              results.push({
                modelId: modelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-\.]/g, ''),
                modelName: modelName,
                input: inputPrice,
                output: outputPrice,
                cached: cachedPrice,
                cacheWrite: cacheWritePrice,
              });
            }
          }
        }

        return results;
      });

      // Combine and convert to ModelPricing format
      const allModels: ModelPricing[] = [];
      const seenIds = new Set<string>();

      for (const m of models) {
        if (!seenIds.has(m.modelId) && this.isTextModel(m.modelName)) {
          seenIds.add(m.modelId);
          allModels.push({
            modelId: m.modelId,
            modelName: m.modelName,
            inputPricePerMillion: m.input,
            outputPricePerMillion: m.output,
            cachedInputPricePerMillion: m.cached,
            cacheWritePricePerMillion: m.cacheWrite,
          });
        }
      }

      console.log(`[openai] Found ${allModels.length} text models`);

      if (allModels.length === 0) {
        throw new Error('[openai] Could not parse any pricing from page');
      }

      if (allModels.length < 5) {
        throw new Error(`[openai] Only found ${allModels.length} models, expected at least 5`);
      }

        return allModels;
      }
    );
  }

  private isTextModel(name: string): boolean {
    const n = name.toLowerCase();
    // Exclude non-text models
    const isExcluded = [
      'audio',
      'tts',
      'transcribe',
      'realtime',
      'image',
      'dall',
      'whisper',
      'embedding',
      'sora',
    ].some(x => n.includes(x));
    return !isExcluded;
  }
}

runCrawlerFromCli(new OpenAICrawler(), 'openai');
