# METRC Data Processing Tool

This tool automates the process of downloading reports and manifests from the METRC system for specified licenses. It leverages [Puppeteer](https://github.com/puppeteer/puppeteer) for browser automation, allowing for headless interaction with the METRC website. The tool supports downloading various reports, handling both incoming and outgoing manifests, and can work concurrently on multiple licenses to optimize the data retrieval process.

## A Note for Non-Technical Folks

Hey there! 🌟 If you're navigating the complexities of METRC and feeling a bit overwhelmed, you're not alone. Whether you're trying to make the most of this METRC Dump Tool or you're diving deeper into the broader METRC API for your business needs, I'm here to help. Please reach out to me at [matt@panoble.com](matt@panoble.com) for any METRC consulting needs.


## Disclaimer

The use of this software and how it interacts with the METRC system has not been explicitly reviewed against the METRC Terms of Service (TOS). As such, I cannot provide assurance regarding compliance with METRC's TOS. This tool is provided for your convenience, and you are responsible for its use. I take no responsibility for any consequences that may arise due to the misuse of this software or any violations of the METRC TOS. It is your data to manage as you see fit. If you are managing a large number of licenses, it is advised not to adjust the CONCURRENT_SESSIONS variable to a level that may cause discomfort or potential issues with METRC's system limitations.

## Work in Progress

This is a work in progress, and has only been tested with a limited number of licenses in the State of Colorado. Please feel free to submit issues and pull requests if you find any bugs or have any suggestions.

## Features

- **License Specific**: Supports specifying individual licenses or processing all available licenses.
- **Report Downloads**: Can download a variety of reports for the specified license(s).
- **Manifest Downloads**: Handles both incoming and outgoing manifests. Checks to see if the manifest already exists in the download directory before downloading it again to avoid duplicate downloads and increase the speed of the process.
- **Concurrent Processing**: Supports running multiple browser instances concurrently to speed up the data retrieval process.
- **Customizable Download Directory**: Allows specifying a base directory for storing downloaded files.

## Prerequisites

- [Node.js](https://nodejs.org/en/#home-downloadhead) installed on your system.
- A METRC account with access to the required licenses.

## Setup

1. **Clone the Repository**: First, clone this repository to your local machine.
`` git clone https://github.com/mpkogli/metrc-dump.git``

2. **Install Dependencies**: Navigate to the project directory and run `npm install` to install the required dependencies.

3. **Configure Environment Variables**: Copy/rename the `.env.example` file in the root of the project directory to `.env` and fill in the necessary details as shown in the template below. You may leave any of the values blank and the script will prompt for your selection.

## .env File Template

```plaintext
METRC_STATE=CO # State abbreviation (e.g. CO)
METRC_USERNAME=your_username # Can be left blank here and will be prompted for later
METRC_PASSWORD=your_password # Can be left blank here and will be prompted for later
METRC_EMAIL=your_email # Can be left blank here and will be prompted for later
METRC_LICENSES=403R-98765,402R-87654 ## or 'all' to process all available licenses
DOWNLOAD_REPORTS=Transfers,LabResults ## or 'all' to download all available reports
DOWNLOAD_MANIFESTS=Incoming ## or 'all' to download all available manifests
CONCURRENT_SESSIONS=3 ## defaults to 2, but can be increased to speed up the process
BASE_DOWNLOAD_DIRECTORY="/path/to/download/directory"
```

## Usage

To use this tool, follow these steps after completing the setup:

1. **Run the Script**: Execute the script by running the following command in your terminal:

    ```bash
    node .
    ```

    This command initiates the automated process based on the configurations set in your `.env` file.

2. **Automated Login**: The script will first log into the METRC website using the credentials you provided in the `.env` file.

3. **License Selection**: Based on your `.env` settings, the script will either process all available licenses or the specific ones you've listed.

4. **Downloading Data**: For each selected license, the tool will download the specified reports and manifests. The types of reports and manifest directions (incoming, outgoing, or both) are determined by your `.env` configuration. Reports are downloaded from 1/1/11 to present and overwritten with each run. All manifests checked for existence before downloading.

5. **File Organization**: All reports and manifests will be saved in the base download directory you specified, organized by license number to keep the data well-organized and easily accessible.

## Configuration Details

### Reports and Manifests

You can download the following reports for each license:

- **Transfers Report**
- **Lab Results Report**
- **Packages Adjustments Report**
- **Sales Transactions Report**
- **Packages Sales Report**

Manifests can be downloaded based on the direction specified (`incoming`, `outgoing`, or `all`).

### Environment Variables

Ensure your `.env` file is correctly set up with all necessary configurations:

- `METRC_STATE`: The state abbreviation for your METRC account (i.e. `CO` or `CA`)
- `METRC_USERNAME`, `METRC_PASSWORD`, `METRC_EMAIL`: Your login credentials.
- `METRC_LICENSES`: Specify `all` to process all available licenses or list specific license numbers separated by commas.
- `DOWNLOAD_REPORTS`: Specify `all` to download all available reports, or list comma separated values including `Transfers`, `LabResults`, `PackagesAdjustments`, `SalesTransactions` and `PackagesSales`
- `DOWNLOAD_MANIFESTS`: Specify `all` to download all available reports/manifests or list specific types.
- `CONCURRENT_SESSIONS`: The number of browser instances to run concurrently. Adjust based on your system's capabilities. Don't set too high or risk running into rate limits.
- `BASE_DOWNLOAD_DIRECTORY`: The path to the directory where downloaded files will be stored.

## Advanced Usage

### Concurrent Processing

To optimize the data retrieval process, especially when dealing with multiple licenses, you can increase the number of concurrent sessions. This allows the tool to process multiple licenses simultaneously, significantly reducing the overall runtime.

### Custom Reports

If you need to download reports not listed in the default configuration, you can extend the script's functionality by modifying the `reportsToDownload` mapping within the code. This requires some familiarity with JavaScript and the METRC report URL structure, and pull requests are welcome to add additional reports for your state.

## Contributing

We welcome contributions from the community! If you have suggestions for improvements or new features, feel free to fork the repository, make your changes, and submit a pull request.

## Roadmap

- Date selection for reports and manifests

## License

This project is licensed under the MIT License. For more details, see the LICENSE file included with the code.