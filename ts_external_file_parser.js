const fs = require('fs');
const unzipper = require('unzipper');
const xml_to_json = require('xml-js');

// const BASE_FOLDER = 'D:/Rishabh/ts_internal/Shared Folder';
const BASE_FOLDER = 'X:';
const BATCH_SIZE = 50;

let MONTH_NAME = '';

processMonthName(process.argv[2]);

function processMonthName(monthName) {
    MONTH_NAME = monthName;
    let topLevelItems = fs.readdirSync(
        `${BASE_FOLDER}/${monthName}`,
        { withFileTypes: true }
    );

    let zipFiles = findZipFiles(`${BASE_FOLDER}/${monthName}`).filter(
        f => {
            let filePath = f.toLowerCase();
            return filePath.includes('/export') && (
                filePath.includes('external') || filePath.includes('client')
            );
        }
    );

    for (let file of zipFiles) {
        // console.log(file);
    }
    // return;

    batchProcessFilePromises(zipFiles.slice(2564), 0, () => {
        console.log("back here");
    });
}

function processDateFolder(folderPath, dateFolders, i, cb) {
    if (i === dateFolders.length) {
        cb();
        return;
    }

    console.log(`Processing date folder ${dateFolders[i]}`);

    let topLevelItems = fs.readdirSync(
        `${folderPath}/${dateFolders[i]}`,
        { withFileTypes: true }
    );

    const labTokens = topLevelItems.filter(e => {
        if (!e.isDirectory()) {
            return false;
        }

        return e.name.trim().length === 2;
    }).map(e => e.name);

    processLabTokens(`${folderPath}/${dateFolders[i]}`, labTokens, 0, () => {
        console.log(`Completed processing date folder ${dateFolders[i]}`);
        processDateFolder(folderPath, dateFolders, i + 1, cb);
    });

}

function processLabTokens(folderPath, labTokens, i, cb) {
    if (i === labTokens.length) {
        cb();
        return;
    }

    console.log(`Processing lab token ${labTokens[i]}- ${folderPath}`);

    let topLevelItems = fs.readdirSync(
        `${folderPath}/${labTokens[i]}`,
        { withFileTypes: true }
    );

    const exportExternalFolders = topLevelItems.filter(e =>
        e.isDirectory() && e.name.toLowerCase().includes('export') && (
            e.name.toLowerCase().includes('external')
            || e.name.toLowerCase().includes('client')
        ))
        .map(e => e.name);

    let zipFiles = [];
    for (let exportFolder of exportExternalFolders) {
        zipFiles = zipFiles.concat(findZipFiles(`${folderPath}/${labTokens[i]}/${exportFolder}`));
    }

    // console.log(zipFiles);
    // const filePromises = zipFiles.map(f => unzipCaseFiles(f).catch(err => {
    //   console.log("error processing " + f);
    // }));

    batchProcessFilePromises(zipFiles, 0, () => {
        console.log("back here");
        processLabTokens(folderPath, labTokens, i + 1, cb);
    });

}


function batchProcessFilePromises(zipFiles, i, cb) {
    let toProcess = zipFiles.slice(i, i + BATCH_SIZE);
    console.log(toProcess);
    const filePromises = toProcess.map(f => unzipCaseFiles(f).catch(err => {
        console.log("error processing " + f);
    }));
    Promise.all(filePromises).then((res) => {
        console.log(`Done, ${i}, ${zipFiles.length}`);
        if ((i + BATCH_SIZE) >= zipFiles.length) {
            console.log("Done!!");
            cb();
        } else {
            batchProcessFilePromises(zipFiles, i + BATCH_SIZE, cb);
        }
    }).catch(err => {
        console.log({ err, loc: 'Error in batchProcess' });
    });
}

function findZipFiles(folderPath) {
    let topLevelItems = fs.readdirSync(
        folderPath,
        { withFileTypes: true }
    );

    const subFolders = topLevelItems.filter(e => e.isDirectory()).map(e => e.name);
    let zipFiles = topLevelItems
        .filter(e => !e.isDirectory() && e.name.endsWith('.zip'))
        .map(e => `${folderPath}/${e.name}`);

    for (let subFolder of subFolders) {
        zipFiles = zipFiles.concat(findZipFiles(`${folderPath}/${subFolder}`));
    }

    return zipFiles;
}

function getUnitProperty(unit, propertyName) {
    return unit.elements.filter(p => p.attributes.name === propertyName)[0].attributes.value;
}

function unzipCaseFiles(filePath) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`Unzipping ${filePath}`);
            let fileNameWithoutExtension = filePath.split('.').slice(0, -1).join('.');
            // let outputPath = filePath.split('/').slice(0, -1).join('/') + '/do_not_use__unzipped';
            let outputPath = `${BASE_FOLDER}/rishabh_parse_testing/${MONTH_NAME}`;
            if (!fs.existsSync(outputPath)) {
                fs.mkdirSync(outputPath, { recursive: true });
            }
            // fs.mkdirSync(outputPath);
            fs.createReadStream(filePath)
                .pipe(unzipper.Extract({ path: outputPath }).on('error', (err) => reject('Unzip parse error for ' + filePath)))
                .on('close', _ => fs.readdir(outputPath, (err, files) => {
                    if (err) {
                        reject({ err, filePath });
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
                                let case_units = teethUnits.map(unit => ({
                                    tooth_number: getUnitProperty(unit, 'ToothNumber'),
                                    abutment_kit_id: getUnitProperty(unit, 'AbutmentKitID'),
                                    anatomical: getUnitProperty(unit, 'Anatomical') !== 'False',
                                    post_and_core: getUnitProperty(unit, 'PostAndCore') !== 'False',
                                    cache_tooth_type_class: getUnitProperty(unit, 'CacheToothTypeClass'),
                                    unit_type: 'Tooth',
                                }));
                                for (let unit of case_units) {
                                    console.log(`${filePath},${unit.tooth_number},${unit.cache_tooth_type_class}`);
                                }
                                let toLog = {
                                    case_file: fileNameWithoutExtension,
                                    case_units,
                                };
                                resolve();
                                // console.log(toLog);
                            } catch (err) {
                                console.log({ err, loc: 'L174 for ' + filePath });
                                reject(err);
                            }
                        },
                    );
                }));
        } catch (err) {
            console.log({ err, filePath });
            reject(err);
        }
    }).catch(err => {
        console.log({ err, filePath });
        reject(err);
    });
}