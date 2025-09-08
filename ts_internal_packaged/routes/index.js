var express = require('express');
var axios = require('axios');
var fs = require('fs-extra');
var router = express.Router();
const { ROOT_FOLDER } = require('../config');
const { getCreationTimeDateString } = require('../ts_datetime.js');
const { 
  ensureDesignerCaseFolderExists,
  getClientCaseFolder,
  getDesignerCaseFolder,
  getDesignerCaseFolderRaw
} = require('../ts_folder_structure.js');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'ToothSketch Workflow Engine'});
});

router.get('/designers', function (req, res, next) {
  axios.get(
    'http://www.prf.nll.mybluehost.me/wp-json/my-route/designer-queue-case-files?test_key=0Wbjj49mZtweghh6RZ5YtcShGaIb10JbdNxEtezdZi2eios4w0TDcxPjRC'
  ).then(({data}) => {
    console.log(data);
    let designers = data.case_files.map(f => f.current_allocation);
    // fs.readdirSync(`${ROOT_FOLDER}/`)
    res.render('designer_queue', { title: 'Ready for designing', case_files: data.case_files, designers: ['All designers', ...new Set(designers)] });
  })
});

router.get('/allocation', function (req, res, next) {
  axios.get(
    'http://www.prf.nll.mybluehost.me/wp-json/my-route/allocation-queue-case-files?test_key=0Wbjj49mZtweghh6RZ5YtcShGaIb10JbdNxEtezdZi2eios4w0TDcxPjRC'
  ).then(({data}) => {
    console.log(data);
    res.render('allocation', { title: 'Allocate Case Files', case_files: data.case_files });
  })
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
  if (caseFile.indexOf('TS Portal case, see all files') >= 0) {
    let caseName = caseId + '-' + caseOwner.replace(' ', '_').replace(/\W/g, '');
    ensureDesignerCaseFolderExists(designer, creationTimeMs, caseName);
    console.log(getClientCaseFolder(caseId, creationTimeMs));
    console.log(getDesignerCaseFolderRaw(designer, creationTimeMs, caseName));
    fs.copySync(
      getClientCaseFolder(caseId, creationTimeMs),
      getDesignerCaseFolderRaw(designer, creationTimeMs, caseName),
    );
  } else {
    let caseName = caseId + '-' + caseFile.replace(' ', '_').replace(/\W/g, '');
    ensureDesignerCaseFolderExists(designer, creationTimeMs, caseName);
    
    let filesInFolder = fs.readdirSync(getClientCaseFolder(caseId, creationTimeMs));
    let zipFiles = filesInFolder.filter(f => {
      return f.endsWith('.zip') && (f.includes(caseFile) || caseFile.includes(f));
    });
    console.log(zipFiles);
    if (zipFiles.length == 0) {
      console.log("Zip file not found for "+caseId);
      return;
    }

    console.log(getDesignerCaseFolderRaw(designer, creationTimeMs, caseName) + '/' + zipFiles[0]);
    console.log(getClientCaseFolder(caseId, creationTimeMs) + '/' + zipFiles[0]);

    fs.copySync(
      getClientCaseFolder(caseId, creationTimeMs) + '/' + zipFiles[0],
      getDesignerCaseFolderRaw(designer, creationTimeMs, caseName) + '/' + zipFiles[0],
    );

    fs.copySync(
      getClientCaseFolder(caseId, creationTimeMs) + '/' + 'CaseDetails.pdf',
      getDesignerCaseFolderRaw(designer, creationTimeMs, caseName) + '/' + 'CaseDetails.pdf',
    );
  }
}

module.exports = router;
