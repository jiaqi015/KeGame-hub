import { FileMaintainerRunRepository } from '../src/selling-houses/infrastructure/fileMaintainerRunRepository.js';

async function main() {
  const runId = process.argv[2];
  const userId = process.argv[3];

  if (!runId || !userId) {
    throw new Error('Usage: tsx scripts/rebuild-selling-houses-file-shadow-sync.ts <runId> <userId>');
  }

  const repository = new FileMaintainerRunRepository();
  const summary = await repository.rebuildShadowTables(runId, userId);

  console.log('selling-houses file shadow summary rebuilt');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
