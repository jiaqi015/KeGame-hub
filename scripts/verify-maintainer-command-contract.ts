import type {
  MaintainerCreateRunCommand,
  MaintainerCreateRunRequest,
  MaintainerSaveRunCommand,
  MaintainerSaveRunRequest,
} from '../src/selling-houses/application/cloudSync.js';
import {
  createMaintainerRun,
  saveMaintainerRun,
} from '../src/selling-houses/infrastructure/cloudClient.js';

type Assert<T extends true> = T;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;
type IsRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;
type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

const createCommandRequiresOwner: Assert<IsRequired<MaintainerCreateRunCommand, 'runOwnerId'>> = true;
const saveCommandRequiresOwner: Assert<IsRequired<MaintainerSaveRunCommand, 'runOwnerId'>> = true;
const createCommandDoesNotExposeLegacyUserId: Assert<HasKey<MaintainerCreateRunCommand, 'userId'> extends false ? true : false> = true;
const saveCommandDoesNotExposeLegacyUserId: Assert<HasKey<MaintainerSaveRunCommand, 'userId'> extends false ? true : false> = true;
const createRequestCanOmitOwner: Assert<IsOptional<MaintainerCreateRunRequest, 'userId'>> = true;
const saveRequestCanOmitOwner: Assert<IsOptional<MaintainerSaveRunRequest, 'userId'>> = true;
const clientCreateCanOmitOwner: Assert<IsOptional<Parameters<typeof createMaintainerRun>[1], 'userId'>> = true;
const clientSaveCanOmitOwner: Assert<IsOptional<Parameters<typeof saveMaintainerRun>[1], 'userId'>> = true;

void createCommandRequiresOwner;
void saveCommandRequiresOwner;
void createCommandDoesNotExposeLegacyUserId;
void saveCommandDoesNotExposeLegacyUserId;
void createRequestCanOmitOwner;
void saveRequestCanOmitOwner;
void clientCreateCanOmitOwner;
void clientSaveCanOmitOwner;

console.log('maintainer command contract verification passed');
