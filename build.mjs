// Assemble le dossier publié par Netlify : app à la racine, page mobile sous /mobile, assets de démo.
import { mkdirSync, copyFileSync, cpSync, rmSync } from "node:fs";
rmSync("site", { recursive: true, force: true });
mkdirSync("site/mobile", { recursive: true });
copyFileSync("inspecto front.html", "site/index.html");
copyFileSync("mobile/index.html", "site/mobile/index.html");
cpSync("demo", "site/demo", { recursive: true });
console.log("site/ pret");
