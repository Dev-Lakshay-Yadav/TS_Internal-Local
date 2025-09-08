
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

function getUnitProperty(unit, propertyName) {
    return unit.elements.filter(p => p.attributes.name === propertyName)[0].attributes.value;
}

function unzipCaseFiles(filePath) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`Unzipping ${filePath}`);
            const fileName = filePath.split('/').pop();
            let fileNameWithoutExtension = fileName.split('.').slice(0, -1).join('.');
            let outputPath = filePath.split('/').slice(0, -1).join('/');
            // fs.mkdirSync(outputPath);
            fs.createReadStream(filePath)
            .pipe(unzipper.Extract({ path: outputPath }).on('error', (err) => reject('Unzip parse error for ')))
            .on('close', _ => fs.readdir(outputPath, (err, files) => {
                if (err) {
                    reject({err, filePath});
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

                            let isDigitalModel = true;
                            let toothNumberStr = '';
                            let toothUnitCount = 0;
                            let isImplant = false;
                            if (teethUnits != undefined && teethUnits.length > 0) {
                              isDigitalModel = false;

                              let case_units = teethUnits.map(unit => ({
                                  tooth_number: getUnitProperty(unit, 'ToothNumber'),
                                  abutment_kit_id: getUnitProperty(unit, 'AbutmentKitID'),
                                  anatomical: getUnitProperty(unit, 'Anatomical') !== 'False',
                                  post_and_core: getUnitProperty(unit, 'PostAndCore') !== 'False',
                                  cache_tooth_type_class: getUnitProperty(unit, 'CacheToothTypeClass'),
                                  unit_type: 'Tooth',
                              }));

                              isImplant = case_units
                                .filter(unit => unit.cache_tooth_type_class === 'teAbutmentWaxup')
                                .length > 0;

                              toothUnitCount = case_units.length;
                              case_units.sort((a, b) => a.tooth_number - b.tooth_number);
                              console.log(case_units);
                              const gapIndices = [0];
                              for (let i=1; i<case_units.length; i++) {
                                  if (case_units[i].tooth_number > (case_units[i-1].tooth_number + 1)) {
                                      gapIndices.push(i);
                                  }
                              }
                              gapIndices.push(case_units.length);
                             
                              for (let i=1; i<gapIndices.length; i++) {
                                  toothNumberStr += `${case_units[gapIndices[i-1]].tooth_number}-${case_units[gapIndices[i]-1].tooth_number},`
                              }
                              if (case_units.length === 1){
                                toothNumberStr = case_units[0].tooth_number;
                              }
                            }

                            const billingCategory = isDigitalModel
                              ? 'Digital Model'
                              : (isImplant ? 'Implant' : 'Crown & Bridge');

                            let toLog = {
                                case_file: fileNameWithoutExtension,
                                billingCategory,
                                toothNumberStr,
                                toothUnitCount
                            };
                            console.log(toLog);
                            resolve(toLog);
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
        console.log({err, filePath});
    });
}

function getXMLFilePath(filePath) {
  const fileName = filePath.split('/').pop();
  const fileNameWithoutExtension = fileName.split('.').slice(0, -1).join('.');
  const outputPath = filePath.split('/').slice(0, -1).join('/');
  const xmlFilePath = `${outputPath}/${fileNameWithoutExtension}/${fileNameWithoutExtension}.xml`;
  return [xmlFilePath, fileNameWithoutExtension];
}

function readXMLFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf-8', (err, fileContent) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        const json = xml_to_json.xml2json(fileContent, {
          compact: false,
          spaces: 4,
        });

        resolve(json);
      } catch (err) {
        reject(err);
      }
    });
  });
}

