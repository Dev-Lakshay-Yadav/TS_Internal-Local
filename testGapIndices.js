const case_units = [1,2,3,6,7,8].map(n => ({tooth_number: n}));
case_units.sort((a, b) => a.tooth_number - b.tooth_number);
const gapIndices = [0];
for (let i=1; i<case_units.length; i++) {
    if (case_units[i].tooth_number > (case_units[i-1].tooth_number + 1)) {
        gapIndices.push(i);
    }
}
gapIndices.push(case_units.length);
let toothNumbersStr = case_units.length === 1 ? case_units[0].tooth_number : '';
for (let i=1; i<gapIndices.length; i++) {
    toothNumbersStr += `${case_units[gapIndices[i-1]].tooth_number}-${case_units[gapIndices[i]-1].tooth_number},`
}
console.log(toothNumbersStr.slice(0,-1));