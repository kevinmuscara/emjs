import assert from 'assert';
import esbuild from 'esbuild';
import fs from 'fs';
import mime from 'mime';
import os from 'os';
import path, { relative } from 'path';
import url from 'url';

import { readFileSync } from 'fs';
import { renderEJSFileAsync } from './router.mjs';

export class VFS {
  constructor(rootPath) {
    this._rootPath = rootPath;
  }

  async listDirectoryAsync(uri) {
    if(!uri.startsWith('/') || !uri.endsWith('/')) throw new MalformedDirectoryURIError(uri);
    
    let parts = uri.split('/');
    if(parts.includes('.') || parts.includes('..')) throw new MalformedDirectoryURIError(uri);

    let listing = new DirectoryListing();
    if(parts.some((p) => isIgnoredDirectoryComponent(p))) return listing;

    await this._loadFromRealFilesystemAsync(uri, listing);
    await this._loadFromIndexScriptsAsync(uri, listing);
    
    return listing;
  }

  async _loadFromRealFilesystemAsync(uri, listing) {
    let dirPath = path.join(this._rootPath, uri);
    let fsChildren;

    try {
      fsChildren = await fs.promises.readdir(dirPath, {
        encoding: 'utf-8',
        withFileTypes: true,
      });
    } catch(error) {
      if(error.code === 'ENOENT' || error.code === "ENOTDIR") return;
      else throw error;
    }

    for(let fsChild of fsChildren) {
      if(fsChild.isDirectory()) {
        if(isIgnoredDirectoryComponent(fsChild.name)) {} else {
          listing._addChild(fsChild.name, new VFSDirectory(uri, fsChild.name));
        }
      } else {
        if(fsChild.name === 'index.html') listing._addChild("", new StaticVFSFile(path.join(dirPath, "index.html")));
        else if(fsChild.name === 'index.ejs.html') listing._addChild("", new EJSVFSFile(path.join(dirPath, 'index.ejs.html'), uri));
        else if(fsChild.name === 'index.mjs') {
          // imported later
        }
        else if(fsChild.name === '.htaccess') listing._addChild(fsChild.name, new ServerConfigVFSFile(path.join(dirPath, fsChild.name)));
        else if(/\.ejs\.html$/.test(fsChild.name)) {
          // do not server ejs-built html files directly.
        } else if (path.extname(fsChild.name) === '' || fsChild.name.startsWith('.') || /\.md$/.test(fsChild.name)) {
          // ignore
        } else listing._addChild(fsChild.name, new StaticVFSFile(path.join(dirPath, fsChild.name)))
      }
    }
  }

  async _loadFromIndexScriptsAsync(uri, listing) {
    for(let currentURI of uriAncestry(uri)) {
      let indexScriptPath = path.join(this._rootPath, currentURI, 'index.mjs');
      await this._loadFromIndexScriptsAsync(uri, indexScriptPath, listing);
    }
  }

  async _loadFromIndexScriptsAsync(uri, indexScriptPath, listing) {
    let routes;

    try {
      let indexModule = await import(url.pathToFileURL(indexScriptPath));
      routes = indexModule.routes;
    } catch(e) {
      if(e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'ENOTDIR') return;
      else throw e;
    }

    for(let routeURI in routes) {
      if(!Object.prototype.hasOwnProperty.call(routes, routeURI)) continue;
      if(!routeURI.startsWith(uri)) continue;

      let relativeRouteURI = routeURI.replace(uri, "");
      if(/\//.test(relativeRouteURI)) {
        let name = relativeRouteURI.split('/')[0];
        listing._addChild(name, new VFSDirectory(uri, name));
      } else {
        let route = routes[routeURI];
        let childEntry = route;

        if(typeof route === 'object' && Object.prototype.hasOwnProperty.call(route, 'type')) {
          switch(route.type) {
            case "build-ejs":
              // path should be relative to indexScriptPath's parent directory instead.
              childEntry = new EJSVFSFile(path.join(this._rootPath, route.path), routeURI);
              break;
            case "esbuild":
              // path should be relative to indexScriptPath's parent directory instead.
              childEntry = new ESBuildVFSFile({
                ...route.esbuildConfig,
                entryPoints: route.esbuildConfig.entryPoints.map((uri) => path.join(this._rootPath, uri))
              });
              break;
            default:
              break;
          }
        }
        listing._addChild(relativeRouteURI, childEntry);
      }
    }
  }
}

