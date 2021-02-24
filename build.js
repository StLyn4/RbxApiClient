'use strict';
// Why is the script executed on the user side and not the author?
// The reason is simple - always up-to-date API.

const fs = require('fs');
const axios = require('axios');
const rimraf = require('rimraf');
const beautify = require('js-beautify');
const { ConcurrencyManager } = require('axios-concurrency');

// How many web requests can occur simultaneously.
// It is not recommended to set too high a value because it will affect stability
const MAX_SIMULTANEOUS_REQUESTS = 30;

const client = axios.create();
ConcurrencyManager(client, MAX_SIMULTANEOUS_REQUESTS);

const currentYear = new Date().getFullYear();

/** The first letter is raised to uppercase, and the rest to lowercase */
 Object.defineProperty(String.prototype, 'toNormalCase', {
   value: function() {
       return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
   },
 });

/**
 * Retrieves a list of APIs from various sources
 * @return {Array<string>} APIs
 */
async function fetchApiList() {
  const apiList = [];
  const requests = [];

  // API addresses to be excluded
  const excludes = [
    'https://friendsite.roblox.com', // UNAVAILABLE
    'roblox.com' // MAIN DOMAIN
  ];

  const sources = [
    /*{ // Disabled due to unavailability :(
      link: 'https://api.roblox.com/docs?useConsolidatedPage=true',
      parser: html => {
        // We are looking for Roblox.EnvironmentUrls = {...} in the code,
        // parse and return the keys where the links will be
        const matches = html.match(/Roblox\.EnvironmentUrls = (\{.*?\})/);
        return Object.keys(JSON.parse(matches[1]));
      }
    },*/
    {
      link: 'https://devforum.roblox.com/t/collected-list-of-apis/557091',
      parser: html => {
        // We are looking for links (excluding aliases),
        // replace the protocol without encryption with the protocol with encryption
        return Array.from(
          html.matchAll(/<li>\s*<a href="(https?:\/\/[a-zA-Z\-]+?\.roblox\.com)">/g)
        ).map(match => match[1]).map(link => link.replace('http:', 'https:'));
      }
    },
    {
      link: 'https://github.com/AntiBoomz/BTRoblox/blob/master/README.md',
      parser: html => {
        return Array.from(
          html.matchAll(/<a href="(https:\/\/[a-zA-Z\-]+?\.roblox\.com)\/docs" rel="nofollow">/g)
        ).map(match => match[1]);
      }
    }
  ];

  for (let source of sources) {
    requests.push(
      axios.get(source.link)
        .then(res => res.data)
        .then(source.parser)
        .then(sourceApiList => {
          for (let api of sourceApiList) {
            // Add the address to the result list only if it is not there yet
            if (apiList.indexOf(api) === -1) {
              apiList.push(api);
            }
          }
        })
        .catch(err => console.warn(`Source "${source.link}" is \x1b[33mnot available\x1b[0m!`))
    );
  }

  // We are waiting for all requests to be completed
  await Promise.all(requests);
  return apiList.filter(api => excludes.indexOf(api) === -1);
}

/**
 * Requests metadata for each endpoint
 * @param  {Array<string>} apisList Links to APIs
 * @return {Object}                 Metadata
 */
async function fetchMeta(apisList) {
  const metaRequests = [];
  const result = {};
  let availableCount = 0;

  for (let url of apisList) {
    metaRequests.push(
      client.get(`${url}/docs/metadata`)
        .then(res => {
          const meta = res.data;
          // Pull API name from address (sub-domain)
          const apiClassNameMatch = url.match(/\/([a-zA-Z\-]+?)\./);
          if (apiClassNameMatch) {
            const apiClassNameRaw = apiClassNameMatch[1];
            let apiClassName = '';
            for(let part of apiClassNameRaw.split('-')) {
              // Normalize the part
              apiClassName += part.toNormalCase();
            }
            result[apiClassName] = { ...meta, url };
            availableCount++;
          }
        })
        .catch(
          // Ignore, unavailable
          err => null
        )
    );
  }

  // Wait until all metadata is received
  await Promise.all(metaRequests);
  return { result, availableCount };
}

