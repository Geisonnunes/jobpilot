import { gupyConnector } from "./gupy";
import { remotiveConnector } from "./remotive";
import type { JobConnector } from "./types";

/**
 * slug → conector. Os slugs são os mesmos de JobSource.slug (prisma/seed.ts).
 * A fonte "manual" não tem conector: as vagas são coladas pelo usuário.
 */
const connectors: Record<string, JobConnector> = {
  [gupyConnector.slug]: gupyConnector,
  [remotiveConnector.slug]: remotiveConnector,
};

export function getConnector(slug: string): JobConnector | undefined {
  return Object.hasOwn(connectors, slug) ? connectors[slug] : undefined;
}

export const connectorSlugs = Object.keys(connectors);
