const fs = require('fs');
const {
    getCreationTimeDateString
} = require('./ts_datetime.js');

const dateMapping = {};

// TODO: Make this an environment variable
// const BASE_FOLDER = 'D:/Rishabh/ts_internal/Shared Folder';
const BASE_FOLDER = 'Z:';
// const BASE_FOLDER = '/Users/rishabhmarya/BambooShoots/ts_downloading_test';

function ensureFolderExists(
    path /* string */,
) {
    if (!fs.existsSync(`${BASE_FOLDER}/${path}`)) {
        fs.mkdirSync(`${BASE_FOLDER}/${path}`, { recursive: true });
    }
}

function ensureRedesignFolderExists(rdCaseId, creationTimeMs) {
    const date = getCreationTimeDateString(creationTimeMs);
    dateMapping[rdCaseId] = date;
    ensureFolderExists(`${date}/REDESIGN`);
    ensureFolderExists(`${date}/REDESIGN/${rdCaseId}`);
}

function getRedesignFolderPath(rdCaseId) {
    return `${BASE_FOLDER}/${dateMapping[rdCaseId]}/REDESIGN/${rdCaseId}`;
}

function ensureLabFolderExists(caseId, creationTimeMs) {
    dateMapping[caseId] = getCreationTimeDateString(creationTimeMs);

    let labToken = caseId.slice(0,2);
    ensureFolderExists(`${dateMapping[caseId]}/${labToken}/IMPORT`);
    ensureFolderExists(`${dateMapping[caseId]}/${labToken}/EXPORT - Internal`);
    ensureFolderExists(`${dateMapping[caseId]}/${labToken}/EXPORT - External`);
    ensureFolderExists(`${dateMapping[caseId]}/${labToken}/Uploads`);
}

function ensureCaseFolderExists(caseId, folderType) {
    validateFolderType(folderType);

    let labToken = caseId.slice(0,2);
    ensureFolderExists(`${dateMapping[caseId]}/${labToken}/${folderType}/${caseId}`);
}

function ensureDesignerCaseFolderExists(designer, creationTimeMs, caseName) {
    ensureFolderExists(getDesignerCaseFolder(designer, creationTimeMs, caseName));
}

function getDesignerCaseFolder(designer, creationTimeMs, caseName) {
    const dateString = getCreationTimeDateString(creationTimeMs);
    return `${dateString}/${designer}/${caseName}`;
}

function getBaseFolders() {
    let allItems = fs.readdirSync(`${BASE_FOLDER}`, {withFileTypes: true});

    return allItems.filter(e => e.isDirectory() && e.name.startsWith('RT-')).map(e => e.name);
}

function getDesignerCaseFolderRaw(designer, creationTimeMs, caseName) {
    const folderPath = getDesignerCaseFolder(designer, creationTimeMs, caseName);
    return `${BASE_FOLDER}/${folderPath}`;
}

function getClientCaseFolder(caseId, creationTimeMs) {
    let labToken = caseId.slice(0,2);
    const dateString = getCreationTimeDateString(creationTimeMs);
    return `${BASE_FOLDER}/${dateString}/${labToken}/IMPORT/${caseId}`;
}

function checkFileExists(caseId, filename, folderType) {
    return fs.existsSync(getFilePath(caseId, filename, folderType));
}

function getFilePath(caseId, filename, folderType) {
    validateFolderType(folderType);

    let labToken = caseId.slice(0,2);
    return `${BASE_FOLDER}/${dateMapping[caseId]}/${labToken}/${folderType}/${caseId}/${filename}`;
}

function validateFolderType(folderType) {
    const validFolderType = [
        'IMPORT',
        'EXPORT - Internal',
        'EXPORT - External',
        'Uploads'
    ].includes(folderType);

    if (!validFolderType) {
        throw `Invalid folderType ${folderType}, must be "IMPORT", "EXPORT - Internal", "EXPORT - External, Uploads"`;
    }
}

function getCasesForDate(dateString) {
    let clients = fs.readdirSync(`${BASE_FOLDER}/${dateString}`);
    let exportCases = {};
    for (let client of clients) {
        if (client.length > 2) {
            continue;
        }
        exportCases[client] = fs.readdirSync(`${BASE_FOLDER}/${dateString}/${client}/IMPORT`);
    }
    return exportCases;
}

