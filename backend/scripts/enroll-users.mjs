#!/usr/bin/env node
// Register + enroll personel ke Fabric CA. Atribut clearance/jabatan/role
// ditanam ke sertifikat (":ecert"), lalu dibaca chaincode via GetAttributeValue.
// Output: wallet/<username>/{cert.pem,key.pem} dan config/users.json
//
// SIGNING_MODE=client: kunci privat personel TIDAK ditinggal di server. Script ini
// berperan sebagai "loket penerbitan kartu": kunci dibungkus PIN menjadi
// cards/<username>.card.json untuk diimpor ke perangkat personel, dan wallet/
// hanya menyimpan sertifikat. Identitas layanan (sentinel, keyguard) tetap di server.
//
// Pakai: npm run enroll   (jaringan Fabric harus sudah jalan dengan -ca)

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { certFingerprint, makeCard } from './card.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(root, '.env'));

const tn = path.resolve(root, process.env.FABRIC_TEST_NETWORK ?? '../fabric-samples/test-network');
const bin = path.resolve(tn, '../bin/fabric-ca-client');
const walletDir = path.resolve(root, process.env.WALLET_DIR ?? './wallet');
const usersFile = path.resolve(root, process.env.USERS_FILE ?? './config/users.json');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'config/users.seed.json'), 'utf8'));
const clientMode = (process.env.SIGNING_MODE ?? 'server') === 'client';
const cardsDir = path.resolve(root, process.env.CARDS_DIR ?? './cards');
const pin = seed.defaultPin ?? '123456';

const ORGS = {
  org1: { msp: 'Org1MSP', port: 7054, caname: 'ca-org1' },
  org2: { msp: 'Org2MSP', port: 8054, caname: 'ca-org2' },
};

if (!fs.existsSync(bin)) die(`fabric-ca-client tidak ditemukan di ${bin}. Jalankan scripts/network-up.sh dulu.`);
fs.mkdirSync(walletDir, { recursive: true });

const secretsFile = path.join(walletDir, '.secrets.json');
const secrets = fs.existsSync(secretsFile) ? JSON.parse(fs.readFileSync(secretsFile, 'utf8')) : {};
const out = [];

for (const u of seed.users) {
  const org = ORGS[u.org] ?? die(`org tidak dikenal: ${u.org}`);
  const orgDir = path.join(tn, `organizations/peerOrganizations/${u.org}.example.com`);
  const tls = path.join(tn, `organizations/fabric-ca/${u.org}/ca-cert.pem`);
  const env = { ...process.env, FABRIC_CA_CLIENT_HOME: orgDir };

  // 1. register (idempoten)
  secrets[u.username] ??= crypto.randomBytes(12).toString('hex');
  const attrs = `clearance=${u.clearance}:ecert,jabatan=${u.jabatan}:ecert,role=${u.role}:ecert`;
  try {
    execFileSync(bin, [
      'register', '--caname', org.caname, '--id.name', u.username, '--id.secret', secrets[u.username],
      '--id.type', 'client', '--id.attrs', attrs, '--tls.certfiles', tls,
    ], { env, stdio: 'pipe' });
    console.log(`+ register ${u.username} (${u.clearance}, ${u.jabatan}, ${u.role})`);
  } catch (e) {
    const msg = String(e.stderr ?? e.message);
    if (!/already registered/i.test(msg)) die(`register ${u.username} gagal:\n${msg}`);
    console.log(`= ${u.username} sudah terdaftar`);
  }

  // 2. enroll -> sertifikat X.509 berisi atribut
  const tmp = fs.mkdtempSync(path.join(walletDir, '.msp-'));
  try {
    execFileSync(bin, [
      'enroll', '-u', `https://${u.username}:${secrets[u.username]}@localhost:${org.port}`,
      '--caname', org.caname, '-M', tmp, '--tls.certfiles', tls,
    ], { env, stdio: 'pipe' });
  } catch (e) {
    die(`enroll ${u.username} gagal (secret tidak cocok? hapus wallet/ lalu jalankan ulang network-up):\n${e.stderr ?? e.message}`);
  }
  const dest = path.join(walletDir, u.username);
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(path.join(tmp, 'signcerts/cert.pem'), path.join(dest, 'cert.pem'));
  const sk = fs.readdirSync(path.join(tmp, 'keystore'))[0];
  if (clientMode && !u.service) {
    // Kunci hanya keluar sebagai kartu terenkripsi; tidak ada salinan di wallet server.
    const certPem = fs.readFileSync(path.join(dest, 'cert.pem'), 'utf8');
    const card = makeCard({
      username: u.username, mspId: org.msp, certFp: certFingerprint(certPem),
      keyPem: fs.readFileSync(path.join(tmp, 'keystore', sk), 'utf8'), pin: u.pin ?? pin,
    });
    fs.mkdirSync(cardsDir, { recursive: true });
    fs.writeFileSync(path.join(cardsDir, `${u.username}.card.json`), JSON.stringify(card, null, 2), { mode: 0o600 });
    fs.rmSync(path.join(dest, 'key.pem'), { force: true });
  } else {
    fs.copyFileSync(path.join(tmp, 'keystore', sk), path.join(dest, 'key.pem'));
    fs.chmodSync(path.join(dest, 'key.pem'), 0o600);
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  out.push({
    username: u.username, nama: u.nama, nrp: u.nrp, jabatan: u.jabatan, clearance: u.clearance,
    role: u.role, org: u.org, mspId: org.msp, service: !!u.service,
    passwordHash: bcrypt.hashSync(u.password ?? seed.defaultPassword, 10),
  });
}

fs.writeFileSync(secretsFile, JSON.stringify(secrets, null, 2), { mode: 0o600 });
fs.mkdirSync(path.dirname(usersFile), { recursive: true });
fs.writeFileSync(usersFile, JSON.stringify(out, null, 2));
console.log(`\n${out.length} identitas di ${walletDir}`);
console.log(`users -> ${usersFile} (password default: ${seed.defaultPassword})`);
if (clientMode) {
  console.log(`\nSIGNING_MODE=client: kartu identitas personel di ${cardsDir} (PIN default: ${pin}).`);
  console.log('Serahkan tiap file ke pemiliknya untuk diimpor di portal, lalu hapus dari server.');
}

function die(m) {
  console.error(m);
  process.exit(1);
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
