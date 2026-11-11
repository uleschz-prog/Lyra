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

Los cobros de los cursos de pago se depositan directamente en la cuenta empresarial de LYRA mediante Checkout Pro. Sobre el precio bruto, el creador tiene derecho al 93% y LYRA retiene el 7%; la tarifa de procesamiento de Mercado Pago la absorbe LYRA. La transferencia al creador es manual y se registra en el panel de administración con fecha y referencia, mientras que el creador puede consultar su saldo pendiente y los pagos ya registrados. La inscripción sólo se activa después de consultar y verificar el pago con el token de LYRA; los webhooks pueden reintentarse sin duplicar la inscripción.

Configura `MERCADOPAGO_ACCESS_TOKEN` con el token de la cuenta empresarial de LYRA y `NEXT_PUBLIC_APP_URL` en el entorno de despliegue. Habilita `ACADEMY_PAYMENTS_ENABLED=true` sólo después de validar Checkout Pro con credenciales de prueba. `ACADEMY_MARKETPLACE_ENABLED` se mantiene como nombre alternativo por compatibilidad con entornos ya configurados. Las credenciales OAuth de vendedores de `ACADEMY_MP_*` son heredadas y ya no se requieren para nuevas ventas.

La Academia admite actualmente cursos gratis y pagos únicos en MXN. El esquema reserva el tipo de precio mensual, pero su creación y checkout permanecen deshabilitados.

El catálogo de creadores se presenta como un feed vertical con vista previa automática, me gusta persistentes por usuario y enlaces compartibles que abren el curso seleccionado. Los cursos de pago se compran con Mercado Pago; Stripe y cripto no forman parte del checkout de Academia.

El creador de cursos guía el flujo desde los datos del curso hasta módulos y lecciones. Las lecciones aceptan enlaces de YouTube/Vimeo o videos MP4 y WebM de hasta 120 MB, que se suben directamente a Vercel Blob; requiere `BLOB_READ_WRITE_TOKEN`.

## Vega

Vega genera sitios responsivos, prototipos interactivos de apps y especificaciones descargables de agentes. Las apps guardan sus registros sólo en el navegador; los formularios no envían solicitudes a un negocio. La demostración del agente responde con ejemplos predefinidos y `agente.json` sirve como base para conectarlo a un modelo, pero no es un agente de IA activo. Para operar con clientes o usuarios reales hace falta implementar backend, almacenamiento seguro e integraciones.

El estudio ofrece un cupo de video independiente de los créditos que se renueva cada 30 días: 40 segundos en Inicio ($29), 140 en Negocio ($99) y 360 en Pro ($249). Wan 3.0 consume el cupo según la duración; Wan 3.0 Prime consume 1.36 veces más. El costo estimado debe estar dentro del límite seguro del cupo antes de iniciar la generación. Los videos se generan en clips de hasta 30 segundos con sonido ambiente y narración del guion mediante ElevenLabs, y se guardan en la Biblioteca como archivos privados de Vercel Blob. El generador directo de Higgsfield usa Wan 3.0 Prime (`/alibaba/wan-3.0-prime/text-to-video`) mediante `POST /api/generate`, consulta `GET /api/status/:id` y copia los resultados a Vercel Blob. Permite configurar duración de 2 a 30 segundos, resolución, relación de aspecto, audio, razonamiento extendido y seed; reserva del cupo Lyra según la duración y el multiplicador del modelo. El generador directo de imágenes usa Soul 2 (`/higgsfield-ai/soul/v2/standard`) y admite estilos, referencias Soul ID, lotes de 1 o 4 imágenes, resolución, relación de aspecto, mejora de prompt y seed; los lotes de cuatro consumen cuatro veces los créditos de imagen. Las referencias Soul ID se crean y consultan en el servidor con `model_version: "v2"` y de 1 a 100 URLs públicas HTTPS; se muestran para usar al terminar su entrenamiento. Las imágenes del estudio y de Vega también usan Higgsfield desde el servidor. Configura `HF_KEY_ID`, `HF_KEY_SECRET`, `ELEVENLABS_API_KEY`, `BLOB_READ_WRITE_TOKEN` y `NEXT_PUBLIC_APP_URL`; Vercel aplica las migraciones en builds de producción.

Los cron configurados en Vercel se declaran en `vercel.json`; sus rutas deben existir en `src/app/api`.

## WhatsApp Business

La conexión usa el flujo oficial Meta Embedded Signup para WhatsApp Business Coexistence: la persona autoriza su cuenta de WhatsApp Business durante el alta y confirma desde la app móvil. No se emparejan sesiones de WhatsApp Web ni se escanea un QR de WhatsApp Web. La disponibilidad de Coexistence depende de la elegibilidad de la cuenta y de que la app de Meta tenga la configuración y permisos aprobados.

Configura en Meta una app de negocio con Embedded Signup, una configuración de alta de WhatsApp, las URLs/dominos HTTPS permitidos y el webhook `https://TU_DOMINIO/api/whatsapp/webhook`. Suscribe los eventos de mensajes y estados de entrega, y configura la verificación de webhook. En Vercel define `META_APP_ID`, `META_APP_SECRET`, `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_GRAPH_API_VERSION`, `NEXT_PUBLIC_META_GRAPH_API_VERSION`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN_ENCRYPTION_KEY` y `CRON_SECRET`. Genera el token de cifrado con `openssl rand -hex 32`; mantenlo estable entre despliegues y no lo guardes en el repositorio. La app y los permisos de Meta deben tener la revisión/acceso de proveedor que corresponda antes de habilitar a usuarios externos.

La bandeja de LYRA atiende conversaciones individuales. Los mensajes de texto libre solo se envían dentro de la ventana de atención de Meta de 24 horas; después se requiere una plantilla aprobada. Los envíos programados exigen confirmar el consentimiento del contacto y vuelven a verificar la baja, el bloqueo, la conexión, la ventana y el estado de la plantilla al ejecutarse. No hay campañas masivas. Los seguimientos sugeridos por Vega se notifican al socio; deben revisarse y programarse desde la bandeja.

La programación se ejecuta mediante `/api/whatsapp/scheduled/run` cada minuto. El cron de un minuto requiere Vercel Pro; en Hobby no se puede desplegar esa frecuencia. La sincronización histórica de conversaciones de WhatsApp Business no está incluida: la bandeja comienza a registrar los mensajes recibidos después de vincular el número.
