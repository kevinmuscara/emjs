import path from 'path';
import url from 'url';
import { main } from 'test-runner';

let __filename = url.fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);

main(__dirname);