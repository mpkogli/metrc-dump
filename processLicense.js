import puppeteer from 'puppeteer-extra';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { downloadManifests } from './downloadManifests.js';

async function cleanupUserDataDir(dirPath) {
  await fsp.rm(dirPath, { recursive: true, force: true });
}

const downloadReports = async (page, license, downloadDir, report) => {
  console.log(`Downloading ${report.name} for ${license.licenseNumber} from ${report.url}...`);
  const cookies = await page.cookies();
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  try {
    const response = await axios.get(report.url, {
      responseType: 'stream',
      headers: { 'Cookie': cookieString }
    });

    const filePath = path.join(downloadDir, `${report.name}_${license.licenseNumber}.csv`);
    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve).on('error', reject);
    });
  } catch (error) {
    console.error('Error downloading report:', error);
    throw error;
  }
};

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

  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36");
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
  
  const today = new Date();
  const endDate = today.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  });
  const startDate = '01/01/2011';

  const reportsToDownload = selectedReportIdentifiers.map(identifier => {
    const reportUrlTemplates = {
      'Transfers_report': `https://${state}.metrc.com/reports/transfers?id=${license.licenseId}&start=${startDate}&end=${endDate}&format=csv`,
      'LabResults_report': `https://${state}.metrc.com/reports/labresults?id=${license.licenseId}&start=${startDate}&end=${endDate}&format=csv`,
      'PackagesAdjustments_report': `https://${state}.metrc.com/reports/packagesadjustments?facilityId=${license.licenseId}&start=${startDate}&end=${endDate}&format=csv`,
      'SalesTransactions_report': `https://${state}.metrc.com/reports/salestransactions?id=${license.licenseId}&start=${startDate}&end=${endDate}&includeHistory=true&format=csv`,
      'PackagesSales_report': `https://${state}.metrc.com/reports/packagessales?id=${license.licenseId}&start=${startDate}&end=${endDate}&format=csv`,
    };

    let url = reportUrlTemplates[identifier];
    return { name: identifier, url };
  });

  for (const report of reportsToDownload) {
    await downloadReports(page, license, downloadDir, report);
  }

  for (const manifestDirection of selectedManifestDirections) {
    await downloadManifests(page, license, downloadDir, manifestDirection, state);
  }

  await browser.close();
  console.log("Done with browser for license: " + license.licenseNumber);
}

export { processLicense };