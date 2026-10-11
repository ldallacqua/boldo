import {
  catalogShard,
  toCatalogMatch,
  type CatalogMatch,
  type CatalogShard,
} from '../../shared/catalog';
import { asset } from './config';

const shards = new Map<string, Promise<CatalogShard>>();

/** Cada arquivo do catálogo é baixado uma vez por sessão. */
function loadShard(key: string): Promise<CatalogShard> {
  let shard = shards.get(key);
  if (!shard) {
    shard = fetch(asset(`catalogo/${key}.json`)).then((response) => {
      if (!response.ok) throw new Error(`catálogo ${key}: ${response.status}`);
      return response.json() as Promise<CatalogShard>;
    });
    shards.set(key, shard);
    // Falhou (sem internet)? A próxima tentativa baixa de novo.
    shard.catch(() => shards.delete(key));
  }
  return shard;
}

/** Procura um código de barras na lista da Anvisa. `null` se ele não está lá. */
export async function findInCatalog(ean: string): Promise<CatalogMatch | null> {
  const record = (await loadShard(catalogShard(ean)))[ean];
  return record ? toCatalogMatch(ean, record) : null;
}
