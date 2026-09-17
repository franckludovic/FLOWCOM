export default async function run(page) {
  const results = []
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page.getByRole('textbox').nth(0).fill('demo@flowcom.app')
  await page.getByRole('textbox').nth(1).fill('demo1234')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForTimeout(1500)

  for (const route of ['/workspace', '/onboarding', '/calendar', '/content', '/library', '/studio', '/roadmap', '/report']) {
    await page.goto(`http://localhost:4173${route}`, { waitUntil: 'networkidle' })
    results.push({
      route,
      url: page.url(),
      bodyWidth: await page.evaluate(() => document.body.scrollWidth),
      viewportWidth: await page.evaluate(() => window.innerWidth),
      bodyChars: await page.locator('body').innerText().then(text => text.length),
    })
  }
  return results
}
