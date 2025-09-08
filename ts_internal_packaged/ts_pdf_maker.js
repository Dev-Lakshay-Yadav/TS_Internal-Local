const PDFGenerator = require('pdfkit')
const fs = require('fs');
const { file } = require('pdfkit');

function generatePDF(
    filePath, /* includes file name, must end in pdf */
    fileContents,
) {
    // instantiate the library
    let theOutput = new PDFGenerator();

    // pipe to a writable stream which would save the result into the same directory
    theOutput.pipe(fs.createWriteStream(filePath));

    theOutput.text(fileContents);

    // write out file
    theOutput.end();
}

module.exports = {
    generatePDF
}
