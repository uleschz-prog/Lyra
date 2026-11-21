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
