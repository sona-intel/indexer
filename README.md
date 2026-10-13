# Sona Intel — indexer

Envio HyperIndex indexers that collect raw on-chain events into Sona's database. This repository only collects data; the analysis lives in `x402-engine` and `prediction-market-engine`.

| Folder | Indexer | Chains |
|---|---|---|
| `x402/` | x402 payment settlements on Monad: EIP-3009 `AuthorizationUsed` with the calldata decoded, Permit2 proxy settlements, the sending relayer (facilitator), and USDC mints | Monad |
| `polymarket/` | Polymarket trades, positions and resolutions, kept current after Envio's public historical dataset | Polygon |

Each folder is a separate HyperIndex project (`package.json` and `config.yaml` at its root), so each can be deployed on its own. On Envio Cloud, set the indexer's root directory to `x402` or `polymarket`.

## Settings

Copy `.env.example` to `.env` in the indexer's folder. HyperIndex reads the HyperSync token from `ENVIO_API_TOKEN`. Never commit real keys.
