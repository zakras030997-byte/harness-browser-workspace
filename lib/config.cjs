const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hostName = 'com.anodhas.browser_workspace';
const stateDir = () => path.resolve(process.env.ANODHAS_BROWSER_STATE_DIR || path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'anodhas-browser-workspace'));
function privateDirectory(dir) {
  fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077)) {
    throw new Error('Browser state directory must be owned by you with mode 0700: ' + dir);
  }
}
function defaults() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'chrome/extension/manifest.json')));
  const hex = crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
  const extensionId = [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
  const hash = crypto.createHash('sha256').update(stateDir()).digest('hex').slice(0, 12);
  const socketDir = path.join(os.tmpdir(), `anodhas-bw-${process.getuid()}-${hash}`);
  const socketPath = path.join(socketDir, 'bridge.sock');
  if (Buffer.byteLength(socketPath) > 100) throw new Error('Temporary directory path is too long for a Unix socket');
  return {extensionId, extensionOrigin: `chrome-extension://${extensionId}/`, socketPath, socketDir, hostName};
}
function loadConfig() {
  const d = defaults();
  const file = process.env.ANODHAS_BROWSER_CONFIG || path.join(stateDir(), 'config.json');
  if (!fs.existsSync(file)) return d;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (config.extensionOrigin !== d.extensionOrigin || typeof config.socketPath !== 'string' || !path.isAbsolute(config.socketPath)) throw new Error('Invalid browser connection configuration');
  return {...d, ...config};
}
module.exports = {root, hostName, stateDir, privateDirectory, defaults, loadConfig};
