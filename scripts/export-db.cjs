const path = require('node:path');
const fs = require('node:fs/promises');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const backendDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendDir, '.env') });
dotenv.config({ path: path.join(backendDir, '..', '.env') });

const collections = [
  'users', 'events', 'ticket_tiers', 'seats',
  'orders', 'tickets', 'coupons', 'audit_logs',
];

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required in backend/.env or the environment.');
  }

  const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'ticketbox');
    const startedAt = new Date();
    const outputDir = path.resolve(
      backendDir, '..', 'exports',
      `${db.databaseName}-${startedAt.toISOString().replace(/[:.]/g, '-')}`,
    );
    await fs.mkdir(path.dirname(outputDir), { recursive: true });
    await fs.mkdir(outputDir);
    const manifest = {
      database: db.databaseName,
      startedAt: startedAt.toISOString(),
      format: 'MongoDB Extended JSON (canonical), JSON arrays',
      collections: [],
    };

    for (const name of collections) {
      const fileName = `${name}.json`;
      const filePath = path.join(outputDir, fileName);
      const temporaryPath = `${filePath}.partial`;
      const file = await fs.open(temporaryPath, 'wx');
      const cursor = db.collection(name).find({}).sort({ _id: 1 });
      let count = 0;
      try {
        await file.writeFile('[\n');
        for await (const document of cursor) {
          const json = mongoose.mongo.BSON.EJSON.stringify(document, { relaxed: false });
          await file.writeFile(`${count ? ',\n' : ''}  ${json}`);
          count++;
        }
        await file.writeFile('\n]\n');
      } finally {
        await cursor.close();
        await file.close();
      }
      await fs.rename(temporaryPath, filePath);
      manifest.collections.push({ name, file: fileName, count });
      console.log(`${name}: ${count} documents`);
    }

    manifest.completedAt = new Date().toISOString();
    await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    console.log(`Export completed: ${outputDir}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  // Avoid logging connection strings or document contents on failure.
  console.error(`Export failed (${error.code || error.name || 'unknown error'}). Check database connectivity and file permissions.`);
  process.exitCode = 1;
});
