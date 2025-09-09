const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const unzipper = require('unzipper');
const axios = require('axios');
const { file } = require('googleapis/build/src/apis/file');
const { XMLParser } = require('fast-xml-parser');
const qs = require('qs');
const xml_to_json = require('xml-js');
const moment = require('moment');

// If modifying these scopes, delete token.json.
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/drive.photos.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// fs.createReadStream('tmp/70850_20210923_1548_Tech_01_Osmaro_#216 - ToothSketch Team.zip')
// .pipe(unzipper.Extract({ path: 'output/path' }));

// Load client secrets from a local file.
fs.readFile('credentials.json', 'utf8', (err, content) => {
    console.log(JSON.parse(content));
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Drive API.
    authorize(JSON.parse(content), processCases);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getAccessToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error retrieving access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

function processCases(auth) {
    console.log("processing cases at " + moment().format('MMMM Do YYYY, h:mm:ss a'));
    axios({
        method: 'get',
        url: 'http://www.prf.nll.mybluehost.me/wp-json/my-route/case-details-for-queue/?test_key=0Wbjj49mZtRZ5YtcShGaIb10JbdNxEtezdZi2eios4w0TDcxPjRC',
    }).then(response => {
        let currentDateString = getCurrentDateString();
        if (!fs.existsSync(`D:/Rishabh/ts_internal/Shared Folder/${currentDateString}`)) {
            fs.mkdirSync(`D:/Rishabh/ts_internal/Shared Folder/${currentDateString}`);
        }
        // console.log(response.data);
        for (let caseDetails of response.data.cases) {
            let labName = caseDetails.case_id.slice(0,2);
            if (!fs.existsSync(`D:/Rishabh/ts_internal/Shared Folder/${currentDateString}/${labName}`)) {
                fs.mkdirSync(`D:/Rishabh/ts_internal/Shared Folder/${currentDateString}/${labName}`);
            }
            console.log(caseDetails);
        }
        let last_case_ts = null;
        for(let caseDetails of response.data.cases) {
            let folderId = caseDetails.case_folder_url.split('/').slice(-1)[0].trim();
            if (folderId.length === 0) {
                continue;
            }
            listFiles(auth, folderId, caseDetails.case_id, caseDetails);
            // $completed_count++;
            last_case_ts = parseInt(caseDetails['creation_time_ms']);
        }

        if (last_case_ts != null) {
            axios.post(
                'http://www.prf.nll.mybluehost.me/wp-json/my-route/set-constant/',
                qs.stringify({name: 'portal_case_ts_ms', value: last_case_ts}),
            );
        }
        setTimeout(function() {
            console.log("Nothing found, sleeping for 5 minutes...");
            processCases(auth);
        }, 5 * 60 * 1000);

    });
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listFiles(auth, parentId, caseId, caseDetails) {
    let currentDateString = getCurrentDateString();
    let labName = caseId.slice(0,2);
    if (!fs.existsSync(`D:/Rishabh/ts_internal/Shared Folder/${currentDateString}/${labName}/${caseId}`)) {
        fs.mkdirSync(`D:/Rishabh/ts_internal/Shared Folder/${currentDateString}/${labName}/${caseId}`);
    }

    let services = Object.keys(JSON.parse(caseDetails.details_json).services);
    let hasFilledOrderForm = services.filter(s => [
        'crownAndBridge',
        'implant',
        'smileDesign',
        'surgicalGuide'
    ].includes(s)).length === 0;
    
    const drive = google.drive({ version: 'v3', auth });
    drive.files.list({
        q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = 'Client Uploads'`,
        pageSize: 10,
        fields: 'nextPageToken, files(id, name)',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        const files = res.data.files;
        if (files.length === 1) {
            console.log('Files:');
            files.map((file) => {
                console.log(`${file.name} (${file.id})`);
            });
            let file = files[0];
            try {
                drive.files.list({
                    q: `'${file.id}' in parents`,
                    fields: 'files(id, name)',
                }, (err, res) => {
                    if (err) return console.log('The Client Uploads API returned an error: ' + err);
                    const files = res.data.files;
                    files.map(file => {
                        console.log(`${caseId}: Client uploaded file: ${file.id} ${file.name}`);
                        if (hasFilledOrderForm && !file.name.endsWith('.zip')) {
                            let toLog = {
                                case_id: caseId,
                                case_file: file.name,
                                queue_status: 'Needs prep work',
                                current_allocation: 'None',
                                case_units: [],
                            };
                            console.log(toLog);
                            axios.post(
                                'http://www.prf.nll.mybluehost.me/wp-json/my-route/create-case-file/?test_key=0Wbjj49mZtRZ5YtcShGaIxEtezdZi2eios4w0TDcxPjRC',
                                qs.stringify(toLog)
                            ).then(response => {
                                console.log(response.data);
                            });
                        } else {
                            // let filePath = `D:/Rishabh/ts_internal/Shared Folder/${currentDateString}/${labName}/${caseId}/${fileName}`;
                            downloadFiles(drive, file.id, caseId + ' - ' + file.name, caseId, (filePath) => {
                                if (!hasFilledOrderForm) {
                                    console.log("OOOOH filled case details form!! " + caseId + " " + caseDetails.details_json);
                                } else {
                                    unzipCaseFiles(filePath, file.name, caseId);
                                }
                            });
                        }
                    });
                });
            } catch (e) {
                console.log(`Error in ${caseId}`);
            }
        } else {
            console.log('No files found.');
        }
    });
}

function downloadFiles(drive, fileId, fileName, caseId, cb) {
    console.log(`Downloading ${fileName} (${fileId})`);
    // var fileId = '1rREOn539lv7EXlbHiw3NI4RN82RLbZ-K';
    // var filePath = 'tmp/' + caseId + '/' + fileName;
    // var dest = fs.createWriteStream(filePath);
    drive.files.get({
        fileId: fileId,
        alt: 'media'
    }, { responseType: 'stream' }).then(
        res => {
            return new Promise((resolve, reject) => {
                // const filePath = path.join(os.tmpdir(), uuid.v4());
                // console.log(`writing to ${filePath}`);
                // fs.writeFile(filePath, () => {});
                let currentDateString = getCurrentDateString();
                let labName = caseId.slice(0,2);
                let filePath = `D:/Rishabh/ts_internal/Shared Folder/${currentDateString}/${labName}/${caseId}/${fileName}`;
                if (fs.existsSync(filePath)) {
                    return null;
                }

                const dest = fs.createWriteStream(filePath);
                let progress = 0;

                res.data
                    .on('end', () => {
                        console.log('Done downloading file.');
                        if (!filePath.endsWith('.zip')) {
                            console.log("Not a zip file!! " + caseId);
                            cb(filePath);
                        }
                        if (filePath.endsWith('.zip')) {
                            // unzipCaseFiles(filePath, fileName, caseId);
                            resolve(filePath);
                            cb(filePath);
                            return;
                            console.log(`Unzipping ${filePath}`);
                            let fileNameWithoutExtension = fileName.split('.').slice(0, -1).join('.')
                            let outputPath = `tmp/${caseId}/${fileNameWithoutExtension}`;
                            // fs.mkdirSync(outputPath);
                            fs.createReadStream(filePath)
                                .pipe(unzipper.Extract({ path: outputPath }))
                                .on('close', _ => fs.readdir(
                                    outputPath, 
                                    (err, files) => {
                                        // console.log(files);
                                        // console.log(outputPath + '/' + files[0] + '/' + files[0] + '.xml');
                                        try {
                                            fs.readFile(outputPath + '/' + files[0] + '/' + files[0] + '.xml', 'utf-8', (err, fileContent) => {
                                                // console.log(fileContent);
                                                try {
                                                    let json = xml_to_json.xml2json(fileContent, {
                                                        compact: false, spaces: 4,
                                                    });
                                                    // console.log("Stringified " + files[0] + " ", JSON.parse(json).elements[0].elements[0].elements
                                                    //     .filter(e => e.attributes.name === 'ToothElementList')[0].elements[0].elements
                                                    // );
                                                    // let lists = json['DentalContainer']['Object']['Object'];
                                                    // // console.log(JSON.stringify(lists));
                                                    let teethUnits = JSON.parse(json).elements[0].elements[0].elements
                                                        .filter(e => e.attributes.name === 'ToothElementList')[0].elements[0].elements;
                                                    let case_units = teethUnits.map(unit => ({
                                                        tooth_number: getUnitProperty(unit, 'ToothNumber'),
                                                        abutment_kit_id: getUnitProperty(unit, 'AbutmentKitID'),
                                                        anatomical: getUnitProperty(unit, 'Anatomical') !== 'False',
                                                        post_and_core: getUnitProperty(unit, 'PostAndCore') !== 'False',
                                                        cache_tooth_type_class: getUnitProperty(unit, 'CacheToothTypeClass'),
                                                        unit_type: 'Tooth',
                                                    }));
                                                    let toLog = {
                                                        case_id: caseId,
                                                        case_file: fileNameWithoutExtension,
                                                        queue_status: 'Ready for design',
                                                        current_allocation: 'None',
                                                        case_units,
                                                    };
                                                    console.log(toLog);
                                                    axios.post(
                                                        'http://www.prf.nll.mybluehost.me/wp-json/my-route/create-case-file/?test_key=0Wbjj49mZtRZ5YtcShGaIxEtezdZi2eios4w0TDcxPjRC',
                                                        qs.stringify(toLog)
                                                    ).then(response => {
                                                        console.log(response.data);
                                                    });
                                                } catch (e) {
                                                    let f = outputPath + '/' + files[0] + '/' + files[0] + '.xml';
                                                    console.log(`XML error for ${caseId} - ${f} - ${e}`);        
                                                }
                                            });
                                        } catch (e) {
                                            console.log(`XML error for ${caseId} - ${e}`);
                                        }
                                    },
                                ));
                            
                        }
                    })
                    .on('error', err => {
                        console.error('Error downloading file.');
                        reject(err);
                    })
                    .on('data', d => {
                        // progress += d.length;
                        // if (process.stdout.isTTY) {
                        //     process.stdout.clearLine();
                        //     process.stdout.cursorTo(0);
                        //     process.stdout.write(`Downloaded ${progress} bytes`);
                        // }
                    })
                    .pipe(dest);
            });
        }
    );
}

function getUnitProperty(unit, propertyName) {
    return unit.elements.filter(p => p.attributes.name === propertyName)[0].attributes.value;
}

function unzipCaseFiles(filePath, fileName, caseId) {
    console.log(`Unzipping ${filePath}`);
    let fileNameWithoutExtension = fileName.split('.').slice(0, -1).join('.');
    let filePathWithoutExtension = filePath.split('.').slice(0, -1).join('.');
    let outputPath = filePath.split('/').slice(0, -1).join('/');
    // fs.mkdirSync(outputPath);
    fs.createReadStream(filePath)
      .pipe(unzipper.Extract({ path: outputPath }))
      .on('close', _ => fs.readdir(
        outputPath, 
        (err, files) => {
          let unzippedName = files.filter(f => fileNameWithoutExtension.includes(f))[0];
          try {
            fs.readFile(outputPath + '/' + unzippedName + '/' + unzippedName + '.xml', 'utf-8', (err, fileContent) => {
              // console.log(fileContent);
              try {
                let json = xml_to_json.xml2json(fileContent, {
                    compact: false, spaces: 4,
                });
                // console.log("Stringified " + files[0] + " ", JSON.parse(json).elements[0].elements[0].elements
                //     .filter(e => e.attributes.name === 'ToothElementList')[0].elements[0].elements
                // );
                // let lists = json['DentalContainer']['Object']['Object'];
                // // console.log(JSON.stringify(lists));
                let teethUnits = JSON.parse(json).elements[0].elements[0].elements
                    .filter(e => e.attributes.name === 'ToothElementList')[0].elements[0].elements;
                let case_units = teethUnits.map(unit => ({
                    tooth_number: getUnitProperty(unit, 'ToothNumber'),
                    abutment_kit_id: getUnitProperty(unit, 'AbutmentKitID'),
                    anatomical: getUnitProperty(unit, 'Anatomical') !== 'False',
                    post_and_core: getUnitProperty(unit, 'PostAndCore') !== 'False',
                    cache_tooth_type_class: getUnitProperty(unit, 'CacheToothTypeClass'),
                    unit_type: 'Tooth',
                }));
                let toLog = {
                    case_id: caseId,
                    case_file: fileNameWithoutExtension,
                    queue_status: 'Ready for design',
                    current_allocation: 'None',
                    case_units,
                };
                console.log(toLog,'logged to log');
                axios.post(
                    'http://www.prf.nll.mybluehost.me/wp-json/my-route/create-case-file/?test_key=0Wbjj49mZtRZ5YtcShGaIxEtezdZi2eios4w0TDcxPjRC',
                    qs.stringify(toLog)
                ).then(response => {
                    console.log(response.data);
                });
              } catch (e) {
                  let f = fileNameWithoutExtension + '/' + fileNameWithoutExtension + '.xml';
                  console.log(`XML error for ${caseId} - ${f} - ${e}`);        
              }
            });
          } catch (e) {
              console.log(`XML error for ${caseId} - ${e}`);
          }
        },
      ));
  }

  function getCurrentDate() {
    return moment().subtract('days', 2);
  }

  function getCurrentDateString() {
    return getCurrentDate().format('YYYY-MM-DD');
  }