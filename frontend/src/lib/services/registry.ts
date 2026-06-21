import type { ServiceDef, ServiceId, PublicServiceDef } from './types';
import { xThreadService } from './x-thread';
import { repurposeThreadService } from './repurpose-thread';
import { hotTakesService } from './hot-takes';

export const SERVICES: Record<ServiceId, ServiceDef> = {
  'x-thread': xThreadService as ServiceDef,
  'repurpose-thread': repurposeThreadService as ServiceDef,
  'hot-takes': hotTakesService as ServiceDef,
};

export function getService(id: string): ServiceDef {
  const def = SERVICES[id as ServiceId];
  if (!def) throw new Error('unknown service');
  return def;
}

export function publicRegistry(): PublicServiceDef[] {
  return Object.values(SERVICES).map(({ id, label, blurb, chained, priceStx, priceSbtc, fields }) =>
    ({ id, label, blurb, chained, priceStx, priceSbtc, fields }));
}
