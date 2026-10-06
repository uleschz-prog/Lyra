# Gelato para Lyra Autonomous Protocol

El keeper no vive en un servidor de Lyra. En Polygon Amoy, Gelato llama a `executeStrategy()` por tiempo. El contrato lee el precio ETH/USD de Chainlink, exige saldo USDC y respeta el cooldown.

Hay que crear la tarea con MetaMask en la consola de Gelato. La dirección de la billetera que paga el gas la muestra Gelato al crear la tarea. No está en este repositorio.

## Contrato en Polygon Amoy

Dirección desplegada:

`0x3C50c13B237F1c6c8fA43a399dCa321e7D4aD17F`

Transacción de despliegue: `0x384d16de26a82eb2dee2ef96963a734c025d86efab4d24baade4486512b735ce`

También está en `contract-address.json`. Explorador:

https://amoy.polygonscan.com/address/0x3C50c13B237F1c6c8fA43a399dCa321e7D4aD17F

Constructor:

- USDC mock `0x367220DC34967Ae19e4B904aCF572fB1eC6eB3CD` (6 decimales)
- Feed Chainlink ETH/USD `0xF0d50568e3A7e8259E16663972b11910F89BD8e7` (8 decimales)
- Cooldown `300` segundos

`executeStrategy()` no es `onlyOwner`. Revierte si el cooldown no pasó (`Cooldown active`), si el precio es inválido o tiene más de 3 horas, o si el agente no tiene USDC (`No funds to operate`). Con saldo, anota una ganancia simulada del 0.1 % (`balance / 1000`), no mueve el USDC y emite `StrategyExecuted(timestamp, "PROFIT_CAPTURED", profit)`.

`depositUSDC` y `withdraw` siguen siendo solo del owner. Sin un depósito, Gelato llama igual y la transacción revierte.

## Crear la tarea

1. Entra a [app.gelato.cloud/sign-in](https://app.gelato.cloud/sign-in). `app.gelato.network` responde 404. Gelato ya no abre cuentas nuevas: la pantalla dice que las inscripciones están restringidas y [app.gelato.cloud/sign-up](https://app.gelato.cloud/sign-up) lo confirma. Un correo nuevo no entra. Solo una cuenta que ya existía puede usar «Continúa con Google».
2. Si entras, elige la red **Polygon Amoy** (chainId 80002) y conecta MetaMask.
3. Crea una **New Task**.
4. Target contract: `0x3C50c13B237F1c6c8fA43a399dCa321e7D4aD17F`.
5. Function to call: `executeStrategy()`. No recibe argumentos.
6. Trigger type: **Time-Based** (intervalo).
7. Interval: `3600` segundos (1 hora). Para una prueba rápida, `300` segundos. El cooldown on-chain es 300 segundos: un intervalo menor revierte con `Cooldown active` y gasta gas sin emitir el evento.
8. Payment token: en Amoy el gas es **POL**. La interfaz a veces sigue diciendo MATIC. Elige el token nativo de Polygon Amoy.
9. Gelato muestra una dirección de billetera para esa tarea. Cópiala de la consola y envíale POL de Amoy desde un faucet. Ese saldo paga las ejecuciones.

El contrato también expone `checker()`. Una tarea de tipo resolver puede usarlo. La configuración de esta guía es el intervalo de tiempo.

## Qué verás en el dashboard

Con la tarea activa y USDC depositado, cada ejecución emite `StrategyExecuted`. El dashboard en `/dashboard/protocol` lo escucha en vivo: Vega sonríe y el aviso dice `Trade ejecutado: Ganancia de X USDC`. El saldo USDC que se muestra es el del token. La ganancia simulada no se suma a ese saldo porque el contrato no acuña USDC.

El historial no cambia la cara de Vega. Solo un evento nuevo, mientras la página escucha, la pone feliz.
