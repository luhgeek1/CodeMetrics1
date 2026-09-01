import { GraphQLDefinitionsFactory } from '@nestjs/graphql';
import { resolve } from 'node:path';

new GraphQLDefinitionsFactory()
  .generate({
    typePaths: [resolve('src/schema.graphql')],
    path: resolve('src/generated/graphql.ts'),
    outputAs: 'interface',
    defaultScalarType: 'unknown',
    customScalarTypeMapping: { JSON: 'unknown' },
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
