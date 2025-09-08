var express = require('express');
var axios = require('axios');
var fs = require('fs-extra');
var router = express.Router();
const qs = require('qs');
const { ROOT_FOLDER } = require('../config');
const { getCreationTimeDateString, getCurrentDateString } = require('../ts_datetime.js');
const { 
  ensureDesignerCaseFolderExists,
  getClientCaseFolder,
  getDesignerCaseFolder,
  getDesignerCaseFolderRaw,
  getCasesForDate,
  getExportFilesForCase,
  getAllDesignedLabFiles,
  getBaseFolders
} = require('../ts_folder_structure.js');
const {
  uploadFilesForCase,
} = require('../box_uploader.js');
const { getIO } = require('./my_socket.js');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'ToothSketch Workflow Engine'});
});

router.get('/designers', function (req, res, next) {
  axios.get(
    'http://www.prf.nll.mybluehost.me/wp-json/my-route/designer-queue-case-files/?test_key=0Wbjj49mZtweghh6RZ5YtcShGaIb10JbdNxEtezdZi2eios4w0TDcxPjRC'
  ).then(({data}) => {
    console.log(data);
    let designers = data.case_files.map(f => f.current_allocation);
    // fs.readdirSync(`${ROOT_FOLDER}/`)
    res.render('designer_queue', { title: 'Ready for designing', case_files: data.case_files, designers: ['All designers', ...new Set(designers)] });
  })
});

router.get('/allocation', function (req, res, next) {
  axios.get(
    'http://www.prf.nll.mybluehost.me/wp-json/my-route/allocation-queue-case-files/?test_key=0Wbjj49mZtweghh6RZ5YtcShGaIb10JbdNxEtezdZi2eios4w0TDcxPjRC'
  ).then(({data}) => {
    // console.log(data);
    let case_files = data.case_files.map(f => {
      let unit_desc = {};
      f.unit_desc.split(',').forEach(t => {
        let type = t.split(' - ')[1];
        let toothNumber = t.split(' - ')[0];
        if (!unit_desc.hasOwnProperty(type)) {
          unit_desc[type] = [];
        }
        unit_desc[type].push(toothNumber);
      });
      unit_desc = Object.keys(unit_desc).map(k => k + ': ' + unit_desc[k].join(', ')).join("\n");
      return {
        ...f,
        unit_desc,
      }
    });
    res.render('allocation', { title: 'Allocate Case Files', case_files });
  })
});

router.get('/uploader', function (req, res, next) {
  let dateString = req.query.date_string;
  let clientCases = {};
  if (dateString && dateString.trim().length > 0) {
    clientCases = getCasesForDate(dateString);
    console.log(clientCases);
  } else {
    dateString = getCurrentDateString();
  }
  let baseFolders = getBaseFolders();
  res.render('upload_cases', {dateString: dateString, clientCases: clientCases, baseFolders});
});

router.get('/group-case-files', function (req, res, next) {
  let labToken = req.query.lab;
  let dateString = req.query.date_string;

  let {fileNames, folderNames, filePath} = getAllDesignedLabFiles(dateString, labToken);
  const currentFileAssignments = {};

  fileNames = fileNames
    .filter(f => !f.endsWith('Thumbs.db'))
    .filter(f => !f.includes('DS_Store'));

  console.log(folderNames);
  for (let folder of folderNames) {
    let {data} = getExportFilesForCase(dateString, labToken, folder);
    console.log(JSON.stringify(data, null, 2));
    // assume success, this will fail if someone manually messed up the folder structure
    // data looks like {<group_name>: {TS_DOWNLOAD: [file_name], TS_PREVIEW: [file_name]}}
    for (let group of Object.keys(data.subFolders)) {
      console.log(data.subFolders[group].TS_DOWNLOAD.concat(data.subFolders[group].TS_PREVIEW));
      for (let f of data.subFolders[group].TS_DOWNLOAD.concat(data.subFolders[group].TS_PREVIEW)) {
        for (let file of fileNames) {
          if (
            (file == f.file_name && !group.startsWith('['))
            || (group.startsWith('[') && file.split('] ')[1] == f.file_name)
          ) {
            currentFileAssignments[file] = {caseID: folder, group};
          }
        }
      }
    }
  }

  for (let file of fileNames) {
    if (!currentFileAssignments.hasOwnProperty(file)) {
      currentFileAssignments[file] = {caseID: '', group: ''};
    }
  }

  res.render('group_case_files', {dateString, labToken, folderNames, fileNames, filePath, currentFileAssignments});
});

