const axios = require('axios');
const BoxSDK = require('box-node-sdk');
const qs = require('qs');


let access_token = {value: '', expires_ts: 0};
let client;

const sdk = new BoxSDK({
    clientID: '2kzp5rjdnwyvqnjoecwv606cb7xk9xju',
    clientSecret: 'd57GMWW3YMAplzSq960J32qcRv5epppW'
});

function getAccessToken(
    cb, /* (token) => void */
    force = false, /* boolean, forces refetch */
) {
    if (
        !force
        && access_token.expires_ts < (new Date()).getTime() 
        && !!access_token.value
    ) {
        cb(access_token.value);
        return;
    }

    axios.post(
        'https://api.box.com/oauth2/token',
        qs.stringify({
            client_id: 'nvsyh9wt882bklxumxuk95j4tmv3d6gr',
            client_secret: 'zpPs7zMFNxx9HSy35iQhO7OL3xaR3aO2',
            grant_type: 'client_credentials',
            box_subject_type: 'enterprise',
            box_subject_id: 943437932,
            scopes: 'base_upload',
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        },
    ).then(response => {
        access_token = {
            value: response.data.access_token,
            expires_ts: 
                (new Date()).getTime() // current time
                + (response.data.expires_in * 1000) // sec to msec
                - (60 * 5 * 1000), // leave 5 minute buffer
        };
        cb(access_token.value);
    });
}

function getClient(cb) {
    if (client && access_token.expires_ts > ((new Date()).getTime() + (60 * 5 * 1000))) { 
        cb(client); 
        return;
    }
    getAccessToken((token) => {
        client = BoxSDK.getBasicClient(token);
        cb(client);
    });
}

module.exports = { getClient }