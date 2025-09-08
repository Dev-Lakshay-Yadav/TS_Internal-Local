const fs = require('fs');
const { google } = require('googleapis');
const unzipper = require('unzipper');
const axios = require('axios');
const { file } = require('googleapis/build/src/apis/file');
const qs = require('qs');
const xml_to_json = require('xml-js');
const {
    getCurrentDateString,
    getCurrentTimeString,
} = require('./ts_datetime.js');
const {
    INCOMING_CASES_QUERY, 
    CONSTANTS_POST_ENDPOINT,
} = require('./ts_constants.js');
const {
    ensureLabFolderExists,
    ensureCaseFolderExists,
    getFilePath,
    checkFileExists,
} = require('./ts_folder_structure.js');
const {
    generatePDF
} = require('./ts_pdf_maker.js');

function processCases(auth) {
    console.log("Processing cases at " + getCurrentTimeString());

    axios({
        method: 'get',
        url: INCOMING_CASES_QUERY,
    }).then(response => {
        let last_case_ts = null;
        let caseProcessingPromises = [];
        console.log(response.data.cases);
        for(let caseDetails of response.data.cases) {
            let folderId = caseDetails.case_folder_url.split('/').slice(-1)[0].trim();
            if (folderId.length === 0) {
                continue;
            }
            
            console.log(caseDetails);

            let caseId = caseDetails['case_id'];
            let creationTimeMs = caseDetails['creation_time_ms'];

            ensureLabFolderExists(caseId, creationTimeMs);
            ensureCaseFolderExists(caseId, 'IMPORT');
            ensureCaseFolderExists(caseId, 'EXPORT - Internal');
            ensureCaseFolderExists(caseId, 'EXPORT - External');
            
            // Needs to be a promise all
            caseProcessingPromises.push(
                processCase(auth, folderId, caseId, caseDetails).catch(err => {
                    console.log({
                        err,
                        message: `Error processing ${caseId}, will need manual processing`
                    });
                })
            );
            last_case_ts = parseInt(creationTimeMs);
        }

        Promise.all(caseProcessingPromises).then((resolutions) => {
            console.log(resolutions);
            console.log('Case files processed successfully');
            if (last_case_ts != null) {
                axios.post(
                    CONSTANTS_POST_ENDPOINT,
                    qs.stringify({name: 'portal_case_ts_ms', value: last_case_ts}),
                ).then(_ => {
                    processCases(auth);
                });
            } else {
                console.log('No more cases for now, going to sleep for 5 minutes');
                setTimeout(function() {
                    processCases(auth);
                }, 5 * 60 * 1000);
            }
        }).catch((error) => {
            console.log(error);
            console.log('An error occurred, will retry in a minute');
            setTimeout(function() {
                processCases(auth);
            }, 1 * 60 * 1000);
        });
    });
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function processCase(auth, parentId, caseId, caseDetails) {
    return new Promise((resolve, reject) => {
        try {
            processCaseImpl(auth, parentId, caseId, caseDetails, resolve, reject);
        } catch (err) {
            reject(err);
        }
    });
}
function processCaseImpl(auth, parentId, caseId, caseDetails, resolve, reject) {
    let services = JSON.parse(caseDetails.details_json).services;
    let hasFilledOrderForm = Object.keys(services).filter(s => [
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
        if (err) {
            reject('The API for ' + caseId + ' returned an error: ' + err);
            return;
        }

        /* Expecting the Client Uploads folder id, should be a single file only. */
        if (res.data.files?.length !== 1) {
            reject('Could not fetch Client Uploads for ' + caseId);
            return;
        }
        drive.files.list({
            q: `'${res.data.files[0].id}' in parents`,
            fields: 'files(id, name)',
        }, (err, res) => {
            if (err) {
                reject('The Client Uploads API for ' + caseId + 'returned an error: ' + err);
                return;
            }
            const files = res.data.files;
            
            // If a case has not filled any details in our portal form, 
            // they must have a filled order form and should only have uploaded
            // zip files.
            nonZipFiles = files.filter(f => !f.name.endsWith('.zip'));
            if (hasFilledOrderForm && nonZipFiles.length > 0) {
                let toLog = {
                    case_id: caseId,
                    case_file: 'Check all files for case',
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
                    resolve(caseId + ' needs more prep work');
                });
                return;
            }

            let fileDownloadPromises = files.map(file => {
                return downloadFile(drive, file.id, file.name, caseId);
            });
            Promise.all(fileDownloadPromises).then(values => {
                generatePDF(
                    getFilePath(caseId, 'CaseDetails.pdf', 'IMPORT'), 
                    JSON.stringify(JSON.parse(caseDetails.details_json), null, 4),
                );
                if (hasFilledOrderForm) {
                    // we've already confirmed that this case only has zip files
                    let unzipPromises = files.map(file => unzipCaseFiles(
                        getFilePath(caseId, file.name, 'IMPORT'), 
                        file.name, 
                        caseId,
                    ));
                    Promise.all(unzipPromises).then(v => resolve(v)).catch(e => reject(e));
                } else {
                    // resolve('Need to process TS Portal case ' + caseId);
                    console.log(services);
                    let case_units = [];
                    for (const service of Object.keys(services)) {
                        const serviceDetails = services[service];
                        let toothNumbers = {};
                        if (
                            service === 'crownAndBridge' || 
                            service === 'implant'
                        ) {
                            for (const instance of serviceDetails.instanceDetails) {
                                for (const toothNumber of instance.toothNumbers) {
                                    if (!toothNumbers.hasOwnProperty(toothNumber)) {
                                        toothNumbers[toothNumber] = 1;
                                        case_units.push({
                                            tooth_number: toothNumber,
                                            abutment_kit_id: null,
                                            anatomical: false,
                                            post_and_core: false,
                                            cache_tooth_type_class: service,
                                            unit_type: 'Tooth',
                                        });
                                    }
                                }
                            }
                        }
                        if (service === 'smileDesign') {
                            for (const toothNumber of serviceDetails.toothNumbers) {
                                case_units.push({
                                    tooth_number: toothNumber,
                                    abutment_kit_id: null,
                                    anatomical: false,
                                    post_and_core: false,
                                    cache_tooth_type_class: service,
                                    unit_type: 'Tooth',
                                });
                            }
                        }
                    }
                    let toLog = {
                        case_id: caseId,
                        case_file: 'TS Portal case, see all files',
                        queue_status: 'Ready for design',
                        current_allocation: 'None',
                        case_units,
                    };
                    console.log(toLog);
                    axios.post(
                        'http://www.prf.nll.mybluehost.me/wp-json/my-route/create-case-file/?test_key=0Wbjj49mZtRZ5YtcShGaIxEtezdZi2eios4w0TDcxPjRC',
                        qs.stringify(toLog)
                    ).then(response => {
                        resolve({
                            caseType: 'TS Portal',
                            responseData: response.data
                        });
                    });
                }
            }).catch(err => reject(err));
        });
    });
}

