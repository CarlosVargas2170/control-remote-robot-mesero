# 🤖 Control Remoto - Robot Mesero

Panel web estático para controlar remotamente los robots meseros desde una computadora, tableta o celular.

La aplicación permite seleccionar un robot, enviar comandos de pantalla y audio, cambiar expresiones, consultar el estado de pagos, gestionar merchants y productos, y enviar texto al servicio TTS.

## Características

- **Selector de robot**: Mesero 1, Mesero 2, Mesero 3, Mesero 4 y Local.
- **Conexión persistente**: la selección del robot se guarda en `localStorage`.
- **Indicador de conexión**: muestra si el robot está `Online` u `Offline`.
- **Consola de logs**: registra las peticiones, respuestas y errores.
- **Expresiones GIF**: normal, feliz, enojado, llorando, amor, dinero, triste, dormido, confundido y SixSeven.
- **Control de pantalla**: muestra el producto, reproduce el saludo o indica cómo realizar el pago.
- **Audios preparados**: saludos, mensajes de atención, venta, entrega, alertas y audios de Kíky.
- **Audio personalizado**: permite indicar un asset, volumen y reproducción forzada.
- **Pago QR**: muestra el estado del polling y un contador de ventas.
- **Merchants y productos**: permite seleccionar merchants, mostrar u ocultar productos, fijarlos y guardar filtros.
- **Texto a Voz (TTS)**: envía texto al servicio de síntesis y reproduce el audio recibido por streaming en el navegador.
- **Instalable como PWA**: incluye un manifest para agregar el panel a la pantalla de inicio.

## Estructura

```text
control-remote-robot-mesero/
├── index.html                       # Interfaz principal
├── style.css                        # Estilos responsive
├── app.js                           # Lógica y llamadas a los servicios
├── manifest.json                    # Configuración de la PWA
├── manual_usuario_robot_mesero.html # Manual de operación
├── package.json                     # Comando de ejecución con Node.js
└── audio/                           # Audios reproducidos localmente
```

## Requisitos

- Un navegador actualizado.
- Acceso de red al robot seleccionado.
- Servidor web estático para servir los archivos.
- Para utilizar TTS, el servicio debe estar disponible en el puerto `9000` del host del robot.

## Cómo levantar la aplicación

### Opción 1: Python

Desde la carpeta del proyecto:

```bash
python3 -m http.server 3000
```

En Windows también puede utilizarse:

```bash
python -m http.server 3000
```

Abrir en el navegador:

```text
http://localhost:3000
```

### Opción 2: Node.js

Con Node.js 18 o superior:

```bash
npm start
```

También puede ejecutarse directamente:

```bash
npx serve -l 3000
```

### Opción 3: VS Code

1. Abrir la carpeta `control-remote-robot-mesero` en VS Code.
2. Instalar la extensión **Live Server**.
3. Hacer clic derecho sobre `index.html`.
4. Seleccionar **Open with Live Server**.

La aplicación es estática y no necesita un backend propio; se comunica directamente con los servicios del robot.

## Uso básico

1. Seleccionar el robot en la lista superior.
2. Pulsar **Conectar**.
3. Verificar que el indicador cambie a **Online**.
4. Confirmar que merchants y productos se hayan cargado.
5. Utilizar los controles necesarios.
6. Revisar la consola para confirmar el resultado de cada operación.

La selección del robot se guarda en el navegador, pero debe verificarse antes de cada uso.

## Pago QR y ventas

Después de conectarse, el panel consulta cada dos segundos el estado del polling del robot.

El bloque de Pago QR puede mostrar:

- Estado del polling.
- Producto, merchant y número de orden.
- Importe de la operación.
- Cantidad total de ventas.
- Importe acumulado.
- Ventas agrupadas por producto.
- Hora de la última venta.

Los botones manuales para iniciar y detener el polling están actualmente ocultos en la interfaz, aunque sus funciones permanecen implementadas en `app.js`.

## Merchants y productos

Al conectar el robot, la aplicación obtiene el catálogo mediante `GET /products`.

Desde la interfaz se puede:

- Seleccionar un merchant.
- Habilitar un merchant y deshabilitar los demás.
- Mostrar u ocultar productos.
- Fijar productos para mantenerlos visibles.
- Guardar cambios pendientes.
- Recargar el catálogo desde el backend.

