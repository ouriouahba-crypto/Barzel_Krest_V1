# SCORING_REPORT — marges de promotion commerciales réalistes

Correction : la marge de promotion des classes **commerciales** utilisait le **coût de construction et le foncier du résidentiel** (foncier zone 125 €/m² à Afurada) et la TVA résidentielle → marges aberrantes. Désormais, par paramètres propres à chaque classe (`commercial_gaia.classes`) :
- **Coût de construction €/m²** par classe : bureaux 1500, hôtellerie 2200, logistique 500, commerce 1400.
- **Foncier commercial = % du prix de la classe** dans la freguesia (part réaliste du foncier dans la valeur commerciale prime) : bureaux 34 %, hôtellerie 21 %, commerce 48 %, logistique 12 %.
- **TVA commerciale récupérable** (neutre pour le promoteur ; le résidentiel reste inchangé, avec TVA + prime neuf + foncier €/m² par zone).

## Afurada (Santa Marinha e São Pedro da Afurada) — marge promotion AVANT / APRÈS

| classe | prix marché €/m² | marge AVANT | marge APRÈS | cible | verdict APRÈS |
|---|---:|---:|---:|---|---|
| Bureaux | 4663 | +74% | **20%** | 15-25% | Go |
| Hôtellerie | 4800 | +46% | **19%** | 15-22% | Go |
| Logistique | 880 | -31% | **15%** | 12-18% | Conditionnel |
| Commerce | 7855 | +232% | **20%** | 15-25% | Go |

Toutes les classes retombent dans les bornes réalistes. Extrait « pourquoi » (APRÈS) :
- **Bureaux** : marge développeur 20% (foncier 1585 €/m² (34% du prix office) · vente 4663 €/m² nette TVA 4663, coût 3891 €/m² dont financement 250 €/m² à 4.5% × 3 ans × LTV 60%)
- **Hôtellerie** : marge développeur 19% (foncier 1008 €/m² (21% du prix hotel) · vente 4800 €/m² nette TVA 4800, coût 4045 €/m² dont financement 260 €/m² à 4.5% × 3 ans × LTV 60%)
- **Logistique** : marge développeur 15% (foncier 106 €/m² (12% du prix logistics) · vente 880 €/m² nette TVA 880, coût 764 €/m² dont financement 49 €/m² à 4.5% × 3 ans × LTV 60%)
- **Commerce** : marge développeur 20% (foncier 3770 €/m² (48% du prix retail) · vente 7855 €/m² nette TVA 7855, coût 6520 €/m² dont financement 419 €/m² à 4.5% × 3 ans × LTV 60%)

_Le résidentiel est inchangé (Haya et le curseur intacts). Le foncier commercial élevé (48 % pour le commerce prime, 34 % bureaux) reflète la part réelle du foncier dans la valeur d'un actif commercial prime ; la logistique a un coût de construction d'entrepôt (500 €/m²)._
