const moment = require('moment');
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function getCurrentDate() {
    return moment();
}

function getCurrentDateString() {
    return getCurrentDate().format('YYYY-MM-DD');
}

function getCurrentTimeString() {
    return getCurrentDate().format('MMMM Do YYYY, h:mm:ss a')
}

function getCreationTimeDateString(
    creationTimeMs, /* could be string or number */
) {
    let d = (new Date(parseInt(creationTimeMs) + (1000 * 60 * 60 * (5.5 - 14))));
    return 'RT-' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

module.exports = {
    getCurrentDateString,
    getCurrentTimeString,
    getCreationTimeDateString
}