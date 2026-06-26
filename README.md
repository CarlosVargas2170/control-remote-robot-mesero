# 🤖 Control Remoto - Mini App QR

Panel de control web (PWA) para manejar el robot totem remotamente desde cualquier celular, tablet o computadora.

## Caracteristicas

- **Botones grandes** tipo panel de control, optimizado para tocar con el dedo.
- **Configuracion de IP** persistente en el navegador (localStorage).
- **Indicador de conexion** en tiempo real (verde = conectado, rojo = sin conexion).
- **Consola de logs** integrada para ver respuestas de cada comando.
- **Audio personalizado**: reproduce cualquier asset del totem con volumen y opcion de forzar.
- **Configuracion remota**: consulta y modifica `merchantId`, `productId`, `baseUrl`, `token` sin reiniciar.
- **PWA instalable**: se puede agregar a la pantalla de inicio del celular como si fuera una app nativa.

## Archivos

```
remote-control/
├── index.html      # Estructura de la app
├── style.css       # Estilos responsive y oscuros
├── app.js          # Logica de fetch a los endpoints
├── manifest.json   # Manifest PWA
└── README.md       # Este archivo
```

## Como levantar

### Opcion 1: Python (recomendado, mas rapido)

```bash
cd remote-control
python3 -m http.server 3000
```

Abre en el navegador: `http://localhost:3000`

### Opcion 2: Node.js (si tienes npm)

```bash
cd remote-control
npx serve -l 3000
```

### Opcion 3: VS Code (Live Server)

1. Abre la carpeta `remote-control` en VS Code.
2. Instala la extension **"Live Server"** de Ritwick Dey.
3. Click derecho en `index.html` -> "Open with Live Server".

### Opcion 4: Copiar a un servidor web

Copia los 4 archivos a cualquier servidor web (Nginx, Apache, S3, GitHub Pages, etc.). Es HTML estatico, no requiere backend.

---

## Como usar

1. **Configura la URL**: escribe la IP del totem en la barra superior.
   - Ejemplo local: `http://localhost:8080`
   - Ejemplo en red: `http://192.168.1.50:8080`
   - La URL se guarda automaticamente en tu navegador.

2. **Pulsa "Probar"** para verificar la conexion. Si el punto se pone verde, estas listo.

3. **Usa los botones**:
   - **Proximidad**: `Cerca` (muestra video), `Lejos` (reposo).
   - **Pantalla**: `Saludar` (producto + audio), `Solo Producto` (solo cambia pantalla).
   - **Audio**: reproduce preguntas, gracias, detener, o cualquier asset personalizado.
   - **Configuracion**: ver o modificar parametros del totem.

4. **Instalar en el celular**:
   - **Android (Chrome)**: Menu (3 puntos) -> "Agregar a pantalla de inicio".
   - **iPhone (Safari)**: Compartir -> "Agregar a pantalla de inicio".
   - Se vera como una app nativa sin barra de direcciones.

---

## Endpoints que usa

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| `POST` | `/proximity/near` | Muestra video de atraccion |
| `POST` | `/proximity/away` | Vuelve a reposo |
| `POST` | `/greet` | Muestra producto + reproduce saludo |
| `POST` | `/product` | Muestra solo el producto |
| `POST` | `/play-question` | Reproduce audio de pregunta |
| `POST` | `/play-thanks` | Reproduce audio de agradecimiento |
| `POST` | `/audio/play` | Reproduce asset personalizado (body: `{asset, volume, force}`) |
| `POST` | `/audio/stop` | Detiene el audio actual |
| `GET`  | `/config` | Lee configuracion actual |
| `POST` | `/config` | Guarda nueva configuracion (body: campos parciales) |

---

## Solucion de problemas

| Problema | Causa probable | Solucion |
|----------|---------------|----------|
| "Sin conexion" (rojo) | IP incorrecta o totem apagado | Verifica la IP del totem en la red |
| `Network Error` | CORS bloqueado o firewall | Asegurate que el totem y el celular esten en la misma red. El servidor del totem ya tiene CORS habilitado. |
| Botones no hacen nada | Totem no cargo aun el producto | Espera a que la app del totem diga "Esperando..." o muestre el video |
| Audio personalizado no suena | Asset no existe en `assets/audio/` | Verifica que el archivo exista en el totem |

---

## Notas de seguridad

- Esta app **no tiene autenticacion**. Cualquiera en la misma red puede controlar el totem.
- Para produccion en red publica, considera poner un reverse proxy con autenticacion basica (Nginx + htpasswd) o VPN.
- El token Bearer de la API de pagos **no se expone** por estos endpoints (solo se usa internamente en el totem).
