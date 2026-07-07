# Photos de ville (couche d'entrée)

L'écran de choix de ville (`/villes`) et la révélation ville (lot 3) attendent
une photo par ville, en `.webp` optimisée, nommée par le slug du registre
(`lib/cities.ts`) :

| Fichier attendu   | Ville             | Photo source          |
| ----------------- | ----------------- | --------------------- |
| `porto.webp`      | Porto             | Ponte Luís I          |
| `lisbonne.webp`   | Lisbonne          | Torre de Belém        |
| `gaia.webp`       | Vila Nova de Gaia | Serra do Pilar        |
| `bruxelles.webp`  | Bruxelles         | Grand-Place           |

Tant qu'un fichier est absent, la carte de ville retombe proprement sur le fond
navy (aucun visuel cassé).

## Conversion (une commande, sur macOS)

Déposer les photos sources (jpg/png) où vous voulez, puis, depuis ce dossier :

```
sips -s format webp --resampleWidth 1600 /chemin/porto.jpg    --out porto.webp
sips -s format webp --resampleWidth 1600 /chemin/lisbonne.jpg --out lisbonne.webp
sips -s format webp --resampleWidth 1600 /chemin/gaia.jpg     --out gaia.webp
sips -s format webp --resampleWidth 1600 /chemin/bruxelles.jpg --out bruxelles.webp
```

Alternative si `cwebp` (webp tools) est installé :

```
cwebp -q 80 -resize 1600 0 /chemin/porto.jpg -o porto.webp
```

Ne jamais committer les `.png`/`.jpg` sources : seules les `.webp` finales
vivent ici.
