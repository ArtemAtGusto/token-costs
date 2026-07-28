import { CrawlResult, ModelPricing, Provider } from '../types.js';
import { updateProviderPrices } from '../utils/storage.js';

/**
 * Base class for all price crawlers
 */
export abstract class BaseCrawler {
  abstract readonly provider: Provider;
  abstract readonly pricingUrl: string;

  /**
   * Crawl prices from the provider's pricing page
   * Subclasses must implement this
   */
  abstract crawlPrices(): Promise<ModelPricing[]>;

  /**
   * Run the crawler and update storage
   */
  async run(): Promise<CrawlResult> {
    const timestamp = new Date().toISOString();
    console.log(`[${this.provider}] Starting price crawl at ${timestamp}`);
    console.log(`[${this.provider}] Pricing URL: ${this.pricingUrl}`);

    try {
      // TODO: Check for /llm_prices.json first, fall back to crawling if not found
      // Once providers start publishing this file, we can skip scraping entirely
      const prices = await this.crawlPrices();
      console.log(`[${this.provider}] Found ${prices.length} models`);

      const changes = await updateProviderPrices(
        this.provider,
        this.pricingUrl,
        prices
      );

      if (changes.length > 0) {
        console.log(`[${this.provider}] Detected ${changes.length} price changes:`);
        for (const change of changes) {
          console.log(`  - ${change.changeType}: ${change.pricing.modelId}`);
          if (change.changeType === 'updated' && change.previousPricing) {
            console.log(
              `    Input: $${change.previousPricing.inputPricePerMillion} -> $${change.pricing.inputPricePerMillion}/1M`
            );
            console.log(
              `    Output: $${change.previousPricing.outputPricePerMillion} -> $${change.pricing.outputPricePerMillion}/1M`
            );
          }
        }
      } else {
        console.log(`[${this.provider}] No price changes detected`);
      }

      return {
        success: true,
        provider: this.provider,
        prices,
        timestamp,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[${this.provider}] Crawl failed: ${errorMessage}`);

      return {
        success: false,
        provider: this.provider,
        prices: [],
        error: errorMessage,
        timestamp,
      };
    }
  }
}

/** Run a crawler when its module is invoked directly from the command line. */
export function runCrawlerFromCli(crawler: BaseCrawler, scriptIdentifier: string): void {
  const scriptPath = process.argv[1];
  if (!scriptPath || !scriptPath.includes(scriptIdentifier)) return;

  crawler.run().then(result => {
    if (!result.success) {
      console.error('Crawl failed:', result.error);
      process.exit(1);
    }
    console.log(`Successfully crawled ${result.prices.length} models`);
  });
}
