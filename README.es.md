# erase.to

Comparte texto y archivos cifrados de forma temporal.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [简体中文](README.zh-CN.md) · [Português (Brasil)](README.pt-BR.md)

[Abrir erase.to](https://erase.to/) · [Documentación](docs/README.md) · [Modelo de seguridad](docs/threat-model.md) · [Alojamiento propio](docs/operations.md)

erase.to es una herramienta de comunicación efímera creada por RedCamel. La desarrollo y mantengo en funcionamiento como un proyecto independiente de una sola persona.

La privacidad no es una función de pago. El servicio es gratuito, sin cuentas, anuncios ni analítica. El contenido se cifra en tu dispositivo antes de subirlo; el servidor conserva paquetes cifrados en memoria volátil. La aplicación no guarda registros de acceso ni perfiles de visitantes basados en su IP, y la interfaz no carga scripts, fuentes ni CDN de terceros.

Escribe un mensaje o adjunta archivos, elige una caducidad y un límite de recuperaciones y comparte el enlace generado. Una frase de contraseña opcional añade un segundo requisito. El editor se abre directamente, sin registro.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/editor-dark.jpg">
  <img src="docs/images/editor-light.jpg" alt="Editor de mensajes de erase.to en escritorio">
</picture>

<details>
<summary>Vista móvil</summary>

<img src="docs/images/editor-mobile.jpg" alt="Editor de erase.to en un teléfono" width="390">

</details>

## Funciones

| Función | Comportamiento |
| --- | --- |
| Texto y archivos | Hasta **64 MiB en total**, incluidos hasta **8 MiB de texto UTF-8** y **8 archivos**. Los nombres y tipos de medios de los archivos están cifrados. |
| Cifrado en el cliente | XChaCha20-Poly1305, un secreto aleatorio en el enlace y una frase de contraseña opcional con Argon2id. Una frase incorrecta no consume una recuperación. |
| Disponibilidad limitada | La caducidad y el número de recuperaciones se aplican a la vez. La autorización, los cambios del contador y el borrado final son atómicos entre los procesos de API que comparten una instancia primaria de Valkey. |
| Control del remitente | Una autorización independiente de revocación elimina la copia restante del servidor. No se incluye en el enlace del destinatario. |
| Limpieza local | Borrado manual, un plazo de cinco minutos de inactividad con un aviso 30 segundos antes y borrado del contenido descifrado al ocultar la pestaña. |
| Acceso y funcionamiento | Clientes web y de línea de comandos, acceso onion opcional mediante Tor Browser y alojamiento propio con Rust, Svelte y Valkey sin persistencia. |

## Probar una instancia local

Con Git, Docker y Docker Compose instalados:

```sh
git clone https://github.com/RedCamel1312/erase.to.git
cd erase.to
docker compose up --build -d
```

Abre `http://127.0.0.1:3001`. Compose publica únicamente esa dirección de bucle local; la aplicación y la caché utilizan redes internas. Detener la caché descarta sus paquetes.

Para un servicio público, sigue la [guía de operaciones](docs/operations.md), que cubre HTTPS o un contexto de navegador compatible con servicios onion, controles de swap y volcados de memoria, búferes del proxy y verificación del host. Los contenedores por sí solos no garantizan un funcionamiento exclusivamente en RAM. Para trabajar con el código, consulta la [guía de desarrollo](docs/development.md). La documentación técnica detallada está en inglés.

## Límites que conviene conocer

- Un enlace completo concede acceso salvo que se exija una frase de contraseña adicional. Protege el enlace y comparte la frase por separado cuando esa separación sea importante.
- El contador limita las recuperaciones autorizadas, no las personas ni las entregas correctas. Una última recuperación interrumpida puede consumir el paquete. Los destinatarios pueden conservar copias; la revocación y la limpieza local no las eliminan.
- Reiniciar la caché descarta los paquetes. Las transferencias grandes mantienen paquetes completos en memoria, pueden necesitar varias veces el tamaño del contenido y deben terminar dentro de plazos limitados.
- El cifrado no oculta todos los metadatos ni protege un dispositivo comprometido. El servidor ve parámetros de acceso e información de transporte; el navegador también confía en el código que recibe. Revisar el código y superar pruebas no equivale a una auditoría de seguridad independiente ni garantiza el anonimato.

El [modelo de amenazas](docs/threat-model.md) explica estos límites en detalle.

<details>
<summary>Cómo funcionan el protocolo y el almacenamiento</summary>

![Flujo de datos y límites de confianza](docs/images/architecture.svg)

El worker del navegador y la CLI comparten el protocolo versionado de `shared/`. Un secreto aleatorio de 256 bits en el enlace y un nonce de 192 bits permiten el cifrado XChaCha20-Poly1305. Las frases opcionales usan Argon2id v1.3 con 64 MiB de memoria y tres pasadas. Los metadatos autenticados vinculan las reglas del paquete con su contenido; el relleno en bloques de 4 KiB oculta las longitudes exactas, aunque el tamaño aproximado sigue siendo visible.

El secreto del enlace permanece en el fragmento de la URL, que los navegadores omiten en las peticiones HTTP. Los metadatos, la recuperación y la revocación utilizan autorizaciones separadas. El servidor recibe datos cifrados, campos públicos del protocolo, reglas de acceso, hashes de las autorizaciones y la autorización presentada en cada acceso; en el protocolo normal no recibe el texto en claro, los nombres originales, el secreto del enlace, la frase de contraseña ni la clave de descifrado.

La API Rust valida peticiones acotadas y pruebas de trabajo de un solo uso vinculadas al paquete. Scripts fijos de Valkey coordinan caducidad, consumo, revocación y capacidad. Todos los paquetes caducan, la persistencia y la expulsión están desactivadas y se rechazan nuevas subidas cuando se llena la capacidad. Reiniciar solo la API puede conservar los paquetes si la caché sigue funcionando.

Consulta la [especificación del protocolo](docs/protocol.md) y las [fuentes del diseño](docs/research.md) para conocer los formatos exactos y sus motivos.

</details>

<details>
<summary>Desarrollo, línea de comandos y verificación</summary>

Usa Node 24 y la versión de pnpm fijada en `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm cli help
```

La [guía de desarrollo](docs/development.md) cubre Rust, una instancia aislada de Valkey y el servidor de desarrollo del navegador. La [guía de pruebas](docs/testing.md) explica las comprobaciones con caché real, varios procesos y flujos completos. Las pruebas nunca deben usar una caché de producción.

La [guía de la CLI](docs/cli.md) explica el envío, la recepción, la entrada de frases de contraseña y la revocación. No pongas enlaces completos, mensajes ni frases de contraseña en los argumentos o el historial de la shell. La CLI admite HTTPS y HTTP local para desarrollo; rechaza direcciones onion porque no incorpora transporte Tor. Utiliza Tor Browser para acceder por onion. Los archivos recibidos nunca se abren ni se previsualizan automáticamente.

Los directorios principales son `web/` (interfaz), `shared/` (protocolo y criptografía), `server/` (API y operaciones atómicas de caché), `cli/` y `deploy/`. La CI comprueba la aplicación, su comportamiento con caché real y el contenedor de producción. El [índice de documentación](docs/README.md) ofrece el mapa completo.

</details>

## Contribuir o comunicar un problema

La [guía de contribución](CONTRIBUTING.md) cubre desarrollo y revisión. Comunica las vulnerabilidades en privado mediante la [política de seguridad](SECURITY.md). Usa ejemplos ficticios; no publiques enlaces privados, mensajes ni autorizaciones de acceso en las incidencias.

## Apoyar el proyecto

Pago el servidor y el dominio de mi propio bolsillo. Si esta herramienta te resulta útil y quieres apoyar mi trabajo y los gastos de funcionamiento, puedes contribuir con algunos sats. El servicio sigue siendo gratuito.

Bitcoin (BTC):

```text
bc1qddfz8u589nvh0gcxdqcz3yltracn9t9qq9jtm7
```

Creado por RedCamel. Publicado bajo la [licencia MIT](LICENSE). [Avisos de terceros](THIRD_PARTY.md).
