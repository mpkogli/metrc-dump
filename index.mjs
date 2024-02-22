import puppeteer from 'puppeteer-extra';
import fs from 'fs';
import fsp from 'fs/promises';
import UserPreferencesPlugin from 'puppeteer-extra-plugin-user-preferences';
import axios from 'axios';
import path from 'path';
import dotenv from 'dotenv';
import inquirer from 'inquirer';

dotenv.config();

puppeteer.use(
  UserPreferencesPlugin({
    userPrefs: {
      download: {
        prompt_for_download: false,
        open_pdf_in_system_reader: false,
      },
      plugins: {
        always_open_pdf_externally: true,
      },
    },
  })
);

async function cleanupUserDataDir(dirPath) {
  await fsp.rm(dirPath, { recursive: true, force: true });
}

async function waitForFileExistence(filePath) {
  while (!await fsp.access(filePath).then(() => true).catch(() => false)) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
const delay = ms => new Promise(r => setTimeout(r, ms));

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

async function getCredentials() {  const requiredCredentials = ['METRC_USERNAME', 'METRC_PASSWORD', 'METRC_EMAIL'];
  const missingCredentials = requiredCredentials.filter(c => !process.env[c]);

  if (missingCredentials.length > 0) {
    const questions = missingCredentials.map(c => ({
      type: c == 'METRC_PASSWORD' ? 'password': 'input',
      name: c,
      message: `Please enter your ${c}:`,
      mask: c == 'METRC_PASSWORD' ? '*': undefined,
    }));

    const answers = await inquirer.prompt(questions);
    process.env = { ...process.env, ...answers };
  }

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

async function metrcLoginAndSaveCookies(state) {
  console.log('Logging into METRC');
  const browser = await puppeteer.launch({
    args: ['--window-size=1920,1080'],
    "headless": 'new'
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36");
  await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });
  await page.goto(`https://${state}.metrc.com`);
  await page.waitForSelector("#username");
  await page.type("#username", process.env.METRC_USERNAME);
  await page.type("#password", process.env.METRC_PASSWORD);
  await page.type("#email", process.env.METRC_EMAIL);
  await page.click("#login_button");
  await page.waitForNetworkIdle();

  const cookies = await page.cookies();

  console.log('Getting available licenses...');
  await page.click(`.facilities-dropdown a.dropdown-toggle`);

  await page.waitForSelector('.facilities-dropdown.open .dropdown-menu.pull-right');

  const licenses = await page.$$eval('div.facilities-dropdown.open ul.dropdown-menu.pull-right li', listItems => 
    listItems.map(item => {
      const parts = item.innerText.split('\n');
      const licenseName = parts[0];
      const licenseNumber = parts[1];
      const anchor = item.querySelector('a');
      const href = anchor ? anchor.href : '';
      const licenseIdMatch = href.match(/\d+$/);
      const licenseId = licenseIdMatch ? licenseIdMatch[0] : ''; // If a match is found, use it; otherwise, return an empty string
      return {
        licenseNumber,
        licenseName,
        licenseId
      };
    })
  );

  await browser.close();
  return { cookies, licenses }; // Return both cookies and licenses
}

(async () => {
  let state = process.env.METRC_STATE?.toLowerCase();
  if (!state) {
    const input = await inquirer.prompt([
      {
        type: 'input',
        name: 'state',
        message: 'Enter your state\'s two character abbreviation (e.g., co, mo, ks):',
        validate: function(value) {
          if (value.match(/^[a-z]{2}$/i)) {
            return true;
          }
          return 'Please enter a valid two character state abbreviation.';
        },
      }
    ]);
    state = input.state.toLowerCase();
  }

  await getCredentials();
  const { cookies: metrcCookies, licenses } = await metrcLoginAndSaveCookies(state);

  if (process.env.METRC_LICENSES && process.env.METRC_LICENSES.toLowerCase() === 'all') {
    console.log('Using all available licenses.');
  } else if (process.env.METRC_LICENSES) {
    const envLicensesArray = process.env.METRC_LICENSES.split(',').map(license => license.trim());
    licenses = licenses.filter(license => envLicensesArray.includes(license.licenseNumber));
    
    if (licenses.length === 0) {
      console.log('None of the specified METRC_LICENSES match the available licenses. Please check the license numbers.');
      return;
    }
  } else {
    const choices = licenses.map(license => ({
      name: `${license.licenseName} [${license.licenseNumber}]`,
      value: license,
      short: license.licenseNumber
    }));
    const defaultChoices = choices.map(choice => choice.value);

    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        message: 'Select licenses to process',
        name: 'selectedLicenses',
        choices: choices,
        default: defaultChoices,
        validate: function(answer) {
          if (answer.length < 1) {
            return 'You must choose at least one license.';
          }
          return true;
        },
      }
    ]);

    licenses = answers.selectedLicenses;
  }


  let selectedReportIdentifiers = [];
  const availableReports = [
    { name: 'Transfers Report', identifier: 'Transfers_report' },
    { name: 'Lab Results Report', identifier: 'LabResults_report' },
    { name: 'Packages Adjustments Report', identifier: 'PackagesAdjustments_report' },
    { name: 'Sales Transactions Report', identifier: 'SalesTransactions_report' },
    { name: 'Packages Sales Report', identifier: 'PackagesSales_report' },
  ];

  if (process.env.DOWNLOAD_REPORTS?.toLowerCase() === 'all') {
    console.log('Downloading all available reports.');
    selectedReportIdentifiers = availableReports.map(report => report.identifier);
  } else if (process.env.DOWNLOAD_REPORTS) {
    const predefinedReports = process.env.DOWNLOAD_REPORTS.split(',');
    const predefinedReportIdentifiers = predefinedReports.map(reportName => {
      switch (reportName.trim()) {
        case 'Transfers':
          return 'Transfers_report';
        case 'LabResults':
          return 'LabResults_report';
        case 'PackagesAdjustments':
          return 'PackagesAdjustments_report';
        case 'SalesTransactions':
          return 'SalesTransactions_report';
        case 'PackagesSales':
          return 'PackagesSales_report';
        default:
          return null;
      }
    }).filter(identifier => identifier !== null);
    

    if (predefinedReportIdentifiers.length > 0) {
      console.log(`Using predefined reports: ${predefinedReports.join(', ')}`);
      selectedReportIdentifiers = predefinedReportIdentifiers;
    } else {
      const reportAnswers = await inquirer.prompt([
        {
          type: 'checkbox',
          message: 'Select reports to download',
          name: 'selectedReports',
          choices: availableReports.map(report => ({ name: report.name, value: report.identifier })),
          validate: function(answer) {
            if (answer.length < 1) {
              return 'You must choose at least one report.';
            }
            return true;
          },
        }
      ]);
      
      selectedReportIdentifiers = reportAnswers.selectedReports;
    }
  }

  let selectedManifestDirections = [];
  if (process.env.DOWNLOAD_MANIFESTS?.toLowerCase() === 'false') {
    selectedManifestDirections = [];
  } else if (process.env.DOWNLOAD_MANIFESTS?.toLowerCase() === 'all') {
    selectedManifestDirections = ['incoming', 'outgoing'];
  } else if (process.env.DOWNLOAD_MANIFESTS) {
    selectedManifestDirections = process.env.DOWNLOAD_MANIFESTS.split(',').map(direction => direction.trim().toLowerCase());
    selectedManifestDirections = selectedManifestDirections.filter(direction => ['incoming', 'outgoing'].includes(direction));
  } else {
    const manifestDirectionAnswer = await inquirer.prompt([
      {
        type: 'checkbox',
        message: 'Select manifest direction(s) to download',
        name: 'selectedManifestDirections',
        choices: [
          { name: 'Incoming', value: 'incoming' },
          { name: 'Outgoing', value: 'outgoing' }
        ],
      }
    ]);
    selectedManifestDirections = manifestDirectionAnswer.selectedManifestDirections;
  }

  const concurrentSessions = Math.max(Number(process.env.CONCURRENT_SESSIONS) || 2, 2);
  const processPromises = [];
  const executingPromises = new Set();

  for (const license of licenses) {
    while (executingPromises.size >= concurrentSessions) {
      await Promise.race(executingPromises);
    }

    const processPromise = processLicense(license, selectedReportIdentifiers, selectedManifestDirections, state, metrcCookies).then(result => {
      executingPromises.delete(processPromise);
      return result;
    });

    processPromises.push(processPromise);
    executingPromises.add(processPromise);
  }

  await Promise.all(processPromises);
  console.log('All processing finished. Closing browser...');
})();