function getAllDesignedLabFiles(dateString, labToken) {
    let topLevelItems = fs.readdirSync(
        `${BASE_FOLDER}/${dateString}/${labToken}/EXPORT - External`,
        {withFileTypes: true}
    );

    const folderNames = topLevelItems.filter(e => e.isDirectory() && !e.name.startsWith('[')).map(e => e.name);
    const versionFolders = topLevelItems.filter(e => e.isDirectory() && e.name.startsWith('[')).map(e => e.name);
    let fileNames = topLevelItems.filter(e => !e.isDirectory()).map(e => e.name);
    for (let versionFolder of versionFolders) {
        fileNames = fileNames.concat(
            fs.readdirSync(`${BASE_FOLDER}/${dateString}/${labToken}/EXPORT - External/${versionFolder}`)
                .map(f => `${versionFolder} ${f}`)
        );
    }
    fileNames.sort();

    console.log({fileNames, folderNames, versionFolders});

    return {fileNames, folderNames, filePath: `${BASE_FOLDER}/${dateString}/${labToken}/EXPORT - External`};
}

function getExportFilesForCase(dateString, labToken, caseID) {
    if (!fs.existsSync(`${BASE_FOLDER}/${dateString}/${labToken}/Uploads/${caseID}`)) {
        return {
            success: true,
            data: {
                subFolders: {},
                caseFilePath: `${BASE_FOLDER}/${dateString}/${labToken}/Uploads/${caseID}`,
            },
        };
    }

    let topLevelItems = fs.readdirSync(
        `${BASE_FOLDER}/${dateString}/${labToken}/Uploads/${caseID}`,
        {withFileTypes: true}
    );

    let nonFolders = topLevelItems.filter(e => !e.isDirectory());
    if (nonFolders.length > 0) {
        let nonFolderNames = nonFolders.map(e => e.name).join(', ');
        return {
            success: false,
            error: `Uploads/${caseID} should ONLY contain folders representing groups of files for this case. Please move ${nonFolderNames} into appropriate folders.`,
        };
    }

    let data = {};
    for (let subFolder of topLevelItems) {
        let files = fs.readdirSync(
            `${BASE_FOLDER}/${dateString}/${labToken}/Uploads/${caseID}/${subFolder.name}`,
            {withFileTypes: true}
        );

        let nonFiles = files.filter(f => !f.isFile());
        if (nonFiles.length > 0) {
            let nonFileNames = nonFiles.map(f => f.name).join(', ');
            return {
                success: false,
                error: `Uploads/${caseID}/${subFolder.name} should ONLY contain files. Please address ${nonFileNames}`,
            };
        }
        data[subFolder.name] = {'TS_PREVIEW': [], 'TS_DOWNLOAD': []};
        for (let f of files) {
            let isPreview = ['JPG', 'JPEG', 'PNG'].includes(f.name.split('.').slice(-1)[0].toUpperCase());
            if (isPreview) {
                data[subFolder.name]['TS_PREVIEW'].push({
                    file_name: f.name,
                    file_type: 'TS_PREVIEW',
                    folder_name: subFolder.name,
                    file_id: null,
                });
            } else {
                data[subFolder.name]['TS_DOWNLOAD'].push({
                    file_name: f.name,
                    file_type: 'TS_DOWNLOAD',
                    folder_name: subFolder.name,
                    file_id: null,
                });
            }
        }
    }

    return {
        success: true,
        data: {
            subFolders: data,
            caseFilePath: `${BASE_FOLDER}/${dateString}/${labToken}/Uploads/${caseID}`,
        },
    }
}


module.exports = {
    ensureLabFolderExists,
    ensureCaseFolderExists,
    getFilePath,
    checkFileExists,
    ensureDesignerCaseFolderExists,
    getDesignerCaseFolder,
    getDesignerCaseFolderRaw,
    getClientCaseFolder,
    getCasesForDate,
    getExportFilesForCase,
    getAllDesignedLabFiles,
    getBaseFolders,
    ensureRedesignFolderExists,
    getRedesignFolderPath,
}
