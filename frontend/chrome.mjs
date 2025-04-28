import puppeteer from 'puppeteer';

const N = 100; // сколько экземпляров
const URL = 'http://localhost:5173/';

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
  defaultViewport: { width: 1500, height: 1000 },
});

for (let i = 0; i < N; i++) {
  const page = await browser.newPage();
  await page.goto(URL);
}
console.log(`${N} sessions running at full FPS`);
