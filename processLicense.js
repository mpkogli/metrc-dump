import puppeteer from 'puppeteer-extra';
import fsp from 'fs/promises';
import path from 'path';
import { downloadManifests } from './downloadManifests.js';
import { downloadReports } from './downloadReports.js';
import UserAgents from 'user-agents';

async function cleanupUserDataDir(dirPath) {
  await fsp.rm(dirPath, { recursive: true, force: true });
}

async function processLicense(license, selectedReportIdentifiers, selectedManifestDirections, state, metrcCookies) {
  const baseDownloadDir = process.env.BASE_DOWNLOAD_DIRECTORY ? path.resolve(process.env.BASE_DOWNLOAD_DIRECTORY) : path.resolve('./METRC Data Dump');

  await fsp.mkdir(baseDownloadDir, { recursive: true });

  console.log(`Processing license: ${license.licenseNumber}`);

  const userDataDir = `/tmp/tmp_chrome_profile_${license.licenseNumber}`;
  await cleanupUserDataDir(userDataDir);

  const browser = await puppeteer.launch({
    args: ['--window-size=1920,1080'],
    headless: 'new',
    userDataDir: userDataDir,
  });

  const page = await browser.newPage();
  const session = await page.target().createCDPSession();

  const downloadDir = `${baseDownloadDir}/${license.licenseNumber}`;
  await fsp.mkdir(downloadDir, { recursive: true });

  const userAgent = new UserAgents({ deviceCategory: 'desktop' });
  await page.setUserAgent(userAgent.toString());
  await session.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  });

  await page.setCookie(...metrcCookies);

  await page.setViewport({
    width: 1920,
    height: 900,
    deviceScaleFactor: 1,
  });
  await page.goto(`https://${state}.metrc.com`);
  
  await downloadReports(page, license, downloadDir, selectedReportIdentifiers, state);

  for (const manifestDirection of selectedManifestDirections) {
    await downloadManifests(page, license, downloadDir, manifestDirection, state);
  }

  await browser.close();
  console.log("Done with browser for license: " + license.licenseNumber);
}

export { processLicense };