function downloadFile(drive, fileId, fileName, caseId) {
    console.log(`Downloading ${fileName} (${fileId})`);
    return new Promise((resolve, reject) => {
        drive.files.get({
            fileId: fileId,
            alt: 'media'
        }, { responseType: 'stream' }).then(res => {
            // if (checkFileExists(caseId, fileName, 'IMPORT')) {
            //     // I should probably be checking if I have the file properly recorded
            //     reject(`${caseId} already has the file ${fileName} downloaded.`);
            //     return;
            // }
                    
            let filePath = getFilePath(caseId, fileName, 'IMPORT');
            const dest = fs.createWriteStream(filePath);

            res.data
                .on('end', () => {
                    console.log('Done downloading file.');
                    resolve(filePath)
                })
                .on('error', err => {
                    console.error('Error downloading file.');
                    reject(err);
                })
                .pipe(dest);
        });
    });
    
}

function getUnitProperty(unit, propertyName) {
    return unit.elements.filter(p => p.attributes.name === propertyName)[0].attributes.value;
}

function unzipCaseFiles(filePath, fileName, caseId) {
    return new Promise((resolve, reject) => {
        try {    
            console.log(`Unzipping ${filePath}`);
            let fileNameWithoutExtension = fileName.split('.').slice(0, -1).join('.');
            let outputPath = filePath.split('/').slice(0, -1).join('/');
            // fs.mkdirSync(outputPath);
            fs.createReadStream(filePath)
            .pipe(unzipper.Extract({ path: outputPath }).on('error', (err) => reject('Unzip parse error for '+caseId)))
            .on('close', _ => fs.readdir(outputPath, (err, files) => {
                if (err) {
                    reject({err, filePath, fileName, caseId});
                    return;
                }
                let unzippedName = files.filter(f => fileNameWithoutExtension.includes(f))[0];
                console.log({unzippedName, fileNameWithoutExtension, files});
                fs.readFile(
                    outputPath + '/' + unzippedName + '/' + unzippedName + '.xml', 
                    'utf-8', 
                    (err, fileContent) => {
                        try {
                            let json = xml_to_json.xml2json(fileContent, {
                                compact: false, spaces: 4,
                            });
                                
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
                                resolve(response.data);
                            });
                        } catch (err) {
                            reject(err);
                        }
                    },
                );
            }));
        } catch (err) {
            reject(err);
        }
    }).catch(err => {
        console.log({err, caseId, filePath, fileName});
        axios.post(
            'http://www.prf.nll.mybluehost.me/wp-json/my-route/create-case-file/?test_key=0Wbjj49mZtRZ5YtcShGaIxEtezdZi2eios4w0TDcxPjRC',
            qs.stringify({
                case_id: caseId,
                case_file: 'An error occurred, check all files for case',
                queue_status: 'Needs prep work',
                current_allocation: 'None',
                case_units: [],
            })
        );
    });
}

module.exports = {
    processCases
}