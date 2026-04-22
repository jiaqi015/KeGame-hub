import { NeonGameRunRepository } from '../src/selling-houses/infrastructure/neonGameRunRepository.js';

async function main() {
  const runId = process.argv[2];
  const userId = process.argv[3];

  if (!runId || !userId) {
    throw new Error('Usage: tsx scripts/rebuild-selling-houses-shadow-sync.ts <runId> <userId>');
  }

  const repository = new NeonGameRunRepository();
  const summary = await repository.rebuildShadowTables(runId, userId);

  console.log('selling-houses shadow tables rebuilt');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
