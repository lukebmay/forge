/**
 * Node/Bun I/O for plog-core (fs / path / crypto / process).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * @returns {import("./plog-core.js").PlogRuntime}
 */
export function createNodeRuntime() {
  return {
    envGet(key) {
      return process.env[key];
    },
    envSet(key, value) {
      process.env[key] = value;
    },
    envDel(key) {
      delete process.env[key];
    },
    pid() {
      return typeof process.pid === "number" ? process.pid : -1;
    },
    getuid() {
      return typeof process.getuid === "function" ? process.getuid() : null;
    },
    homeDir() {
      return process.env.HOME || null;
    },
    sudoUser() {
      return process.env.SUDO_USER || null;
    },
    randomBytes(n) {
      return crypto.randomBytes(n);
    },
    resolvePath(p0) {
      return path.resolve(p0);
    },
    dirname(p0) {
      return path.dirname(p0);
    },
    basename(p0) {
      return path.basename(p0);
    },
    pathJoin(a, b) {
      return path.join(a, b);
    },
    pathSep: path.sep,
    realpathOrResolve(p0) {
      try {
        return fs.realpathSync(p0);
      } catch {
        return path.resolve(p0);
      }
    },
    exists(p0) {
      return fs.existsSync(p0);
    },
    appendFile(filePath, bytes) {
      const fd = fs.openSync(
        filePath,
        fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT,
        0o600
      );
      try {
        fs.writeSync(fd, bytes);
      } finally {
        fs.closeSync(fd);
      }
    },
    readFile(filePath) {
      return fs.readFileSync(filePath, "utf8");
    },
    writeFileAtomic(filePath, content, tmpPath) {
      fs.writeFileSync(tmpPath, content, { encoding: "utf8", mode: 0o600 });
      fs.renameSync(tmpPath, filePath);
    },
    writeFileInPlace(filePath, content) {
      const fd = fs.openSync(filePath, fs.constants.O_RDWR | fs.constants.O_TRUNC);
      try {
        if (content) fs.writeSync(fd, content);
      } finally {
        fs.closeSync(fd);
      }
    },
    truncateFile(filePath) {
      const fd = fs.openSync(filePath, fs.constants.O_WRONLY | fs.constants.O_TRUNC);
      fs.closeSync(fd);
    },
    unlinkQuiet(filePath) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    },
    writeStderr(text) {
      process.stderr.write(text);
    },
    writeStdout(text) {
      process.stdout.write(text);
    },
    get stdout() {
      return process.stdout;
    },
    get stderr() {
      return process.stderr;
    },
  };
}
