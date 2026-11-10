<div align="center">

# SEPA XML Tools

**Créer des fichiers de virements et de prélèvements SEPA (XML pain.001, pain.008) à partir d'Excel, et des QR codes de paiement, dans le navigateur.**

[**→ Ouvrir le générateur**](https://sepa-xml-tools.kothanromeo.dev/) · [Guides](https://sepa-xml-tools.kothanromeo.dev/guides/) · [Signaler un problème](https://github.com/kothanromeo/sepa-xml-tools/issues)

![Tests](https://github.com/kothanromeo/sepa-xml-tools/actions/workflows/ci.yml/badge.svg)
![Licence MIT](https://img.shields.io/badge/licence-MIT-blue)

</div>

---

Payer des fournisseurs ou des salaires, prélever des cotisations : les banques acceptent un fichier qui contient toutes les opérations d'un coup. Ce fichier suit la norme ISO 20022 et se fabrique mal à la main. SEPA XML Tools le produit à partir d'un tableau, sans envoyer vos IBAN nulle part.

## Fonctionnalités

- **Virements** : fichier `pain.001.001.09` (2019) ou `pain.001.001.03` (2009), virements instantanés (`INST`), option « une seule ligne sur le relevé ».
- **Prélèvements** : fichier `pain.008.001.08` ou `pain.008.001.02`, CORE ou B2B, un lot par séquence (FRST, RCUR, OOFF, FNAL), contrôle de la clé de l'ICS.
- **Import** Excel (.xlsx) ou CSV avec reconnaissance des colonnes, ou saisie directe dans une grille modifiable ; modèle Excel téléchargeable.
- **Contrôles** : IBAN (modulo 97, longueur, clé RIB), RIB converti en IBAN, BIC, montants, dates (calendrier TARGET et jours fériés français), longueurs, références en double, mandat signé après l'échéance.
- **Jeu de caractères** des banques françaises (guide CFONB) : accents et symboles convertis plutôt que rejetés.
- **QR code de paiement** au format EPC069-12 (niveau M, 331 octets au plus), référence structurée RF (ISO 11649), export PNG et SVG.
- **Lecteur** de fichiers pain.001 et pain.008 existants : totaux recalculés, IBAN et ICS vérifiés, export Excel.

Chaque version produite est validée dans les tests contre les schémas XSD officiels de l'ISO 20022.

## Structure

```
src/lib/sepa/
├── build.ts      Génération XML pain.001 et pain.008 (deux versions chacun)
├── compose.ts    En-tête + lignes contrôlées → fichier, avec les messages
├── rows.ts       Reconnaissance des colonnes, contrôle de chaque ligne
├── text.ts       Jeu de caractères SEPA, identifiants
├── amount.ts     Lecture des montants (1 234,56 ; 1,234.56…), centimes
├── dates.ts      Calendrier TARGET, jours fériés, lecture des dates
├── ics.ts        Identifiant créancier SEPA et sa clé
├── epc.ts        QR code EPC, référence RF
├── read.ts       Lecture et contrôle d'un fichier pain.001 / pain.008
└── sample.ts     Exemples, modèle Excel, export du lecteur
src/lib/          iban.ts, table.ts (CSV/XLSX), xlsx.ts (écriture Office Open XML)
src/scripts/      gen-ui.ts, reader-ui.ts, qr-ui.ts
```

## Développement

```bash
npm install
npm run dev     # http://localhost:4321/
npm test        # tests Vitest (les fichiers générés sont écrits dans tests/out/)
npm run build   # site statique dans dist/
```

## Limites

Le fichier respecte la norme, mais c'est votre contrat de banque en ligne qui détermine ce que vous pouvez importer (service de remise de fichiers, prélèvements, virements instantanés). Un IBAN valide ne dit rien de son titulaire : la vérification du bénéficiaire reste du ressort de la banque.

## Contribuer

Issues et pull requests bienvenues, en particulier les retours de banques qui refuseraient un fichier. **Ne publiez jamais de vrais IBAN** : anonymisez vos exemples.

## Licence

[MIT](LICENSE) © Roméo Kothan
