import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const settings = join(root, '.env.local');
const config = await exists(settings) ? parseEnv(await readFile(settings, 'utf8')) : {};
const configuredWorkspace = process.env.DENTA_LOCAL_STATE_DIR || config.DENTA_LOCAL_STATE_DIR;
if (configuredWorkspace && !isAbsolute(configuredWorkspace)) {
  throw new Error('Укажите абсолютный путь в DENTA_LOCAL_STATE_DIR.');
}
const workspace = configuredWorkspace || join(root, 'work', 'local-demo');
const data = join(workspace, 'data');
const keyFile = join(workspace, 'clinic_data_key');
const passwordFile = join(workspace, 'admin_password');

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

async function createSecret(file, secret) {
  try {
    await writeFile(file, secret + '\n', { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

if (!(await exists(join(root, 'selfhost-build', 'public', 'index.html')))) {
  throw new Error('Сначала соберите приложение: npm run build:selfhost');
}
await mkdir(workspace, { recursive: true, mode: 0o700 });
if (await exists(join(data, 'clinic.sqlite'))) {
  if (!(await exists(keyFile))) {
    throw new Error('Для существующей локальной базы нужен исходный ключ: ' + keyFile);
  }
} else {
  await createSecret(keyFile, randomBytes(32).toString('base64'));
  await createSecret(passwordFile, randomBytes(24).toString('base64url'));
}

Object.assign(process.env, {
  APP_ORIGIN: 'http://127.0.0.1:3000',
  HOST: '127.0.0.1',
  PORT: '3000',
  ALLOW_HTTP_LOCAL: 'true',
  DEMO_MODE: 'true',
  DATA_DIR: data,
  CLINIC_DATA_KEY_FILE: keyFile,
  ADMIN_EMAIL: 'admin@denta.test',
  ADMIN_PASSWORD_FILE: passwordFile,
});
process.chdir(root);
console.log('Локальный администратор: ' + process.env.ADMIN_EMAIL);
console.log('Файл начального пароля: ' + passwordFile);
await import('./server.mjs');
