---
title: "Le QR code de paiement sur les factures : format EPC, référence RF et bonnes pratiques"
seoTitle: "QR code de paiement sur facture : le format EPC expliqué"
description: "Le QR code de virement SEPA (EPC069-12) : ce qu’il contient, comment le générer, la référence RF, la taille d’impression et sa prise en charge par les banques."
keywords: ["qr code paiement facture", "qr code virement", "epc qr code", "epc069-12", "girocode", "qr code iban", "qr code sepa facture", "référence rf", "iso 11649", "payer par qr code", "qr code virement bancaire france", "qr code facture iban montant"]
published: 2026-11-10
faq:
  - q: "Est-ce la même chose que la QR-facture suisse ?"
    a: "<p>Non. La QR-facture suisse suit un format propre, obligatoire en Suisse, avec des champs différents. Le QR code EPC présenté ici est le format européen pour les virements SEPA en euros.</p>"
  - q: "Le QR code peut-il être falsifié ?"
    a: "<p>Comme n’importe quelle mention d’une facture, oui, si la facture elle-même est falsifiée. C’est pourquoi le payeur doit vérifier le nom du bénéficiaire affiché par son application avant de valider, comme pour un virement saisi à la main.</p>"
  - q: "Peut-on mettre plusieurs factures dans un QR code ?"
    a: "<p>Un QR code correspond à un virement : un montant, une référence. Pour régler plusieurs factures, le plus simple reste un QR code sur un relevé récapitulatif, avec le total.</p>"
---

Recopier un IBAN de 27 caractères depuis une facture papier ou PDF est une source classique d’erreurs et de retards de paiement. Le **QR code de paiement** règle le problème : le client le scanne avec l’application de sa banque, et le virement se remplit tout seul. Le format est européen, gratuit, et ne demande aucun contrat.

## D’où vient ce format

Le Conseil européen des paiements (EPC) a publié des recommandations, référencées **EPC069-12**, pour que n’importe quelle application bancaire puisse lire les mêmes QR codes. En Allemagne et en Autriche, on l’appelle souvent *GiroCode*, et il est imprimé sur une grande partie des factures.

## Ce qu’il contient

Le contenu est du texte brut, une donnée par ligne :

| Ligne | Contenu | Exemple |
|---|---|---|
| 1 | Marqueur | `BCD` |
| 2 | Version | `002` |
| 3 | Jeu de caractères (1 = UTF-8) | `1` |
| 4 | Type d’opération | `SCT` (virement SEPA) |
| 5 | BIC (facultatif en version 002) | |
| 6 | Nom du bénéficiaire, 70 caractères | `François D'Alsace S.A.` |
| 7 | IBAN | `FR1420041010050500013M02606` |
| 8 | Montant, facultatif | `EUR12.30` |
| 9 | Code motif, facultatif | |
| 10 | Référence structurée **ou**… | |
| 11 | … libellé libre, 140 caractères | `Client:Marie Louise La Lune` |
| 12 | Information pour le payeur, 70 caractères | |

Quelques règles à connaître :

- les lignes vides en fin de contenu sont supprimées, mais une ligne vide au milieu doit rester (ici, le BIC) ;
- le montant s’écrit `EUR`, puis le nombre avec un point décimal, entre 0,01 et 999 999 999,99 ;
- on met **soit** une référence structurée, **soit** un libellé, jamais les deux ;
- l’ensemble ne doit pas dépasser **331 octets**, et le QR code est généré avec le niveau de correction d’erreur **M**.

Le [générateur de QR code](/qr-code-virement-sepa/) applique toutes ces règles et affiche le contenu exact du code.

## La référence RF : pour rapprocher sans effort

Le libellé libre convient pour un numéro de facture. Si votre logiciel rapproche automatiquement les paiements, la **référence structurée RF** (norme ISO 11649) est plus fiable : elle contient ses propres chiffres de contrôle, et une référence mal recopiée se voit tout de suite.

Elle s’écrit `RF`, deux chiffres de contrôle, puis votre référence (21 lettres ou chiffres au plus). Pour la référence interne `539007547034` :

1. on ajoute `RF00` à la fin : `539007547034RF00` ;
2. on remplace R par 27 et F par 15 : `539007547034271500` ;
3. le reste de la division par 97 vaut **80** ;
4. les chiffres de contrôle valent 98 − 80 = **18**.

La référence est donc `RF18 5390 0754 7034`. L’outil la calcule pour vous à partir du numéro de facture.

## Bien l’imprimer

- **Taille** : au moins 2 cm de côté sur papier, davantage si le contenu est long (le code devient plus dense).
- **Marge** : une bordure blanche d’au moins quatre modules autour du code ; ne collez pas de texte ou de logo dessus.
- **Légende** : une phrase comme « Payer par virement : scannez ce code avec votre application bancaire ».
- **En clair** : le nom, l’IBAN, le montant et la référence restent écrits à côté, pour vérification et pour ceux qui ne peuvent pas scanner.

Sur une facture PDF envoyée par e-mail, le QR code se scanne aussi depuis un autre écran, ou s’ouvre directement dans certaines applications.

## Les banques françaises le lisent-elles ?

C’est la limite actuelle. La lecture du QR code EPC est courante dans les applications allemandes, autrichiennes, belges ou néerlandaises ; en France, elle dépend de la banque et progresse. Imprimer le QR code ne coûte rien et ne gêne personne : c’est un raccourci pour ceux qui peuvent l’utiliser, et les autres gardent l’IBAN en clair.

Pour les paiements que vous émettez vous-même en série, le bon outil n’est pas le QR code mais le [fichier de virements groupés](/guides/fichier-virement-groupe-sepa-xml-excel/).
