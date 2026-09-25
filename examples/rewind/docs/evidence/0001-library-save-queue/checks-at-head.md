# Evidence: tests, coverage, lint, and typecheck pass at head

Task: PR #4 (head `53ab694`). Run from `examples/rewind`.

## Command run

```sh
PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH bun run --filter web test
PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH bun run --filter web lint
PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH bun run --filter web typecheck
```

## Output: test (100% coverage thresholds enforced)

```text
web test: (!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
web test:   - import "./local-env" without a file extension (vitest.config.mts:3:26). Add the file extension
web test:   - ESM syntax in a file loaded as CommonJS (local-env.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
web test: Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
web test:
web test:  RUN  v5.0.1 <repo>/examples/rewind/apps/web
web test:       Coverage enabled with v8
web test:
web test:
web test:  Test Files  25 passed (25)
web test:       Tests  302 passed (302)
web test:    Start at  07:22:02
web test:    Duration  2.55s (import 51%, tests 24%, transform 13%, environment 9%, worker 3%)
web test:
web test:     Isolate  25 workers spawned · ~147ms startup each (spawn + environment, per file)
web test:              at least ~377ms faster with isolate: false — reuses workers across files instead of one per file
web test:
web test:  % Coverage report from v8
web test: -------------------|---------|----------|---------|---------|-------------------
web test: File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
web test: -------------------|---------|----------|---------|---------|-------------------
web test: -------------------|---------|----------|---------|---------|-------------------
web test:
web test: =============================== Coverage summary ===============================
web test: Statements   : 100% ( 828/828 )
web test: Branches     : 100% ( 385/385 )
web test: Functions    : 100% ( 314/314 )
web test: Lines        : 100% ( 739/739 )
web test: ================================================================================
web test: Exited with code 0
exit=0
```

## Output: lint

```text
web lint: Exited with code 0
exit=0
```

## Output: typecheck

```text
web typecheck: Exited with code 0
exit=0
```
