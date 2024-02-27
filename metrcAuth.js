import puppeteer from 'puppeteer-extra';
import dotenv from 'dotenv';
import UserPreferencesPlugin from 'puppeteer-extra-plugin-user-preferences';
import UserAgents from 'user-agents';

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

async function metrcLoginAndSaveCookies(state) {
  console.log('Logging into METRC');
  const browser = await puppeteer.launch({
    args: ['--window-size=1920,1080'],
    "headless": 'new'
  });

  const page = await browser.newPage();
  const userAgent = new UserAgents({ deviceCategory: 'desktop' });
  await page.setUserAgent(userAgent.toString());
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

export { metrcLoginAndSaveCookies };
