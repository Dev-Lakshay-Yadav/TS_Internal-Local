const PDFGenerator = require('pdfkit')
const fs = require('fs');

function generateCasePDF(
    caseId, /* string */
    caseDetails, /* JSON object */
    filePath, /* string */
) {
    // instantiate the library
    let doc = new PDFGenerator();

    // pipe to a writable stream which would save the result into the same directory
    doc.pipe(fs.createWriteStream(filePath));

    doc.fontSize(24)
        .text(`Case Details for TS-${caseId}`)
        .moveDown();

    if (caseDetails.hasOwnProperty('casePriority')) {
        doc.fontSize(20)
        .text(`Case Priority ${caseDetails.casePriority}`)
        .moveDown();
    }

    doc.fontSize(16)
        .text(`Patient name - ${caseDetails.patientName}`)
        .moveDown()
        .moveDown();

    const services = caseDetails['services'];
    Object.keys(services).forEach(service => {
        doc.fontSize(16)
            .text(convertKey(service));
        service = services[service];
        Object.keys(service).forEach(fieldKey => {
            if (fieldKey == 'instanceDetails') {
                doc.moveDown();
                doc.fontSize(14).text(convertKey(fieldKey) + ': ');
                instances = service[fieldKey];
                instances.forEach((instance, idx) => {
                    let answers = Object.keys(instance).map(instanceFieldKey => {
                        if (instanceFieldKey == 'toothNumbers') {
                            return 'Tooth Numbers: ' + instance['toothNumbers'].join(",");
                        }
                        return convertKey(instanceFieldKey) + ': ' + instance[instanceFieldKey];
                    }).join("\n");
                    doc.fontSize(12).text(
                        "Instance " + (idx+1).toString() +"\n"+ answers + "\n",
                    ).moveDown();
                })
            } else {
                let text = convertKey(fieldKey) + ': ';
                if (fieldKey == 'toothNumbers' || fieldKey == 'teethExtractions' || fieldKey == 'plannedImplantSites') {
                    text += service[fieldKey].join(",");
                } else {
                    text += service[fieldKey];
                }
                doc.fontSize(12).text(text);
            }
        });
        doc.moveDown();
    });

    doc.moveDown();
    doc.fontSize(16).text('Misc. details');

    doc.fontSize(12).text('Additional Notes: ' + caseDetails['additionalNotes']).moveDown();
    doc.fontSize(12).text('Splinted Crowns: ' + caseDetails['splintedCrowns']).moveDown();

    // write out file
    doc.end();
}

const convertKey = (text) => {
    var result = text.replace( /([A-Z])/g, " $1" );
    return result.charAt(0).toUpperCase() + result.slice(1);
}

function generateCommentsPDF(
    caseId, /* string */
    caseActivities, /* JSON object */
    priority, /* string */
    filePath, /* string */
) {
    let doc = new PDFGenerator();
    doc.pipe(fs.createWriteStream(filePath));
    doc.fontSize(24)
        .text(`Comments for TS-${caseId}`)
        .moveDown();

    doc.fontSize(20)
        .text(`Case Redesign Priority ${priority}`)
        .moveDown()
        .moveDown();

    for (let activity of caseActivities) {
        if (activity.type == 'system_update') {
            continue;
        }

        const author = activity.type == 'admin_comment'
            ? 'ToothSketch Team'
            : 'User';
        doc.fontSize(10).text(
            (new Date(activity.timestamp * 1000)).toLocaleString()
        ).moveDown();
        doc.fontSize(12).text(`${author.toUpperCase()}: `);
        doc.fontSize(12).text(activity.content).moveDown().moveDown();
    }

    doc.end();
}

module.exports = {
    generateCasePDF,
    generateCommentsPDF,
}
