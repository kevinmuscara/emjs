import assert from 'assert';
import colors from 'colors/safe.js';

import {
  IndexConflictVFSError,
  MalformedDirectoryURIError,
  ServerConfigVFSFile,
  VFS,
  VFSDirectory
} from './vfs.mjs';

import { performance } from 'perf_hooks';

let statusToColor = {
  2: colors.green,
  3: colors.cyan,
  4: colors.yellow,
  5: colors.red  
}

export function makeServer({ wwwRootPath }) {
  let vfs = new VFS(wwwRootPath);
  return serve;

  function serve(request, response) {
    serveAsync(request, response).catch((error) => {
      console.error(`error processing request: ${error.stack}`);
      
      if(error instanceof MalformedDirectoryURIError) {
        response.writeHead(404);
        response.end();
        return;
      }

      if(response.headersSent) response.end();
      else {
        response.writeHead(500);
        response.end(error.stack);
      }
    });
  }

  async function serveAsync(request, response) {
    logRequestResponse(request, response);
    
    if(request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405);
      response.end(`bad method ${request.method}`);
      return;
    }

    if(!request.url.startsWith("/")) {
      response.writeHead(400);
      response.end(`bad URL ${request.url}`);
      return;
    }

    let requestPath = request.url.match(/^[^?]+/)[0];
    let pathLastSlashIndex = requestPath.lastIndexOf("/");
    
    assert.notStrictEqual(pathLastSlashIndex, -1);

    let childName    = requestPath.slice(pathLastSlashIndex + 1);
    let directoryURI = requestPath.slice(0, pathLastSlashIndex + 1);

    let listing = await vfs.listDirectoryAsync(directoryURI);
    let entry = listing.get(childName);

    if(entry === null || entry instanceof VFSDirectory) {
      response.writeHeader(404);
      response.end();
    }
    else if(entry instanceof ServerConfigVFSFile) {
      response.writeHeader(403);
      response.end();
    }
    else if(entry instanceof IndexConflictVFSError) {
      response.writeHeader(409);
      response.end();
    } else {
      let headers = { 'content-type': entry.getContentType() };
      let data = undefined;
      
      if(request.method === 'GET') data = await entry.getContentsAsync();
      
      response.writeHeader(200, headers);
      response.end(data);
    }
  }
}

function logRequestResponse(request, response) {
  let beginTime = performance.now();

  response.on('finish', () => {
    let endtime = performance.now();
    let durationMilliseconds = endtime - beginTime;
    let statusColor = statusToColor[Math.floor(response.statusCode / 100)] ?? colors.red;
    
    console.log(`${request.method} ${request.url} ${statusColor(response.statusCode)} ${durationMilliseconds.toFixed(2)} ms`);
  });
}