const moment = require('moment');

function getCurrentDate() {
    return moment().subtract('days', 2);
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
    return (new Date(parseInt(creationTimeMs) + (1000 * 60 * 60 * 5.5))).toJSON().split('T')[0];
}

module.exports = {
    getCurrentDateString,
    getCurrentTimeString,
    getCreationTimeDateString
}