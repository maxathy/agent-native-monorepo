import neo4j, { type Driver } from 'neo4j-driver';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
}

export function createNeo4jClient(config: Neo4jConfig): Driver {
  return neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password));
}
