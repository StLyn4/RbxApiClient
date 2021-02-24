<h1 align="center">Welcome to Roblox API Client 👋</h1>
<p>
  <img alt="Version" src="https://img.shields.io/badge/version-1.2.1-blue.svg?cacheSeconds=2592000" />
  <a href="https://github.com/StLyn4/RbxApiClient#tutorial" target="_blank">
    <img alt="Documentation" src="https://img.shields.io/badge/documentation-yes-brightgreen.svg" />
  </a>
  <a href="https://github.com/StLyn4/RbxApiClient/graphs/commit-activity" target="_blank">
    <img alt="Maintenance" src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" />
  </a>
  <a href="https://github.com/StLyn4/RbxApiClient/blob/master/LICENSE" target="_blank">
    <img alt="License: MIT" src="https://img.shields.io/github/license/StLyn4/RbxApiClient" />
  </a>
</p>

> Library for working with Roblox Web API, contains a tool for the automatic construction of documented functions

## Install

```sh
yarn install rbx-api-client
```
or
```sh
npm install rbx-api-client
```

## Usage

```sh
yarn run build
```
or
```sh
npm run build
```

## Tutorial

```JavaScript
// Importing an asynchronous factory
import createRBXClient from 'rbx-api-client';

/* ... */

// Creation of a client, which will then be used to call API methods asynchronous
// It takes a token string (.ROBLOSECURITY)
// and a function that will be called if the token is outdated
// (must return a new token and be asynchronous)
// (the second argument is optional)
const RBXClient = await createRBXClient(token, refreshToken);

/* ... */

// After that, you can refer to the Roblox API documentation,
// only with some small changes for better code output.

// In most cases, your IDE should give you hints,
// because each method is documented by Roblox itself

// Methods use named arguments. Therefore, you need to pass them as an object.
// All methods are asynchronous. After their execution, the server response will be received

// EXAMPLE: Send message "Hi 😜" to user with ID 123456789
// Starting a 1v1 dialogue
RBXClient.Chat['v2'].StartOneToOneConversation({
  participantUserId: 123456789
}).then(response => {
  RBXClient.Chat['v2'].SendMessage({
    message: 'Hi 😜',
    conversationId: response.conversation.id,
    // Please note that some parameters are marked as required,
    // but they are not, so you can ignore them by passing null
    decorators: null
  });
}).catch(err => {
  // If an error occurs.
  // For example, if we cannot start a dialogue
  console.error(err.message);
});

// Also, you can send url requests directly
// without worrying about the transfer of tokens using DIRECT (Axios instance).
RBXClient.direct.get('https://api.roblox.com/my/balance').then(response => {
  console.log(`I have ${response.robux} robux!`);
});
```

## Author

👤 **Vsevolod Volkov**

* Github: [@StLyn4](https://github.com/StLyn4)

## 🤝 Contributing

Contributions, issues and feature requests are welcome!<br />Feel free to check [issues page](https://github.com/StLyn4/RbxApiClient/issues). You can also take a look at the [contributing guide](https://github.com/StLyn4/RbxApiClient/blob/master/CONTRIBUTING.md).

## Show your support

Give a ⭐️ if this project helped you!

## 📝 License

Copyright © 2021 [Vsevolod Volkov](https://github.com/StLyn4).<br />
This project is [MIT](https://github.com/StLyn4/RbxApiClient/blob/master/LICENSE) licensed.
