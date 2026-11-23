# DocFix — stress test intensivo 1.9.66 (23 novembre 2026)

## Ambito e dati

Prova ripetibile su **600 fotografie sintetiche** a risoluzione 420 × 560, eseguita con il codice JavaScript originale dei moduli di DocFix:
- `docfix-wood-single.js` (una tessera su sfondo di legno);
- `docfix-wood-physical-edges.js` (adattamento quattro lati);
- `card-quad-audit.js` (verifica indipendente).

Test realizzato in `qa-stress-166.cjs` con seed deterministico `16620261123`, 50 scene per scenario: tessera integra, prospettiva, rotazione, posizione decentrata, sfocatura, venature del legno, ombre, angolo coperto, tratto di bordo laterale rimosso, documento fuori inquadratura, due documenti, sfondo non ligneo. I casi di occlusione sono verificati sui pixel realmente alterati.

**Non** sono state caricate su GitHub foto reali o dati personali. Nei log e negli artifact compaiono soltanto geometria e statistiche di immagini sintetiche.

In parallelo le due foto sorgente reali dell'utente sono state sottoposte **localmente** a ulteriori **400 trasformazioni** (rotazione, prospettiva, rumore, sfocatura JPEG, ombra e cambio sfondo) con una **baseline OpenCV indipendente**, non con l'app integrale. Il resoconto aggregato è conservato solo nella sessione locale, senza immagini personali.

## Risultato sul motore reale (600)

| Indicatore | Risultato |
|---|---:|
| Scene totali | 600 |
| Proposte "tessera singola" | 394 |
| Rifiniture a quattro lati riuscite | 251 |
| Approvazioni automatiche | 185 |
| Casi lasciati alla verifica manuale | 415 |
| Falsi documenti singoli da foto con più tessere | **0** |
| Approvazioni gravi errate | **0** |
| Approvazioni con IoU >= 0,97 | **183 / 185** |
| Approvazioni con IoU tra 0,95 e 0,97 | **2 / 185** |
| Tagli di oltre lo 0,5% della tessera nei casi approvati | **0** |
| Eccezioni del rilevatore | **0** |

Le 2 approvazioni al di sotto dello 0,97 presentano rispettivamente **IoU 0,9637 e 0,969**, ma copertura integrale della superficie della tessera nel test sintetico. L'IoU misura sovrapposizione geometrica, quindi distingue la rifinitura molto precisa dal margine residuo, e **non** equivale direttamente a una stima del tasso di errore nella vita reale.

## Difetti trovati e modifiche

1. Il primo stress test indicava erroneamente decine di casi pericolosi con bordo laterale rimosso: un errore nel *generatore delle scene* usava coordinate non intere in un `Uint8Array`, e non cancellava realmente il bordo. Il generatore è stato corretto e ora controlla esplicitamente che l'occlusione sia presente; le prime cifre non vanno utilizzate come misura valida.
2. Il motore non controllava in modo continuo i lati oltre alle estremità. È stata aggiunta una verifica distribuita in **13 punti per ciascuno dei quattro lati**, che blocca l'approvazione quando mancano tratti consistenti della plastica, mantenendo la proposta editabile.
3. La protezione fissa esterna di 1 pixel produceva più cornice residua del necessario; è stata ridotta a **0,5 pixel di lavoro** e misurata nuovamente. Il lato della plastica non deve essere sacrificato per ottenere un bordo più stretto.
4. La verifica automatica richiede ancora un controllo indipendente dei quattro lati. Un riconoscimento dubbio deve restare *Correggi*, non *PDF pronto*.

## Limiti

- Test sintetici su fotografie e superfici create artificialmente **non certificano** la precisione su tutte le patenti, tessere sanitarie, libretti, CIE e documenti cartacei reali.
- Il test concentrato sui bordi **non** costituisce una validazione completa della pipeline OCR o di tutte le combinazioni dell'interfaccia Windows.
- Le 400 trasformazioni delle foto reali sono state misurate con OpenCV come **riferimento indipendente**; le statistiche non vanno presentate come prestazioni del riconoscitore JavaScript DocFix.
- Documento troncato, ombre pesanti e sfondi poco contrastati possono produrre una richiesta di correzione manuale, non un'autorizzazione automatica.
- Per completare l'omologazione operativa servono nuove fotografie reali di tipi di documento diversi e l'esportazione effettiva dall'app aggiornata.

## Collegamenti tecnici

- Branch di test: https://github.com/Jorrob98/PDF-Facile/tree/docfix-166-stress-realistic-20261123
- Esecuzione finale 600 casi: https://github.com/Jorrob98/PDF-Facile/actions/runs/45229631283
- Test precedenti: `qa-edge-corner-165.cjs`, `qa-wood-four-physical-164.cjs`, `qa-safe-pdf-163.cjs`, `qa-pdf-image-integrity-165.cjs`.

**Criterio di superamento del test:** nessuna approvazione con superficie della tessera persa >= 0,5%; nessuna approvazione con IoU < 0,95; nessuna approvazione automatica di tessere con angoli/lati mancanti o fuori quadro; nessun falso "documento singolo" in una scena multi-tessera. Restano documentati i 2 scostamenti rispetto alla soglia ideale IoU 0,97.