export class DirectoryListing {
  constructor() {
    this._entries = {};
  }

  names() {
    return Object.keys(this._entries).sort();
  }

  get(name) {
    if(!Object.prototype.hasOwnProperty.call(this._entries, name)) return null;

    return this._entries[name];
  }

  _addChild(name, vfsEntry) {
    if(Object.prototype.hasOwnProperty.call(this._entries, name)) {
      let existingEntry = this._entries[name];
      if(name === '') this._entries[""] = new IndexConflictVFSError([existingEntry, vfsEntry]);
      else if(existingEntry instanceof VFSDirectory && vfsEntry instanceof VFSDirectory) {
        // conflicting directories are okay.
      } else throw new Error(`conflict for ${name}`);
    } else this._entries[name] = vfsEntry;
  }
}

export class VFSEntry {}

export class StaticVFSFile extends VFSEntry {
  constructor(path) {
    super();

    this._path = path;
  }

  get path() {
    return this._path;
  }

  async getContentsAsync() {
    return await fs.promises.readFile(this._path);
  }

  getContentType() {
    return mime.getType(this._path);
  }
}

export class EJSVFSFile extends VFSEntry {
  constructor(path, uri) {
    super();

    this._path = path;
    this._uri = uri; 
  }

  get path() {
    return this._path;
  }

  async getContentsAsync() {
    let data = await renderEJSFileAsync(this._path, { currentURI: this._uri });
    return Buffer.from(data);
  }

  getContentType() {
    return "text/html";
  }
}

// .js file generated by ESBuild
export class ESBuildVFSFile extends VFSEntry {
  constructor(esbuildConfig) {
    super();

    this._esbuildConfig = esbuildConfig;
  }

  get config() {
    return this._esbuildConfig;
  }

  async getContentsAsync() {
    let temporaryDirectory = await fs.promises.mkdtemp(os.tmpdir() + path.sep);

    try {
      let bundlePath = path.join(temporaryDirectory, 'bundle.js');
      await esbuild.build({ ...this._esbuildConfig, bundle: true, outfile: bundlePath });
      return await readFileSync(bundlePath);
    } finally {
      fs.promises.rmdir(temporaryDirectory, { recursive: true });
    }
  }

  getContentType() {
    return "application/javascript";
  }
}

// when directory uri has multiple sources.
export class IndexConflictVFSError extends VFSEntry {
  constructor(conflictingVFSEntries) {
    super();

    this._conflictingVFSEntries = conflictingVFSEntries;
  }

  get conflictingPaths() {
    return this._conflictingVFSEntries.map((entry) => entry.path);
  }
}

// subdir
export class VFSDirectory extends VFSEntry {
  constructor(baseURI, name) {
    super();

    this._baseURI = baseURI;
    this._name = name;
  }

  get uri() {
    return `${this._baseURI}${this._name}/`;
  }
}

// A server configuration that should be copied but not served (.htaccess (for Apache httpd))
export class ServerConfigVFSFile extends StaticVFSFile {}

export class MalformedDirectoryURIError extends Error {
  constructor(uri) {
    super(`malformed directory URI: ${uri}`);
  }
}

// export for testing only
export function uriAncestry(uri) {
  let result = [];

  for(;;) {
    result.push(uri);
    if(uri === '/') break;
    
    let slashIndex = uri.lastIndexOf('/', uri.length - 2);
    assert.notStrictEqual(slashIndex, -1);
    uri = uri.substr(0, slashIndex + 1);
  }
  return result;
}

function isIgnoredDirectoryComponent(name) {
  return name.startsWith('.') || name === 'node_modules';
}