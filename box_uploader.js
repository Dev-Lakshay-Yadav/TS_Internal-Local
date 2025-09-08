const { getClient } = require('./box_connectors/box_client.js');
const { getExportFilesForCase } = require('./ts_folder_structure.js');
const fs = require('fs');
const { getIO } = require('./routes/my_socket');

function uploadFile(client, folderID, filePath, fileName, caseID, cb) {
    getIO().local.emit('upload_message', {caseID, message: 'Uploading ' + filePath});
    console.log("Uploading " + filePath);
    let stream = fs.createReadStream(filePath);
    client.files.uploadFile(folderID, fileName, stream)
        .then(file => {
            console.log("Uploaded " + filePath);
            getIO().local.emit('upload_message', {caseID, message: 'Uploaded ' + filePath});
            cb(file);
        });
}

// // Example invocation
// getClient(client => {
//     uploadFile(client, './ts_folder_structure.js', 'ts_folder_structure.js');
// })

function uploadFilesForCase(dateString, caseID, subFolderIds, caseFilePath, cb) {
    const labToken = caseID.slice(0, 2);
    const {data} = getExportFilesForCase(dateString, labToken, caseID);
    const {subFolders} = data;

    const argsList = [];
    Object.keys(subFolders).forEach(subFolderName => {
        const previewsFolderID = subFolderIds[subFolderName]['Previews'];
        const downloadsFolderID = subFolderIds[subFolderName]['Downloads'];

        let subFolderDetails = subFolders[subFolderName];
        subFolderDetails['TS_PREVIEW'].forEach(file => {
            argsList.push([previewsFolderID, `${caseFilePath}/${subFolderName}/${file.file_name}`, file.file_name, caseID]);
        });
        subFolderDetails['TS_DOWNLOAD'].forEach(file => {
            argsList.push([downloadsFolderID, `${caseFilePath}/${subFolderName}/${file.file_name}`, file.file_name, caseID]);
        });
    });

    processUploadsArgsList(argsList, 0, [], (results) => {
        console.log(results);
        cb();
    });

}

function processUploadsArgsList(argsList, index, results, cb) {
    if (index === argsList.length) {
        cb(results);
        return;
    }
    const args = argsList[index];
    getClient(client => {
        uploadFile(client, args[0], args[1], args[2], args[3], (result) => {
            results.push(result);
            processUploadsArgsList(argsList, index+1, results, cb);
        });
    });
}

module.exports = {
    uploadFilesForCase,
}