function processCaseFile(filePath) {
  const [xmlFilePath, xmlFileName] = getXMLFilePath(filePath);
  //const xmlFilePath = getXMLFilePath(filePath);

  return readXMLFile(xmlFilePath)
    .then((json) => {
      const teethUnits = JSON.parse(json).elements[0].elements[0].elements
        .filter((e) => e.attributes.name === 'ToothElementList')[0].elements[0].elements;

      let isDigitalModel = true;
      let toothNumberStr = '';
      let toothUnitCount = 0;
      let isImplant = false;

      if (teethUnits !== undefined && teethUnits.length > 0) {
        isDigitalModel = false;

        const case_units = teethUnits.map((unit) => ({
          tooth_number: parseInt(getUnitProperty(unit, 'ToothNumber')),
          abutment_kit_id: getUnitProperty(unit, 'AbutmentKitID'),
          anatomical: getUnitProperty(unit, 'Anatomical') !== 'False',
          post_and_core: getUnitProperty(unit, 'PostAndCore') !== 'False',
          cache_tooth_type_class: getUnitProperty(unit, 'CacheToothTypeClass'),
          unit_type: 'Tooth',
        }));

        isImplant =
          case_units.filter((unit) => unit.cache_tooth_type_class === 'teAbutmentWaxup').length > 0;

        toothUnitCount = case_units.length;
        case_units.sort((a, b) => a.tooth_number - b.tooth_number);
        console.log({case_units});
        const gapIndices = [0];
        for (let i = 1; i < case_units.length; i++) {
          if (case_units[i].tooth_number > case_units[i - 1].tooth_number + 1) {
            gapIndices.push(i);
          }
        }
        gapIndices.push(case_units.length);
        console.log({gapIndices});

        for (let i = 1; i < gapIndices.length; i++) {
          if (gapIndices[i] == gapIndices[i - 1] + 1){
            toothNumberStr += `${case_units[gapIndices[i - 1]].tooth_number},`;
          }
          else{
            toothNumberStr += `${case_units[gapIndices[i - 1]].tooth_number}-${case_units[
              gapIndices[i] - 1
            ].tooth_number},`;
          }
          
          console.log({toothNumberStr});
        }

        if (case_units.length === 1) {
          toothNumberStr = case_units[0].tooth_number;
        }
      }

      const billingCategory = isDigitalModel ? 'Digital Model' : isImplant ? 'Implant' : 'Crown & Bridge';

      const toLog = {
        case_file: xmlFileName,
        billingCategory,
        toothNumberStr,
        toothUnitCount,
      };

      console.log({toLog});
      return toLog;
    })
    .catch((err) => {
      console.log({ err, filePath });
    });
}



// printing all the zip files found
const fs = require('fs');
const path = require('path');
const csv = require('csv-writer').createObjectCsvWriter;
const labsList = ["AU", "BG", "Bant", "BTT(3Shape)- Updated in Element Digital", "CalmandGentleDentalCare", "Dentsply", "DL", "Carly Roguszka at Chilwell DP", "DK", "Dr. Meetal", "Dr. Meetal", "FZ", "GV", "JI", "KB", "MK", "MS", "PH Dental Lab(Paul)", "PL", "QF", "QX", "TV", "XP"]
const unzipper = require('unzipper');
const xml_to_json = require('xml-js');

let s_no = 1;

function printZipFilePaths(directoryPath, csvWriter) {
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }

    files.forEach(file => {
      const filePath = path.join(directoryPath, file);
      const fileExtension = path.extname(file);

      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error('Error retrieving file stats:', err);
          return;
        }

        if (stats.isDirectory()) {
          printZipFilePaths(filePath, csvWriter); // Recursive call for subdirectories
        } else if (stats.isFile() && fileExtension === '.zip' && (filePath.toLowerCase().includes('export') && !filePath.toLowerCase().includes('internal'))) {
          const folders = filePath.split(path.sep); // Split the file path into folders
          if (folders.length >= 6) {
            const date = folders[5];
            const labName = folders[6];
            if (labsList.includes(labName)) {
              console.log(`Date: ${date}`);
              console.log(`Lab name: ${labName}`);
              console.log(`File Path: ${filePath}`);

              processCaseFile(filePath)
                .then(data => {
                  // const records = data.case_units.map(unit => ({
                  //   case_file: data.case_file,
                  //   queue_status: data.queue_status,
                  //   current_allocation: data.current_allocation,
                  //   tooth_number: unit.tooth_number,
                  //   abutment_kit_id: unit.abutment_kit_id,
                  //   anatomical: unit.anatomical,
                  //   post_and_core: unit.post_and_core,
                  //   cache_tooth_type_class: unit.cache_tooth_type_class,
                  //   unit_type: unit.unit_type
                  // }));
                  const price_per_unit = data.billingCategory === 'Implant' ? 2.75 : 2.5;
                  const records = [{
                    's_no': s_no++,
                    'date': date.slice(3),
                    'case_name': data.case_file,
                    'category': data.billingCategory,
                    'tooth_numbers': data.toothNumberStr,
                    'units': data.billingCategory !== 'Digital Model' ? data.toothUnitCount : 'Only model',
                    'price_per_unit': price_per_unit,
                    'total': data.billingCategory !== 'Digital Model' ? price_per_unit * data.toothUnitCount : price_per_unit,
                  }];

                  csvWriter.writeRecords(records)
                    .then(() => {
                      console.log('CSV file created successfully.');
                    })
                    .catch(error => {
                      console.error('An error occurred while writing to the CSV file:', error);
                    });
                })
                .catch(error => {
                  console.error('An error occurred during unzipping:', error);
                });
            }
          }
        }
      });
    });

  });
}




