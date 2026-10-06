# Lyra Autonomous Protocol

Agente en Solidity dentro de LYRA. El owner deposita y retira USDC. Un keeper llama `executeStrategy()` (sin `onlyOwner`) como máximo cada 10 minutos. Si hay saldo, el contrato simula un swap contra `MockSwapRouter.swapUSDCForProfit` y emite `StrategyExecuted` con action `BUY` y asset `ETH`. Si no hay saldo, revierte. El router mock se sustituye después por Uniswap.

La sección vive en el dashboard, ruta `/dashboard/protocol`.

## Compile y test

```bash
npm run compile
npm run test:contracts
```

## Deploy

```bash
cp .env.example .env
npm run deploy:autonomous:local
npm run deploy:autonomous
```

`deploy:autonomous:local` usa Hardhat y despliega `MockERC20` y `MockSwapRouter`. En `localhost` o `amoyNode` (nodo local con chainId 80002) hace lo mismo. `deploy:autonomous` usa Polygon Amoy: toma la USDC de `config/amoy.ts` y exige `MOCK_ROUTER_ADDRESS` (un router mock ya desplegado y con USDC para pagar la ganancia). También hace falta `PRIVATE_KEY`.

Para escuchar eventos en local: `npx hardhat node --network amoyNode` y apunta `NEXT_PUBLIC_LYRA_RPC_URL` a `http://127.0.0.1:8545`.

## Variables

Sin secretos en el repositorio. En `.env`:

- `POLYGON_AMOY_RPC_URL` — RPC de Amoy. Vacío usa `https://rpc-amoy.polygon.technology`.
- `PRIVATE_KEY` — cuenta que despliega en Amoy. No la subas.
- `AMOY_USDC_ADDRESS` — opcional. Vacío usa la USDC de Circle en Amoy `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`.
- `MOCK_ROUTER_ADDRESS` — obligatorio solo al desplegar en Amoy.
- `NEXT_PUBLIC_LYRA_AUTONOMOUS_AGENT_ADDRESS` — dirección del agente en el dashboard. Si falta, la sección dice «Sin contrato configurado».
- `NEXT_PUBLIC_LYRA_RPC_URL` — opcional. Vacío usa el RPC público de Amoy.

Red: Polygon Amoy, chainId `80002`. Explorer: https://amoy.polygonscan.com.

## Gelato

En [app.gelato.network](https://app.gelato.network), para llamar `executeStrategy()` cada 10 minutos en Amoy:

1. Crea una tarea y elige la red **Polygon Amoy** (chainId 80002).
2. Contrato: la dirección de `LyraAutonomousAgent` que imprimió el deploy.
3. Función: `executeStrategy()`. No recibe argumentos.
4. Trigger de tiempo: cada **10 minutos** (600 segundos). El contrato igual exige `block.timestamp > lastExecutionTime + 10 minutes`.
5. Si usas resolver: el resolver es **el mismo contrato**, función `checker()`. Devuelve `(bool canExec, bytes execPayload)`. `execPayload` ya trae `abi.encodeCall(executeStrategy, ())`. Gelato debe ejecutar solo cuando `canExec` es true (pasaron 10 minutos y hay saldo USDC).
6. Activa **dedicated msg.sender**. Esa dirección no está en este repo: Gelato la muestra en el dashboard al crear la tarea y cambia según la red. Cópiala de ahí. El contrato no la exige; cualquiera puede llamar `executeStrategy()`.
7. Fondea **1Balance** en esa misma pantalla, con el token y la cantidad que indique Gelato para Amoy. La dirección del contrato de 1Balance se copia del dashboard al crear la tarea.
