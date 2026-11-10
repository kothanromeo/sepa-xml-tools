---
title: "Virements groupés : passer d’un tableau Excel à un fichier SEPA XML"
seoTitle: "Fichier de virement groupé SEPA XML depuis Excel : la méthode"
description: "Préparer un fichier de virements groupés (pain.001) à partir d’Excel : colonnes, contrôles, caractères autorisés, date d’exécution et import dans la banque."
keywords: ["fichier virement groupé", "virement groupé excel", "fichier xml virement sepa", "créer fichier sepa xml", "pain.001 excel", "virement de masse", "remise de virements banque", "virement fournisseurs en masse", "virement salaires fichier", "import virements banque en ligne", "batch booking", "virement instantané fichier"]
published: 2026-11-10
faq:
  - q: "Combien de virements peut contenir un fichier ?"
    a: "<p>La norme ne fixe pas de limite pratique ; ce sont les banques qui en fixent une, généralement plusieurs milliers d’opérations par remise. Pour quelques dizaines ou centaines de virements, aucune banque ne pose problème.</p>"
  - q: "Peut-on mélanger virements classiques et instantanés ?"
    a: "<p>Pas dans le même lot : le caractère instantané se déclare pour tout le lot. Faites deux fichiers, ou deux remises.</p>"
  - q: "Le fichier peut-il être réutilisé le mois suivant ?"
    a: "<p>Non, pas tel quel : chaque fichier porte un identifiant de message unique et une date d’exécution. La plupart des banques refusent un identifiant déjà reçu. Régénérez le fichier à partir du même tableau, c’est instantané.</p>"
---

Payer vingt fournisseurs ou verser les salaires d’une petite équipe en saisissant chaque virement à la main, c’est long et c’est là que naissent les erreurs d’IBAN. Presque toutes les banques proposent pourtant d’**importer un fichier** qui contient tous les virements d’un coup. Ce fichier a un format précis, le **pain.001** de la norme ISO 20022. Voici comment le produire à partir d’un simple tableau.

## Ce que la banque attend

Un fichier de virements SEPA est un document XML organisé en trois niveaux :

```
Document
└─ CstmrCdtTrfInitn          la remise
   ├─ GrpHdr                 l’en-tête : identifiant, date de création, nombre et total
   └─ PmtInf                 un lot : compte débité, date d’exécution
      ├─ CdtTrfTxInf         un virement : bénéficiaire, IBAN, montant, libellé
      ├─ CdtTrfTxInf
      └─ …
```

L’en-tête annonce le **nombre de virements** (`NbOfTxs`) et leur **total** (`CtrlSum`). Si l’un des deux ne correspond pas au contenu, la banque rejette le fichier entier. C’est la principale raison de ne pas fabriquer ce XML à la main.

## Étape 1 : préparer le tableau

Une ligne par virement, une ligne d’en-tête, et au minimum trois colonnes :

| Colonne | Exemple | Remarque |
|---|---|---|
| Nom du bénéficiaire | Imprimerie Lefèvre | 70 caractères au plus |
| IBAN | FR76 3000 6000 0112 3456 7890 189 | espaces acceptés |
| Montant | 1 250,00 | virgule ou point, sans signe moins |

Deux colonnes facultatives sont très utiles :

- **le libellé**, que le bénéficiaire verra sur son relevé (140 caractères) : numéro de facture, « Salaire novembre »… ;
- **la référence de bout en bout**, 35 caractères, qui accompagne le virement jusqu’au bénéficiaire et facilite les rapprochements.

Le BIC n’est plus nécessaire pour les virements dans l’Espace économique européen. Il reste demandé pour la Suisse, le Royaume-Uni ou Monaco, et dans ce cas votre propre adresse doit aussi figurer dans le fichier.

Le [générateur de virements](/) propose un modèle Excel prêt à remplir, et reconnaît de toute façon les colonnes d’un export de votre logiciel de comptabilité ou de paie.

## Étape 2 : les contrôles qui évitent un rejet

**Les IBAN.** Chaque IBAN porte une clé de contrôle (modulo 97) qui détecte presque toutes les fautes de frappe, et l’IBAN français contient en plus l’ancienne clé RIB. Un IBAN faux bloque le virement concerné, parfois toute la remise.

**Les caractères.** Les banques françaises n’acceptent, sauf accord, que les lettres non accentuées, les chiffres, l’espace et les signes `/ - ? : ( ) . , ' +`. Un « é » ou un « & » dans un nom peut faire rejeter le fichier. La solution la plus sûre est de convertir : « Lefèvre & Fils » devient « Lefevre et Fils ».

**Les longueurs.** 70 caractères pour un nom, 140 pour un libellé, 35 pour une référence. Au-delà, la banque tronque ou rejette.

**Les montants.** Strictement positifs, en euros, avec deux décimales au plus.

## Étape 3 : choisir la date et les options

**La date d’exécution** est le jour où votre compte sera débité. Elle doit être un jour ouvré et ne peut pas être dans le passé. Un fichier déposé après l’heure limite de la banque (souvent en milieu d’après-midi) part le jour ouvré suivant.

**Le virement instantané.** Depuis le 9 octobre 2025, toutes les banques de la zone euro doivent permettre d’envoyer des virements instantanés, au même prix que les virements classiques. Dans le fichier, il suffit d’ajouter le code `INST` au lot. Vérifiez quand même que votre banque accepte les remises instantanées par fichier.

**Une seule ligne sur le relevé.** L’option *batch booking* demande à la banque de débiter le total en une fois. C’est pratique pour la paie : les salaires n’apparaissent pas un par un sur le relevé de l’entreprise. Toutes les banques ne la proposent pas.

**La vérification du bénéficiaire.** Depuis octobre 2025 aussi, la banque compare le nom saisi au titulaire réel de l’IBAN avant un virement. Pour les remises de fichiers, les professionnels peuvent y renoncer : demandez à votre banque ce qu’elle applique à vos imports.

## Étape 4 : importer dans la banque

Le menu s’appelle selon les banques « virements groupés », « remise de fichiers », « import de virements » ou « transferts de fichiers ». Le service doit parfois être activé par votre conseiller.

Après l’import, la banque affiche un récapitulatif : **comparez le nombre de virements et le total** avec ceux de votre tableau avant de valider. S’ils diffèrent, ne signez pas.

## Quelle version : 03 ou 09 ?

Les banques françaises acceptent deux versions du message : `pain.001.001.03` (2009) et `pain.001.001.09` (2019). La seconde est recommandée par la profession bancaire et sera nécessaire pour certaines évolutions. Prenez la 09 sauf si votre banque ou votre logiciel ne lit que la 03. Les différences, et la liste des rejets les plus courants, sont dans [pain.001.001.03 ou .09 : versions et rejets](/guides/pain-001-version-rejets-fichier-sepa/).

Pour encaisser plutôt que payer, la logique est la même avec les prélèvements : voir [ICS, RUM, mandat et séquences](/guides/prelevement-sepa-ics-rum-mandat/).