Los cambios de productos se mantienen localmente hasta pulsar **Guardar filtros**.

## Texto a Voz (TTS)

El servicio TTS se verifica en:

```text
http://{host}:9000/health
```

Para utilizarlo:

1. Conectar un robot.
2. Esperar el indicador **TTS Online**.
3. Escribir el texto en el campo **Texto a Voz**.
4. Pulsar el botón de reproducción.

El audio TTS se reproduce directamente en el navegador del operador. El servicio devuelve audio PCM mono a `24000 Hz` mediante streaming.

Si el indicador muestra **TTS Offline**, los audios preparados pueden continuar funcionando siempre que el robot principal esté conectado.

## Endpoints del robot

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/config` | Consulta la configuración actual. |
| `POST` | `/config` | Actualiza parcialmente la configuración. |
| `POST` | `/attract/set` | Cambia la expresión o GIF del robot. Body: `{ "gif": "happy" }`. |
| `POST` | `/greet` | Muestra el producto y reproduce el saludo. |
| `POST` | `/product` | Muestra únicamente el producto. |
| `POST` | `/play-question` | Reproduce la pregunta de compra. |
| `POST` | `/play-thanks` | Reproduce el agradecimiento. |
| `POST` | `/play-buy` | Reproduce la invitación a comprar. |
| `POST` | `/play-order` | Notifica que existe un pedido. |
| `POST` | `/play-attention` | Reproduce un mensaje de atención. |
| `POST` | `/play-collect-tray` | Solicita recoger la bandeja. |
| `POST` | `/play-coffee` | Reproduce el mensaje de entrega del café. |
| `POST` | `/audio/play` | Reproduce un asset personalizado. |
| `POST` | `/audio/stop` | Detiene el audio remoto. |
| `GET` | `/payment/polling-status` | Consulta el estado del polling y las ventas. |
| `POST` | `/payment/start-polling` | Inicia el polling de pagos. |
| `POST` | `/payment/stop-polling` | Detiene el polling de pagos. |
| `GET` | `/products` | Obtiene merchants y productos. |
| `POST` | `/products/filter` | Actualiza merchants, productos o modo de filtro. |
| `POST` | `/products/reload` | Fuerza la recarga del catálogo. |

El endpoint `/audio/play` acepta campos como:

```json
{
  "asset": "audio/alert_siren.mp3",
  "volume": 1.0,
  "force": false,
  "displayText": null
}
```

## Servicio TTS

La aplicación también utiliza estos endpoints en el puerto `9000`:

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/health` | Comprueba la disponibilidad del servicio. |
| `POST` | `/synthesize/play` | Genera y devuelve el audio de un texto. |

## Instalación como PWA

El proyecto incluye `manifest.json` y puede agregarse a la pantalla de inicio desde navegadores compatibles:

- **Android/Chrome**: menú de tres puntos → **Agregar a pantalla de inicio**.
- **iPhone/Safari**: compartir → **Agregar a pantalla de inicio**.

No se incluye un service worker, por lo que la aplicación no ofrece funcionamiento offline.

## Solución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| El estado permanece Offline | Robot apagado, URL incorrecta o falta de red | Confirmar el robot seleccionado, la red y pulsar **Conectar**. |
| Error de red o CORS | Servicio inaccesible, firewall o CORS no configurado | Comprobar que el dispositivo y el robot estén en la red autorizada y que el backend permita CORS. |
| No aparecen merchants o productos | El catálogo aún no se cargó | Conectar nuevamente y pulsar **Recargar**. |
| Un producto no aparece | Merchant o producto deshabilitado | Habilitar el merchant y el producto, guardar los filtros y volver a mostrar el producto. |
| No se escucha un audio | Volumen, archivo inexistente o audio en cooldown | Revisar el volumen, la consola y la ruta del asset. |
| Suena localmente pero no en el robot | Error en la petición remota | Revisar la respuesta de la consola y reconectar el robot. |
| TTS Offline | Servicio TTS detenido o inaccesible en `:9000` | Verificar `http://{host}:9000/health`. |
| El pago no cambia de estado | Polling, producto o conexión incorrectos | Revisar el bloque de Pago QR, esperar unos segundos y consultar la consola. |


## Manual de usuario

Para instrucciones operativas detalladas, abrir:

```text
manual_usuario_robot_mesero.html
```
