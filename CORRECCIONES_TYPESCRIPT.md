# Banca Victoria — paquete corregido

Este paquete parte del proyecto `Banca-Victoria-v50-horarios-automaticos` y contiene la integración del módulo de Contabilidad y Monitoreo, además de correcciones a los errores TypeScript indicados en el registro de PowerShell.

## Incluye

- Módulo de Contabilidad y Monitoreo para administración y supervisión.
- Consultas de ventas, tickets, grupos, vendedores y jugadas.
- Registro del motivo de anulación de tickets.
- Notificaciones de tickets anulados y ganadores.
- Cambios de esquema idempotentes para `annul_reason` y `notifications`.
- Limpieza de importaciones/variables no utilizadas y correcciones de tipos/nullabilidad detectadas en `npm run check`.

## Reemplazar el proyecto local

1. Haz una copia de seguridad de la carpeta `app` actual.
2. Descomprime este ZIP.
3. Copia el contenido de `Banca-Victoria-corregida` dentro de tu carpeta `app`.
4. **No reemplaces ni elimines** tu archivo `.env` ni tu carpeta `.git` existentes. El ZIP no incluye ninguno de esos dos elementos.
5. Desde PowerShell, dentro de la carpeta `app`, ejecuta:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run build
```

6. Si `check` y `build` terminan sin errores, prueba primero con una copia de la base de datos antes de publicar en Render.

## GitHub y Render

Este ZIP no modifica el repositorio remoto ni despliega la aplicación. Cuando termines las pruebas locales:

```powershell
git status
git add .
git commit -m "feat: contabilidad y monitoreo; correcciones TypeScript"
git push origin main
```

Revisa los logs de Render después del despliegue.

## Estado de validación

Se corrigieron los diagnósticos del registro compartido (incluidos los 28 errores reportados por `npm run check`). En este entorno no fue posible completar una instalación limpia de todas las dependencias para ejecutar una validación integral posterior; por eso debes ejecutar los comandos anteriores en tu equipo antes de subir a producción.

No ejecutes `npm audit fix --force` como parte de esta actualización: puede introducir cambios incompatibles de dependencias.
