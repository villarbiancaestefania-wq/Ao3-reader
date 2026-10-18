# Biblioteca (lector privado de fics de AO3)

App Android hecha con React + Capacitor. Todo se guarda en el celular (IndexedDB), sin cuentas ni servidores.

## Qué hace
- Pegás el link de un fic de AO3 y se descarga entero (todos los capítulos publicados).
- Retoma exactamente donde quedaste (capítulo + posición).
- Portada elegida desde la galería (o una portada generada automáticamente).
- Estilo de lectura: 4 temas, 4 tipografías, tamaño, interlineado, márgenes, justificado, modo deslizar o páginas.
- Buscar capítulos nuevos en fics en curso.
- Copia de seguridad: exportar e importar un archivo JSON.

## Opción A: compilar el APK en la nube (sin instalar nada)
1. Subí esta carpeta a un repositorio nuevo de GitHub (rama `main`).
2. Entrá a la pestaña Actions, abrí "Build APK" y tocá Run workflow.
3. Cuando termine (unos 5 a 10 min), bajá el artefacto `biblioteca-apk`, descomprimilo e instalá `app-debug.apk` en el celular
   (hay que permitir "instalar apps de orígenes desconocidos").

## Opción B: compilar en tu PC
Necesitás Node 20+, JDK 21 y Android Studio (o el SDK de Android).

    npm install
    npm run build
    npx cap sync android
    cd android && ./gradlew assembleDebug      # en Windows: gradlew.bat assembleDebug

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.
También podés abrir la carpeta con `npx cap open android` y usar Build > Build APK(s).

## Después de cambiar código
    npm run sync      # compila la web y la copia a Android

## Notas
- AO3 limita los pedidos: si aparece "pidió esperar", esperá unos minutos.
- Los fics solo para usuarios registrados no se pueden bajar (la app no tiene login).
- Los datos viven solo en el celular: usá Ajustes > Exportar copia de vez en cuando.
- En el navegador de la PC la descarga falla por CORS; solo funciona dentro del APK.
