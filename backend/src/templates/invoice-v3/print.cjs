const { chromium } = require("C:/Users/Wasi Haider/dev/silk-route-logistics/node_modules/@playwright/test");
(async () => {
  const [src, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file:///" + src, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: out, format: "Letter", printBackground: true, preferCSSPageSize: true });
  const pages = await p.evaluate(() => document.querySelectorAll("section.page").length);
  console.log("wrote", out, "sections", pages);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
