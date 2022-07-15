export function listenAsync(server, ...args) {
  return new Promise((resolve, reject) => {
    server.listen(...args);

    function onError(error) {
      removeListeners();
      reject(error);
    }

    function onListening() {
      removeListeners();
      resolve();
    }

    function removeListeners() {
      server.removeListener("error", onError);
      server.removeListener("listening", onListening);
    }

    server.on("error", onError);
    server.on("listening", onListening);
  });
}

export function urlFromServerAddress(address) {
  if(typeof address !== 'object') throw new Error(`Expected an AF_INET or AF_INET6 address, but got ${address}`);

  let url = new URL(`http://localhost/`);
  
  switch(address.family) {
    case "IPv4":
      url.hostname = address.address;
      break;
    case "IPv6":
      url.hostname = `[${address.address}]`;
      break;
    default:
      throw new Error(`Expected an AF_INET or AF_INET6 address, but got an ${address.family} address`);
  }

  url.port = String(address.port);
  return url;
}