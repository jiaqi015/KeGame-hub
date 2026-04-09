import { OpenDayCatalogService } from '../../application/openDayCatalogService.js';

const catalogService = new OpenDayCatalogService();

export function handleOpenDayCatalog() {
  return catalogService.execute();
}
