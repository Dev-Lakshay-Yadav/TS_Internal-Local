// module.exports = {
// INCOMING_CASES_QUERY: 'https://www.toothsketch.com/wp-json/my-route/case-details-for-queue/?test_key=0Wbjj49mZtRZ5YtcShGaIb10JbdNxEtezdZi2eios4w0TDcxPjRC',
// INCOMING_REDESIGNS_QUERY: 'https://www.toothsketch.com/wp-json/my-route/case-details-for-redesign-queue/?test_key=0Wbjj49mZtRZ5YtcShGaIb10JbdNxEtezdZi2eios4w0TDcxPjRC',
// UPDATE_REDESIGN_STATUS_ENDPOINT: 'https://www.toothsketch.com/wp-json/my-route/update-redesign-status/',
// CONSTANTS_POST_ENDPOINT: 'https://www.toothsketch.com/wp-json/my-route/set-constant/',
// CONSTANTS_GET_ENDPOINT: 'https://www.toothsketch.com/wp-json/my-route/get-constant/',
// }

// Lakshay testing
// const BASE_URL = "https://ts-gcp-app-687220600374.us-central1.run.app/api/localUploader";
const BASE_URL = "http://localhost:8080/api/localUploader";

module.exports = {
  INCOMING_CASES_QUERY: `${BASE_URL}/all-cases/0Wbjj49mZtRZ5YtcShGaIb10JbdNxEtezdZi2eios4w0TDcxPjRC`,
  INCOMING_REDESIGNS_QUERY: `${BASE_URL}/redesign-cases/0Wbjj49mZtRZ5YtcShGaIb10JbdNxEtezdZi2eios4w0TDcxPjRC`,
  UPDATING_CASEFILES_AND_CASEUNITS: `${BASE_URL}/add-casefiles`,
  UPDATE_REDESIGN_STATUS_ENDPOINT: `${BASE_URL}/update-redesign-status`,
  CONSTANTS_POST_ENDPOINT: `${BASE_URL}/set-constants`,
  CONSTANTS_GET_ENDPOINT: `${BASE_URL}/get-constants/`,
};
