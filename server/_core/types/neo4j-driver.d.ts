// Ambient declaration for `neo4j-driver`.
//
// The package is listed in `package.json` and installed by CI. Local
// development environments that have not run `npm install --legacy-
// peer-deps` (e.g. Termux dev boxes targeting the postgres backend)
// otherwise see TS2307 when tsc resolves the dynamic import in
// `default-bolt-driver-factory.ts`. This ambient declaration unblocks
// resolution; the real types from the installed package override
// once present in `node_modules`.
//
// The factory casts the imported module to its internal `Real*`
// interfaces (`RealNeo4jDriverModule` etc.) via `as unknown as`, so
// shape mismatches don't propagate.

declare module "neo4j-driver";
