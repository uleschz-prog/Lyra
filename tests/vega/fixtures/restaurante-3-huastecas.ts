/**
 * Caso real (nov 2026): Ule le pidió a Vega un sistema para su restaurante y la respuesta abrió
 * con una negativa y filtró el nombre interno `entregar_proyecto`. Este fixture fija el prompt,
 * esa mala respuesta y una respuesta con el estilo esperado.
 */
export const restaurantPrompt =
  "Tengo un restaurante, Las 3 Huastecas, con 2 sucursales. Necesito controlar el inventario de insumos contra las comandas y contra la caja, porque se me pierde dinero y no sé dónde. ¿Cómo lo resolvemos?";

export const badRestaurantAnswer = `[animo: neutral] ¡Hola! Debo aclararte algo importante: como Vega no puedo construir sistemas de inventario completos ni conectarme a tu punto de venta. Solo puedo generar prototipos visuales con la herramienta \`entregar_proyecto\`, que no guardan datos reales.

Si quieres, puedo hacerte unas preguntas para entender mejor tu negocio.`;

export const goodRestaurantAnswer = `[animo: entusiasta] ¡Va! Es un caso clásico de control de costos y se resuelve cruzando tres cosas: lo que vendes (comandas), lo que debió salir del almacén (recetas) y lo que entró a caja.

## 1. Receta estándar (escandallo) por platillo
Cada platillo del menú lleva sus insumos y gramajes. Ejemplo:

| Platillo | Insumo | Cantidad | Costo aprox. (a validar) |
|---|---|---|---|
| Enchiladas huastecas | Tortilla | 4 pzas | $6 |
| Enchiladas huastecas | Cecina | 120 g | $28 |

## 2. Descuento de inventario por comanda
Cada comanda cobrada descuenta del inventario teórico de **su sucursal** los insumos de la receta.

## 3. Conteo teórico vs. real y merma
- Conteo físico diario de los 20 insumos más caros y semanal del resto.
- Diferencia = inventario teórico − conteo real → **merma** por insumo y por turno.

## 4. Corte de caja por sucursal y turno
Ventas del sistema vs. efectivo + terminal, con faltantes y sobrantes por cajero.

## 5. ¿Comprar o construir?
- **Comprar:** Soft Restaurant, Parrot o Loyverse ya traen recetas, inventario y corte.
- **Construir:** tiene sentido si necesitas reglas propias entre sucursales.

## Plan sugerido
1. Semana 1–2: recetas de los 30 platillos que más vendes.
2. Semana 3: conteos y reporte de merma.
3. Semana 4: corte de caja por turno.

Puedo armarte ahora un prototipo navegable en Proyectos o un documento de propuesta con fases y costos. ¿Cuántas comandas al día maneja cada sucursal y qué punto de venta usan hoy?`;

/**
 * Caso real en producción (21 nov 2026), ya con el prompt de experto: Ule pidió el sistema completo
 * (2 sucursales, inventario de insumos por orden, comandas, meseros/cocina/caja a la vez y dinero en
 * caja) y Vega respondió con la lista de lo que la app no podía hacer.
 */
export const restaurantSystemPrompt =
  "Mi cliente Las 3 Huastecas tiene 2 sucursales. Quiere una app para controlar el inventario de insumos (cecina, arrachera, chorizo, queso) con sus equivalencias a órdenes, que los meseros levanten comandas, que cocina las vea y que caja cobre al mismo tiempo, y saber cuánto dinero debe haber en caja. ¿Me haces la app?";

export const productionRefusalAnswer = `Entiendo tu interés en una app, LyraMaster. Sin embargo, es importante que sepas que la herramienta de creación de apps que tengo disponible genera prototipos interactivos que guardan la información solo en el navegador del usuario.

Esto significa que no puedo crear una app que:

- Gestione inventarios en tiempo real con múltiples insumos y recetas.
- Sincronice datos entre dos sucursales.
- Permita que varios usuarios (meseros, cocineros, cajeros) trabajen al mismo tiempo con la misma información.

Lo que sí puedo hacer es crear un prototipo de app que se enfoque en un flujo específico.`;

export const proposeAndBuildAnswer = `[animo: feliz] ¡Va! Te armo el sistema de Las 3 Huastecas completo: comandas, cocina, caja e inventario por receta en las 2 sucursales.

## Cómo funciona
- **Meseros** levantan la comanda; al enviarla a cocina se descuentan los insumos de cada platillo según su receta (por ejemplo, 200 g de cecina por orden).
- **Cocina** ve las comandas de su sucursal y las marca como listas.
- **Caja** cobra, y el corte del turno te dice cuánto efectivo debe haber.

## Plan por fases
1. App con las pantallas de cada rol y el menú con recetas.
2. Conteos físicos y reporte de merma por sucursal.

Empiezo ya con la fase 1. ¿Cómo se llaman las dos sucursales?`;
