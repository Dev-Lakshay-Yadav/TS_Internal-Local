const fs = require('fs');
const { ROOT_FOLDER } = require('./config');

const readyForExportFiles = new Set();
const readyForShippingFiles = new Set();

// fs.watch(`${ROOT_FOLDER}`, {recursive: true}, function (eventType, filePath) {
//     console.log("Watching file: ", eventType, filePath);
//     if (filePath.includes('EXPORT - Internal')) {
        
//     }
// })

let fileWatcherInitialize = function() {
    console.log("Running file watcher initialization");
}

module.exports = {
    readyForExportFiles,
    readyForShippingFiles,
    fileWatcherInitialize,
}