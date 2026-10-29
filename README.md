## Lyra

Aplicación Next.js para membresías, pagos, red de partners y herramientas de IA. Requiere Node.js 22.12 o posterior y PostgreSQL.

## Desarrollo

```bash
npm ci
cp .env.example .env
npm run dev
```

Completa `DATABASE_URL` y `SESSION_SECRET` en `.env`; las integraciones externas requieren además sus respectivas claves.

## Verificación

```bash
npm run lint
npm test
npm run build
```

Los builds de producción en Vercel preparan un baseline solo si encuentran el esquema LYRA existente sin historial de Prisma, registran como aplicadas las migraciones históricas que ese esquema ya contiene y luego ejecutan `prisma migrate deploy` antes de compilar. El script valida las tablas y el enum de pagos USDT y se detiene ante un esquema o historial parcial inesperado. Para sincronizar manualmente el esquema en desarrollo, revisa `DATABASE_URL` y ejecuta `npm run db:sync`; no uses ese comando como sustituto de migraciones revisadas para producción.

Los pagos de membresías se hacen con Mercado Pago, USDT TRC20 o códigos promocionales. Los enlaces antiguos de vinculación de wallet redirigen al flujo de pago.

## Academia

Los creadores conectan su cuenta de vendedor de Mercado Pago mediante OAuth; Lyra cifra los access y refresh tokens con `ACADEMY_MP_TOKEN_ENCRYPTION_KEY`. En un pago único, Checkout Pro usa la cuenta conectada del creador y aplica `marketplace_fee`: 7% para Lyra y 93% para el creador sobre el precio del curso. La tarifa de procesamiento de Mercado Pago se descuenta por separado al creador. La inscripción solo se activa después de consultar y verificar el pago con las credenciales del vendedor; los webhooks pueden reintentarse sin duplicar la inscripción.

Para habilitar esta integración, registra en la app de Mercado Pago la URL exacta de `ACADEMY_MP_REDIRECT_URI` (por defecto `https://lyyra.vercel.app/api/academy/mercadopago/callback`), activa [OAuth Authorization Code con PKCE S256 y acceso `offline_access`](https://www.mercadopago.com.mx/developers/es/docs/security/oauth/creation), y confirma que la aplicación esté habilitada para operar como Marketplace con comisión. El checkout utiliza la [preferencia Checkout Pro y `marketplace_fee`](https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-pro-preferences/create-preference/post) y rechaza el pago si Mercado Pago no devuelve la comisión o el identificador de Marketplace esperado. Configura `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `ACADEMY_MP_REDIRECT_URI`, `ACADEMY_MP_TOKEN_ENCRYPTION_KEY` y `NEXT_PUBLIC_APP_URL` en el entorno de despliegue. Genera la clave de cifrado con `openssl rand -hex 32`, mantenla estable entre despliegues y no la guardes en el repositorio. Mantén `ACADEMY_MARKETPLACE_ENABLED=false` hasta validar el flujo con credenciales de prueba, una cuenta vendedora elegible y la respuesta correcta de Marketplace; sólo entonces habilítalo en producción.

La Academia admite actualmente cursos gratis y pagos únicos en MXN para vendedores de México. El esquema reserva el tipo de precio mensual, pero su creación y checkout permanecen deshabilitados hasta confirmar que Mercado Pago aplique el split de Marketplace también a cada cobro recurrente.

El estudio ofrece un cupo de video independiente de los créditos que se renueva cada 30 días: 40 segundos en Inicio ($29), 140 en Negocio ($99) y 360 en Pro ($249). Wan 3.0 consume el cupo según la duración; Wan 3.0 Prime consume 1.36 veces más. El costo estimado debe estar dentro del límite seguro del cupo antes de iniciar la generación. Los videos se generan en clips de hasta 30 segundos con sonido ambiente y narración del guion mediante ElevenLabs, y se guardan en la Biblioteca como archivos privados de Vercel Blob. Las imágenes del estudio y de Vega se generan con Marketing Studio Image 2.5 Flare de Higgsfield; Vega consulta la generación en segundo plano para no bloquear el chat. Configura `HIGGSFIELD_API_KEY_ID`, `HIGGSFIELD_API_KEY_SECRET`, `ELEVENLABS_API_KEY` y `BLOB_READ_WRITE_TOKEN`; Vercel aplica las migraciones en builds de producción.

Los cron configurados en Vercel se declaran en `vercel.json`; sus rutas deben existir en `src/app/api`.

## WhatsApp Business

La conexión usa el flujo oficial Meta Embedded Signup para WhatsApp Business Coexistence: la persona autoriza su cuenta de WhatsApp Business durante el alta y confirma desde la app móvil. No se emparejan sesiones de WhatsApp Web ni se escanea un QR de WhatsApp Web. La disponibilidad de Coexistence depende de la elegibilidad de la cuenta y de que la app de Meta tenga la configuración y permisos aprobados.

Configura en Meta una app de negocio con Embedded Signup, una configuración de alta de WhatsApp, las URLs/dominos HTTPS permitidos y el webhook `https://TU_DOMINIO/api/whatsapp/webhook`. Suscribe los eventos de mensajes y estados de entrega, y configura la verificación de webhook. En Vercel define `META_APP_ID`, `META_APP_SECRET`, `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_GRAPH_API_VERSION`, `NEXT_PUBLIC_META_GRAPH_API_VERSION`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN_ENCRYPTION_KEY` y `CRON_SECRET`. Genera el token de cifrado con `openssl rand -hex 32`; mantenlo estable entre despliegues y no lo guardes en el repositorio. La app y los permisos de Meta deben tener la revisión/acceso de proveedor que corresponda antes de habilitar a usuarios externos.

La bandeja de LYRA atiende conversaciones individuales. Los mensajes de texto libre solo se envían dentro de la ventana de atención de Meta de 24 horas; después se requiere una plantilla aprobada. Los envíos programados exigen confirmar el consentimiento del contacto y vuelven a verificar la baja, el bloqueo, la conexión, la ventana y el estado de la plantilla al ejecutarse. No hay campañas masivas. Los seguimientos sugeridos por Vega se notifican al socio; deben revisarse y programarse desde la bandeja.

La programación se ejecuta mediante `/api/whatsapp/scheduled/run` cada minuto. El cron de un minuto requiere Vercel Pro; en Hobby no se puede desplegar esa frecuencia. La sincronización histórica de conversaciones de WhatsApp Business no está incluida: la bandeja comienza a registrar los mensajes recibidos después de vincular el número.