router.post('/group-case-files', function (req, res, next) {
  let {dateString, caseID, fileGroupingsStr, filePath, labToken} = req.body;
  const fileGroupings = JSON.parse(fileGroupingsStr);
  
  const uploadsFilePath = filePath.replace('EXPORT - External', 'Uploads');
  fs.rmSync(`${uploadsFilePath}`, {recursive: true, force: true});
  fs.mkdirSync(`${uploadsFilePath}`);

  Object.keys(fileGroupings).forEach(caseID => {
    fs.mkdirSync(`${uploadsFilePath}/${caseID}`);

    Object.keys(fileGroupings[caseID]).forEach(groupName => {
      let files = fileGroupings[caseID][groupName];
      fs.mkdirSync(`${uploadsFilePath}/${caseID}/${groupName}`);
      for (let file of files) {
        if (file.startsWith('[')) {
          let versionFolder = file.split('] ')[0] + ']';
          let actualFileName = file.split('] ')[1];
          fs.copyFileSync(
            `${filePath}/${versionFolder}/${actualFileName}`,
            `${uploadsFilePath}/${caseID}/${groupName}/${actualFileName}`
          ); 
        } else {
          fs.copyFileSync(
            `${filePath}/${file}`,
            `${uploadsFilePath}/${caseID}/${groupName}/${file}`
          );
        }
      }
    });
  });


  res.send(`/upload_case?lab=${labToken}&caseID=${caseID}&date_string=${dateString}`);
});

router.get('/upload_case', function (req, res, next) {
  let labToken = req.query.lab;
  let caseID = req.query.caseID;
  let dateString = req.query.date_string;

  let {success, error, data} = getExportFilesForCase(dateString, labToken, caseID);
  console.log({success, error, data});
  if (!success) {
    console.log("Rendering invalid");
    res.render('upload_case_invalid', {error: error})
  } else {
    console.log("Rendering valid");
    let localData = data.subFolders;
    let caseFilePath = data.caseFilePath;
    axios.get(
      `https://www.toothsketch.com/wp-json/my-route/get-box-previews-downloads-metadata/?access_token=kItblpzQTBo0y3q1wH5QdlzKWtl0XQATon4aE4Bv3H7zC4xnyZ3odOoczwQP&case_id=${caseID.split(' ')[0]}`
    ).then(({data}) => {
      console.log(data);
      res.render('upload_case_valid', {localData, remoteData: data.sub_folders, caseID, dateString, caseFilePath})
    })
  }
});

router.post('/upload-case-files', function (req, res, next) {
  const {dateString, caseID, caseFilePath} = req.body;
  const subFolderIds = JSON.parse(req.body.subFolderIds);
  console.log(req.body);
  // return;
  console.log({dateString, caseID, subFolderIds});
  uploadFilesForCase(dateString, caseID, subFolderIds, caseFilePath, () => {
    console.log("Syncing previews and downloads for " + caseID);
    getIO().local.emit('upload_message', {caseID, message: 'Starting sync of previews and downloads'});
    axios.post(
      'https://www.toothsketch.com/wp-json/my-route/sync-box-previews-downloads/',
      qs.stringify({case_id: caseID.split(' ')[0]}),
    ).then(
      (data) => {
        console.log("Synced previews for " + caseID);
        console.log(data);
        getIO().local.emit('upload_message', {caseID, message: 'Completed sync of previews and downloads', action: 'reload'});
      }
    )
    .catch(
      (err) => {
        console.log("Error syncing previews for " + caseID);
        console.log(err);
      }
    );
  });
  res.send(200, {success: true});
});

