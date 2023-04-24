#!/usr/bin/env node

const axios = require("axios");
const querystring = require("querystring");
const ssh2 = require("ssh2");
const fs = require("fs");
const util = require("util");
const path = require("path");

require("dotenv").config();

function translate(target_lang, text) {
  return axios.default
    .post(
      "https://api-free.deepl.com/v2/translate",
      querystring.stringify({
        text,
        target_lang,
      }),
      {
        headers: {
          Authorization: `DeepL-Auth-Key ${process.env.DEEPL_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    )
    .then((r) => r.data.translations[0].text);
}

async function translateSRT(targetLang, inPath, outPath) {
  console.log("Translating the transcript...");
  const str = fs.readFileSync(inPath, "utf8");
  const tstr = str
    .split("\n\n")
    .map((s) => s.split("\n")[2])
    .join("\n");

  const txt = await translate(targetLang, tstr);
  const stxt = txt.split("\n");

  const outstr = str
    .split("\n\n")
    .map((s, idx) => {
      const r = s.split("\n");
      r[2] = stxt[idx];
      return r.join("\n");
    })
    .join("\n\n");

  fs.writeFileSync(outPath, outstr);

  console.log("Done.");
}

function jarvislabs(f, body = {}) {
  return axios.default
    .post(
      `https://backendprod.jarvislabs.ai:8000/${f}`,
      JSON.stringify({
        ...body,
        jwt: process.env.JARVISLABS_KEY,
        user_id: process.env.JARVISLABS_UID,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    )
    .then((r) => r.data);
}

const conn = new ssh2.Client();

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        return reject(err);
      }
      stream
        .on("close", (code, signal) => {
          resolve();
        })
        .on("data", (data) => {
          process.stdout.write(data);
        })
        .stderr.on("data", (data) => {
          process.stderr.write(data);
        });
    });
  });
}

const sshSFTP = util.promisify(conn.sftp.bind(conn));

function transcribe({
  port,
  host,
  langIn,
  filePath,
  outFile,
  privKeyPath,
  passphrase,
}) {
  return new Promise((resolve, reject) => {
    conn
      .on("error", (err) => reject(err))
      .on("ready", async () => {
        console.log("Connected to an instance");
        console.log("Installing dependencies...");
        await sshExec(conn, "apt update");
        await sshExec(
          conn,
          "DEBIAN_FRONTEND=noninteractive apt install ffmpeg -y"
        );
        await sshExec(
          conn,
          "pip install git+https://github.com/m-bain/whisperx.git"
        );
        await sshExec(conn, "pip install scipy --upgrade");

        console.log("Uploading audio file...");
        const sftp = await sshSFTP();
        const fastPut = util.promisify(sftp.fastPut.bind(sftp));
        const fastGet = util.promisify(sftp.fastGet.bind(sftp));
        await fastPut(filePath, "/root/audio.wav");

        console.log("Transcribing...");
        await sshExec(conn, `whisperx audio.wav --language ${langIn}`);

        console.log("Downloading transcription...");
        await fastGet("/root/audio.srt", outFile);

        conn.end();
        console.log("Done.");
        resolve();
      })
      .connect({
        host,
        port,
        username: "root",
        privateKey: fs.readFileSync(privKeyPath),
        passphrase,
      });
  });
}

function createInstance() {
  console.log("Spinning up GPU instance...");
  const GPUS = 1;
  return jarvislabs("create", {
    gpuType: "RTX5000",
    gpus: GPUS,
    hdd: 20,
    framework: `${0}`,
    ram: `${GPUS * 32}GB`,
    cores: `${GPUS * 7}`,
    name: "transcribe",
    is_reserved: false,
    duration: "hour",
  }).then((r) => {
    if (!r.success) {
      throw r.error_message;
    }
    const [, _port, host] = r.ssh_str.match(/^ssh -p (\d{4}) root@(.+)$/);
    const port = parseInt(_port, 10);
    return { port, host, id: r.machine_id };
  });
}

function destroyInstance(id) {
  console.log("Shutting down GPU instance...");
  return jarvislabs("destroy", {
    id,
  }).then((r) => {
    if (r.success) {
      console.log("Done.");
    } else {
      throw r.error_message;
    }
  });
}

(async function main() {
  const [, , audioFile, srtFile, langIn, langOut, privKeyPath, passphrase] =
    process.argv;
  const aFile = path.join(process.cwd(), audioFile);
  const sFile = path.join(process.cwd(), srtFile);
  console.log(aFile, sFile);
  const { port, host, id } = await createInstance();

  await transcribe({
    port,
    host,
    langIn,
    filePath: aFile,
    outFile: sFile,
    privKeyPath,
    passphrase,
  });
  await destroyInstance(id);
  await translateSRT(
    langOut.toUpperCase(),
    sFile,
    sFile.replace(".srt", `_${langOut}.srt`)
  );
})();
