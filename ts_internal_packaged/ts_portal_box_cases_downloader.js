const fs = require('fs');
const unzipper = require('unzipper');
const axios = require('axios');
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
const {
    getClient,
} = require('./box_connectors/box_client.js');

function processCases(client) {
    console.log("Processing cases at " + getCurrentTimeString());

    axios({
        method: 'get',
        url: INCOMING_CASES_QUERY,
    }).then(response => {
        let last_case_ts = null;
        let caseProcessingPromises = [];
        console.log(response.data.cases);
        for(let caseDetails of response.data.cases) {
            let folderId = caseDetails.box_folder_id;
            if (folderId.length === 0) {
                continue;
            }
            
            console.log(caseDetails);

            let caseId = caseDetails['case_id'];
            let creationTimeMs = caseDetails['creation_time_ms'];

            ensureLabFolderExists(caseId, creationTimeMs);
            ensureCaseFolderExists(caseId, 'IMPORT');
            
            // Needs to be a promise all
            caseProcessingPromises.push(
                processCase(client, folderId, caseId, caseDetails).catch(err => {
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
                ).then(data => {
                    console.log({data: data.data, message: "Update const value"});
                    getClient(client => processCases(client));
                });
            } else {
                console.log('No more cases for now, going to sleep for 5 minutes');
                setTimeout(function() {
                    console.log("triggering case processing after sleep");
                    getClient(client => processCases(client));
                }, 5 * 60 * 1000);
            }
        }).catch((error) => {
            console.log(error);
            console.log('An error occurred, will retry in a minute');
            setTimeout(function() {
                console.log("triggering case processing after error");
                getClient(client => processCases(client));
            }, 1 * 60 * 1000);
        });
    });
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param client Box API client.
 */
function processCase(client, folderId, caseId, caseDetails) {
    return new Promise((resolve, reject) => {
        try {
            processCaseImpl(client, folderId, caseId, caseDetails, resolve, reject);
        } catch (err) {
            reject(err);
        }
    });
}
function processCaseImpl(client, folderId, caseId, caseDetails, resolve, reject) {
    let services = JSON.parse(caseDetails.details_json).services;
    let hasFilledOrderForm = Object.keys(services).filter(s => [
        'crownAndBridge',
        'implant',
        'smileDesign',
        'surgicalGuide'
    ].includes(s)).length === 0;
    
    client.folders.getItems(
        folderId,
        {
            usermarker: 'false',
            fields: 'name,id,item_status,type',
            offset: 0,
            limit: 100,
        }
    ).then(items => {
        let files = items.entries.filter(e => e.type != 'folder' && e.item_status == 'active');
        if (files.length == 0) {
            reject('Could not find files for '+caseId+'.');
            return;
        }

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
                'http://www.prf.nll.mybluehost.me/wp-json/my-route/create-case-file?test_key=0Wbjj49mZtRZ5YtcShGaIxEtezdZi2eios4w0TDcxPjRC',
                qs.stringify(toLog)
            ).then(response => {
                console.log(response.data);
                resolve(caseId + ' needs more prep work');
            });
            return;
        }

        let fileDownloadPromises = files.map(file => {
            return downloadFile(client, file.id, file.name, caseId);
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
                    'http://www.prf.nll.mybluehost.me/wp-json/my-route/create-case-file?test_key=0Wbjj49mZtRZ5YtcShGaIxEtezdZi2eios4w0TDcxPjRC',
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
}

function downloadFile(client, fileId, fileName, caseId) {
    console.log(`Downloading ${fileName} (${fileId})`);
    return new Promise((resolve, reject) => {
        client.files.getReadStream(fileId, null, (error, stream) => {
            // if (checkFileExists(caseId, fileName, 'IMPORT')) {
            //     // I should probably be checking if I have the file properly recorded
            //     reject(`${caseId} already has the file ${fileName} downloaded.`);
            //     return;
            // }

            if (error) {
                reject('Box API readstream error for '+caseId);
                return;
            }
                    
            let filePath = getFilePath(caseId, fileName, 'IMPORT');
            const dest = fs.createWriteStream(filePath);

            stream
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
                                'http://www.prf.nll.mybluehost.me/wp-json/my-route/create-case-file?test_key=0Wbjj49mZtRZ5YtcShGaIxEtezdZi2eios4w0TDcxPjRC',
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
            'http://www.prf.nll.mybluehost.me/wp-json/my-route/create-case-file?test_key=0Wbjj49mZtRZ5YtcShGaIxEtezdZi2eios4w0TDcxPjRC',
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