const fs = require('fs');
const unzipper = require('unzipper');
const axios = require('axios');
const qs = require('qs');
const xml_to_json = require('xml-js');
const {
    getCurrentTimeString,
} = require('./ts_datetime.js');
const {
    INCOMING_CASES_QUERY,
    CONSTANTS_POST_ENDPOINT,
    CONSTANTS_GET_ENDPOINT,
} = require('./ts_constants.js');
const {
    ensureLabFolderExists,
    ensureCaseFolderExists,
    getFilePath,
} = require('./ts_folder_structure.js');
const {
    generateCasePDF,
} = require('./ts_case_details_pdf.js');
const {
    getClient,
} = require('./box_connectors/box_client.js');
const {
    processRedesigns,
} = require('./ts_portal_redesigns_downloader.js');

function processCases(client) {
    axios({
        method: 'get',
        url: CONSTANTS_GET_ENDPOINT + '?name=case_downloader_mutex_ts',
    }).then(response => {
        if (response.data['name'] !== 'case_downloader_mutex_ts') {
            return;
        }

        let now = Math.round((new Date()).getTime() / 1000);
        let prev = parseInt(response.data['value']);
        if (prev + (4 * 60) > now) {
            console.log("Its already running!");
            return;
        }

        axios.post(
            CONSTANTS_POST_ENDPOINT,
            qs.stringify({ name: 'case_downloader_mutex_ts', value: now }),
        ).then(data => {
            console.log({ data: data.data, message: "Update mutex value" });
            processCasesBehindLock(client);
            try {
                processRedesigns();
            } catch (ex) {
                console.log("Exception while processing redesigns");
                console.log(ex);
            }
        });
    });
}

function processCasesBehindLock(client) {
    console.log("Processing cases at " + getCurrentTimeString());

    axios({
        method: 'get',
        url: INCOMING_CASES_QUERY,
    }).then(response => {
        let last_case_ts = null;
        let caseProcessingPromises = [];
        for(let caseDetails of response.data.cases) {
            let folderId = caseDetails.box_folder_id;
            if (folderId.length === 0) {
                continue;
            }

            let caseId = caseDetails['case_id'];

            let creationTimeMs = caseDetails['creation_time_ms'];

            ensureLabFolderExists(caseId, creationTimeMs);
            ensureCaseFolderExists(caseId, 'IMPORT');
            ensureCaseFolderExists(caseId, 'EXPORT - External');
            ensureCaseFolderExists(caseId, 'Uploads');

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
            if (last_case_ts != null) {
                axios.post(
                    CONSTANTS_POST_ENDPOINT,
                    qs.stringify({name: 'portal_case_ts_ms', value: last_case_ts}),
                ).then(data => {
                    console.log({data: data.data, message: "Update const value"});
                    getClient(client => processCases(client));
                });
            } else {
                console.log('No more cases for now, going to sleep for 1 minute');
            }
        }).catch((error) => {
            console.log(error);
            console.log('An error occurred, will retry in a minute');
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
    console.log("processCaseImpl called and caseDetails is : ",caseDetails)
    let hasFilledOrderForm = Object.keys(services).filter(s => [
        'crownAndBridge',
        'implant',
        'smileDesign',
        'surgicalGuide',
        'digital-model',
        'complete-denture',
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
        console.log("inside function line 153")
        let files = items.entries.filter(e => e.type != 'folder' && e.item_status == 'active');
        if (files.length == 0) {
            reject('Could not find files for '+caseId+'.');
            return;
        }

        // If a case has not filled any details in our portal form,
        // they must have a filled order form and should only have uploaded
        // zip files.

        let fileDownloadPromises = files.map(file => {
            return downloadFile(client, file.id, file.name, caseId);
        });
        Promise.allSettled(fileDownloadPromises).then(results => {
            const hasRejected = results.some(result => result.status === 'rejected');
            if (hasRejected) {
                const rejectedFiles = results.filter(result => result.status === 'rejected');
                console.log(`Error while downloading files for ${caseId}`);
                console.log([caseId, rejectedFiles]);
                resolve(`Resolving ${caseId}, but we could not download the files`);
                return;
            }
            try {
                generateCasePDF(
                    caseId,
                    JSON.parse(caseDetails.details_json),
                    getFilePath(caseId, 'CaseDetails.pdf', 'IMPORT'),
                );
                let toLog = {
                    case_id: caseId,
                    case_file: 'Unzipping paused',
                    queue_status: 'Needs prep work',
                    current_allocation: 'None',
                    case_units: [],
                };
                console.log(`Intentionally not unzipping ${caseId}`);
                console.log(toLog,'asddd')
                const response = axios.post(
                    UPDATING_CASEFILES_AND_CASEUNITS,
                    toLog,
                    { headers: { "Content-Type": "application/json" } }
                  ).then(response => {
                    console.log("api triggered")
                    console.log(response.data);
                    resolve(caseId + ' finished downloading and creating caseDetails');
                });
            } catch (e) {
                console.log("Failed to generate CaseDetails.pdf for " + caseId);
                resolve([`Resolving ${caseId} with eror`, e]);
            }
            return;

        }).catch(err => reject(err));

    });
}

function downloadFile(client, fileId, fileName, caseId) {
    console.log(`Downloading ${fileName} (${fileId})`);
    return new Promise((resolve, reject) => {
        client.files.getReadStream(fileId, null, (error, stream) => {

            if (error) {
                reject('Box API readstream error for '+caseId);
                return;
            }

            let filePath = getFilePath(caseId, fileName, 'IMPORT');
            const dest = fs.createWriteStream(filePath);

            stream
                .on('end', () => {
                    console.log(`Done downloading file - ${caseId} ${fileName}`);
                    resolve(filePath)
                })
                .on('error', err => {
                    console.error(`Error downloading file - ${caseId} ${fileName}`);
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
                // console.log({unzippedName, fileNameWithoutExtension, files});
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
                            let case_units;
                            if (!teethUnits) {
                                case_units = [{
                                    tooth_number: 0,
                                    abutment_kit_id: null,
                                    anatomical: false,
                                    post_and_core: false,
                                    cache_tooth_type_class: '',
                                    unit_type: 'Digital Model',
                                }];
                            } else {
                                case_units = teethUnits.map(unit => ({
                                    tooth_number: getUnitProperty(unit, 'ToothNumber'),
                                    abutment_kit_id: getUnitProperty(unit, 'AbutmentKitID'),
                                    anatomical: getUnitProperty(unit, 'Anatomical') !== 'False',
                                    post_and_core: getUnitProperty(unit, 'PostAndCore') !== 'False',
                                    cache_tooth_type_class: getUnitProperty(unit, 'CacheToothTypeClass'),
                                    unit_type: 'Tooth',
                                }));
                            }
                            let toLog = {
                                case_id: caseId,
                                case_file: fileNameWithoutExtension,
                                queue_status: 'Ready for design',
                                current_allocation: 'None',
                                case_units,
                            };
                            console.log(toLog);
                            axios.post(
                                UPDATING_CASEFILES_AND_CASEUNITS,
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
            UPDATING_CASEFILES_AND_CASEUNITS,
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
    processCases,
    unzipCaseFiles
}
