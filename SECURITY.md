# Seguridad

## Cómo reportar una vulnerabilidad
**No abras un issue público.** Usa el reporte privado de GitHub: pestaña **Security → Report a vulnerability** de este repositorio. Incluye los pasos para reproducirla y la versión afectada.

Respondemos lo antes posible y publicamos la corrección junto con un aviso en las notas de la versión.

## Qué protege Libreta
- Las notas son archivos locales; la app no envía nada a internet.
- Las **notas bloqueadas** usan AES-256-GCM con clave derivada de la contraseña (scrypt). Título, texto y etiquetas se guardan cifrados.

## Límites conocidos
- Las imágenes y archivos adjuntos de una nota bloqueada **no** se cifran.
- Si olvidas la contraseña de una nota bloqueada no hay forma de recuperarla.
- Los instaladores de Windows no están firmados, por lo que SmartScreen puede mostrar un aviso.
