const moment = require('moment');

module.exports = {
    ROOT_FOLDER: 'D:/Rishabh/ts_internal/Shared Folder',
    CURRENT_DATE_STRING_FN: () => moment().format('YYYY-MM-DD'),
}