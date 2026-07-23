#!/usr/bin/env node
/* Assemble static pages from shared head/header/footer partials + per-page content.
   Usage: node _build/build.js
   Reads _build/manifest.json, writes <slug>.html at the project root. */
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);
const BUILD = path.join(ROOT, "_build");

function read(p) {
  return fs.readFileSync(p, "utf-8");
}

function main() {
  const headTpl = read(path.join(BUILD, "partials", "head.html"));
  const header = read(path.join(BUILD, "partials", "header.html"));
  const footer = read(path.join(BUILD, "partials", "footer.html"));
  const manifest = JSON.parse(read(path.join(BUILD, "manifest.json")));

  manifest.forEach((page) => {
    const content = read(path.join(BUILD, "content", page.content));
    const head = headTpl.replace(/{{TITLE}}/g, page.title).replace(/{{DESC}}/g, page.desc);
    const html = head + header + content + footer;
    const outPath = path.join(ROOT, page.slug + ".html");
    fs.writeFileSync(outPath, html, "utf-8");
    console.log("built", page.slug + ".html");
  });
}

main();