/**
 * Creates API class files (one version - one file)
 * @param  {string} name API name
 * @param  {Object} data API data (metadata and version methods)
 */
async function createAPIClasses(name, data) {
  for (let [version, methods] of Object.entries(data.versions)) {
    // If the selected version has no methods (yes, it can be), then we ignore it
    if (methods.length === 0) continue;
    fs.writeFileSync(
      `./dist/apis/${name}_${version.replace(/\.0$/, '')}.js`,
      beautify(
        `// Automatically generated (Vsevolod Volkov ${currentYear}©)

        /**
         * Throws an exception if the value was not overwritten when the function was called
         * @param  {string}      paramName Parameter name
         * @throws {SyntaxError}           A message stating that you must specify the "..." parameter when calling the "..." function
         */
        function required(paramName) {
          throw new SyntaxError(
            \`Required parameter "\${paramName}" of method "\${arguments.callee.caller.name}" is not specified\`
          );
        }

        /** ${data.meta.name}: ${data.meta.description} */
        class ${name}_${version.replace(/\.0$/, '').replace(/\./g, '_')} {
          /**
           * Create endpoint class representation and bind axios client
           * @param {AxiosInstance} client Client for web requests.
           */
          constructor(client) {
            this.client = client;
          }

          ${methods.join('\n\n')}
        }

        module.exports = ${name}_${version.replace(/\.0$/, '').replace(/\./g, '_')};
        `, { indent_size: 2 }
      )
    )
  }
}

/**
 * Creating the main package file
 * @param {Object} apis Data on all APIs
 */
async function createIndex(apis) {
  fs.writeFileSync(
    `./dist/index.js`,
    beautify(
      `// Automatically generated (Vsevolod Volkov ${currentYear}©)
      const createClient = require('./client');

      ${Object.entries(apis).map(([name, data]) => {
        // Note: data.versions[version] points to a list of methods
        return Object.keys(data.versions)
          .filter(version => data.versions[version].length > 0)
          .sort()
          .map(version => version.replace(/\.0$/, '').replace(/\./g, '_'))
          .map(version => {
            return `const ${name}_${version} = require('./apis/${name}_${version}');`;
          }).join('\n');
      }).join('')}

      /** General class for working with Roblox API */
      class RbxApiClient {
        /**
         * [constructor description]
         * @param {string} token                     Authorization token (.ROBLOSECURITY)
         * @param {function():void} [onTokenExpired] Callback function that will be called in case of token expiration
         */
        constructor(token, onTokenExpired) {
          /** Configured Axios web client for direct API calls */
          this.direct = createClient(token, onTokenExpired);

          /* APIs */
          ${Object.entries(apis).map(([name, data]) => {
            const vers = Object.keys(data.versions)
              // Note: data.versions[version] points to a list of methods
              .filter(version => data.versions[version].length > 0)
              .sort()
              .map(version => {
                version = version.replace(/\.0$/, '');
                return `'${version}': new ${name}_${version.replace(/\./g, '_')}(this.direct)`;
              }).join(',\n');

            return `/** ${data.meta.name}: ${data.meta.description} */
            this.${name} = {
              ${vers.length ? vers : '/* No documentation available */'}
            };`;
          }).join('\n\n')}
        }
      }

      /**
       * class factory for RbxApiClient
       * @param {string} token                     Authorization token (.ROBLOSECURITY)
       * @param {function():void} [onTokenExpired] Callback function that will be called in case of token expiration
       * @return {RbxApiClient}                    Will return an instance of the RbxApiClient class
       */
      const createRBXClient = async (token, onTokenExpired) => {
        const RBXClient = new RbxApiClient(token, onTokenExpired);
        try {
          // Definition of ID and nickname.
          // It will also force you to re-login in case of incorrect tokens
          const userInfo = await RBXClient.Users['v1'].Authenticated();
          RBXClient.userID = userInfo.id;
          RBXClient.userName = userInfo.name;
        } catch (err) {
          // onTokenExpired will be called automatically in case of 401 error
          if (!err.status !== 401) {
            throw err;
          }
        }
        return RBXClient;
      };

      module.exports = createRBXClient;
      `, { indent_size: 2 }
    )
  )
}

