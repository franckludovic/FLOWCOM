export default async function run(page) {
  const results = []
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
    results.push({
      width,
      bodyWidth: await page.evaluate(() => document.body.scrollWidth),
      viewportWidth: await page.evaluate(() => window.innerWidth),
      title: await page.title(),
      bodyChars: await page.locator('body').innerText().then(text => text.length),
    })
  }
  return results
}
