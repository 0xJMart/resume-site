// Post-build renders against a running `astro preview`: resume.pdf, the no-WebGL poster and the OG image.
// Usage: node scripts/render.mjs [baseUrl]   (default http://localhost:4321)
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:4321';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const pdf = await browser.newPage();
await pdf.goto(`${base}/resume`, { waitUntil: 'networkidle' });
await pdf.pdf({ path: 'dist/resume.pdf', format: 'Letter', printBackground: true, margin: { top: '0.5in', bottom: '0.5in', left: '0.55in', right: '0.55in' } });

// Mock data so the poster shows a healthy rack, not the offline face
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(`${base}/?mock`, { waitUntil: 'networkidle' });
await page.locator('.stage canvas').waitFor();
await page.waitForTimeout(3500);
await page.addStyleTag({ content: '.readout { display: none !important; }' });
await page.locator('.stage').screenshot({ path: 'dist/rack-poster.png' });

// OG card: the hero as it first appears (name beside the rack)
await page.setViewportSize({ width: 1200, height: 630 });
await page.addStyleTag({ content: '.readout { display: none !important; }' });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'dist/og.png' });

await browser.close();
console.log('rendered dist/resume.pdf, dist/rack-poster.png, dist/og.png');
