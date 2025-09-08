const { getClient } = require('./box_connectors/box_client.js');
const { processCases } = require('./ts_portal_box_cases_downloader.js');

getClient(client => {
    processCases(client);
})