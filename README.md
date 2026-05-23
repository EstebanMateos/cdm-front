# CDM Front

Interface web locale pour suivre les pronostics Coupe du Monde 2026.

## Lancement local

```bash
npm install
npm run dev
```

Interface disponible sur `http://localhost:5173` en développement.

Si le backend tourne ailleurs :

```bash
VITE_API_URL=http://adresse-du-nuc:5050 npm run dev
```

En production sur le NUC, le projet racine fournit un `docker-compose.yml` qui sert le build via nginx sur le port `8080`.

## Pages

- `/` : classement public en lecture seule.
- `/admin` : login local, import XLSX, mode test, édition manuelle des pronostics.

Identifiants par défaut côté backend :

```text
admin:admin
```