// ---- Functions for generating methods

/**
 * Returns the contents of the node directly or from a link, if specified
 * @param  {string} docNode Documentation node
 * @param  {Object} schemas All document schemas
 * @return {Object}         Node content
 */
function extractSchemaNode(docNode, schemas) {
  if (docNode.$ref) {
    const schemaName = docNode.$ref.match(/#\/definitions\/(.+)/)[1];
    return schemas[schemaName];
  }
  return docNode;
}

/**
 * Generating information about method parameters and how it should look in the request
 * @param  {string} path       Method relative path
 * @param  {Object} methodInfo Method documentation node
 * @param  {Object} schemas    Document schemas
 * @return {Object}            Parameter information
 */
function buildParamsInfo(path, methodInfo, schemas) {
  const params = [];
  const pathParams = {};
  let isMapped = false;

  if (methodInfo.parameters) {
    for (let param of path.matchAll(/\{([a-zA-Z\-]+).*?\}/g)) {
      pathParams[param[1]] = param[0];
    }

    // Process the required parameters first
    methodInfo.parameters.sort(param => param.required ? -1 : 1);

    if (methodInfo.parameters.length === 1 && methodInfo.parameters[0].schema) {
      const param = methodInfo.parameters[0];
      const schema = extractSchemaNode(param.schema, schemas);
      const out = {
        param: param.name,
        location: pathParams[param.name] ? 'path' : param.in
      };

      if (schema.type === 'object') {
        for (let [name, propInfo] of Object.entries(schema.properties)) {
          let paramType = propInfo.type;

          if (paramType === 'array') {
            const items = extractSchemaNode(propInfo.items, schemas);
            paramType = `array<${items.type}>`;
          }

          isMapped = true;
          params.push({
            name: name.split(/\-|\./)
                      .map((part, index) => index ? part.toNormalCase() : part)
                      .join(''),
            type: propInfo.type,
            description: propInfo.description || '',
            out: out,
            required: true
          });
        }
      }
    } else {
      for (let param of methodInfo.parameters) {
        let paramType;
        const out = {
          param: param.name,
          location: pathParams[param.name] ? 'path' : param.in
        };

        if (param.schema) {
          const schema = extractSchemaNode(param.schema, schemas);
          if (schema.type === 'array') {
            const items = extractSchemaNode(schema.items, schemas);
            paramType = `array<${items.type}>`;
          } else {
            paramType = schema.type;
          }
        } else {
          paramType = param.type;
        }

        params.push({
          name: param.name.split(/\-|\./)
                          .map((part, index) => index ? part.toNormalCase() : part)
                          .join(''),
          type: paramType,
          description: param.description || '',
          out: out,
          enum: param.enum ? param.enum.map(value => `'${value}'`) : null,
          required: Boolean(param.required)
        });
      }
    }
  }

  return { params, pathParams, isMapped };
}

/**
 * Generating documentation for the method
 * @param  {string}  description Method description
 * @param  {Boolean} deprecated  Is the method deprecated
 * @param  {Array}   params      Parameters
 * @return {string}              Documentation
 */
function buildMethodDoc(description, deprecated, params) {
  // If the method has parameters or is deprecated, then create a full version
  if (params.length || deprecated) {
    return [
      `/** ${description || 'No description'}`,
      deprecated ? '* @deprecated' : '',
      ...params.map(param => {
        const enumOrType = param.enum ? `(${param.enum.join('|')})` : param.type;
        const name = param.required ? param.name : `[${param.name}]`;
        return `* @param {${enumOrType}} ${name} ${param.description}`;
      }),
      '*/'
    ].filter(Boolean).join('\n');
  }
  // If not, then just write down the description
  return `/** ${description || 'No description'} */`;
}

/**
 * Generates a name for a method based on a relative path
 * @param  {string} apiClassName The name of the class that the method belongs to
 * @param  {string} path         Method relative path
 * @return {string}              Method name for the class
 */
function buildMethodName(apiClassName, path) {
  let name = '';
  const parts = path.split(/-|\//)
                    // Don't include empty values
                    .filter(Boolean)
                    // Don't include parameters and version in the name
                    .filter(part => {
                      return !/^v(\d|.)+$/.test(part) && !/^\{.*?\}$/.test(part);
                    });

  for (let part of parts) {
    // If the first word is the name of the class, then we ignore it
    if (!name && parts.length > 1 && RegExp(apiClassName, 'i').test(part)) {
      continue;
    }
    name += part.toNormalCase();
  }
  return name;
}

/**
 * Builds a string of named parameters
 * @param  {string} methodName Method name
 * @param  {Array}  params     Parameters
 * @return {string}            A string of named parameters
 */
function buildMethodParams(params) {
  const resultParams = [];

  for (let param of params) {
    resultParams.push(
      // If you do not pass a required argument to the method, an error will be raised
      `${param.name} = ${param.required ? `required('${param.name}')` : null}`
    );
  }

  return resultParams.length ? `{ ${resultParams.join(', ')} } = {}` : '';
}

/**
 * Method body generation
 * @param  {string}  fullURL    Full address of the method (https://<>.roblox.com/...)
 * @param  {string}  methodType Method for working with endpoint (GET, POST, PATCH etc)
 * @param  {Array}   params     Parameters
 * @param  {Object}  pathParams Information about the parameters that will be written to the address
 * @param  {Boolean} isMapped   Do we need to group parameters
 * @return {string}             Method body
 */
function buildMethodBody(fullURL, methodType, params, pathParams, isMapped) {
  let reqBody = null;
  const reqParams = [];
  const reqHeaders = [];

  if (isMapped) {
    let out;
    // Combining variables into one object
    const param = `{${
      params.map(param => {
              out = param.out;
              return `'${param.name}': ${param.name}`;
            }).join(',\n')
    }}`;

    if (out.location === 'path') {
      fullURL = fullURL.replace(pathParams[out.param], param);
    } else if (out.location === 'query') {
      reqParams.push(`'${out.param}': ${param}`);
    } else if (out.location === 'header') {
      reqHeaders.push(`'${out.param}': ${param}`);
    } else if (out.location === 'body') {
      reqBody = param;
    } else {
      throw new Error('Unsupported parameter location: ' + out.location);
    }
  } else {
    for (let param of params) {
      if (param.out.location === 'path') {
        fullURL = fullURL.replace(pathParams[param.out.param], `\${${param.name}}`);
      } else if (param.out.location === 'query') {
        reqParams.push(`'${param.out.param}': ${param.name}`);
      } else if (param.out.location === 'header') {
        reqHeaders.push(`'${param.out.param}': ${param.name}`);
      } else if (param.out.location === 'body') {
        if (reqBody) { throw new Error(param); }
        reqBody = param.name;
      } else if (param.out.location === 'formData') {
        reqBody = param.name;
        reqHeaders.push(`...(${param.name} ? ${param.name}.getHeaders() : {})`);
      } else {
        throw new Error('Unsupported parameter location: ' + param.out.location);
      }
    }
  }

  return `return this.client({
    ${
      [
        `method: '${methodType.toLowerCase()}'`,
        `url: \`${fullURL}\``,
        reqBody ? `data: ${reqBody}` : null,
        reqParams.length ? `params: {${reqParams.join(',\n')}}` : null,
        reqHeaders.length ? `headers: {${reqHeaders.join(',\n')}}` : null
      ].filter(Boolean).join(',\n')
    }
  });`;
}

/**
 * Generation of all endpoint methods
 * @param  {string} apiClassName Base endpoint link
 * @param  {string} url          Base endpoint link
 * @param  {string} path         Method relative path
 * @param  {Object} methodInfo   Method Information (Swagger format)
 * @return {string}              Class method as string
 */
function buildEndpoint(apiClassName, url, path, endpointData, schemas) {
  const methodTypes = Object.entries(endpointData);
  const methods = [];

  for (let [methodType, methodInfo] of methodTypes) {
    const { params, pathParams, isMapped } = buildParamsInfo(path, methodInfo, schemas);
    const mathodDoc = buildMethodDoc(methodInfo.summary, methodInfo.deprecated, params);
    const methodName = buildMethodName(apiClassName, path);
    const methodParams = buildMethodParams(params);
    const methodBody = buildMethodBody(url + path, methodType, params, pathParams, isMapped);
    methodType = methodTypes.length > 1 ? methodType.toNormalCase() : '';

    methods.push(`${mathodDoc}
    ${methodType}${methodName}(${methodParams}) {
      ${methodBody}
    }`);
  }

  return methods.join('\n\n');
}

// ---- --------------------------------

/**
 * Building an API tree
 * @param  {Object} apis Metadata
 * @return {Object}      API tree
 */
async function buildApiTree(apis) {
  const docsRequests = [];
  const apisTree = {};

  for (let [apiName, data] of Object.entries(apis)) {
    apisTree[apiName] = {
      meta: data,
      versions: {}
    };
    for (let version of data.versions) {
      docsRequests.push(
        // Request documentation for each method of each endpoint version
        client.get(`${data.url}/docs/json/${version}`)
          .then(res => {
            const doc = res.data;
            const methods = [];
            for (let [path, methodData] of Object.entries(doc.paths)) {
              // code generation
              methods.push(
                buildEndpoint(apiName, data.url, path, methodData, doc.definitions)
              );
            }
            apisTree[apiName].versions[version] = methods;
          })
      );
    }
  }

  // Wait until all the documentation is loaded, and the methods are generated
  await Promise.all(docsRequests);
  return apisTree;
}

/**
 * Creating files based on the received data
 * @param  {Object} apis Data on all APIs (API tree)
 */
async function createAPI(apis) {
  // Recursive cleaning of the working area
  if (fs.existsSync('./dist/apis')) rimraf.sync('./dist/apis');
  if (fs.existsSync('./dist/index.js')) rimraf.sync('./dist/index.js');

  // dist always exists, but apis does not
  fs.mkdirSync('./dist/apis');

  const creations = [
    createIndex(apis)
  ];

  for (let [name, versions] of Object.entries(apis)) {
    creations.push(
      createAPIClasses(name, versions)
    );
  }

  await Promise.all(creations);
}

/** Main script function, works asynchronously */
async function main() {
  console.log('Request for a list of Roblox endpoints...\nIt can take some time. \x1b[33m\x1b[4mPlease, wait.\x1b[0m');
  const apisList = await fetchApiList();

  if (apisList.length) {
    const { result: apis, availableCount: available } = await fetchMeta(apisList);
    console.log(`Done. \x1b[32m${available} / ${apisList.length}\x1b[0m endpoints are available.`);

    console.log('Construction of the API tree.');
    const apisTree = await buildApiTree(apis);

    console.log('The tree is ready. File generation started.');
    await createAPI(apisTree);

  } else {
    throw new Error('API list not found.');
  }
}

main()
  .then(
    res => console.log('\x1b[32mAPI was successfully built.\nHave a nice day! :)\x1b[0m')
  )
  .catch(
    err => console.error(`\x1b[31mAn error was detected while building the API: \x1b[4m${err.message}\x1b[0m`)
  );
