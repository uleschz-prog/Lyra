# Keeper de Lyra Autonomous Protocol

Gelato ya no abre cuentas nuevas. [app.gelato.cloud/sign-up](https://app.gelato.cloud/sign-up) lo dice, y [app.gelato.network](https://app.gelato.network) responde 404. Por eso el keeper vive en Lyra: una ruta llama a `executeStrategy()` en Polygon Amoy. No hace falta una cuenta de Gelato.

## Contrato

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

`depositUSDC` y `withdraw` siguen siendo solo del owner. La llave del keeper no puede retirar.

La billetera que paga el gas es `0xDAf485619B13207232fC29B1F016A99D3eB5f53e`. No es el owner. Su llave no está en el repositorio.

## Cómo se dispara

1. Cada hora, GitHub Actions (`.github/workflows/lyra-keeper.yml`) hace `GET https://lyyra.vercel.app/api/protocol/execute` con `Authorization: Bearer CRON_SECRET`. El cron es `5 * * * *` (minuto 5). GitHub solo programa ese archivo si está en `main`. En esta rama queda escrito, pero el horario no arranca hasta copiar el workflow a `main`. Se puede lanzar a mano con `workflow_dispatch`.
2. Cada día, Vercel llama la misma ruta a las 11:15 UTC (`15 11 * * *`). El plan Hobby no acepta un cron más frecuente: una expresión horaria falla el deploy. Este es el respaldo que sí corre en el deploy de producción.

La ruta:

1. Sin el bearer correcto responde 401 `{ error: "No autorizado." }`.
2. Lee `checker()`, el saldo USDC, el cooldown, el owner y la hora del bloque.
3. Si no toca ejecutar, responde 200 y no envía transacción. Motivos: `sin_contrato`, `sin_ejecutor`, `es_owner`, `cooldown`, `sin_saldo`, `precio`.
4. Si toca, simula la llamada y luego la firma `LYRA_KEEPER_PRIVATE_KEY`. Esa variable es solo de producción. No es `PRIVATE_KEY` del owner.
5. Una transacción enviada que no confirma responde 502. Un revert esperado (cooldown, sin USDC, precio) responde 200 para que el cron no reintente y gaste gas.

Cada `executeStrategy` exitosa en Amoy gasta alrededor de 0.009 POL. 0.05 POL alcanzan para unas cinco llamadas. No alcanza para semanas de ejecuciones horarias.

## Qué verás en el dashboard

Con USDC depositado, cada ejecución emite `StrategyExecuted`. El dashboard en `/dashboard/protocol` lo escucha en vivo: Vega sonríe y el aviso dice `Trade ejecutado: Ganancia de X USDC`. El saldo USDC que se muestra es el del token. La ganancia simulada no se suma a ese saldo porque el contrato no acuña USDC.

El historial no cambia la cara de Vega. Solo un evento nuevo, mientras la página escucha, la pone feliz.
