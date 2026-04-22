import type { MaintainerRunRepository } from '../application/maintainerRunRepository.js';
import type { SellingHousesScenarioRepository } from '../application/sellingHousesScenarioRepository.js';
import { FileMaintainerRunRepository } from './fileMaintainerRunRepository.js';
import { NeonGameRunRepository } from './neonGameRunRepository.js';
import { NeonScenarioRepository } from './neonScenarioRepository.js';

let maintainerRunRepositorySingleton: MaintainerRunRepository | null = null;
let scenarioRepositorySingleton: SellingHousesScenarioRepository | null = null;

export function hasSellingHousesDatabaseConfig() {
  return Boolean((process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim());
}

export function getMaintainerRunRepository(): MaintainerRunRepository {
  if (!maintainerRunRepositorySingleton) {
    maintainerRunRepositorySingleton = hasSellingHousesDatabaseConfig()
      ? new NeonGameRunRepository()
      : new FileMaintainerRunRepository();
  }

  return maintainerRunRepositorySingleton;
}

export function getSellingHousesScenarioRepository(): SellingHousesScenarioRepository {
  if (!scenarioRepositorySingleton) {
    scenarioRepositorySingleton = new NeonScenarioRepository();
  }

  return scenarioRepositorySingleton;
}
