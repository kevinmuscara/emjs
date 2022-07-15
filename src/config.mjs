import path from 'path';
import url from 'url';

let __filename = url.fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);

export let websiteConfig = {
  wwwRootPath: path.join(__dirname, "..", "public")
}