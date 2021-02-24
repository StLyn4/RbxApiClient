const axios = require('axios');
const qs = require('qs');

// URL (POST-method) from which the X-CSRF token will be taken
const XCSRFEndpoint = 'https://auth.roblox.com/v2/logout';

/**
 * returns configured axios instance
 * @param {string} token                     Authorization token (.ROBLOSECURITY)
 * @param {function():void} [onTokenExpired] Callback function that will be called in case of token expiration
 * @return {[AxiosInstance]}                 Will return the configured Axios instance
 */
const createClient = (token, onTokenExpired) => {
  // Attach an authorization token to every request
  const client = axios.create({
    headers: { Cookie: `.ROBLOSECURITY=${token};` },
    paramsSerializer: params => {
      return qs.stringify(params, { arrayFormat: 'repeat' })
    }
  });

  // If successful, return the information itself, without data about the request, etc
  client.interceptors.response.use(res => res.data, err => {
    if (err.config && err.response) {
      // if authorization is lost (cookies are invalid / outdated)
      // A session shouldn't be out of date in the middle of a job, usually.
      // If this happens, then an error will occur, which can be handled
      // (for example, when logging into the application), or not.
      // In any case, a callback will be called if it exists
      if (err.response.status === 401) {
        // Call callback if it exists
        onTokenExpired && onTokenExpired();
      // Updating X-CSRF token
      } else if (err.response.status === 403) {
        if (err.config.url !== XCSRFEndpoint) {
          // request after FAILURE of which the token will be received in the header
          // If the token is received, then the error will be processed
          // and it will be possible to execute "then", otherwise an unhandled error will occur
          // with a message stating that the endpoint needs to be updated
          return client.post(XCSRFEndpoint).then(
            // retry with new token
            () => client.request(err.config)
          );
        // if we make a request for an endpoint from which we will receive a token
        } else {
          const XCSRF = err.response.headers['x-csrf-token']
          if (XCSRF) {
            client.defaults.headers.common['X-CSRF-TOKEN'] = XCSRF;
            return;
          } else {
            // if the endpoint hasn't attached a token
            return Promise.reject('Cannot get X-CSRF-TOKEN, change API endpoint');
          }
        }
      }
      const errors = err.response.data.errors;
      if (errors && errors.length) {
        err.message = `${err.message}: ${errors[0].message}`;
      }
    }
    return Promise.reject(err);
  });

  return client;
};

module.exports = createClient;
