# PresupuestApp

PresupuestApp es una aplicación de presupuestos construida con Angular e Ionic. La autenticación con Firebase es opcional y permite habilitar funciones adicionales sin bloquear el uso principal de la app.

## Requisitos previos

- Node.js 20+
- npm 10+

## Puesta en marcha

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia el archivo `src/environments/environment.ts` con el path `src/environments/environment.local.ts` y configúralo con tus credenciales locales de Firebase (ver siguiente sección).

3. Levanta el servidor de desarrollo:

   ```bash
   npm start
   ```

## Configuración de entornos

El proyecto utiliza tres archivos de configuración:

- `src/environments/environment.ts`: placeholder con definición de variables necesarias.
- `src/environments/environment.local.ts`: desarrollo local.
- `src/environments/environment.prod.ts`: producción (las credenciales se reemplazan a través del pipeline).

### Variables requeridas para desarrollo local

Reemplaza los valores marcados en `src/environments/environment.local.ts` con las credenciales de tu proyecto Firebase:

- `firebase.apiKey`
- `firebase.authDomain`
- `firebase.projectId`
- `firebase.storageBucket`
- `firebase.messagingSenderId`
- `firebase.appId`
- `firebase.measurementId` *(opcional, sólo si usas Analytics)*

Mantén estos valores fuera del control de versiones. El archivo `.gitignore` incluye patrones para ayudarte a proteger credenciales y archivos sensibles relacionados con Firebase.

En producción, el pipeline debe rellenar las variables placeholder definidas en `src/environments/environment.prod.ts` (`${FIREBASE_*}`).

## Autenticación con Firebase

- La autenticación es opcional y actualmente soporta únicamente Google.
- El acceso está disponible desde la pestaña de Ajustes.
- Errores de inicio de sesión o cierres inesperados de sesión se informan al usuario para facilitar el diagnóstico.
- En modo desarrollo se muestra información adicional del usuario autenticado para depuración. En producción estos datos no se muestran.

## Scripts útiles

- `npm start`: levanta la aplicación en modo desarrollo.
- `npm run build`: compila la versión de producción.
- `npm test`: ejecuta la suite de pruebas unitarias.
