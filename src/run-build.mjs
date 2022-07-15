import fs from 'fs';
import path from 'path';
import promiseLimit from 'promise-limit';
import { websiteConfig } from './config.mjs';

import {
  IndexConflictVFSError, 
  MalformedDirectoryURIError,
  ServerConfigVFSFile,
  VFS,
  VFSDirectory
} from './vfs.mjs';

let maxConcurrentJobs = 8;
let semaphore = promiseLimit(maxConcurrentJobs);

async function mainAsync() {
  let { targetDirectory } = parseArgs(process.argv.slice(2));

  let wwwRootPath = websiteConfig.wwwRootPath;
  let vfs = new VFS(wwwRootPath);

  await buildDirAsync(vfs, '/', targetDirectory);

  process.exit(0);
}

async function buildDirAsync(vfs, uri, outputDirectory) {
  let listing = await vfs.listDirectoryAsync(uri);
  await fs.promises.mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    listing.names().map(async (childName) => {
      let child = listing.get(childName);
      let childPath = path.join(
        outputDirectory,
        childName === "" ? "index.html" : childName
      );
      if (child instanceof VFSDirectory) {
        await buildDirAsync(vfs, `${uri}${childName}/`, childPath);
      } else if (child instanceof IndexConflictVFSError) {
        throw child;
      } else {
        await semaphore(async () => {
          console.log(`generating ${childPath} ...`);
          let data = await child.getContentsAsync();
          await fs.promises.writeFile(childPath, data);
        });
      }
    })
  );
}

function parseArgs(args) {
  let targetDirectory;
  switch (args.length) {
    case 1:
      targetDirectory = args[0];
      break;

    default:
      throw new Error("Expected exactly 1 argument");
  }
  return { targetDirectory };
}

mainAsync().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});
