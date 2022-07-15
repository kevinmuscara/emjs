import http from 'http';
import path from 'path';
import url  from 'url';

import { listenAsync, urlFromServerAddress } from './net.mjs';
import { makeServer } from './server.mjs';
import { websiteConfig } from './config.mjs';

let __filename = url.fileURLToPath(import.meta.url);
let __dirname  = path.dirname(__filename); 

let DEFAULT_PORT = 80;

async function mainAsync() {
  let { host, port } = parseArgs(process.argv.slice(2));

  let server = http.createServer(makeServer(websiteConfig));
  await listenAsync(server, { host, port });

  console.log(`Server running ${urlFromServerAddress(server.address())}`);
}

function parseArgs(args) {
  let host = '0.0.0.0';
  let port = DEFAULT_PORT;

  switch(args.length) {
    case 0:
      break;
    case 1:
      port = parseInt(args[0]);
      if(isNaN(port)) throw new Error(`Expected port number, but got: ${args[0]}`);
      break;
    case 2:
      host = args[0];
      port = parseInt(args[1]);
      if(isNaN(port)) throw new Error(`Expected port number, but got: ${args[1]}`);
      break;
    default:
      throw new Error(`Too many arguments; expected 0, 1, or 2`);
  }

  return { host, port }
}

mainAsync().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});