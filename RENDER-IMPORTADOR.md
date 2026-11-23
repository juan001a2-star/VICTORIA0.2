# Banca Victoria — corrección inicial del importador en Render

## Cambios incluidos

- El Dockerfile instala Playwright 1.64.1 y Chromium con sus dependencias del sistema durante la construcción de la imagen.
- El empaquetado del backend marca `playwright` como externo para que Node lo cargue desde `node_modules` en producción.
- El importador reconoce los nombres `New York Tarde` y `New York Noche` como aliases. Esto permite cruzar esos nombres si la fuente consultada realmente publica esos sorteos.
- La fecha predeterminada del importador se calcula con `America/Santo_Domingo` mediante `Intl`, sin restar cuatro horas fijas.
- El error de carga de Playwright ahora conserva el detalle técnico.

## Publicación

1. Haz una copia de seguridad de PostgreSQL en Render.
2. Sustituye el código del repositorio por esta versión o aplica los cambios del ZIP.
3. Confirma que el servicio de Render usa `Dockerfile` como runtime y que `Dockerfile Path` apunta al archivo correcto.
4. Haz commit y push a la rama conectada a Render. El servicio debe reconstruir la imagen; un simple restart no instala Chromium.
5. En los logs de build, confirma que finalizan `npm ci`, la instalación de Playwright y `npx playwright install --with-deps chromium`.
6. Abre Importar resultados y actualiza la vista previa. Playwright ya no debería aparecer como “no instalado”.

## Límite importante

Esta corrección resuelve la ausencia del navegador en el contenedor, pero NO garantiza que aparezcan las 27 loterías. El scraper de esta versión todavía consulta únicamente `https://loterias.do/`, `https://loterias.do/leidsa/` y `https://www.nacionalloteria.com/republica-dominicana/resultados-leidsa.php`; el fallback de Playwright consulta `loterias.do` y `leidsa.com`. Antes de declarar cobertura para Florida, Nueva York, New Jersey, Georgia, Anguila o Haití, hay que identificar y validar una fuente adecuada para cada sorteo, y escribir un parser específico para su estructura. No se agregaron fuentes inventadas ni se cambia la importación manual confirmada.

## Validación posterior

- Revisar los logs del servicio y el resultado de cada fuente.
- Probar una fecha con resultados ya publicados y comparar cada número con la página oficial correspondiente.
- No confirmar/importar resultados con confianza baja o sin verificación humana.

## Referencias Conectate añadidas

Se añadieron como referencias de consulta:
- https://www.conectate.com.do/
- https://www.conectate.com.do/loterias/

La portada se utiliza solo para descubrir navegación; no se interpreta como una página de resultados. El índice `/loterias/` se consulta y sus enlaces internos reconocidos se visitan por lotería. También se añadieron las páginas de New York Tarde y New York Noche al recorrido de Playwright.

Conectate es una fuente informativa de terceros, no el operador oficial. Los resultados detectados continúan en vista previa y requieren confirmación manual. La extracción debe probarse en Render porque la disponibilidad del HTML y los componentes dinámicos puede variar.

## Referencias Conectate añadidas

Se añadieron como referencias de consulta:
- https://www.conectate.com.do/
- https://www.conectate.com.do/loterias/

La portada se utiliza solo para descubrir navegación; no se interpreta como una página de resultados. El índice `/loterias/` se consulta y sus enlaces internos reconocidos se visitan por lotería. También se añadieron las páginas de New York Tarde y New York Noche al recorrido de Playwright.

Conectate es una fuente informativa de terceros, no el operador oficial. Los resultados detectados continúan en vista previa y requieren confirmación manual. La extracción debe probarse en Render porque la disponibilidad del HTML y los componentes dinámicos puede variar.
