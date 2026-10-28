import bcrypt from 'bcrypt';
import { createPool } from './db-common.js';

function readHidden(prompt) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this command in an interactive terminal.'));
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error = null) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (buffer) => {
      for (const character of buffer.toString('utf8')) {
        if (character === '\u0003') return finish(new Error('Cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u0008' || character === '\u007f') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    };
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

const pool = createPool();
let client;
try {
  const email = (await import('node:readline/promises')).createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const address = (await email.question('Admin email: ')).trim().toLowerCase();
  email.close();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) {
    throw new Error('Enter a valid email address.');
  }
  const password = await readHidden('Admin password (12-72 bytes): ');
  if (Buffer.byteLength(password) < 12 || Buffer.byteLength(password) > 72) {
    throw new Error('Admin password must be 12-72 bytes.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  client = await pool.connect();
  const { rows } = await client.query(
    `INSERT INTO APP_USER (email, password_hash, role)
     VALUES ($1, $2, 'admin') RETURNING user_id`,
    [address, passwordHash],
  );
  console.log(`Created admin account ${rows[0].user_id}.`);
} catch (error) {
  console.error(`Admin creation failed (${error?.code || error?.name || 'unknown'}): ${error.message}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
