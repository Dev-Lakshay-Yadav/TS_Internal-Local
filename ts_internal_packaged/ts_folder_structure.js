const fs = require('fs');
const {
    getCreationTimeDateString
} = require('./ts_datetime.js');

const dateMapping = {};

// TODO: Make this an environment variable
const BASE_FOLDER = 'D:/Rishabh/ts_internal/Shared Folder';

function ensureFolderExists(
    path /* string */,
) {
    if (!fs.existsSync(`${BASE_FOLDER}/${path}`)) {
        fs.mkdirSync(`${BASE_FOLDER}/${path}`, { recursive: true });
    }
}

function ensureLabFolderExists(caseId, creationTimeMs) {
    dateMapping[caseId] = getCreationTimeDateString(creationTimeMs);

    let labToken = caseId.slice(0,2);
    ensureFolderExists(`${dateMapping[caseId]}/Clients/${labToken}/IMPORT`);
    ensureFolderExists(`${dateMapping[caseId]}/Clients/${labToken}/EXPORT - Internal`);
    ensureFolderExists(`${dateMapping[caseId]}/Clients/${labToken}/EXPORT - External`);
}

function ensureCaseFolderExists(caseId, folderType) {
    validateFolderType(folderType);

    let labToken = caseId.slice(0,2);
    ensureFolderExists(`${dateMapping[caseId]}/Clients/${labToken}/${folderType}/${caseId}`);
}

function ensureDesignerCaseFolderExists(designer, creationTimeMs, caseName) {
    ensureFolderExists(getDesignerCaseFolder(designer, creationTimeMs, caseName));
}

function getDesignerCaseFolder(designer, creationTimeMs, caseName) {
    const dateString = getCreationTimeDateString(creationTimeMs);
    return `${dateString}/Designers/${designer}/${caseName}`;
}

function getDesignerCaseFolderRaw(designer, creationTimeMs, caseName) {
    const dateString = getCreationTimeDateString(creationTimeMs);
    const folderPath = getDesignerCaseFolder(designer, creationTimeMs, caseName);
    return `${BASE_FOLDER}/${folderPath}`;
}

function getClientCaseFolder(caseId, creationTimeMs) {
    let labToken = caseId.slice(0,2);
    const dateString = getCreationTimeDateString(creationTimeMs);
    return `${BASE_FOLDER}/${dateString}/Clients/${labToken}/IMPORT/${caseId}`;
}

function checkFileExists(caseId, filename, folderType) {
    return fs.existsSync(getFilePath(caseId, filename, folderType));
}

function getFilePath(caseId, filename, folderType) {
    validateFolderType(folderType);

    let labToken = caseId.slice(0,2);
    return `${BASE_FOLDER}/${dateMapping[caseId]}/Clients/${labToken}/${folderType}/${caseId}/${filename}`;
}

function getFilePathFromMS(caseId, filename, folderType, creationTimeMs) {
    validateFolderType(folderType);
    const dateString = getCreationTimeDateString(creationTimeMs);
    let labToken = caseId.slice(0,2);
    return `${BASE_FOLDER}/${dateString}/Clients/${labToken}/${folderType}/${caseId}/${filename}`;
}

function validateFolderType(folderType) {
    const validFolderType = [
        'IMPORT',
        'EXPORT - Internal',
        'EXPORT - External'
    ].includes(folderType);
    
    if (!validFolderType) {
        throw `Invalid folderType ${folderType}, must be "IMPORT", "EXPORT - Internal", "EXPORT - External"`;
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
}