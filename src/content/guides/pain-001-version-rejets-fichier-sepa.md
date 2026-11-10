---
title: "pain.001.001.03 ou pain.001.001.09 : les versions du fichier SEPA et les causes de rejet"
seoTitle: "pain.001.001.03 ou .09 ? Versions SEPA et causes de rejet"
description: "pain.001.001.03 ou .09 : les différences, la migration ISO 20022, les adresses après le 15 novembre 2026 et les causes de rejet les plus fréquentes."
keywords: ["pain.001.001.03", "pain.001.001.09", "différence pain.001.001.03 et 09", "fichier sepa rejeté", "rejet remise virement", "erreur fichier xml sepa", "iso 20022 2019", "adresse structurée sepa", "adresse hybride iso 20022", "pain.008.001.08", "pain.002 rejet", "msgid déjà utilisé"]
published: 2026-11-10
faq:
  - q: "Comment savoir quelle version ma banque accepte ?"
    a: "<p>Le guide d’import de votre banque en ligne, ou votre conseiller, l’indique. En pratique, les banques françaises acceptent les deux versions ; en cas de doute, essayez la 09 et gardez la 03 en solution de repli.</p>"
  - q: "Mon fichier est en version 03 : dois-je le changer tout de suite ?"
    a: "<p>Ce n’est pas une urgence pour des virements SEPA simples entre comptes européens. Prévoyez la migration à l’occasion d’un changement de logiciel ou si votre banque vous le demande.</p>"
  - q: "Qu’est-ce qu’un pain.002 ?"
    a: "<p>C’est le compte rendu que certaines banques renvoient après l’import : il indique si la remise a été acceptée, et sinon, le code du motif de rejet pour chaque opération.</p>"
---

Un fichier de virements ou de prélèvements SEPA est un message de la norme **ISO 20022**. Comme toute norme, elle a des versions. Côté client, deux coexistent en France, et on se demande souvent laquelle choisir, surtout après un rejet.

## Les deux versions en circulation

| | Version 2009 | Version 2019 |
|---|---|---|
| Virements | `pain.001.001.03` | `pain.001.001.09` |
| Prélèvements | `pain.008.001.02` | `pain.008.001.08` |
| Statut | historique, toujours accepté | recommandé par le CFONB |

La version se lit dans la première balise du fichier :

```xml
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
```

Entre banques, la migration vers la version 2019 a eu lieu le **17 mars 2024** pour les virements et les prélèvements SEPA. Côté clients, les banques françaises continuent d’accepter les deux versions, mais recommandent la 2019. Elle devient même indispensable pour certains usages : indiquer l’heure d’exécution d’un virement instantané, transmettre des adresses riches, ou suivre un virement international de bout en bout.

## Ce qui change concrètement

Pour un virement SEPA courant, les différences sont minimes :

- le BIC s’écrit `<BICFI>` au lieu de `<BIC>` ;
- la date d’exécution est enveloppée : `<ReqdExctnDt><Dt>2026-11-13</Dt></ReqdExctnDt>` au lieu de `<ReqdExctnDt>2026-11-13</ReqdExctnDt>`. Pour un virement instantané, `<DtTm>` permet de préciser l’heure ;
- les adresses postales gagnent des champs (bâtiment, étage, boîte postale…) ;
- un identifiant de suivi universel (UETR) peut être ajouté.

Un logiciel qui produit la version 03 ne fabrique donc pas un « mauvais » fichier, mais un fichier ancien.

## Les adresses : la date du 15 novembre 2026

C’est le changement à surveiller. Dans les échanges de paiements, une adresse peut s’écrire de trois façons :

- **non structurée** : des lignes de texte libre (`AdrLine`) ;
- **structurée** : chaque élément dans son champ (rue, code postal, ville, pays) ;
- **hybride** : ville et pays dans leurs champs, le reste en lignes libres.

D’après le calendrier publié par le CFONB, l’adresse non structurée n’est plus admise pour les paiements SEPA **après le 15 novembre 2026**. Le format hybride est accepté depuis le 5 octobre 2025.

Dans un virement SEPA entre pays de l’Espace économique européen, l’adresse est facultative : un fichier sans adresse reste valable. Elle est en revanche exigée pour les virements vers la Suisse, le Royaume-Uni ou Monaco, et pour les prélèvements sur des comptes hors EEE. Le [générateur](/) n’écrit les adresses qu’au format structuré.

## Les causes de rejet les plus fréquentes

**1. Nombre ou total d’en-tête faux.** `NbOfTxs` et `CtrlSum` doivent correspondre exactement au contenu, dans l’en-tête et dans chaque lot. C’est le rejet typique d’un fichier modifié à la main.

**2. Un IBAN invalide.** Une seule erreur de clé suffit à faire rejeter l’opération, parfois toute la remise selon la banque.

**3. Un caractère interdit.** Accents, `&`, `@`, guillemets typographiques : hors du jeu de caractères SEPA (`a-z A-Z 0-9 / - ? : ( ) . , ' +` et l’espace), ils provoquent des rejets ou des remplacements. Le `&` est le pire : non échappé, il rend le XML illisible.

**4. Un identifiant de message déjà utilisé.** Les banques refusent un fichier dont le `MsgId` a déjà été reçu, pour éviter les doublons. Réimporter un ancien fichier ne marche donc pas : il faut le régénérer.

**5. Une date impossible.** Date d’exécution passée, trop lointaine ou, pour un prélèvement, trop proche de l’échéance.

**6. Une version ou un service non souscrit.** Le contrat de banque en ligne n’inclut pas l’import de fichiers, ou pas les prélèvements, ou pas les virements instantanés par fichier.

**7. Des montants mal formés.** Une virgule au lieu du point décimal, plus de deux décimales, un montant nul ou négatif.

**8. Pour les prélèvements :** ICS faux, RUM absente ou modifiée d’un prélèvement à l’autre, date de signature du mandat manquante, mélange CORE et B2B.

## Diagnostiquer un fichier

Le [lecteur de fichiers SEPA](/lire-fichier-sepa-xml/) ouvre n’importe quel pain.001 ou pain.008, recalcule les nombres et les totaux, vérifie chaque IBAN, l’ICS et les caractères, et exporte le contenu vers Excel. C’est le moyen le plus rapide de trouver la ligne fautive avant de rappeler la banque.

Pour repartir sur une base saine, la méthode complète est dans [du tableau Excel au fichier XML](/guides/fichier-virement-groupe-sepa-xml-excel/).
