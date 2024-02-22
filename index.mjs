import puppeteer from 'puppeteer-extra';
import UserPreferencesPlugin from 'puppeteer-extra-plugin-user-preferences';
import dotenv from 'dotenv';
import mainProcess from './mainProcess.js';

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

(async () => {
  await mainProcess();
  console.log('All processing finished. Closing browser...');
})();
