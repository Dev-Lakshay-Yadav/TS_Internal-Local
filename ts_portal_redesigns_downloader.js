const fs = require("fs");
// const unzipper = require('unzipper');
const axios = require("axios");
const qs = require("qs");
const xml_to_json = require("xml-js");
const {
  getCurrentDateString,
  getCurrentTimeString,
} = require("./ts_datetime.js");
const {
  INCOMING_CASES_QUERY,
  CONSTANTS_POST_ENDPOINT,
  CONSTANTS_GET_ENDPOINT,
  INCOMING_REDESIGNS_QUERY,
  UPDATE_REDESIGN_STATUS_ENDPOINT,
} = require("./ts_constants.js");
const {
  ensureLabFolderExists,
  ensureCaseFolderExists,
  getFilePath,
  checkFileExists,
  ensureRedesignFolderExists,
  getRedesignFolderPath,
} = require("./ts_folder_structure.js");
const { generatePDF } = require("./ts_pdf_maker.js");
const {
  generateCasePDF,
  generateCommentsPDF,
} = require("./ts_case_details_pdf.js");
const { getClient } = require("./box_connectors/box_client.js");
const path = require("path");

function processRedesigns() {
  console.log("Starting to process redesigns");
  axios({
    method: "get",
    url: INCOMING_REDESIGNS_QUERY,
  }).then(async (response) => {
    // console.log(['redesigns response', response.data]);
    getClient(async (client) => {
      for (let caseDetails of response.data.cases) {
        // console.log(['processing redownload', caseDetails]);
        const priority = caseDetails["priority"].toUpperCase();
        caseDetails["casePriority"] = priority.toUpperCase();
        let creationTimeMs = caseDetails["creation_time_ms"];
        const rdCaseId = `RD-${caseDetails["redesign_attempt"]}-${caseDetails["case_id"]}-${priority}`;
        ensureRedesignFolderExists(rdCaseId, creationTimeMs);
        const boxFolderId = caseDetails["box_folder_id"];
        await processFolder(
          client,
          boxFolderId,
          getRedesignFolderPath(rdCaseId)
        );
        const detailsJson = JSON.parse(caseDetails.details_json);
        detailsJson["casePriority"] = `[REDESIGN PRIORITY] ${priority}`;
        try {
          generateCasePDF(
            caseDetails["case_id"],
            detailsJson,
            path.join(getRedesignFolderPath(rdCaseId), "CaseDetails.pdf")
          );
        } catch (e) {
          console.log("Failed to generate CaseDetails.pdf for " + rdCaseId);
        }
        try {
          generateCommentsPDF(
            caseDetails["case_id"],
            JSON.parse(JSON.parse(caseDetails.case_activities)),
            priority,
            path.join(getRedesignFolderPath(rdCaseId), "Comments.pdf")
          );
        } catch (e) {
          console.log(e);
          console.log("Failed to generate Comments.pdf for " + rdCaseId);
        }
        console.log(
          `Completed redesign processing for ${caseDetails["case_id"]}`
        );
        const response = axios
          .post(
            UPDATE_REDESIGN_STATUS_ENDPOINT,
            {
              case_id: caseDetails["case_id"].split(" -- ")[0],
              status: "downloaded",
            },
            { headers: { "Content-Type": "application/json" } }
          )
          .then((response) => {
            console.log(response.data);
            console.log(`Updated status for ${caseDetails["case_id"]}`);
          });
      }
    });
  });
}

async function processFolder(client, folderId, downloadPath) {
  // Ensure the folder exists locally
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  // Get items in the folder
  const items = await client.folders.getItems(folderId, {
    fields: "id,type,name",
  });

  for (const item of items.entries) {
    if (item.type === "file") {
      // Download the file
      console.log(`Downloading file: ${item.name}`);
      await downloadFile(client, item.id, item.name, downloadPath);
    } else if (item.type === "folder") {
      // Recursively process the subfolder
      console.log(`Entering folder: ${item.name}`);
      await processFolder(client, item.id, path.join(downloadPath, item.name));
    }
  }
}

async function downloadFile(client, fileId, fileName, downloadPath) {
  const stream = await client.files.getReadStream(fileId);
  const filePath = path.join(downloadPath, fileName);
  const writeStream = fs.createWriteStream(filePath);
  stream.pipe(writeStream);

  return new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
}

// processRedesigns();
module.exports = {
  processRedesigns,
};
