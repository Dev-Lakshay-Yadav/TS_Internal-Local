const axios = require('axios');
const qs = require('qs');
const { getClient } = require('./box_client.js');
const fs = require('fs');

function downloadClientUploads(
    client, /* Box js client, see box_client.js */
    fileID, /* string, https://app.box.com/file/<fileID> */
    destinationPath, /* string, where the file will be saved */
) {
    return new Promise((resolve, reject) => {
        client.files.getReadStream(fileID, null, (error, stream) => {
            if (error) {
                console.log(error);
                return;
            }

            let output = fs.createWriteStream(destinationPath);
            stream
                .pipe(output)
                .on('close', () => resolve(destinationPath));
        });
    });
}

getClient((client) => {
    let p1 = downloadClientUploads(client, '1030494843014', './test1.JPG');
    let p2 = downloadClientUploads(client, '1030486961897', './card_labels.pdf');
    let p3 = downloadClientUploads(client, '1030493218031', './lower_jaw.stl');

    Promise.all([p1, p2, p3]).then(values => console.log(values));
});