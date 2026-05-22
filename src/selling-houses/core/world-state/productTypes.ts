/**
 * productTypes.ts — canonical definition of product/process types.
 *
 * Architecture position:
 *   This is the single authority for the ProductType type.
 *   Domain re-exports from here; core imports from here.
 *   This prevents core→domain layer boundary violations.
 */

export const PRODUCT_TYPES = ['open-day', 'sincere-sale'] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];
