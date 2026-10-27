// Render the scene to video frames with headless Chromium.
//   node render.js                      full render -> build/frames.mp4
//   node render.js --stills 1.5,7,20    single frames -> build/still-<t>.jpg
//   node render.js --fps 30 --scale 1 --from 0 --to 10
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const BUILD = path.join(__dirname, "build");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const FPS = Number(args.fps || 30);
const SCALE = Number(args.scale || 1);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".woff2": "font/woff2" };
function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/video/scene/index.html?scale=${SCALE}`;
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("console", (m) => m.type() === "error" && console.error("[page]", m.text()));
  page.on("pageerror", (e) => console.error("[page]", e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
  const duration = await page.evaluate(() => window.duration);

  if (args.stills) {
    for (const t of String(args.stills).split(",").map(Number)) {
      await page.evaluate((t) => window.renderAt(t), t);
      const out = path.join(BUILD, `still-${t}.jpg`);
      await page.screenshot({ path: out, type: "jpeg", quality: 88 });
      console.log(out);
    }
  } else {
    const from = Number(args.from || 0);
    const to = Math.min(Number(args.to || duration), duration);
    const frames = Math.ceil((to - from) * FPS);
    const out = args.out || path.join(BUILD, "frames.mp4");
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS),
      "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", out],
      { stdio: ["pipe", "inherit", "inherit"] });
    const started = Date.now();
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t) => window.renderAt(t), from + f / FPS);
      const buf = await page.screenshot({ type: "jpeg", quality: 93 });
      if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once("drain", ok));
      if (f % 30 === 0) {
        const per = (Date.now() - started) / (f + 1) / 1000;
        console.log(`frame ${f}/${frames}  ${per.toFixed(2)}s/frame  eta ${Math.round(per * (frames - f))}s`);
      }
    }
    ff.stdin.end();
    await new Promise((ok) => ff.on("close", ok));
    console.log("wrote", out);
  }
  await browser.close();
  server.close();
})();
