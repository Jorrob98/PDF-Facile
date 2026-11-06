# DocFix Desktop — Debug generale e audit di affidabilità
_Data: 6 novembre 2026 · Ramo di sviluppo: `docfix-desktop-build` · Produzione non modificata._

## Cosa è stato realmente ispezionato
- Caricamento JPG/PNG/WebP/PDF, coda di elaborazione e reset.
- Riconoscimento e suddivisione tessere, raddrizzamento e verifica dei bordi.
- Anteprime, riordino delle pagine, correzioni manuali ed esportazione PDF.
- OCR locale e cloud opzionale: worker, memoria, risultati asincroni.
- Installer Electron, controlli Windows e sistema di aggiornamento.
- Suite automatica `node qa-stability-guard.cjs`, lanciata anche da GitHub Actions.

Le modifiche sono **solo nel ramo di sviluppo**. La release pubblica resta v1.9.12
fino a un collaudo effettivo. Non includiamo fotografie personali nei test.

## Difetti confermati nel codice e corretti nel ramo
| Priorità | Difetto | Correzione | Verifica |
| --- | --- | --- | --- |
| Critica | `resize()` poteva restituire l'immagine originale, poi `width=height=1` la azzerava | Protezione identità in raddrizzamento, qualità e bordi fisici | Test pixel del canvas piccolo + controlli sorgenti |
| Critica | Un'eccezione in `recoverIncompleteTwoByTwo()` interrompeva il `finally`, lasciando `busy=true` | Gestione errore separata prima dello sblocco; `repaint` iniziale dentro `try` | Controllo regressione nel guard |
| Alta | `multiCropHealthy()` restituiva `true` su eccezione | Ora restituisce `false` e richiede revisione | Guard |
| Alta | L'ordinamento automatico sovrascriveva quello manuale al momento dell'esportazione | Stato `manuallyOrdered`: operatore prevale | Test di riordino 6 pagine |
| Alta | Layout ruotato 90° era considerato `trustworthy:true` senza vera prova del verso | Nessuna falsa attestazione; controllo MRZ sulla carta d'identità | Guard |
| Alta | Evidenze fronte/retro discordanti potevano causare riordino silenzioso | Conflitto esplicito, verifica manuale | Test segnali discordanti |
| Alta | Avvio del worker OCR fallito lasciava immagini temporanee in memoria | Cleanup in tutti i percorsi d'errore, reset worker | Test worker fallito |
| Alta | Preparazione parziale di filtri OCR poteva lasciare canvas allocati | Cleanup delle varianti parzialmente create | Ispezione del percorso d'errore |
| Alta | L'OCR di una versione precedente della pagina poteva arrivare dopo una correzione | Identificatore di revisione e scarto risultati obsoleti | Test OCR asincrono |
| Media | Durante l'OCR ogni `repaint()` ricodificava tutte le anteprime | `WeakMap` per immagine: si ricodifica solo se l'immagine cambia | Test cache e proprietà immagine |
| Alta | L'aggiornamento dichiarava conclusa l'installazione al solo avvio di NSIS | Ricevuta di aggiornamento, verifica effettiva della versione al riavvio e avviso d'insuccesso | Simulazione esito aggiornamento |

## Difetti non corretti alla cieca: rischio residuo
1. **Conflitto 2 vs 3 tessere:** il rilevatore 2×2 ha precedenza e può nascondere
   una terza tessera poco contrastata. Va confrontato con casi reali e sintetici
   difficili prima di cambiare la selezione.
2. **Riconoscimento fronte/retro incerto:** sei anteprime presenti non provano
   necessariamente che ordine e verso siano corretti. Ora viene segnalata
   l'incertezza, ma occorre verifica dell'operatore prima del PDF definitivo.
3. **Ricarica della finestra Electron:** un processo grafico bloccato può essere
   ricaricato, ma una pratica non ancora esportata non è persistita su disco.
   Serve un progetto separato per recupero sessione locale sicuro.
4. **Aggiornamento Windows reale:** la ricevuta verifica la versione al riavvio,
   ma non equivale a un test su tutte le configurazioni dell'ufficio.
5. **Bordi e qualità:** la geometria deve essere verificata sui file con
   tessere rosa pallido, superfici riflettenti, sfondi chiari e scansioni con
   rotazioni arbitrarie. Un test sintetico non sostituisce questi casi.

## Matrice di collaudo prima del rilascio
| Scenario | Stato |
| --- | --- |
| Due foto da due tessere → 4 anteprime/PDF | Test sintetico automatizzato; prova ufficio necessaria |
| Due foto da tre tessere → 6 anteprime/PDF | Test sintetico automatizzato; prova ufficio necessaria |
| Ritaglio da una singola foto | Da provare su immagini diverse |
| Foto da 250–600 px | Test protezione canvas, prova qualità necessaria |
| Reset durante elaborazione/OCR | Da collaudare con input reali |
| 12 file misti aggiunti in più volte | Da collaudare su Windows |
| Ordine manuale prima di PDF | Test automatico |
| OCR in corso mentre si modifica immagine | Test asincrono |
| Worker OCR non disponibile e riprova | Test asincrono |
| PDF con pagine JPEG o con testo vettoriale | Test PDF fotografico; test documento vettoriale da integrare |
| Offline all'avvio e durante lavoro | Self-test Electron; prova ambiente reale necessaria |
| Installer NSIS, upgrade e riapertura | Test installer e ricevuta; collaudo macchina ufficio necessario |

## Regole di rilascio proposte
- Non pubblicare automaticamente il ramo di debug.
- Nessun test fallito né avviso silenziato.
- Ogni errore deve lasciare l'interfaccia utilizzabile o fornire una via di recupero.
- Immagini originali sempre immutabili.
- L'anteprima e il PDF devono usare la stessa sequenza e gli stessi canvas.
- Non dichiarare “Elaborata” o “Verso verificato” senza un controllo effettivo.
- Riservare l'ultima decisione sui documenti difficili all'operatore, con avviso chiaro.
- Registrare versione sorgente, data del collaudo e casi superati prima di distribuire.

## Strumenti
- `npm run test:stability` esegue regressioni offline senza immagini di clienti.
- `--self-test` di Electron controlla avvio, moduli, geometria sintetica e sicurezza canvas.
- GitHub Actions compila l'installer solo dopo i controlli statici e di stabilità.
