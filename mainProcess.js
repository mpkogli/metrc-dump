import inquirer from 'inquirer';
import { processLicense } from './processLicense.js';
import { metrcLoginAndSaveCookies } from './metrcAuth.js';
import dotenv from 'dotenv';

dotenv.config();

async function mainProcess() {
  let state = process.env.METRC_STATE?.toLowerCase() || await getState();

  await getCredentials();
  let { cookies: metrcCookies, licenses } = await metrcLoginAndSaveCookies(state);

  licenses = await handleLicenseSelection(licenses);
  const selectedReportIdentifiers = await getSelectedReportIdentifiers();
  const selectedManifestDirections = await getSelectedManifestDirections();

  await processSelectedItems(licenses, selectedReportIdentifiers, selectedManifestDirections, state, metrcCookies);
}

async function getState() {
  const input = await inquirer.prompt([{
    type: 'input',
    name: 'state',
    message: 'Enter your state\'s two character abbreviation (e.g., co, mo, ks):',
    validate: value => value.match(/^[a-z]{2}$/i) ? true : 'Please enter a valid two character state abbreviation.',
  }]);
  return input.state.toLowerCase();
}

async function getCredentials() {
  const requiredCredentials = ['METRC_USERNAME', 'METRC_PASSWORD', 'METRC_EMAIL'];
  const missingCredentials = requiredCredentials.filter(c => !process.env[c]);

  if (missingCredentials.length > 0) {
    const questions = missingCredentials.map(c => ({
      type: c === 'METRC_PASSWORD' ? 'password' : 'input',
      name: c,
      message: `Please enter your ${c}:`,
      mask: '*',
    }));

    const answers = await inquirer.prompt(questions);
    process.env = { ...process.env, ...answers };
  }
}

async function handleLicenseSelection(licenses) {
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
  return licenses;
}

async function getSelectedReportIdentifiers() {
  let selectedReportIdentifiers = [];
  const availableReports = [
    { name: 'Transfers Report', identifier: 'Transfers_report' },
    { name: 'Lab Results Report', identifier: 'LabResults_report' },
    { name: 'Packages Adjustments Report', identifier: 'PackagesAdjustments_report' },
    { name: 'Sales Transactions Report', identifier: 'SalesTransactions_report' },
    { name: 'Packages Sales Report', identifier: 'PackagesSales_report' },
    { name: 'Harvests Report', identifier: 'Harvests_report' },
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
        case 'Harvests':
          return 'Harvests_report';
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
  return selectedReportIdentifiers;
}

async function getSelectedManifestDirections() {
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
  return selectedManifestDirections;
}

async function processSelectedItems(licenses, selectedReportIdentifiers, selectedManifestDirections, state, metrcCookies) {
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
}

export default mainProcess;
