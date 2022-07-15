import assert from 'assert';
import child_process from 'child_process';
import path from 'path';
import url from 'url';

let __filename = url.fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);

export async function renderEJSFileAsync(ejsFilePath, { currentURI }) {
  let childProcess = await renderEJSChildProcessPool.takeAsync();
  try {
    let page = await childProcess.renderAsync({ currentURI, ejsFilePath });
    let pagePostProcess = page.replace(/<script>\s*\/\/\s*<\/script>/g, "");
    return pagePostProcess;
  } finally {
    renderEJSChildProcessPool.recycle(childProcess);
  }
}

class RenderEJSChildProcess {
  constructor({ child }) {
    this._child = child;

    this._errorPromise = new Promise((resolve, reject) => {
      child.on('message', (message, _sendHandle) => {
        if(message.cmd === 'error') reject(message.error);
      });

      child.on("close", (_code, _signal) => reject(new Error("worker exited without returning a response")));
      child.on("exit", (_code, _signal) => reject(new Error("worker exited without returning a response")));
      child.on("error", (error) => reject(error));
      child.on("disconnect", () => reject(new Error("worker disconnected without returning a response")));

      this._readyPromise = new Promise((resovle, reject) => {
        child.on('message', (message, _sendHandle) => {
          if(message.cmd === 'ready') resolve();
        });
      });

      this._resultPromise = new Promise((resolve, reject) => {
        child.on('message', (message, _sendHandle) => {
          if(message.cmd === 'result') resolve(message.result);
        });
      });
    });
  }

  async waitForReadyAsync() {
    return await Promise.race([this._readyPromise, this._errorPromise]);
  }

  async renderAsync({ currentURI, ejsFilePath }) {
    let sent = this._child.send({ currentURI, ejsFilePath });
    assert.ok(sent);

    return await Promise.race([this._resultPromise, this._errorPromise]);
  }

  static fork() {
    let child = child_process.fork(path.join(__dirname, 'render-ejs-file-child-process.mjs'), [], { serialization: 'advanced'});
    return new RenderEJSChildProcess({ child: child });
  }
}

class RenderEJSChildProcessPool {
  constructor() {
    let processCount = 6;

    this._processes = [];
    for(let i = 0; i < processCount; ++i) {
      this._forkProcess();
    }
  }

  async takeAsync() {
    if(this._processes.length === 0) {
      this._forkProcess();
    }

    let process = this._processes.shift();
    await process.waitForReadyAsync();
    return process;
  }

  recycle(_process) {
    this._forkProcess();
  }

  _forkProcess() {
    this._processes.push(RenderEJSChildProcess.fork());
  }
}

let renderEJSChildProcessPool = new RenderEJSChildProcessPool();