// if (!directoryPath) {
//   console.error('Please provide a directory path as an argument.');
// } else {
//     const csvWriter = csv({
//         path: 'Bhavya/debug-logs/folder_names.csv',
//         header: [
//           { id: 'Date', title: 'Date' },
//           { id: 'LabName', title: 'Lab Name' },
//           { id: 'FilePath', title: 'File Path' }
//         ]
//       });
//     csvWriter.writeRecords([]) // Write an empty array to initialize the CSV file
//     .then(() => {
//       return printZipFilePaths(directoryPath, csvWriter);
//     })
//     .then(() => {
//       console.log('CSV file created successfully.');
//     })
//     .catch(error => {
//       console.error('An error occurred:', error);
//     });
// }

// const filePath = '/Volumes/Expansion/ToothSketch/April 2023/RT-24 APR 2023/FZ/EXPORT - External/91618_20230421_Cochran.zip';


// unzipCaseFiles(filePath)
//   .then(() => {
//     console.log('Unzipping completed successfully.');
//   })
//   .catch(error => {
//     console.error('An error occurred during unzipping:', error);
//   });

//function to unzip one-by-one

// function processZipFiles(csvFilePath) {
//   const csv = require('csv-parser');
//   const csvWriter = require('csv-writer').createObjectCsvWriter;
//   const fs = require('fs');

//   const outputCsvPath = 'Bhavya/debug-logs/unzip_results.csv';
//   const csvWriterOptions = {
//     path: outputCsvPath,
//     header: [
//       { id: 'FilePath', title: 'File Path' },
//       { id: 'Result', title: 'Result' },
//     ],
//   };

//   const rows = [];
//   const writer = csvWriter(csvWriterOptions)
//   fs.createReadStream(csvFilePath)
//     .pipe(csv())
//     .on('data', (data) => {

//       console.log({data});
//       const filePath = data['File Path'];
//       console.log(filePath);
//       try {
//         // Unzip the file
//         unzipCaseFiles(filePath)
//           .then(() => {
//             let r1 = [{ FilePath: filePath, Result: 'Success' }];
//             console.log({r1});
//             writer.writeRecords(r1);
//             //rows.push({ FilePath: filePath, Result: 'Success' });
//           })
//           .catch((error) => {
//             let r2 = [{ FilePath: filePath, Result: `Error: ${error}` }];
//             console.log({r2});
//             writer.writeRecords(r2);
//             //rows.push({ FilePath: filePath, Result: `Error: ${error}` });
//           });
//       } catch (error) {
//         let r3 = [{ FilePath: filePath, Result: `Error: ${error}` }];
//         writer.writeRecords(r3);
//         //rows.push({ FilePath: filePath, Result: `Error: ${error}` });
//       }
//     })
//     .on('end', () => {
//     });
// }

// // Example usage
// const csvFilePath = 'Bhavya/debug-logs/folder_names.csv';
// processZipFiles(csvFilePath);

const filePath = 'Bhavya/checklist/output_29_FZ.csv';

fs.writeFileSync(filePath, '');

const csvWriter = createCsvWriter({
  path: filePath,
  header: [
    { id: 's_no', title: 'S. No.' },
    { id: 'date', title: 'Date', },
    { id: 'case_name', title: 'Case Name' },
    { id: 'category', title: 'Category' },
    { id: 'tooth_numbers', title: 'Tooth Numbers' },
    { id: 'units', title: 'Units' },
    { id: 'price_per_unit', title: 'Price/Unit' },
    { id: 'total', title: 'Total' }
  ],
  append: true,
});

csvWriter.writeRecords([{
  's_no': 'S No.',
  'date': 'Date',
  'case_name': 'Case Name',
  'category': 'Category',
  'tooth_numbers': 'Tooth Numbers',
  'units': 'Units',
  'price_per_unit': 'Price/Unit',
  'total': 'Total',
}]);
const directoryPath = process.argv[2];
printZipFilePaths(directoryPath, csvWriter);