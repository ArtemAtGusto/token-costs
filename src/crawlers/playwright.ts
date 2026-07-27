import { chromium, type Page } from 'playwright';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type NavigationOptions = NonNullable<Parameters<Page['goto']>[1]>;

/** Run page-specific pricing extraction with the shared browser setup and teardown. */
export async function withPricingPage<T>(
  pricingUrl: string,
  navigationOptions: NavigationOptions,
  extract: (page: Page) => Promise<T>
): Promise<T> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    await page.goto(pricingUrl, navigationOptions);
    return await extract(page);
  } finally {
    await browser.close();
  }
}
