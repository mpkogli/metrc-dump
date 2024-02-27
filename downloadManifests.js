import puppeteer from 'puppeteer-extra';
import fsp from 'fs/promises';
import path from 'path';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function waitForFileExistence(filePath) {
  while (!await fsp.access(filePath).then(() => true).catch(() => false)) {
    await delay(100);
  }
}

async function downloadManifests(page, license, downloadDir, direction, state) {
  await page.goto(`https://${state}.metrc.com/industry/${license.licenseNumber}/transfers/licensed`);
  await page.waitForNetworkIdle();
  await delay(1000);

  console.log(`Downloading ${direction} manifests for license ${license.licenseNumber}...`);
  const manifestDir = `${downloadDir}/${direction}`;
  await fsp.mkdir(manifestDir, { recursive: true });

  await page.click(`#${direction}Inactive-tab`);
  await delay(1000);
  await page.waitForNetworkIdle();

  await page.evaluate(direction => {
    document.querySelector(`div#${direction}Inactive-grid .k-grid-pager .k-pager-sizes .k-dropdown`).click();
  }, direction);
  await delay(250);
  await page.select(`div#${direction}Inactive-grid .k-grid-pager .k-pager-sizes select`, '500');
  await delay(1000);

  const totalPages = parseInt(await page.$eval(`div#${direction}Inactive-grid .k-grid-pager .k-pager-input`, el => el.textContent.match(/of (\d+)/)[1]));

  let disabled = false;
  while (!disabled) {
    const tableSelector = `div#${direction}Inactive-grid table tbody`;
    const manifests = await page.$$(`${tableSelector} tr`);

    const currentPage = await page.$eval(`div#${direction}Inactive-grid .k-grid-pager .k-current-page`, el => el.textContent);
    console.log(`Page: ${currentPage}/${totalPages} for ${direction} transfers of license ${license.licenseNumber}`);

    for (const manifest of manifests) {
      let manifestNum = await manifest.$eval('td:nth-child(2)', el => el.innerText.trim());

      if (!await fsp.access(`${manifestDir}/${manifestNum}.pdf`).then(() => true).catch(() => false)) {
        await manifest.click();
        await page.click("#viewmanifest-btn");
        await waitForFileExistence(`${downloadDir}/TransferManifest.pdf`);
        await fsp.rename(`${downloadDir}/TransferManifest.pdf`, `${manifestDir}/${manifestNum}.pdf`);
      }
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    disabled = await page.$(`div#${direction}Inactive-grid .k-grid-pager a[title="Go to the next page"].k-state-disabled`) !== null;
    if (!disabled) {
      await page.click(`div#${direction}Inactive-grid .k-grid-pager a[title="Go to the next page"]`);
      await page.waitForNetworkIdle();
      await delay(1500);
    }
    console.log(`Done with page ${currentPage}/${totalPages} for ${direction} transfers of license ${license.licenseNumber}`);
  }
}

export { downloadManifests };