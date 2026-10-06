# Gelato para Lyra Autonomous Protocol

El keeper no vive en un servidor de Lyra. Gelato llama a `executeStrategy()` cuando el propio contrato dice que ya puede. El cooldown de 10 minutos y el saldo USDC están en la cadena.

## Contrato en Polygon Amoy

Dirección desplegada:

`0x355B1Af7FD423EC1C60D1E0Bfb630C63a236eEcA`

También está en `contract-address.json`. Explorador:

https://amoy.polygonscan.com/address/0x355B1Af7FD423EC1C60D1E0Bfb630C63a236eEcA

La USDC de esta demo es el mock `0x367220DC34967Ae19e4B904aCF572fB1eC6eB3CD`. El router `0x9f7C9Ed6431E45C72f919c089D9686138A541Dd7` devuelve el monto más un 10 %. La ganancia que muestra el dashboard es `amountOut - amountIn`.

## Crear la tarea

1. Entra a [app.gelato.network](https://app.gelato.network) (la consola que antes estaba en console.gelato.network) con la misma billetera que puede pagar gas de prueba.
2. Elige la red **Polygon Amoy** (chainId 80002).
3. Crea una tarea de tipo **Resolver** (no un intervalo ciego).
4. Contrato: `0x355B1Af7FD423EC1C60D1E0Bfb630C63a236eEcA`.
5. Función resolver: `checker()`. No recibe argumentos. Devuelve:
   - `canExec`: verdadero solo si pasaron más de 10 minutos desde la última ejecución y el agente tiene USDC.
   - `execPayload`: la llamada ya codificada a `executeStrategy()`.
6. Gelato debe ejecutar ese `execPayload`. No hace falta pegar otra dirección de contrato de Gelato: la tarea apunta a este agente.
7. Si la consola solo ofrece un trigger por tiempo, pon el intervalo por encima de 10 minutos. Un intervalo más corto revierte con `LyraAutonomousAgent: cooldown` y gasta gas sin tradear.

`executeStrategy()` no tiene `onlyOwner`. La puede llamar Gelato. `depositUSDC` y `withdraw` siguen siendo solo del owner.

## Precio ETH/USD

El contrato que ya está en `0x355B1Af7FD423EC1C60D1E0Bfb630C63a236eEcA` no lee un oráculo. El código nuevo sí: antes de tradear llama al proxy Chainlink ETH/USD de Amoy `0xF0d50568e3A7e8259E16663972b11910F89BD8e7` y `checker()` solo devuelve verdadero si ese precio tiene menos de 3 horas. Ese código entra en cadena con el próximo despliegue. Esta tarea de Gelato sigue apuntando al agente que ya está desplegado.

## Pagar el gas

En Amoy el gas es **POL**, no un saldo aparte de Lyra. En la consola de Gelato fondea la tarea con POL de Amoy (a veces la interfaz sigue diciendo el nombre viejo de la red). Sin ese saldo la tarea no se ejecuta.

No hace falta un backend que firme transacciones.

## Qué verás en el dashboard

Con la tarea activa, cada trade emite `StrategyExecuted`. El dashboard en `/dashboard/protocol` lo escucha y Vega pasa a feliz. El aviso dice la ganancia en USDC y el saldo suma esa diferencia.

Mientras el checker dice que ya puede ejecutar, Vega queda pensando. Si la lectura de la red falla, Vega queda en alerta.
