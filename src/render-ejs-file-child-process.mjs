import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import url from 'url';

process.on('message', (message, _sendHandle) => {
  let { currnetURI, ejsFilePath } = message;
  let result = renderEJSFileAsync({ currnetURI, ejsFilePath })
    .then((result) => {
      process.send({ cmd: 'result', result });
    })
    .catch((error) => {
      process.send({ cmd: 'error', error });
    });
});

process.on("error", (error) => {
  if (error.code === "EPIPE" || error.code === "ERR_IPC_CHANNEL_CLOSED") parentDied();
  else console.error("child:", error);
});

process.on("disconnect", () => parentDied());
process.send({ cmd: "ready" });

function parentDied() {
  // parent doesn't care about us anymore, exit silently.
  process.exit(0);
}

async function renderEJSFileAsync({ currnetURI, ejsFilePath }) {
  ejsFilePath = path.resolve(ejsFilePath);
  let ejsHTML = await fs.promises.readFile(ejsFilePath, 'utf-8');

  function includer(_path, resolvedPath) {
    // include() (defined by our prelude) will restore the current working directory
    process.chdir(path.dirname(resolvedPath));
  }

  let prelude = `
    let __realInclude  = include;
    include = async function (...args) {
      let oldCWD = process.cwd();
      try {
        /* __realInclude will call includer which will call process.chdir. */
        return await __realInclude(...args);
      } finally {
        process.chdir(oldCWD);
      }
    }
  `;

  prelude = prelude.replace(/\n/g, " ") // preserve line numbers in user code.

  let oldCWD = process.cwd();
  process.chdir(path.dirname(ejsFilePath));

  try {
    return await ejs.render(
      `<% ${prelude} %>${ejsHTML}`, 
      { 
        currnetURI: currnetURI,
        importFileAsync: async(path) => { return await import(url.pathToFileURL(path))},
        makeRelativeURI: (uri) => {
          if(/^\w+:/.test(uri)) return uri;

          let suffix = uri.endsWith('/') ? '/' : "";
          return path.posix.relative(currnetURI, uri) + suffix;
        },
        collapseInteriorWhitespace: (s) => { return s.replace(/\s+/g, " ");}
      },
      {
        async: true,
        compileDebug: true,
        filename: ejsFilePath,
        includer: includer,
      }
    );
  } finally { process.chdir(oldCWD);}
}

