---
title: "Prélèvement SEPA : ICS, RUM, mandat et séquences expliqués simplement"
seoTitle: "Prélèvement SEPA : ICS, RUM, mandat, FRST et RCUR expliqués"
description: "Tout ce qu’il faut pour prélever ses clients ou adhérents : identifiant créancier (ICS) et sa clé, RUM, mandat, séquences FRST/RCUR, délais et fichier pain.008."
keywords: ["prélèvement sepa", "identifiant créancier sepa", "ics", "numéro ics", "rum mandat", "référence unique de mandat", "mandat de prélèvement sepa", "frst rcur", "séquence prélèvement", "prélèvement association cotisation", "pré-notification prélèvement", "délai prélèvement sepa", "pain.008"]
published: 2026-11-10
faq:
  - q: "Un particulier peut-il refuser un prélèvement ?"
    a: "<p>Oui. Il peut demander à sa banque de bloquer un créancier ou de limiter le montant, et il peut se faire rembourser un prélèvement autorisé pendant 8 semaines, sans avoir à se justifier. Sans mandat valable, le délai de contestation est de 13 mois.</p>"
  - q: "Que se passe-t-il si un mandat n’est pas utilisé ?"
    a: "<p>Un mandat qui n’a donné lieu à aucun prélèvement pendant 36 mois devient caduc. Il faut alors en faire signer un nouveau.</p>"
  - q: "Le débiteur change de banque : faut-il un nouveau mandat ?"
    a: "<p>Non. Le mandat reste valable ; vous mettez simplement à jour son IBAN. La RUM ne change pas.</p>"
---

Le prélèvement SEPA est le moyen le plus simple d’encaisser des sommes régulières : cotisations d’une association, abonnements, loyers, échéanciers. Mais il arrive avec son vocabulaire : ICS, RUM, mandat, FRST, RCUR. Voici ce que chaque terme recouvre, et ce qu’il faut vérifier avant d’envoyer un fichier.

## L’ICS, votre identifiant de créancier

L’**identifiant créancier SEPA** (ICS) vous identifie comme émetteur de prélèvements. Il apparaît sur le relevé de chaque débiteur, à côté de votre nom. Vous le demandez à votre banque avant votre premier prélèvement, et il vous suit si vous changez de banque.

En France, il compte 13 caractères :

```
FR  07  ZZZ  591778
│   │   │    └─ identifiant national (6 caractères)
│   │   └────── code activité (souvent ZZZ, libre)
│   └────────── clé de contrôle
└────────────── pays
```

### La clé de contrôle

La clé se calcule comme celle d’un IBAN, mais **sans le code activité** :

1. on prend l’identifiant national, suivi du code pays et de `00` : `591778` `FR` `00` ;
2. on remplace les lettres par des nombres (A = 10… F = 15, R = 27) : `591778152700` ;
3. on calcule le reste de la division par 97 : **91** ;
4. la clé vaut 98 − 91 = **07**.

Le code activité (`ZZZ` ici) peut donc être changé sans changer la clé. Le [générateur de prélèvements](/prelevement-sepa-xml/) refuse un ICS dont la clé est fausse : c’est souvent le signe d’un ICS recopié de travers.

## Le mandat et sa RUM

Aucun prélèvement sans **mandat** : un document signé par le débiteur, qui vous autorise à prélever son compte. Il doit comporter au minimum :

- vos nom, adresse et ICS ;
- le nom, l’adresse et l’IBAN du débiteur ;
- le type de paiement : récurrent ou ponctuel ;
- la date et le lieu de signature, et la signature ;
- la **référence unique du mandat** (RUM).

La **RUM** est un identifiant que vous choisissez, 35 caractères au plus, unique pour chaque mandat chez vous. Par exemple `ADH-2026-0031` ou le numéro de contrat. Une fois choisie, elle ne doit plus changer : c’est elle que la banque du débiteur compare d’un prélèvement à l’autre.

Le mandat se conserve chez vous, pas à la banque. Vous devez pouvoir le produire en cas de contestation.

## Les séquences : FRST, RCUR, OOFF, FNAL

Chaque prélèvement indique sa place dans la vie du mandat :

| Code | Signification | Quand l’utiliser |
|---|---|---|
| `FRST` | premier | le premier prélèvement d’un mandat récurrent (facultatif depuis 2016) |
| `RCUR` | récurrent | tous les suivants, et désormais aussi le premier |
| `FNAL` | final | le dernier d’une série, quand vous le savez |
| `OOFF` | ponctuel | un prélèvement unique, avec un mandat ponctuel |

Depuis novembre 2016, le premier prélèvement peut être envoyé en `RCUR` : la distinction `FRST` n’est plus obligatoire, mais reste acceptée. Dans le fichier, la séquence se déclare au niveau du lot. Un fichier qui mélange plusieurs séquences contient donc plusieurs lots, ce que le générateur fait automatiquement.

## Les délais

**Prévenir le débiteur.** Avant chaque prélèvement, le débiteur doit connaître le montant et la date. Par défaut, cette pré-notification se fait au moins **14 jours** avant l’échéance ; un délai plus court peut être prévu dans le contrat ou le mandat. Un échéancier annuel envoyé une fois suffit pour des montants fixes.

**Remettre le fichier.** Entre banques, un prélèvement CORE doit être présenté au moins un jour ouvré avant l’échéance, quelle que soit la séquence. Votre banque ajoute sa propre heure limite, souvent la veille ouvrée avant midi, parfois davantage : elle figure dans votre contrat de remise.

**L’échéance** doit être un jour ouvré du calendrier TARGET (pas de week-end, ni de 1<sup>er</sup> janvier, Vendredi saint, lundi de Pâques, 1<sup>er</sup> mai, 25 et 26 décembre).

## CORE ou B2B

- **CORE** : le prélèvement standard, pour tous les débiteurs. Remboursement possible pendant 8 semaines sur simple demande du débiteur.
- **B2B** (interentreprises) : réservé aux débiteurs professionnels. Pas de droit au remboursement, mais le débiteur doit avoir communiqué le mandat à sa banque avant le premier prélèvement, sinon il est rejeté.

Un même fichier ne peut pas mélanger CORE et B2B.

## Le fichier pain.008

Comme pour les virements, la banque attend un XML ISO 20022 : le **pain.008**, en version 2019 (`pain.008.001.08`) ou 2009 (`pain.008.001.02`). Chaque prélèvement y porte la RUM, la date de signature du mandat, l’IBAN du débiteur et le montant ; chaque lot porte votre ICS, la séquence et la date d’échéance.

Le plus simple est de tenir un tableau de vos mandats (nom, IBAN, RUM, date de signature, montant) et de le transformer avec le [générateur de prélèvements SEPA](/prelevement-sepa-xml/). Pour les virements, la méthode est dans [du tableau Excel au fichier XML](/guides/fichier-virement-groupe-sepa-xml-excel/).
