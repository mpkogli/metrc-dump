import fs from 'fs';
import axios from 'axios';
import path from 'path';


async function downloadReports(page, license, downloadDir, selectedReportIdentifiers, state) {
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
      'Harvests_report': `https://${state}.metrc.com/reports/harvests?id=${license.licenseId}&start=${startDate}&end=${endDate}&format=csv`,
      'PlantsTrend_report': `https://${state}.metrc.com/reports/plantstrend?id=${license.licenseId}&start=${startDate}&end=${endDate}&format=csv`,
    };

    let url = reportUrlTemplates[identifier];
    return { name: identifier, url };
  });

  for (const report of reportsToDownload) {
    await downloadReport(page, license, downloadDir, report);
  }
}

async function downloadReport(page, license, downloadDir, report) {
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

export { downloadReports };