router.post('/allocate-case-files', function (req, res, next) {
  let caseFiles = req.body.case_files;
  console.log(caseFiles);
  for (let details of caseFiles) {
    allocateCaseToDesigner(
      details.case_id, 
      details.case_file, 
      details.designer, 
      details.creation_time_ms,
      details.case_owner,
    );
  }
  res.send(200, {success: true});
});

// const ROOT_FOLDER = 'Z:/RishabhTest';
function allocateCaseToDesigner(caseId, caseFile, designer, creationTimeMs, caseOwner) {
  console.log(caseId, caseFile, designer, creationTimeMs);
  if (
    caseFile.indexOf('TS Portal case, see all files') >= 0
    || caseFile.indexOf('heck all files for case') >= 0
  ) {
    let caseName = caseId; // + '-' + caseOwner.replace(' ', '_').replace(/\W/g, '');
    ensureDesignerCaseFolderExists(designer, creationTimeMs, caseName);
    console.log(getClientCaseFolder(caseId, creationTimeMs));
    console.log(getDesignerCaseFolderRaw(designer, creationTimeMs, caseName));
    fs.copySync(
      getClientCaseFolder(caseId, creationTimeMs),
      getDesignerCaseFolderRaw(designer, creationTimeMs, caseName),
    );

    fs.copySync(
      getClientCaseFolder(caseId, creationTimeMs) + '/' + 'CaseDetails.pdf',
      getDesignerCaseFolderRaw(designer, creationTimeMs, caseName) + '/' + 'CaseDetails.pdf',
    );
  } else {
    // let caseName = caseId + '-' + caseFile.replace(' ', '_').replace(/\W/g, '');
    // if (/^[A-Z]{2}\s/.test(caseId)) {
    //   let toUnixTimestamp = function (dateStr) {
    //     // Parse the date string and convert it to a Date object
    //     var dateParts = dateStr.split("-");
    //     var day = String(dateParts[0]).padStart(2, "0");
    //     var month = String(dateParts[1]).padStart(2, "0");
    //     var year = dateParts[2];
    //     var date = new Date(`${year}/${month}/${day}`);
      
    //     // Return the Unix timestamp (the number of milliseconds since January 1, 1970)
    //     return date.getTime();
    //   }
      
    //   let extractDate = function (str) {
    //     // Use a regular expression to match a date string of the form "day-month-year"
    //     var dateRegex = /\b\d{1,2}-\d{1,2}-\d{4}\b/;
    //     var match = dateRegex.exec(str);
        
    //     // If a match is found, return the date string. Otherwise, return null.
    //     return match ? match[0] : null;
    //   }
      
    //   creationTimeMs = toUnixTimestamp(extractDate(caseId)) + (14 * 60 * 60 * 1000);
    // }
    
    ensureDesignerCaseFolderExists(designer, creationTimeMs, caseId);
    let filesInFolder = fs.readdirSync(getClientCaseFolder(caseId, creationTimeMs));
    let zipFiles = filesInFolder.filter(f => {
      return f === caseFile + '.zip';
    });
    console.log(zipFiles);
    if (zipFiles.length == 0) {
      console.log("Zip file not found for "+caseId);
      return;
    }

    // console.log(getDesignerCaseFolderRaw(designer, creationTimeMs, caseName) + '/' + zipFiles[0]);
    // console.log(getClientCaseFolder(caseId, creationTimeMs) + '/' + zipFiles[0]);

    fs.copySync(
      getClientCaseFolder(caseId, creationTimeMs) + '/' + zipFiles[0],
      getDesignerCaseFolderRaw(designer, creationTimeMs, caseId) + '/' + zipFiles[0],
    );

    if (fs.existsSync(getClientCaseFolder(caseId, creationTimeMs) + '/' + 'CaseDetails.pdf')) {
      fs.copySync(
        getClientCaseFolder(caseId, creationTimeMs) + '/' + 'CaseDetails.pdf',
        getDesignerCaseFolderRaw(designer, creationTimeMs, caseId) + '/' + 'CaseDetails.pdf',
      );
    }
  }
}

module.exports = router;
